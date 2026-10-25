// The edge cases: FolderView Plus and FolderView3 (and no plugin) on the fake Unraid server, one
// setting changed at a time from a base, with the clicks a user makes, on the Docker, VMs and
// Dashboard pages, the plugins' settings pages and their folder editor.

// Ready: the list is there and has not changed for two seconds (folders built).
const listReady = () => {
    const list = document.getElementById('docker_list') || document.getElementById('kvm_list');
    if (!list) return false;
    const filled = list.querySelector('td.ct-name, td.vm-name') || /No Docker|No Virtual/i.test(list.textContent);
    const sig = list.querySelectorAll('tr').length + ':' + list.querySelectorAll('tr.folder').length + ':' + (document.documentElement.className.length);
    if (window.tpSig !== sig) { window.tpSig = sig; window.tpSigAt = Date.now(); return false; }
    return Boolean(filled) && Date.now() - window.tpSigAt > 2000;
};
const dashboardReady = () => {
    const tile = document.getElementById('docker_view');
    if (!tile || !tile.querySelector('span.outer')) return false;
    const sig = tile.querySelectorAll('span.outer').length + ':' + document.querySelectorAll('#vm_view span.outer').length;
    if (window.tpSig !== sig) { window.tpSig = sig; window.tpSigAt = Date.now(); return false; }
    return Date.now() - window.tpSigAt > 2000;
};
const pageReady = () => document.readyState === 'complete' && (window.tpLoadedAt = window.tpLoadedAt || Date.now()) && Date.now() - window.tpLoadedAt > 3000;

