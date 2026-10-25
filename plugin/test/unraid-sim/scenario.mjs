// Writes one scenario into the fake Unraid server: containers (for dockerd.mjs and Unraid's
// files: templates, update status, autostart, order, icons), VMs (for libvirt_stub.php), Unraid's
// Display Settings, Aurora's settings and groups (Aurora from AURORA_REPO, linked in the way its
// .plg installs it), which FolderView plugin is installed (from the FVP / FV3 checkouts) and its
// folders and settings.
//
//   applyScenario({
//     containers: { count: 40, stopped: 3 (every 3rd), paused: [indexes], updates: [indexes],
//                   noTemplate: [...], thirdParty: [...], compose: [...], names: 'plain' | 'long' | 'mixed', autostart: true },
//     display: { theme: 'black', resize: '0', tabs: '1', width: '', font: '', number: '.,' },
//     aurora: { installed: true, layout: 'sidebar', enhance: 'yes', theme: 'yes', dockerview: 'folderview' } | { installed: false },
//     auroraGroups: { docker: [{ name, containers }], vm: [] },
//     plugin: 'fv3' | 'fvplus' | null,
//     folders: { count: 6, members: 'spread' | 'all-in-one' | 'none', empty: 1, nested: 0, settings: {...}, perFolder: [{...}] },
//     pluginSettings: {...}  (FV3 settings.json, or Plus docker.prefs.json overrides),
//     vms: { count: 10, paused: [indexes], long: false }, vmFolders: { count: 3 },
//     fv3Autostart: { mode: 'custom', sequence: [...] } (FolderView3's Autostart tab),
//     busy: false (rc.docker running: Unraid reloads the list every 5 s),
//   })
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = '/usr/local/emhttp';
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const ini = object => Object.entries(object).map(([key, value]) => `${key}="${value}"`).join('\n') + '\n';
const xml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const PLUGINS = {
    fv3: { dir: 'folder.view3', src: process.env.FV3 + '/src/folder.view3/usr/local/emhttp/plugins/folder.view3', config: '/boot/config/plugins/folder.view3' },
    fvplus: { dir: 'folderview.plus', src: process.env.FVP + '/src/folderview.plus/usr/local/emhttp/plugins/folderview.plus', config: '/boot/config/plugins/folderview.plus' },
};
const ICONS = ['default.png', 'disk.png', 'explore.png', 'directory.png', 'cdrom.png'];

function containerNames(count, style) {
    const words = ['plex', 'sonarr', 'radarr', 'nginx-proxy-manager', 'home-assistant', 'nextcloud', 'mariadb', 'redis', 'grafana', 'prometheus', 'jellyfin', 'qbittorrent', 'unifi-controller', 'vaultwarden', 'paperless-ngx', 'immich-server', 'tautulli', 'overseerr', 'prowlarr', 'bazarr'];
    return Array.from({ length: count }, (_value, index) => {
        const base = words[index % words.length] + (index >= words.length ? '-' + Math.floor(index / words.length) : '');
        if (style === 'long' || (style === 'mixed' && index % 4 === 1)) return base + '-with-a-really-long-container-name-for-testing';
        if (style === 'mixed' && index % 4 === 2) return base.toUpperCase().replace(/-/g, '_') + '.v2';
        return base;
    });
}

export function makeContainers(options = {}) {
    const count = options.count ?? 40;
    const names = containerNames(count, options.names || 'plain');
    const pick = (list, index) => Array.isArray(list) ? list.includes(index) : typeof list === 'number' ? list > 0 && index % list === 0 : false;
    return names.map((name, index) => {
        const stopped = options.allStopped ? true : options.allRunning ? false : pick(options.stopped ?? 3, index);
        const network = index % 7 === 3 ? 'host' : index % 7 === 5 ? 'br0' : 'bridge';
        return {
            name, id: (index + 1).toString(16).padStart(4, '0').padStart(12, 'a'), imageId: ((index % 17) + 1).toString(16).padStart(12, 'b'),
            image: `${['lscr.io/linuxserver', 'ghcr.io/hotio', 'jlesage', 'library'][index % 4]}/${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}:latest`,
            running: !stopped, paused: !stopped && pick(options.paused, index), network,
            ports: network === 'bridge' ? [[8000 + index, 'tcp', 18000 + index], [9000 + index, 'udp', null]] : [],
            volumes: [`/mnt/user/appdata/${name}:/config:rw`, '/mnt/user/media:/media:ro'],
            webui: index % 5 === 4 ? '' : 'http://[IP]:[PORT:' + (8000 + index) + ']/',
            template: !pick(options.noTemplate, index), manager: pick(options.thirdParty, index) ? '3rdparty' : pick(options.compose, index) ? 'composeman' : 'dockerman',
            labels: pick(options.compose, index) ? { 'com.docker.compose.project': 'stack' } : {},
            update: pick(options.updates, index) ? 'false' : 'true', autostart: options.autostart !== false && index % 2 === 0, wait: index % 6 === 0 ? 10 : 0,
            icon: ICONS[index % ICONS.length],
        };
    });
}

