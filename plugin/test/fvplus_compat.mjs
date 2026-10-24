// FolderView Plus compatibility check: loads FolderView Plus's real Docker, Dashboard, VMs and
// settings pages (its own unmodified scripts and styles, on the synthetic Unraid host in
// fvplus_host.mjs), once alone and once with Aurora from this working tree, and compares them
// (compat_lib.mjs): folders drawn, rows and chips kept, no theme elements in FolderView Plus's
// lists, no hang, no lasting extra load, no new script errors. Unraid's live values are simulated.
//
//   git clone --depth 1 https://github.com/alexphillips-dev/FolderView-Plus.git /tmp/fvp
//   (cd /tmp/fvp && npm install --no-save jquery@3.7.1)
//   FVP=/tmp/fvp node plugin/test/fvplus_compat.mjs
//
// Needs Playwright with Chromium. Exits with 1 on any failure. Uses fixture code from FolderView
// Plus's tests, which may change with its releases.
import { createPlusHost } from './fvplus_host.mjs';
import { comparePage, loadPlaywright, onlyPages, onlySizes, requireCheckout } from './compat_lib.mjs';

const fvp = requireCheckout('FVP', 'scripts/lib/production-perf-fixture.mjs', 'Set FVP to a FolderView Plus checkout (see the top of this file).');

// Docker page: Unraid's page frame and its live values, every container's CPU and memory every
// second (the Dashboard and VMs pages of fvplus_host.mjs bring their own).
const dockerHost = html => html
    .replace(/data-name="([^"]+)"([\s\S]*?)<td>bridge<\/td><td><\/td>/g, (match, name, between) =>
        `data-name="${name}"${between}<td>bridge</td><td class="advanced"><span class="cpu-${name}">0.5%</span><br><span class="mem-${name}">20MiB / 15GiB</span></td>`)
    .replace('<div class="canvas">', '<div id="header"><div id="UserProfile"></div></div><div id="menu"><div class="nav-tile"><div class="nav-item active"><a href="/Docker">Docker</a></div></div></div><div id="displaybox"><div class="title"><span class="left">Docker Containers</span></div><div class="canvas">')
    .replace('</tbody></table></div>', '</tbody></table></div></div>')
    .replace('</body>', `<script>setInterval(() => document.querySelectorAll('[class^="cpu-"]:not([class*="folder"])').forEach(cell => {
        cell.textContent = (Math.random() * 9).toFixed(1) + '%';
        const memory = cell.parentElement.querySelector('[class^="mem-"]');
        if (memory) memory.textContent = (Math.random() * 900 | 0) + 'MiB / 15GiB';
    }), 1000);</script></body>`);

// Per page: when FolderView Plus has drawn its folders, and what Aurora must have left alone.
const pages = {
    docker: {
        prepare: dockerHost,
        ready: count => document.querySelectorAll('#docker_list tr.folder').length === count.docker,
        inspect: () => ({
            folders: document.querySelectorAll('#docker_list tr.folder').length,
            rows: document.querySelectorAll('#docker_containers tr[id^="ct-"]').length,
            aurora: document.querySelectorAll('#tp-docker-summary, .tp-toolbar, .tp-view-switch').length,
        }),
    },
    dashboard: {
        ready: count => document.querySelectorAll('#docker_view [class*="folder-showcase-outer-"]').length === count.docker
            && document.querySelectorAll('#vm_view [class*="folder-showcase-outer-"]').length === count.vm,
        inspect: () => ({
            folders: document.querySelectorAll('#docker_view [class*="folder-showcase-outer-"], #vm_view [class*="folder-showcase-outer-"]').length,
            rows: document.querySelectorAll('#docker_view .folder-storage span.outer.apps, #vm_view .folder-storage span.outer.vms').length,
            aurora: document.querySelectorAll('#docker_view :is(.tp-group-chip, .tp-chip-divider, .tp-group-apps, .tp-update), #vm_view :is(.tp-group-chip, .tp-group-panel)').length,
        }),
    },
    // FolderView Plus's settings page (Settings > FolderView Plus): it must load completely.
    settings: {
        ready: () => { const state = window.FolderViewPlusSettingsBootstrapState; return state?.ready === true && state.failed !== true && state.degraded !== true; },
        inspect: () => ({ folders: document.querySelectorAll('tr[data-folder-id]').length, rows: 0, aurora: 0 }),
    },
    vms: {
        ready: count => document.querySelectorAll('#kvm_list tr.folder').length === count.vm,
        inspect: () => ({
            folders: document.querySelectorAll('#kvm_list tr.folder').length,
            rows: document.querySelectorAll('#kvm_list tr[parent-id]:not(.folder)').length,
            aurora: document.querySelectorAll('#kvm_list tr.folder .tp-vm-expand, #kvm_list .folder-storage .tp-vm-expand, #kvm_list tr.tp-group, .tp-view-switch').length,
        }),
    },
};

// What AuroraTheme.page adds with FolderView Plus installed.
const aurora = { classes: ['tp-fvplus'], dockerView: { folderView: true, plus: true, mode: 'folderview' } };

const scenarios = [
    { folders: 10, members: 90, nestedFolders: 2, vms: 24, vmFolders: 4 },
    { folders: 30, members: 300, nestedFolders: 5, vms: 60, vmFolders: 8 },
];
const browser = await loadPlaywright(fvp).chromium.launch();
let failed = false;
for (const scenario of onlySizes(scenarios)) {
    const host = await createPlusHost(fvp, scenario);
    const count = { docker: scenario.folders, vm: scenario.vmFolders };
    for (const [name, page] of Object.entries(pages).filter(([name]) => onlyPages(name))) {
        const label = `FolderView Plus ${name}: ${scenario.members} containers in ${scenario.folders} folders, ${scenario.vms} VMs in ${scenario.vmFolders} folders`;
        const problems = await comparePage(browser, { ...page, name, url: `${host.origin}/${name}`, shot: `fvplus-${name}-${scenario.members}` }, count, aurora, label);
        if (problems.length) failed = true;
    }
    host.server.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