// Steps (the same in both runs).
const click = (selector, index = 0) => async tab => {
    const target = tab.locator(selector).nth(index);
    await target.scrollIntoViewIfNeeded({ timeout: 3000 });
    await target.click({ timeout: 3000 });
};
const folderButton = list => `#${list} tr.folder button.folder-dropdown`;
const steps = {
    openFolder: { name: 'open first folder', run: click(folderButton('docker_list'), 0), wait: 1500 },
    closeFolder: { name: 'close it again', run: click(folderButton('docker_list'), 0), wait: 1500 },
    expandAll: { name: 'expand all', run: async tab => {
        const button = tab.locator('button, a').filter({ hasText: /^\s*Expand All\s*$/i });
        if (await button.count()) return button.first().click();
        const n = await tab.locator(folderButton('docker_list')).count();
        for (let i = 0; i < n; i++) await tab.locator(folderButton('docker_list')).nth(i).click();
    }, wait: 2500 },
    advanced: { name: 'advanced view', run: tab => tab.evaluate(() => document.querySelector('.ToggleViewMode .switch-button-background').click()), wait: 2000 },
    containerMenu: { name: 'container menu', run: async tab => {
        await tab.evaluate(() => { const hand = [...document.querySelectorAll('#docker_list td.ct-name:not(.folder-name) span.hand')].find(el => el.getBoundingClientRect().height > 0); hand.scrollIntoView({ block: 'center' }); });
        await tab.locator('#docker_list td.ct-name:not(.folder-name) span.hand >> visible=true').first().click();
    }, wait: 1000 },
    folderMenu: { name: 'folder menu', run: click('#docker_list tr.folder span.hand', 0), wait: 1000 },
    escape: { name: 'close menu', run: tab => tab.mouse.click(5, 5), wait: 600 },
    hoverPreview: { name: 'hover preview', run: async tab => { await tab.locator('#docker_list tr.folder .folder-preview span.hand, #docker_list tr.folder .folder-preview img').first().hover({ timeout: 3000 }); }, wait: 1200 },
    stopOne: { name: 'stop a container', run: tab => tab.evaluate(() => { const ct = docker.find(item => item.state == 1 && !item.pause); eventControl({ action: 'stop', container: ct.id }, 'loadlist'); }), wait: 5000 },
    unlock: { name: 'unlock sorting', run: tab => tab.evaluate(() => LockButton()), wait: 1000 },
    bottom: { name: 'scroll to the end', run: tab => tab.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight)), wait: 800 },
    phone: { name: 'phone width', run: tab => tab.setViewportSize({ width: 390, height: 844 }), wait: 2000 },
    tablet: { name: 'tablet width', run: tab => tab.setViewportSize({ width: 1024, height: 768 }), wait: 2000 },
    // VMs page
    openVmFolder: { name: 'open first VM folder', run: click(folderButton('kvm_list'), 0), wait: 1500 },
    vmDetails: { name: 'VM details', run: async tab => { await tab.locator('#kvm_list tr[parent-id]:not(.folder) a[onclick*="toggle_id"] >> visible=true').first().click({ timeout: 3000 }); }, wait: 1200 },
    vmMenu: { name: 'VM menu', run: async tab => { await tab.locator('#kvm_list tr[parent-id]:not(.folder) span.hand >> visible=true').first().click({ timeout: 3000 }); }, wait: 1000 },
    startVm: { name: 'start a VM', run: tab => tab.evaluate(() => { const row = [...document.querySelectorAll('#kvm_list span.hand[id^="vm-"]')].find(el => el.closest('tr') && /stopped/.test(el.closest('tr').textContent)); ajaxVMDispatch({ action: 'domain-start', uuid: row.id.slice(3) }, 'loadlist'); }), wait: 4000 },
    // Dashboard
    dashFolder: { name: 'open a folder on the tile', run: async tab => {
        const target = tab.locator('#docker_view [class*="folder-showcase-outer"] span.hand >> visible=true, #docker_view .folder-docker span.hand >> visible=true').first();
        await target.scrollIntoViewIfNeeded({ timeout: 3000 }); await target.click({ timeout: 3000 });
    }, wait: 1500 },
    dashAllApps: { name: 'all apps switch', run: async tab => { await tab.evaluate(() => { const box = document.querySelector('#docker_view .switch-button-background, #apps'); box.scrollIntoView({ block: 'center' }); box.click(); }); }, wait: 2500 },
    // Sorting and autostart: unlock, drag the 3rd row to the top, switch the first loose row's
    // autostart, set a wait (advanced view).
    dragRow: { name: 'drag a row to the top', run: async tab => {
        await tab.evaluate(() => LockButton());
        const list = await tab.evaluate(() => document.getElementById('docker_list') ? 'docker_list' : 'kvm_list');
        const boxes = await tab.evaluate(id => [...document.querySelectorAll('#' + id + ' > tr')].filter(r => r.getBoundingClientRect().height > 0).slice(0, 3).map(r => { r.scrollIntoView({ block: 'nearest' }); const b = r.getBoundingClientRect(); return [b.left + 120, b.top + b.height / 2]; }), list);
        const [fx, fy] = boxes[2], [, ty] = boxes[0];
        await tab.mouse.move(fx, fy); await tab.mouse.down(); await tab.waitForTimeout(250);
        for (let i = 1; i <= 15; i++) { await tab.mouse.move(fx, fy + (ty - 15 - fy) * i / 15); await tab.waitForTimeout(30); }
        await tab.mouse.up();
    }, wait: 3000 },
    toggleAutostart: { name: 'switch autostart', run: tab => tab.evaluate(() => {
        const row = [...document.querySelectorAll('#docker_list > tr.sortable:not(.folder), #kvm_list > tr.sortable:not(.folder)')].find(r => r.querySelector('input.autostart') && r.getBoundingClientRect().height > 0);
        (row.querySelector('.switch-button-background') || row.querySelector('input.autostart')).click();
    }), wait: 2500 },
    setWait: { name: 'set a wait', run: tab => tab.evaluate(() => { const input = [...document.querySelectorAll('#docker_list input.wait')].find(i => i.offsetParent); if (input) { input.value = '7'; $(input).change(); } }), wait: 2500 },
    fv3AutostartTab: { name: 'Autostart tab: drag, position, wait, apply', run: async tab => {
        await tab.evaluate(() => [...document.querySelectorAll('#displaybox a, #displaybox button, [role=tab], .tabs label')].find(e => e.textContent.trim() === 'Autostart').click());
        await tab.waitForTimeout(1500);
        const rows = tab.locator('#fv3-as-rows tr.fv3-as-item').filter({ visible: true });
        await rows.nth(3).dragTo(rows.nth(0), { targetPosition: { x: 150, y: 3 } });
        const pos = rows.nth(5).locator('.fv3-as-pos-input'); await pos.fill('2'); await pos.press('Enter'); await pos.blur();
        const wait = rows.nth(1).locator('.fv3-as-wait'); await wait.fill('33'); await wait.press('Tab');
        await tab.locator('button, input[type=button]').filter({ hasText: /^Apply$/ }).filter({ visible: true }).first().click();
    }, wait: 3000 },
    plusReorder: { name: 'reorder folders in the settings table', run: async tab => {
        const handles = tab.locator('.folder-drag-handle').filter({ visible: true });
        const rows = tab.locator('tr[data-folder-id]').filter({ visible: true });
        await handles.nth(3).dragTo(rows.nth(0), { targetPosition: { x: 300, y: 5 } });
    }, wait: 3000 },
    dashTile: { name: 'scroll to the Docker tile', run: tab => tab.evaluate(() => document.getElementById('docker_view').scrollIntoView({ block: 'start' })), wait: 800 },
};
const full = [steps.openFolder, steps.closeFolder, steps.expandAll, steps.advanced, steps.containerMenu, steps.escape, steps.folderMenu, steps.escape, steps.stopOne, steps.unlock, steps.bottom, steps.tablet, steps.phone];
const short = [steps.openFolder, steps.advanced, steps.bottom, steps.phone];