export function makeFolders(names, options = {}) {
    const count = options.count ?? 0;
    const folders = {};
    for (let index = 0; index < count; index++) {
        const id = `folder${index}`;
        let containers = [];
        if (options.members === 'all-in-one') containers = index === 0 ? names : [];
        else if (options.members !== 'none' && index < count - (options.empty || 0)) containers = names.filter((_name, member) => member % (count - (options.empty || 0)) === index && member < names.length - (options.loose ?? 2));
        folders[id] = {
            name: options.longNames && index % 2 ? `Folder ${index} with a very long name that does not fit` : (options.folderNames || ['Media', 'Downloads', 'Home', 'Network', 'Databases', 'Monitoring', 'Tools', 'Backup'])[index % 8] + (index >= 8 ? ' ' + index : ''),
            icon: '/plugins/dynamix.docker.manager/images/question.png', regex: '', containers,
            settings: { preview: 1, preview_hover: false, expand_tab: false, expand_dashboard: false, preview_update: true, preview_webui: true, preview_logs: true, preview_console: true, preview_grayscale: false, preview_border: true, preview_border_color: '#afa89e', preview_vertical_bars: false, preview_text_width: '', context: 1, context_trigger: 0, update_column: true, ...(options.settings || {}), ...((options.perFolder || [])[index] || {}) },
            actions: [],
            ...(options.nested && index >= count - options.nested ? { parentId: 'folder' + (index - (count - options.nested)) } : {}),
        };
    }
    return folders;
}

// VMs for the fake libvirt (libvirt_stub.php): a third running, one paused if asked.
export function makeVms(options = {}) {
    const count = options.count ?? 0;
    const names = ['Windows 11', 'Ubuntu Server', 'Home Assistant OS', 'pfSense', 'macOS Sonoma', 'Debian 12', 'TrueNAS', 'Kali'];
    return Array.from({ length: count }, (_value, index) => ({
        name: options.long && index % 3 === 1 ? names[index % names.length] + ' with a very long virtual machine name' : names[index % names.length] + (index >= names.length ? ' ' + Math.floor(index / names.length) : ''),
        uuid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        running: index % 3 === 0, paused: (options.paused || []).includes(index), autostart: index % 2 === 0, vcpus: 2 + (index % 4) * 2,
        memoryKiB: 4194304 * (1 + (index % 3)), description: index % 2 ? 'Test machine ' + index : '', icon: ['windows.png', 'ubuntu.png', 'linux.png', 'freebsd.png'][index % 4],
        disks: Array.from({ length: 1 + (index % 2) }, (_d, disk) => `/mnt/user/domains/vm${index}/vdisk${disk + 1}.img`),
    }));
}

