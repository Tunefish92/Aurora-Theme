// FolderView3 compatibility check: loads FolderView3's real Docker, Dashboard and VMs pages (its
// own unmodified scripts and styles, on the synthetic Unraid host in fv3_host.mjs), once alone and
// once with Aurora from this working tree, in both of Aurora's views (compat_lib.mjs):
//   FolderView mode  FolderView3 draws its folders; Aurora must keep every folder, row and chip,
//                    add its switch and summary, and not put its own groups or compact view in.
//   Aurora view      Aurora draws the lists (compact view, groups); FolderView3 must draw no
//                    folders, and every container and VM must be listed.
// In both: no hang, no lasting extra load, no new script errors. Unraid's live values simulated.
//
//   git clone --depth 1 https://github.com/chodeus/folder.view3.git /tmp/fv3
//   (cd /tmp/fv3 && npm install --no-save --no-package-lock jquery@3.7.1)
//   FV3=/tmp/fv3 node plugin/test/fv3_compat.mjs
//
// Needs Playwright with Chromium. Exits with 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { createFv3Host } from './fv3_host.mjs';
import { comparePage, loadPlaywright, onlyPages, onlySizes, repo, requireCheckout } from './compat_lib.mjs';

const fv3 = requireCheckout('FV3', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/docker.js', 'Set FV3 to a FolderView3 checkout (see the top of this file).');

// The head script AuroraTheme.page adds in Aurora's view (it undoes FolderView3's takeover of the
// lists), taken from the page itself so the check follows it.
const auroraPage = fs.readFileSync(path.join(repo, 'plugin/src/AuroraTheme.page'), 'utf8');
const auroraViewScript = auroraPage.match(/<\?php if \(\$auroraDockerView === 'aurora'\): \?>\s*([\s\S]*?)<\?php endif; \?>/)[1];

// Aurora's groups as AuroraTheme.page hands them over: two Docker groups and one VM group.
const groupsHead = scenario => '<script>window.auroraDockerGroups = '
    + JSON.stringify([{ name: 'Media', containers: ['fixture-app-1', 'fixture-app-2', 'fixture-app-3'] }, { name: 'Tools', containers: ['fixture-app-4', 'fixture-app-5'] }])
    + '; window.auroraVmGroups = ' + JSON.stringify([{ name: 'Desktops', containers: ['fixture-vm-0', 'fixture-vm-1'] }])
    + "; window.auroraDecimalMark = '.';</script>";

const modes = {
    folderview: scenario => ({ dockerView: { folderView: true, plus: false, mode: 'folderview' }, head: groupsHead(scenario) }),
    aurora: scenario => ({ dockerView: { folderView: true, plus: false, mode: 'aurora' }, head: groupsHead(scenario) + auroraViewScript }),
};

// Ready: FolderView3's folders drawn, or in Aurora's view Aurora's list complete.
const pages = {
    docker: {
        ready: count => document.documentElement.classList.contains('tp-aurora-view')
            ? document.getElementById('docker_list').classList.contains('tp-ready') && document.querySelectorAll('#docker_list td.ct-name').length === count.members
            : document.querySelectorAll('#docker_list tr.folder').length === count.docker,
        inspect: () => ({
            folders: document.querySelectorAll('#docker_list tr.folder').length,
            rows: document.querySelectorAll('#docker_list td.ct-name:not(.folder-name)').length,
            aurora: 0,
            compact: document.querySelectorAll('#docker_containers.tp-compact').length,
            groups: document.querySelectorAll('#docker_list > tr.tp-group').length,
            viewSwitch: document.querySelectorAll('.tp-view-switch').length,
            summary: document.querySelectorAll('#tp-docker-summary').length,
        }),
    },
    dashboard: {
        ready: count => document.documentElement.classList.contains('tp-aurora-view')
            ? document.querySelectorAll('#docker_view span.outer.apps').length >= count.members && document.querySelectorAll('#vm_view span.outer.vms').length >= count.vms
            : document.querySelectorAll('#docker_view [class*="folder-showcase-outer"]').length === count.docker && document.querySelectorAll('#vm_view [class*="folder-showcase-outer"]').length === count.vm,
        inspect: () => ({
            folders: document.querySelectorAll('#docker_view [class*="folder-showcase-outer"], #vm_view [class*="folder-showcase-outer"]').length,
            // Every container and VM chip, in a folder or not; not the folder and group chips.
            rows: document.querySelectorAll('#docker_view span.outer.apps:not(.folder-docker, .tp-group-chip), #vm_view span.outer.vms:not(.folder-vm, .tp-group-chip)').length,
            aurora: 0,
            groups: document.querySelectorAll('#docker_view .tp-group-chip, #vm_view .tp-group-chip').length,
        }),
    },
    vms: {
        ready: count => document.documentElement.classList.contains('tp-aurora-view')
            ? document.querySelectorAll('#kvm_list tr[parent-id]:not(.folder)').length === count.vms && document.querySelectorAll('#kvm_list > tr.tp-group').length > 0
            : document.querySelectorAll('#kvm_list tr.folder').length === count.vm,
        inspect: () => ({
            folders: document.querySelectorAll('#kvm_list tr.folder').length,
            rows: document.querySelectorAll('#kvm_list tr[parent-id]:not(.folder)').length,
            aurora: document.querySelectorAll('#kvm_list tr.folder .tp-vm-expand, #kvm_list .folder-storage .tp-vm-expand').length,
            groups: document.querySelectorAll('#kvm_list > tr.tp-group').length,
            viewSwitch: document.querySelectorAll('.tp-view-switch').length,
        }),
    },
};

// What each view must show besides the shared checks.
const expectations = {
    folderview: {
        docker: (alone, theme) => [
            ...(theme.compact ? ['Aurora\'s compact view over FolderView3\'s folders'] : []),
            ...(theme.groups ? ['Aurora\'s groups inside FolderView3\'s list'] : []),
            ...(theme.viewSwitch !== 1 ? ['no Aurora / FolderView switch'] : []),
            ...(theme.summary !== 1 ? ['no summary above the list'] : []),
        ],
        dashboard: (alone, theme) => theme.groups ? ['Aurora\'s groups on FolderView3\'s tile'] : [],
        vms: (alone, theme) => [
            ...(theme.groups ? ['Aurora\'s VM groups inside FolderView3\'s list'] : []),
            ...(theme.viewSwitch !== 1 ? ['no Aurora / FolderView switch'] : []),
        ],
    },
    aurora: {
        docker: (alone, theme) => [
            ...(theme.folders ? [`${theme.folders} FolderView3 folders in Aurora's view`] : []),
            ...(theme.rows !== alone.rows ? [`${theme.rows} containers listed instead of ${alone.rows}`] : []),
            ...(!theme.compact ? ['no compact view'] : []),
            ...(theme.groups !== 3 ? [`${theme.groups} group headers instead of 3 (2 groups and Ungrouped)`] : []),
            ...(theme.viewSwitch !== 1 ? ['no Aurora / FolderView switch'] : []),
        ],
        dashboard: (alone, theme) => [
            ...(theme.folders ? [`${theme.folders} FolderView3 folders in Aurora's view`] : []),
            ...(theme.rows !== alone.rows ? [`${theme.rows} chips instead of ${alone.rows}`] : []),
            ...(!theme.groups ? ['no group chips'] : []),
        ],
        vms: (alone, theme) => [
            ...(theme.folders ? [`${theme.folders} FolderView3 folders in Aurora's view`] : []),
            ...(theme.rows !== alone.rows ? [`${theme.rows} VMs listed instead of ${alone.rows}`] : []),
            ...(theme.viewSwitch !== 1 ? ['no Aurora / FolderView switch'] : []),
        ],
    },
};

const scenarios = [
    { folders: 10, members: 90, vms: 24, vmFolders: 4 },
    { folders: 30, members: 300, vms: 60, vmFolders: 8 },
];
const browser = await loadPlaywright(fv3).chromium.launch();
let failed = false;
for (const scenario of onlySizes(scenarios)) {
    const host = await createFv3Host(fv3, scenario);
    const count = { docker: scenario.folders, vm: scenario.vmFolders, members: scenario.members, vms: scenario.vms };
    // MODES: only these of Aurora's views (folderview, aurora).
    for (const [mode, aurora] of Object.entries(modes).filter(([mode]) => !process.env.MODES || process.env.MODES.split(',').includes(mode))) {
        for (const [name, page] of Object.entries(pages).filter(([name]) => onlyPages(name))) {
            const label = `FolderView3 ${name}, ${mode === 'aurora' ? "Aurora's view" : 'FolderView mode'}: ${scenario.members} containers in ${scenario.folders} folders, ${scenario.vms} VMs in ${scenario.vmFolders} folders`;
            const problems = await comparePage(browser, { ...page, name, url: `${host.origin}/${name}`, sameLists: mode !== 'aurora', shot: `fv3-${name}-${mode}-${scenario.members}` }, count, aurora(scenario), label, expectations[mode][name]);
            if (problems.length) failed = true;
        }
    }
    host.server.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