const containers = (extra = {}) => ({ count: 40, stopped: 3, updates: [2, 9], paused: [4], noTemplate: [7], thirdParty: [11], compose: [13], ...extra });
const docker = (extra = {}) => ({ path: '/Docker', ready: listReady, steps: short, ...extra });
const vms = (extra = {}) => ({ path: '/VMs', ready: listReady, steps: [steps.openVmFolder, steps.vmDetails, steps.vmMenu, steps.escape, steps.startVm, steps.bottom, steps.phone], ...extra });
const dashboard = (extra = {}) => ({ path: '/Dashboard', ready: dashboardReady, steps: [steps.dashTile, steps.dashFolder, steps.dashAllApps, steps.phone, steps.dashTile], ...extra });
const page = (path, extra = {}) => ({ path, ready: pageReady, settle: 2000, steady: 4000, steps: [steps.bottom, steps.phone], ...extra });

export const cases = [];
const add = (name, scenario, pageSpec = docker()) => cases.push({ name, scenario, page: pageSpec });

for (const plugin of ['fvplus', 'fv3']) {
    const base = (extra = {}) => ({ containers: containers(), vms: { count: 10, paused: [3] }, vmFolders: { count: 3 }, plugin, folders: { count: 6 }, aurora: {}, display: {}, ...extra });
    const tag = plugin === 'fvplus' ? 'plus' : 'fv3';
    add(`${tag} base`, base(), docker({ steps: full }));
    // Container and folder counts.
    add(`${tag} no containers`, base({ containers: containers({ count: 0 }), folders: { count: 2, members: 'none' } }), docker({ steps: [steps.advanced, steps.phone] }));
    add(`${tag} one container`, base({ containers: containers({ count: 1, stopped: 0, updates: [], paused: [], noTemplate: [], thirdParty: [], compose: [] }), folders: { count: 1, loose: 0 } }));
    add(`${tag} no folders`, base({ folders: { count: 0 } }), docker({ steps: [steps.advanced, steps.containerMenu, steps.escape, steps.stopOne, steps.phone] }));
    add(`${tag} one folder with everything`, base({ folders: { count: 1, members: 'all-in-one' } }), docker({ steps: [steps.openFolder, steps.advanced, steps.bottom, steps.phone] }));
    add(`${tag} empty folders`, base({ folders: { count: 6, empty: 3 } }));
    add(`${tag} all stopped`, base({ containers: containers({ allStopped: true }) }));
    add(`${tag} long names`, base({ containers: containers({ names: 'mixed' }), folders: { count: 6, longNames: true } }), docker({ steps: [steps.openFolder, steps.expandAll, steps.advanced, steps.phone] }));
    // FolderView3 restyles every row it opens or rebuilds, and with Aurora's rules each row
    // takes about twice as long to style (spread over the whole stylesheet, no single rule):
    // opening 40 folders one by one takes about 1.5 s of style work instead of 0.7 s, opening
    // 300 containers 13 s instead of 6 s. Allowed up to that, so more than it still fails.
    const fv3Styling = tag === 'fv3' ? { blockedFactor: 3, blockedAllowance: 2500 } : {};
    add(`${tag} 300 containers in 30 folders`, base({ containers: containers({ count: 300 }), folders: { count: 30 } }), docker({ steps: [steps.openFolder, steps.closeFolder, steps.expandAll, steps.advanced, steps.stopOne], ...fv3Styling }));
    add(`${tag} 40 folders of one`, base({ folders: { count: 40, loose: 0 } }), docker({ steps: [steps.openFolder, steps.expandAll, steps.phone], ...fv3Styling }));
    add(`${tag} docker busy`, base({ busy: true }), docker({ steps: [steps.openFolder, steps.advanced], steady: 12000 }));
    // Aurora's settings.
    add(`${tag} aurora top layout`, base({ aurora: { layout: 'top' } }));
    add(`${tag} aurora enhancements off`, base({ aurora: { enhance: 'no' } }));
    add(`${tag} aurora theme off`, base({ aurora: { theme: 'no' } }));
    add(`${tag} aurora accent and unraid font`, base({ aurora: { accent: '#e11d48', font: 'unraid' } }), docker({ steps: [steps.openFolder, steps.advanced] }));
    // Unraid's Display Settings and cookies.
    add(`${tag} white theme`, base({ display: { theme: 'white' } }));
    add(`${tag} fixed listing height`, base({ display: { resize: '1' } }));
    add(`${tag} small font`, base({ display: { font: '56.25' } }));
    add(`${tag} unlimited width, large font`, base({ display: { width: '1', font: '68.75' } }));
    add(`${tag} comma decimals`, base({ display: { number: ',.' } }), docker({ steps: [steps.openFolder, steps.advanced] }));
    add(`${tag} advanced view at load`, base(), docker({ cookies: { docker_listview_mode: 'advanced' }, steps: [steps.openFolder, steps.expandAll, steps.bottom] }));
    add(`${tag} phone`, base(), docker({ viewport: { width: 390, height: 844 }, steps: [steps.openFolder, steps.closeFolder, steps.containerMenu, steps.escape, steps.advanced, steps.bottom] }));
    add(`${tag} 1920`, base(), docker({ viewport: { width: 1920, height: 1080 }, steps: [steps.openFolder, steps.expandAll, steps.advanced] }));
    // VMs, Dashboard, settings, folder editor.
    add(`${tag} vms`, base(), vms());
    add(`${tag} vms without folders, 40 VMs`, base({ vms: { count: 40, long: true }, vmFolders: { count: 0 } }), vms({ steps: [steps.vmDetails, steps.vmMenu, steps.escape, steps.bottom, steps.phone] }));
    add(`${tag} vms in 8 folders`, base({ vms: { count: 40 }, vmFolders: { count: 8 } }));
    add(`${tag} dashboard`, base(), dashboard());
    add(`${tag} dashboard white, top layout`, base({ display: { theme: 'white' }, aurora: { layout: 'top' } }), dashboard());
    add(`${tag} settings page`, base(), page(plugin === 'fvplus' ? '/Settings/FolderViewPlus' : '/Settings/FolderView3'));
    add(`${tag} folder editor`, base(), page('/Docker/Folder?type=docker&id=folder0'));
    // Sorting and autostart: what is saved must be the same with Aurora.
    add(`${tag} sorting and autostart`, base(), docker({ files: true, cookies: { docker_listview_mode: 'advanced' }, steps: [steps.dragRow, steps.toggleAutostart, steps.setWait] }));
    add(`${tag} vm sorting and autostart`, base(), vms({ files: true, steps: [steps.dragRow, steps.toggleAutostart] }));
    if (plugin === 'fv3') {
        add('fv3 custom start sequence, toggle on the Docker page', base({ fv3Autostart: { mode: 'custom', sequence: ['tautulli', 'jellyfin', 'plex', 'grafana', 'home-assistant', 'radarr'] } }), docker({ files: true, steps: [steps.dragRow, steps.toggleAutostart] }));
        add('fv3 autostart tab', base({ fv3Autostart: { mode: 'custom', sequence: ['tautulli', 'jellyfin', 'plex', 'grafana', 'home-assistant', 'radarr'] } }), page('/Settings/FolderView3', { files: true, steps: [steps.fv3AutostartTab, steps.phone] }));
    } else {
        add('plus settings reorder', base(), page('/Settings/FolderViewPlus', { files: true, steps: [steps.plusReorder, steps.phone] }));
        add('plus start batches', base({ pluginSettings: { dockerStartOrder: { mode: 'custom-batches', remaining: 'before', batches: [{ id: 'b1', name: 'DB first', delay: 15, items: [{ type: 'folder', id: 'folder4' }] }, { id: 'b2', name: 'Apps', parallel: true, items: [{ type: 'container', name: 'plex' }, { type: 'container', name: 'tautulli' }] }] } } }), docker({ files: true, cookies: { docker_listview_mode: 'advanced' }, steps: [steps.dragRow, steps.toggleAutostart, steps.setWait] }));
    }
    // The plugins' own settings.
    if (plugin === 'fv3') {
        for (const preview of [0, 2, 3, 4]) add(`fv3 preview ${preview}`, base({ folders: { count: 6, settings: { preview } } }), docker({ steps: [steps.openFolder, steps.hoverPreview, steps.advanced, steps.phone] }));
        add('fv3 preview on hover', base({ folders: { count: 6, settings: { preview_hover: true } } }), docker({ steps: [steps.hoverPreview, steps.openFolder, steps.phone] }));
        add('fv3 folders open at load', base({ folders: { count: 6, settings: { expand_tab: true, expand_dashboard: true } } }));
        add('fv3 preview extras', base({ folders: { count: 6, settings: { preview_vertical_bars: true, preview_grayscale: true, preview_status: 'symbol', preview_text_width: '80px', preview_border: false } } }), docker({ steps: [steps.openFolder, steps.hoverPreview, steps.advanced] }));
        add('fv3 no update column', base({ folders: { count: 6, settings: { update_column: false } } }), docker({ steps: [steps.openFolder, steps.advanced] }));
        add('fv3 context tooltip', base({ folders: { count: 6, settings: { context: 2, context_trigger: 1 } } }), docker({ steps: [steps.hoverPreview, steps.openFolder] }));
        for (const overflow of ['scroll', 'expand']) add(`fv3 overflow ${overflow}`, base({ pluginSettings: { default_overflow: overflow }, folders: { count: 6, members: 'all-in-one' } }), docker({ steps: [steps.openFolder, steps.advanced, steps.phone] }));
        add('fv3 row separator', base({ pluginSettings: { default_row_separator: 'yes' } }), docker({ steps: [steps.openFolder, steps.advanced] }));
        for (const layout of ['fullwidth', 'accordion', 'inset', 'embossed']) add(`fv3 dashboard ${layout}`, base({ pluginSettings: { dashboard_docker_layout: layout, dashboard_vm_layout: layout } }), dashboard());
        add('fv3 aurora view', base({ aurora: { dockerview: 'aurora' } }), docker({ sameShown: false, sameFolders: false, steps: [steps.advanced, steps.containerMenu, steps.escape, steps.stopOne, steps.phone] }));
        add('fv3 aurora view vms', base({ aurora: { dockerview: 'aurora' } }), vms({ sameShown: false, sameFolders: false, steps: [steps.vmDetails, steps.vmMenu, steps.escape, steps.phone] }));
        add('fv3 aurora view dashboard', base({ aurora: { dockerview: 'aurora' } }), dashboard({ sameShown: false, sameFolders: false, steps: [steps.dashTile, steps.dashAllApps, steps.phone] }));
    } else {
        for (const mode of ['host', 'command']) add(`plus page view ${mode}`, base({ pluginSettings: { pageViewMode: mode } }), docker({ steps: [steps.advanced, steps.containerMenu, steps.escape, steps.bottom, steps.phone] }));
        for (const mode of ['host', 'safe', 'highcontrast']) add(`plus theme mode ${mode}`, base({ pluginSettings: { themeCompatibilityMode: mode } }), docker({ steps: [steps.openFolder, steps.advanced] }));
        add('plus live refresh', base({ pluginSettings: { liveRefreshEnabled: true, liveRefreshSeconds: 10 } }), docker({ steady: 15000, steps: [steps.openFolder, steps.advanced] }));
        for (const width of ['compact', 'wide']) add(`plus column width ${width}`, base({ pluginSettings: { appColumnWidth: width } }), docker({ steps: [steps.openFolder, steps.advanced, steps.phone] }));
        for (const profile of ['adaptive', 'maximum']) add(`plus performance ${profile}`, base({ containers: containers({ count: 150 }), folders: { count: 15 }, pluginSettings: { performanceProfile: profile, lazyPreviewEnabled: true, lazyPreviewThreshold: 10 } }), docker({ steps: [steps.openFolder, steps.expandAll, steps.advanced] }));
        add('plus nested folders', base({ folders: { count: 8, nested: 3 } }), docker({ steps: [steps.openFolder, steps.expandAll, steps.advanced, steps.phone] }));
        add('plus hide empty, no badges, page title', base({ folders: { count: 6, empty: 2 }, pluginSettings: { hideEmptyFolders: true, badges: { running: false, stopped: false, updates: false }, pageTitle: { enabled: true, text: 'My containers' } } }));
        add('plus health and status detail', base({ pluginSettings: { health: { cardsEnabled: true, runtimeBadgeEnabled: true }, status: { mode: 'dominant', displayMode: 'detailed' } } }), docker({ steps: [steps.openFolder, steps.advanced] }));
        add('plus pinned and manual order', base({ pluginSettings: { sortMode: 'manual', pinnedFolderIds: ['folder2'], manualOrder: ['folder3', 'folder1'] } }), docker({ steps: [steps.openFolder, steps.advanced] }));
        add('plus folder settings', base({ folders: { count: 6, settings: { preview: 2, preview_hover: true, preview_overflow: 'expand', update_column: false, context: 2 }, perFolder: [{ expand_tab: true }, { preview: 3 }, { preview: 4 }, { preview: 0 }] } }), docker({ steps: [steps.hoverPreview, steps.openFolder, steps.advanced, steps.phone] }));
        for (const layout of ['legacy', 'fullwidth', 'accordion', 'inset', 'compactmatrix', 'embossed']) add(`plus dashboard ${layout}`, base({ pluginSettings: { dashboard: { layout } } }), dashboard());
        add('plus dashboard greyscale, no labels, hover preview', base({ pluginSettings: { dashboard: { greyscale: true, folderLabel: false, expandToggle: false, previewContext: 'advanced', previewTrigger: 'hover' } } }), dashboard());
    }
}
// No folder plugin at all, for reference.
add('no plugin', { containers: containers(), vms: { count: 10 }, plugin: null, aurora: {} }, docker({ sameShown: false, steps: [steps.advanced, steps.containerMenu, steps.escape, steps.stopOne, steps.phone] }));