export function applyScenario(scenario) {
    const containers = makeContainers(scenario.containers);
    const vms = makeVms(scenario.vms);
    write('/tmp/sim/vms.json', JSON.stringify({ vms }, null, 1));
    fs.rmSync('/boot/config/plugins/dynamix.vm.manager/userprefs.cfg', { force: true });
    write('/boot/config/domain.cfg', vms.length || scenario.vms ? 'SERVICE="enable"\nMEDIADIR="/mnt/user/isos/"\nDOMAINDIR="/mnt/user/domains/"\n' : 'SERVICE="disable"\n');
    // libvirt counts as running when its pid file names a live process: the fake dockerd's.
    const daemon = (() => { try { return execSync('pgrep -f dockerd.mjs').toString().trim().split('\n')[0]; } catch { return '1'; } })();
    if (vms.length || scenario.vms) write('/var/run/libvirt/libvirtd.pid', daemon); else fs.rmSync('/var/run/libvirt/libvirtd.pid', { force: true });
    const state = { containers, actionDelay: scenario.actionDelay || 0, dockerloadOff: !!scenario.dockerloadOff };
    write('/tmp/sim/containers.json', JSON.stringify(state, null, 1));

    // Unraid's Docker files.
    fs.rmSync('/boot/config/plugins/dockerMan/templates-user', { recursive: true, force: true });
    const imagesDir = '/var/lib/docker/unraid/images';
    const ramDir = `${ROOT}/state/plugins/dynamix.docker.manager/images`;
    fs.rmSync(imagesDir, { recursive: true, force: true });
    fs.rmSync(ramDir, { recursive: true, force: true });
    const status = {};
    for (const ct of containers) {
        if (ct.template) write(`/boot/config/plugins/dockerMan/templates-user/my-${ct.name}.xml`, `<?xml version="1.0"?>\n<Container version="2">\n  <Name>${xml(ct.name)}</Name>\n  <Repository>${xml(ct.image)}</Repository>\n  <Registry>https://hub.docker.com/r/${xml(ct.image.split(':')[0])}</Registry>\n  <Network>${ct.network}</Network>\n  <Shell>sh</Shell>\n  <WebUI>${xml(ct.webui)}</WebUI>\n  <Icon>https://example.invalid/${ct.icon}</Icon>\n</Container>\n`);
        const icon = fs.readFileSync(`${ROOT}/plugins/dynamix/images/${ct.icon}`);
        write(`${imagesDir}/${ct.name}-icon.png`, icon);
        write(`${ramDir}/${ct.name}-icon.png`, icon);
        status[ct.image] = { local: 'sha256:aaaa', remote: ct.update === 'false' ? 'sha256:bbbb' : 'sha256:aaaa', status: ct.update };
    }
    write('/var/lib/docker/unraid-update-status.json', JSON.stringify(status));
    write('/var/lib/docker/unraid-autostart', containers.filter(ct => ct.autostart).map(ct => ct.wait ? `${ct.name} ${ct.wait}` : ct.name).join('\n') + '\n');
    write('/boot/config/plugins/dockerMan/userprefs.cfg', containers.map((ct, index) => `${index}="${ct.name}"`).join('\n') + '\n');
    fs.rmSync(`${ROOT}/state/plugins/dynamix.docker.manager/docker.json`, { force: true });

    // Unraid's Display Settings.
    write('/boot/config/plugins/dynamix/dynamix.cfg', '[display]\n' + ini({ theme: 'black', ...(scenario.display || {}) }));

    // Aurora: installed (a link per file, as the .plg installs them) and its settings.
    const aurora = `${ROOT}/plugins/Aurora-Theme`;
    fs.rmSync(aurora, { recursive: true, force: true });
    if (scenario.aurora?.installed !== false) {
        const repo = process.env.AURORA_REPO;
        const src = `${repo}/plugin/src`;
        for (const file of execSync(`cd ${src} && find . -type f`).toString().trim().split('\n')) {
            fs.mkdirSync(path.dirname(path.join(aurora, file)), { recursive: true });
            fs.symlinkSync(path.join(src, file), path.join(aurora, file));
        }
        fs.symlinkSync(`${repo}/unraid-tapeory.css`, `${aurora}/styles/theme.css`);
        const { installed, ...settings } = scenario.aurora || {};
        write('/boot/config/plugins/Aurora-Theme/Aurora-Theme.cfg', ini({ theme: 'yes', layout: 'sidebar', enhance: 'yes', stats: 'no', autoupdate: 'no', accent: '', font: 'aurora', ...settings }));
        write('/boot/config/plugins/Aurora-Theme/docker-groups.json', JSON.stringify({ groups: scenario.auroraGroups?.docker || [] }));
        write('/boot/config/plugins/Aurora-Theme/vm-groups.json', JSON.stringify({ groups: scenario.auroraGroups?.vm || [] }));
    }

    // The FolderView plugin and its folders.
    for (const plugin of Object.values(PLUGINS)) {
        fs.rmSync(`${ROOT}/plugins/${plugin.dir}`, { recursive: true, force: true });
        fs.rmSync(plugin.config, { recursive: true, force: true });
    }
    if (scenario.plugin) {
        const plugin = PLUGINS[scenario.plugin];
        fs.symlinkSync(plugin.src, `${ROOT}/plugins/${plugin.dir}`);
        fs.mkdirSync(plugin.config, { recursive: true });
        const folders = makeFolders(containers.map(ct => ct.name), scenario.folders);
        write(`${plugin.config}/docker.json`, JSON.stringify(folders, null, 1));
        write(`${plugin.config}/vm.json`, JSON.stringify(makeFolders(vms.map(vm => vm.name), { count: 0, ...(scenario.vmFolders || {}) }), null, 1));
        if (scenario.plugin === 'fv3') {
            write(`${plugin.config}/settings.json`, JSON.stringify(scenario.pluginSettings || {}));
            if (scenario.folderOrder) write(`${plugin.config}/order-docker.json`, JSON.stringify(scenario.folderOrder));
            if (scenario.fv3Autostart) write(`${plugin.config}/autostart.json`, JSON.stringify(scenario.fv3Autostart));
        } else {
            write(`${plugin.config}/docker.prefs.json`, JSON.stringify({ setupWizardCompleted: true, ...(scenario.pluginSettings || {}) }));
            write(`${plugin.config}/vm.prefs.json`, JSON.stringify({ setupWizardCompleted: true }));
        }
    }

    // Unraid busy (starting containers): its Docker page reloads the list every 5 s meanwhile.
    try { execSync('pkill -x rc.docker'); } catch { /* none */ }
    if (scenario.busy) execSync('(/tmp/sim/rc.docker 3600 >/dev/null 2>&1 &)');
    return { containers };
}

if (process.argv[1] && process.argv[1].endsWith('scenario.mjs') && process.argv[2]) applyScenario(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
