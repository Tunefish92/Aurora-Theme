// A synthetic Unraid host for FolderView3's real Docker, Dashboard and VMs pages, used by
// fv3_compat.mjs. The pages are built from FolderView3's .page files (PHP left out, assets
// served from the checkout, its translation loader rendered for English), on an Unraid page
// frame with Unraid's list markup (DockerContainers.php, DashboardApps.php, VMMachines.php) and
// Unraid's loadlist() / listview(), and FolderView3's server endpoints answered from fixture
// data. FolderView3's scripts and styles run unmodified.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const prefix = '/plugins/folder.view3/';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

export async function createFv3Host(fv3, scenario) {
    const plugin = path.join(fv3, 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
    const jquery = path.join(fv3, 'node_modules/jquery/dist/jquery.min.js');
    const read = file => fs.readFileSync(path.join(plugin, file), 'utf8');
    const icon = prefix + 'img/folder-icon.png';
    const iconFile = fs.existsSync(path.join(plugin, 'img/folder-icon.png')) ? icon : '/plugins/dynamix.docker.manager/images/question.png';

    // Containers: two thirds running, spread over the folders; VMs: a third running.
    const names = Array.from({ length: scenario.members }, (_value, index) => `fixture-app-${index}`);
    const shortId = index => (index + 1).toString(16).padStart(12, '0');
    const containers = Object.fromEntries(names.map((name, index) => {
        const running = index % 3 !== 0;
        return [name, {
            Id: shortId(index).padEnd(64, '0'), Names: ['/' + name], Image: `fixture/${name}:latest`, ImageID: 'sha256:' + 'c'.repeat(64),
            State: running ? 'running' : 'exited', Status: running ? 'Up 2 hours' : 'Exited (0) 2 hours ago', Labels: { 'net.unraid.docker.managed': 'dockerman' },
            HostConfig: { NetworkMode: 'bridge' }, NetworkSettings: { Networks: { bridge: { IPAddress: running ? '172.17.0.' + (index % 250 + 2) : '' } } },
            shortId: shortId(index), shortImageId: 'c'.repeat(12),
            info: { Name: name, State: { Running: running, Paused: false, Autostart: false, Updated: true, manager: 'dockerman', WebUi: '', TSWebUi: '' },
                Config: { Image: `fixture/${name}:latest`, Labels: {} }, HostConfig: {}, Shell: 'sh', template: null, Ports: [] },
        }];
    }));
    const folders = Object.fromEntries(Array.from({ length: scenario.folders }, (_value, index) => [`fixture-folder-${index}`, {
        name: `Fixture folder ${index}`, icon: iconFile, regex: '', hidden_preview: [], actions: [],
        containers: names.filter((_name, member) => member % scenario.folders === index),
        settings: { preview: 1, preview_hover: false, expand_tab: false },
    }]));
    const vmNames = Array.from({ length: scenario.vms }, (_value, index) => `fixture-vm-${index}`);
    const vms = Object.fromEntries(vmNames.map((name, index) => [name, {
        uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name, description: '', autostart: false,
        state: index % 3 === 0 ? 'running' : 'shutoff', icon: iconFile, logs: '', vnc_port: '',
    }]));
    const vmFolders = Object.fromEntries(Array.from({ length: scenario.vmFolders }, (_value, index) => [`fixture-vm-folder-${index}`, {
        name: `Fixture VM folder ${index}`, icon: iconFile, regex: '', hidden_preview: [], actions: [],
        containers: vmNames.filter((_name, member) => member % scenario.vmFolders === index),
        settings: { preview: 1, preview_hover: false, expand_tab: false },
    }]));
    const data = {
        docker: { folders, info: containers, order: Object.keys(folders).map(id => 'folder-' + id).concat(names), unraidOrder: names },
        vm: { folders: vmFolders, info: vms, order: Object.keys(vmFolders).map(id => 'folder-' + id).concat(vmNames), unraidOrder: vmNames },
    };

    // FolderView3's .page as served: front matter and PHP removed, autov() URLs kept, its
    // translation loader (langs/script.php) rendered for English.
    const languageLoader = () => read('langs/script.php')
        .replace(/^<\?php[\s\S]*?\?>/, '')
        .replace(/<\?= json_encode\(\$loc\) \?>/, '"en"')
        .replace(/<\?php[\s\S]*?\?>/, JSON.stringify({ en: prefix + 'langs/en.json' }));
    const pluginPage = file => {
        const source = read(file);
        return source.slice(source.indexOf('---') + 3)
            .replace(/<\?php\s+\$type = '[a-z]+';\s+require_once\('[^']*langs\/script\.php'\);\s+\?>/, languageLoader)
            .replace(/<\?php\s*autov\('([^']+)'\)\s*\?>/g, '$1')
            .replace(/<\?(?:php|=)[\s\S]*?\?>/g, '');
    };

    // Unraid's page script, reduced to what these pages do with the lists: loadlist() loads the
    // list from Unraid's include and calls listview(), as DockerContainers.page, VMMachines.page
    // and DashStats.page do; the menus and dialogs are stubs.
    const unraidScript = surface => `
        window.csrf_token = 'fixture-unraid-token'; window.timers = {}; window.docker = [];
        window.eventControl = () => {}; window.addDockerContainerContext = () => {}; window.addVMContext = () => {};
        window.addDockerImageContext = () => {}; window.openDocker = () => {}; window.openTerminal = () => {}; window.editContainer = () => {};
        window.toggle_id = id => { const row = document.getElementById(id); if (row) row.style.display = row.style.display === 'none' ? '' : 'none'; };
        window.context = { attach() {}, init() {}, destroy() {} };
        // Unraid's live channel of the Docker page (NchanSubscriber('/sub/dockerload')): a message a second.
        window.dockerload = Object.assign(new EventTarget(), {
            on(type, handler) { this.addEventListener(type, event => handler(event.data)); },
            start() { this.timer = this.timer || setInterval(() => this.dispatchEvent(Object.assign(new Event('message'), { data: '' })), 1000); },
            stop() { clearInterval(this.timer); this.timer = null; },
        });
        window.swal = () => Promise.resolve(false); window.swal.close = () => {};
        jQuery.cookie = () => null; jQuery.removeCookie = () => true;
        for (const name of ['switchButton', 'sortable', 'tooltip', 'tooltipster', 'dialog', 'tablesorter', 'contextMenu', 'readmore', 'hideMe']) jQuery.fn[name] = function () { return this; };
        ${surface === 'docker' ? `
        window.listview = () => {};
        window.loadlist = () => { window.docker = []; jQuery.get('/plugins/dynamix.docker.manager/include/DockerContainers.php', data => {
            const parts = data.split(/\\0/); jQuery('#docker_list').html(parts[0]); (new Function(parts[1]))(); window.listview(); }); };`
        : surface === 'vms' ? `
        window.listview = () => {};
        window.loadlist = () => jQuery.get('/plugins/dynamix.vm.manager/include/VMMachines.php', { show: '' }, data => {
            jQuery('#kvm_list').html(data.split(/\\0/)[0]); });`
        : `
        window.loadlist = () => jQuery.post('/webGui/include/DashboardApps.php', { docker: 'yes', vms: 'yes', vmusage: 'no' }, data => {
            const parts = data.split('\\0');
            jQuery('#docker_view tr.updated').remove(); jQuery('#docker_view').append(parts[0]);
            jQuery('#vm_view tr.updated').remove(); jQuery('#vm_view').append(parts[1]); });`}
        jQuery(() => window.loadlist());`;

    // Unraid's live values: every container's CPU and memory every second on the Docker page,
    // the server load on the Dashboard.
    const live = surface => surface === 'docker'
        ? `<script>setInterval(() => document.querySelectorAll('[class^="cpu-"]:not([class*="folder"])').forEach(cell => {
            cell.textContent = (Math.random() * 9).toFixed(1) + '%';
            const memory = cell.parentElement.querySelector('[class^="mem-"]');
            if (memory) memory.textContent = (Math.random() * 900 | 0) + 'MiB / 15GiB'; }), 1000);</script>`
        : surface === 'dashboard' ? `<script>setInterval(() => { const load = document.querySelector('span.cpu.load'); if (load) load.textContent = (Math.random() * 30 | 0) + '%'; }, 1000);</script>` : '';

    const bodies = {
        docker: '<div class="title"><span class="left">Docker Containers</span></div><div class="TableContainer"><table id="docker_containers" class="tablesorter shift"><thead><tr><th><a id="resetsort" class="nohand"><i class="fa fa-th-list"></i></a>Application</th><th>Version</th><th>Network</th><th>Container IP</th><th>Container Port</th><th>LAN IP:Port</th><th>Volume Mappings</th><th class="load advanced">CPU &amp; Memory load</th><th class="nine">Autostart</th><th class="five">Uptime</th></tr></thead><tbody id="docker_list" class="js-fill-available-height"><tr><td colspan="10"></td></tr></tbody></table></div><div class="js-actions"><input type="button" value="Add Container"></div>',
        dashboard: '<div class="frame"><table class="dashboard"><tbody id="docker_view"><tr><td><div class="tile-header"><div class="tile-header-left"><div class="section"><h3 class="tile-header-main">Docker Containers</h3></div></div></div></td></tr></tbody>'
            + '<tbody id="vm_view"><tr><td><div class="tile-header"><div class="tile-header-left"><div class="section"><h3 class="tile-header-main">Virtual Machines</h3></div></div></div></td></tr></tbody>'
            + '<tbody><tr><td><span class="cpu load">3%</span></td></tr></tbody></table></div>',
        vms: '<div class="title"><span class="left">Virtual Machines</span></div><div class="TableContainer"><table id="kvm_table" class="tablesorter four shift"><thead><tr><th>Name</th><th>Description</th><th>CPUs</th><th>Memory</th><th>vDisks</th><th>Graphics</th><th>IP Address</th><th>Autostart</th></tr></thead><tbody id="kvm_list"><tr><td colspan="8"></td></tr></tbody></table></div>',
    };
    const pageFiles = { docker: 'folder.view3.Docker.page', dashboard: 'folder.view3.Dashboard.page', vms: 'folder.view3.VMs.page' };
    const page = surface => '<!doctype html><html><head><meta charset="utf-8">'
        + '<style>body{font:14px Arial;background:#1d1d1f;color:#eee;margin:16px}.img{width:32px}</style>'
        + '<script src="/vendor/jquery.js"></script>' + `<script>${unraidScript(surface)}</script>`
        + '</head><body><div id="header"><div id="UserProfile"></div></div>'
        + `<div id="menu"><div class="nav-tile"><div class="nav-item active"><a href="/${surface}">${surface}</a></div></div></div>`
        + `<div id="displaybox">${bodies[surface]}</div>` + pluginPage(pageFiles[surface]) + live(surface) + '</body></html>';

    // Unraid's markup for the lists.
    const status = ct => ct.info.State.Running ? ['play', 'started', 'green-text'] : ['square', 'stopped', 'red-text'];
    const dockerRows = () => names.map(name => {
        const ct = containers[name];
        const [shape, state, color] = status(ct);
        const id = ct.shortId;
        return `<tr class='sortable'><td class='ct-name' style='width:220px;padding:8px'><i class='fa fa-arrows-v mover orange-text'></i>`
            + `<span class='outer'><span id='${id}' onclick="addDockerContainerContext('${name}','sha256:c','',${ct.info.State.Running ? 1 : 0},0,0,'false','','','sh','${id}','','','','','')" class='hand'><img src='${iconFile}' class='img'></span>`
            + `<span class='inner'><span class='appname '><a class='exec' onclick="editContainer('${name}','')">${name}</a></span><br><i id='load-${id}' class='fa fa-${shape} ${state} ${color}'></i><span class='state'>${state}</span></span></span>`
            + `<div class='advanced' style='margin-top:8px'>Container ID: ${id}<br>By: fixture</div></td>`
            + `<td class='updatecolumn'><span class='green-text' style='white-space:nowrap;'><i class='fa fa-check fa-fw'></i> up-to-date</span></td>`
            + `<td>bridge</td><td style='white-space:nowrap'><span class='docker_readmore'>${ct.NetworkSettings.Networks.bridge.IPAddress}</span></td>`
            + `<td style='white-space:nowrap'><span class='docker_readmore'>8080:TCP</span></td><td style='white-space:nowrap'><span class='docker_readmore'>192.168.1.2:8080</span></td>`
            + `<td style='word-break:break-all'><span class='docker_readmore'>/config<i class="fa fa-arrows-h" style="margin:0 6px"></i>/mnt/user/appdata/${name}</span></td>`
            + `<td class='advanced'><span class='cpu-${id}'>0%</span><div class='usage-disk mm'><span id='cpu-${id}' style='width:0'></span><span></span></div><br><span class='mem-${id}'>0 / 0</span></td>`
            + `<td><input type='checkbox' id='${id}-auto' class='autostart' container='${name}'><span id='${id}-wait' style='float:right;display:none'>wait<input class='wait' container='${name}' type='number' value='' placeholder='0'></span></td>`
            + `<td><div style='white-space:nowrap'>${ct.Status}</div></td></tr>`;
    }).join('') + '\0' + names.map(name => `docker.push({name:'${name}',id:'${containers[name].shortId}',state:${containers[name].info.State.Running ? 1 : 0},pause:0,update:0});`).join('') + '\0' + '0';
    const dockerChips = () => names.map(name => {
        const ct = containers[name];
        const [shape, state, color] = status(ct);
        return `<span class='outer solid apps ${state}'><span id='${ct.shortId}' onclick="addDockerContainerContext('${name}','sha256:c','',${ct.info.State.Running ? 1 : 0},0,0,'false','','','sh','${ct.shortId}','','','','','')" class='hand'><img src='${iconFile}' class='img'></span><span class='inner'><span class=''>${name}</span><br><i class='fa fa-${shape} ${state} ${color}'></i><span class='state'>${state}</span></span></span>`;
    }).join('');
    const vmStatus = vm => vm.state === 'running' ? ['play', 'started', 'green-text'] : ['square', 'stopped', 'red-text'];
    const vmChips = () => vmNames.map(name => {
        const vm = vms[name];
        const [shape, state, color] = vmStatus(vm);
        return `<span class='outer solid vms ${state}'><span id='vm-${vm.uuid}' onclick="addVMContext('${name}','${vm.uuid}')" class='hand'><img src='${vm.icon}' class='img'></span><span class='inner'>${name}<br><i class='fa fa-${shape} ${state} ${color}'></i><span class='state'>${state}</span></span></span>`;
    }).join('');
    const vmRows = () => vmNames.map((name, index) => {
        const vm = vms[name];
        const [shape, state, color] = vmStatus(vm);
        return `<tr parent-id='${index}' class='sortable'><td class='vm-name' style='width:220px;padding:8px'><i class='fa fa-arrows-v mover orange-text'></i><span class='outer'><span id='vm-${vm.uuid}' onclick="addVMContext('${name}','${vm.uuid}')" class='hand'><img src='${vm.icon}' class='img'></span><span class='inner'><a href='#' onclick='return toggle_id("name-${index}")' title='click for more VM info'>${name}</a><br><i class='fa fa-${shape} ${state} ${color}'></i><span class='state'>${state} </span></span></span></td>`
            + `<td></td><td><a class='vcpu-${vm.uuid}'>2</a></td><td>4G</td><td title=''><span class='state'>1</span></td><td><span class='vmgraphics'>VNC</span></td><td><span class='vmgraphics'>-</span></td><td><input class='autostart' type='checkbox' uuid='${vm.uuid}'></td></tr>`
            + `<tr child-id='${index}' id='name-${index}' style='display:none'><td colspan='8' style='margin:0;padding:0'><table class='tablesorter domdisk'><thead class='child'><tr><th>Disk devices/Volume</th></tr></thead><tbody class='child'><tr><td>/mnt/user/domains/${name}/vdisk1.img</td></tr></tbody></table></td></tr>`;
    }).join('') + '\0';

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const send = (body, type = 'application/json') => {
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            res.end(type === 'application/json' ? JSON.stringify(body) : body);
        };
        const type = url.searchParams.get('type') === 'vm' ? 'vm' : 'docker';
        if (['/docker', '/dashboard', '/vms'].includes(url.pathname)) return send(page(url.pathname.slice(1)), 'text/html');
        if (url.pathname === '/vendor/jquery.js') return send(fs.readFileSync(jquery), 'text/javascript');
        if (url.pathname === '/graphql') return send({ errors: [{ message: 'No Unraid API on the synthetic host.' }] });
        if (url.pathname === '/plugins/dynamix.docker.manager/images/question.png') return send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'), 'image/png');
        if (url.pathname === '/plugins/dynamix.docker.manager/include/DockerContainers.php') return send(dockerRows(), 'text/html');
        if (url.pathname === '/plugins/dynamix.vm.manager/include/VMMachines.php') return send(vmRows(), 'text/html');
        if (url.pathname === '/webGui/include/DashboardApps.php') return send(`<tr title='' class='updated'><td>${dockerChips()}</td></tr>\0<tr title='' class='updated'><td>${vmChips()}</td></tr>\0`, 'text/html');
        if (url.pathname.startsWith(prefix + 'server/')) {
            const endpoint = path.basename(url.pathname);
            if (endpoint === 'read.php') return send(data[type].folders);
            if (endpoint === 'read_info.php') return send(data[type].info);
            if (endpoint === 'read_order.php') return send(data[type].order);
            if (endpoint === 'read_unraid_order.php') return send(data[type].unraidOrder);
            if (endpoint === 'read_settings.php') return send({});
            if (endpoint === 'read_organizer_registry.php') return send({ folders: [] });
            if (endpoint === 'read_autostart.php') return send({ mode: 'off' });
            if (endpoint === 'cpu.php') return send('8', 'text/plain');
            if (endpoint === 'version.php') return send('2026.10.24', 'text/plain');
            return send({ ok: true });
        }
        const file = url.pathname.startsWith(prefix) ? path.resolve(plugin, url.pathname.slice(prefix.length)) : '';
        if (file && file.startsWith(plugin + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            return send(fs.readFileSync(file), types[path.extname(file)] || 'application/octet-stream');
        }
        res.writeHead(404); res.end('');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${server.address().port}`, server };
}
