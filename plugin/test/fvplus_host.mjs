// A synthetic Unraid host for FolderView Plus's real Docker, Dashboard and VMs pages, used by
// fvplus_compat.mjs. The Docker page and FolderView Plus's server endpoints come from FolderView
// Plus's own benchmark fixture (scripts/lib/production-perf-fixture.mjs). Added here: the
// Dashboard and VMs pages, built from FolderView Plus's .page files the same way that fixture
// builds the Docker page, Unraid's DashboardApps.php and VMMachines.php with Unraid's markup and
// a loadlist() that loads them as Unraid's pages do, and VM folders, VMs and orders for
// FolderView Plus's endpoints. FolderView Plus's scripts and styles run unmodified.
import fs from 'node:fs';
import path from 'node:path';

const prefix = '/plugins/folderview.plus/';
const meta = (name, value) => `<meta name="${name}" content='${JSON.stringify(value).replaceAll("'", '&#39;')}'>`;
const script = file => `<script src="${file}?v=compat"></script>`;

export async function createPlusHost(fvp, scenario) {
    const { createProductionPerfFixture } = await import(path.join(fvp, 'scripts/lib/production-perf-fixture.mjs'));
    const fixture = createProductionPerfFixture(fvp, scenario, 'en');
    const plugin = path.join(fvp, 'src/folderview.plus/usr/local/emhttp/plugins/folderview.plus');
    const read = file => fs.readFileSync(path.join(plugin, file), 'utf8');
    const fixtureHandler = fixture.server.listeners('request')[0];
    fixture.server.removeAllListeners('request');

    // VMs: a third running, the rest stopped, spread over their own folders.
    const vmCount = scenario.vms ?? 24;
    const vmFolderCount = scenario.vmFolders ?? 4;
    const vmNames = Array.from({ length: vmCount }, (_value, index) => `fixture-vm-${index}`);
    const vmRuntime = Object.fromEntries(vmNames.map((name, index) => [name, {
        uuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name, description: '',
        autostart: false, state: index % 3 === 0 ? 'running' : 'shutoff', vcpus: 2,
        memoryKiB: 4194304, storageBytes: 0, icon: prefix + 'images/folder-icon.png', logs: '',
    }]));
    const vmFolders = Object.fromEntries(Array.from({ length: vmFolderCount }, (_value, index) => [`fixture-vm-folder-${index}`, {
        name: `Fixture VM folder ${index}`, icon: prefix + 'images/folder-icon.png',
        containers: vmNames.filter((_name, member) => member % vmFolderCount === index),
        settings: { preview: 1, preview_hover: false, expand_tab: false }, actions: [],
    }]));
    const vmOrder = Object.keys(vmFolders).map(id => 'folder-' + id).concat(vmNames);
    const prefs = { performanceProfile: 'standard', lazyPreviewEnabled: false, setupWizardCompleted: true, autoRules: [] };
    const vmSnapshot = () => ({ ok: true, kind: 'runtime_snapshot', schemaVersion: 1, type: 'vm', folders: vmFolders,
        runtime: vmRuntime, order: vmOrder, unraidOrder: vmNames, prefs, metadata: {}, revision: 'b'.repeat(64) });

    // The Docker containers as FolderView Plus's fixture serves them, plus the order Unraid lists
    // them in (unraidOrder), which the Dashboard reads and that fixture (Docker page only) leaves out.
    let origin = '';
    const dockerSnapshot = async () => {
        const snapshot = await (await fetch(origin + prefix + 'server/runtime_snapshot.php?type=docker&fixture=raw')).json();
        return { ...snapshot, unraidOrder: snapshot.order.filter(name => !name.startsWith('folder-')) };
    };

    // As FolderView Plus's langs/script.php: only the namespaces that have a catalogue.
    const catalogs = wanted => { const namespaces = wanted.filter(name => fs.existsSync(path.join(plugin, `langs/namespaces/en/${name}.json`))); return { requestedLocale: 'en', resolvedLocale: 'en', direction: 'ltr',
        namespaces: ['common', 'legacy-surface', ...namespaces],
        assets: [{ locale: 'en', namespace: 'legacy', url: prefix + 'langs/en.json?v=compat' },
            ...['common', 'legacy-surface', ...namespaces].map(namespace => ({ locale: 'en', namespace, url: prefix + `langs/namespaces/en/${namespace}.json?v=compat` }))] }; };
    const scriptsFrom = source => [...source.matchAll(/<script[^>]*src="[^"\n]*?fvplus_asset\('([^']+)'\)[^"\n]*"[^>]*><\/script>/g)].map(match => match[1]);
    const pluginPage = file => {
        const source = read(file);
        return source.slice(source.indexOf('---') + 3).replace(/<\?(?:php|=)[\s\S]*?\?>/g, php => {
            const asset = php.match(/fvplus_asset\('([^']+)'\)/);
            return asset ? asset[1] + '?v=compat' : '';
        });
    };

    // Unraid's own page script, reduced to what these pages do with the lists.
    const unraidScript = `
        window.csrf_token = 'fixture-unraid-token';
        window.eventControl = () => {}; window.addDockerContainerContext = () => {}; window.addVMContext = () => {};
        window.openVMAction = () => {}; window.toggle_id = id => { const row = document.getElementById(id); if (row) row.style.display = row.style.display === 'none' ? '' : 'none'; };
        window.context = { attach() {}, init() {}, destroy() {} };
        window.swal = () => Promise.resolve(false); window.swal.close = () => {};
        jQuery.cookie = () => ''; jQuery.fn.switchButton = function () { return this; }; jQuery.fn.hideMe = function () { return this; };
        for (const name of ['sortable', 'tooltip', 'tooltipster', 'dialog', 'tablesorter', 'contextMenu']) jQuery.fn[name] = function () { return this; };
        window.loadlist = location.pathname === '/vms'
            ? () => jQuery.get('/plugins/dynamix.vm.manager/include/VMMachines.php', { show: '' }, data => {
                const parts = data.split(/\\0/);
                jQuery('#kvm_list').html(parts[0]);
              })
            : () => jQuery.post('/webGui/include/DashboardApps.php', { docker: 'yes', vms: 'yes', vmusage: 'no' }, data => {
                const parts = data.split('\\0');
                jQuery('#docker_view tr.updated').remove(); jQuery('#docker_view').append(parts[0]);
                jQuery('#vm_view tr.updated').remove(); jQuery('#vm_view').append(parts[1]);
              });
        jQuery(() => window.loadlist());`;

    const page = surface => {
        const vms = surface === 'vms';
        const body = vms
            ? '<div id="displaybox"><div class="title"><span class="left">Virtual Machines</span></div><table id="kvm_table" class="tablesorter four shift"><thead><tr><th>Name</th><th>Description</th><th>CPUs</th><th>Memory</th><th>vDisks</th><th>Graphics</th><th>IP Address</th><th>Autostart</th></tr></thead><tbody id="kvm_list"><tr><td colspan="8"></td></tr></tbody></table></div>'
            : '<div id="displaybox"><div class="frame"><table class="dashboard"><tbody id="docker_view"><tr><td><div class="tile-header"><div class="tile-header-left"><div class="section"><h3 class="tile-header-main">Docker Containers</h3></div></div></div></td></tr></tbody>'
              + '<tbody id="vm_view"><tr><td><div class="tile-header"><div class="tile-header-left"><div class="section"><h3 class="tile-header-main">Virtual Machines</h3></div></div></div></td></tr></tbody>'
              + '<tbody><tr><td><span class="cpu load">3%</span></td></tr></tbody></table></div></div>';
        const live = vms ? '' : `<script>setInterval(() => { const load = document.querySelector('span.cpu.load'); if (load) load.textContent = (Math.random() * 30 | 0) + '%'; }, 1000);</script>`;
        return '<!doctype html><html><head><meta charset="utf-8"><meta name="fv-request-token" content="fixture-request-token-1234567890">'
            + meta('fvplus-i18n-config', catalogs(vms ? ['vm', 'diagnostics'] : ['dashboard', 'diagnostics']))
            + meta('fvplus-page-i18n', { mode: vms ? 'vms' : 'dashboard' })
            + meta('fvplus-runtime-context', { page: vms ? 'VMs' : 'Dashboard', pluginVersion: 'compat', unraidVersion: '7.2.0' })
            + (vms ? '' : meta('fvplus-page-data', { dashboardPluginVersion: 'compat', assetUrls: { chartStack: ['chart.min.js', 'moment.min.js', 'chartjs-adapter-moment.min.js', 'chartjs-plugin-streaming.min.js'].map(file => prefix + 'scripts/include/' + file + '?v=compat') } }))
            + '<style>body{font:14px Arial;background:#1d1d1f;color:#eee;margin:16px}.img{width:32px}</style></head><body>'
            + '<div id="header"><div id="UserProfile"></div></div><div id="menu"><div class="nav-tile"><div class="nav-item active"><a href="/' + (vms ? 'VMs' : 'Dashboard') + '">' + (vms ? 'VMs' : 'Dashboard') + '</a></div></div></div>'
            + body + script('/vendor/jquery.js') + `<script>${unraidScript}</script>`
            + scriptsFrom(read('langs/script.php')).map(script).join('')
            + ['runtime.image-fallbacks', 'folderviewplus.csp-events', 'folderviewplus.safe-dom'].map(file => script(prefix + 'scripts/' + file + '.js')).join('')
            + pluginPage(vms ? 'folderview.plus.VMs.page' : 'folderview.plus.Dashboard.page') + live + '</body></html>';
    };

    // Unraid's markup: DashboardApps.php (Docker and VM chips) and VMMachines.php (VM rows).
    const dockerChips = runtime => Object.values(runtime).map(ct => {
        const status = ct.running ? 'started' : 'stopped';
        const id = String(ct.id).slice(0, 12);
        return `<span class='outer solid apps ${status}'><span id='${id}' onclick="addDockerContainerContext('${ct.name}','sha256:0','',${ct.running ? 1 : 0},0,0,'false','','','sh','${id}','','','','','')" class='hand'><img src='${prefix}images/folder-icon.png' class='img'></span><span class='inner'><span class=''>${ct.name}</span><br><i class='fa fa-${ct.running ? 'play' : 'square'} ${status} ${ct.running ? 'green-text' : 'red-text'}'></i><span class='state'>${status}</span></span></span>`;
    }).join('');
    const vmChips = () => Object.values(vmRuntime).map(vm => {
        const status = vm.state === 'running' ? 'started' : 'stopped';
        return `<span class='outer solid vms ${status}'><span id='vm-${vm.uuid}' onclick="addVMContext('${vm.name}','${vm.uuid}','',' ${vm.state}','','','','','')" class='hand'><img src='${vm.icon}' class='img'></span><span class='inner'>${vm.name}<br><i class='fa fa-${status === 'started' ? 'play' : 'square'} ${status} ${status === 'started' ? 'green-text' : 'red-text'}'></i><span class='state'>${status}</span></span></span>`;
    }).join('');
    const vmRows = () => vmNames.map((name, index) => {
        const vm = vmRuntime[name];
        const status = vm.state === 'running' ? 'started' : 'stopped';
        return `<tr parent-id='${index}' class='sortable'><td class='vm-name' style='width:220px;padding:8px'><i class='fa fa-arrows-v mover orange-text'></i><span class='outer'><span id='vm-${vm.uuid}' onclick="addVMContext('${name}','${vm.uuid}')" class='hand'><img src='${vm.icon}' class='img'></span><span class='inner'><a href='#' onclick='return toggle_id("name-${index}")' title='click for more VM info'>${name}</a><br><i class='fa fa-${status === 'started' ? 'play' : 'square'} ${status} ${status === 'started' ? 'green-text' : 'red-text'}'></i><span class='state'>${status} </span></span></span></td>`
            + `<td></td><td><a class='vcpu-${vm.uuid}'>2</a></td><td>4G</td><td title=''><span class='state'>1</span></td><td><span class='vmgraphics'>VNC</span></td><td><span class='vmgraphics'>-</span></td><td><input class='autostart' type='checkbox' uuid='${vm.uuid}'></td></tr>`
            + `<tr child-id='${index}' id='name-${index}' style='display:none'><td colspan='8' style='margin:0;padding:0'><table class='tablesorter domdisk'><thead class='child'><tr><th>Disk devices/Volume</th></tr></thead><tbody class='child'><tr><td>/mnt/user/domains/${name}/vdisk1.img</td></tr></tbody></table></td></tr>`;
    }).join('');

    const send = (res, body, type = 'application/json') => {
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    fixture.server.on('request', async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        try {
            if (url.pathname === '/dashboard' || url.pathname === '/vms') return send(res, page(url.pathname.slice(1)), 'text/html');
            if (url.pathname === '/webGui/include/DashboardApps.php') {
                const docker = await dockerSnapshot();
                return send(res, `<tr title='' class='updated'><td>${dockerChips(docker.runtime)}</td></tr>\0<tr title='' class='updated'><td>${vmChips()}</td></tr>\0`, 'text/html');
            }
            if (url.pathname === '/plugins/dynamix.vm.manager/include/VMMachines.php') return send(res, vmRows() + '\0', 'text/html');
            if (url.pathname.startsWith(prefix + 'server/')) {
                const endpoint = path.basename(url.pathname);
                const type = url.searchParams.get('type') || 'docker';
                if (endpoint === 'runtime_snapshot.php' && type === 'docker' && url.searchParams.get('fixture') !== 'raw') return send(res, await dockerSnapshot());
                if (endpoint === 'runtime_snapshot.php' && type === 'all') {
                    return send(res, { ok: true, kind: 'runtime_config_bootstrap', schemaVersion: 1, snapshots: { docker: await dockerSnapshot(), vm: vmSnapshot() } });
                }
                if (type === 'vm') {
                    if (endpoint === 'runtime_snapshot.php') return send(res, vmSnapshot());
                    if (endpoint === 'read.php') return send(res, vmFolders);
                    if (endpoint === 'read_info.php') return send(res, vmRuntime);
                    if (endpoint === 'read_order.php') return send(res, vmOrder);
                    if (endpoint === 'read_unraid_order.php') return send(res, vmNames);
                }
                if (endpoint === 'read_unraid_order.php') return send(res, (await dockerSnapshot()).unraidOrder);
                if (endpoint === 'reconcile_member_identities.php') return send(res, { ok: true, changed: false });
            }
        } catch (error) {
            res.writeHead(500); res.end(String(error)); return;
        }
        return fixtureHandler(req, res);
    });

    await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${fixture.server.address().port}`;
    return { origin, server: fixture.server, vmFolderCount, vmCount };
}
