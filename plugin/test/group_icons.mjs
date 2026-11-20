// Group icons (#40) on the real Docker, VMs and Dashboard pages of the FolderView3 host
// (fv3_host.mjs) in Aurora's view: the icons stored with the groups show in the tabs' section
// headers and on the Dashboard's group chips, and the picker sets one from every source (an icon
// on the page, a symbol, a file from the PC, a web address, back to the default) and saves it.
// A file from the PC is checked in the browser before anything is sent (size, type by content,
// pixels, readable), and uploads and downloads show their progress.
//
// Aurora's PHP endpoints are answered by stand-ins here, which, like Unraid, refuse anything but
// URL-encoded forms (Unraid's login check hangs on multipart bodies). group_icons_stack.sh runs
// this check against the real endpoints behind a server set up like Unraid's instead
// (AURORA_STACK, AURORA_STACK_COOKIE, AURORA_STACK_TOKEN).
//
//   FV3=/tmp/fv3 node plugin/test/group_icons.mjs   (FV3 as for fv3_compat.mjs; UNRAID_WEBGUI,
//   THEME=white and SCREENSHOTS=dir work as there)
//
// Needs Playwright with Chromium and Node 22 or newer. Exits with 1 on any failure.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createFv3Host } from './fv3_host.mjs';
import { loadPlaywright, openWithAurora, repo, requireCheckout } from './compat_lib.mjs';

const fv3 = requireCheckout('FV3', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/docker.js', 'Set FV3 to a FolderView3 checkout (see fv3_compat.mjs).');
const theme = process.env.THEME === 'white' ? 'white' : 'black';
const shots = process.env.SCREENSHOTS || '';
const stack = (process.env.AURORA_STACK || '').replace(/\/$/, '');
const stackCookie = process.env.AURORA_STACK_COOKIE || '';
const token = process.env.AURORA_STACK_TOKEN || 'fixture-csrf-token';

const auroraPage = fs.readFileSync(path.join(repo, 'plugin/src/AuroraTheme.page'), 'utf8');
const auroraViewScript = auroraPage.match(/<\?php if \(\$auroraDockerView === 'aurora'\): \?>\s*([\s\S]*?)<\?php endif; \?>/)[1];

/** The icon value the server gives an image: its SHA-1 and type. */
const iconOf = (bytes, extension) => 'upload:' + crypto.createHash('sha1').update(bytes).digest('hex') + '.' + extension;

/**
 * A greyscale PNG of the given size, for the pixel limit (zlib.crc32: Node 22 or newer).
 */
function pngOf(width, height) {
    const chunk = (type, data) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        out.write(type, 4, 'latin1');
        data.copy(out, 8);
        out.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 8 + data.length);
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.alloc((width + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const uploaded = iconOf(png, 'png');
// A real image on the web for the stack run; the stand-ins answer any address but example.com.
const imageUrl = 'https://raw.githubusercontent.com/unraid/webgui/master/emhttp/plugins/dynamix.docker.manager/images/question.png';
const pageUrl = 'https://example.com/';

// Media: a symbol; Tools: an uploaded image; Backup: no icon (it gets one in the steps).
const dockerGroups = [
    { name: 'Media', containers: ['fixture-app-1', 'fixture-app-2'], icon: 'fa-film' },
    { name: 'Tools', containers: ['fixture-app-3', 'fixture-app-4'], icon: uploaded },
    { name: 'Backup', containers: ['fixture-app-5'] },
];
const vmGroups = [{ name: 'Desktops', containers: ['fixture-vm-0', 'fixture-vm-1'], icon: '/plugins/fixture/vm-icon.png' }];
const aurora = {
    dockerView: { folderView: true, plus: false, mode: 'aurora' },
    head: '<script>window.csrf_token = ' + JSON.stringify(token) + '; window.auroraDockerGroups = ' + JSON.stringify(dockerGroups)
        + '; window.auroraVmGroups = ' + JSON.stringify(vmGroups) + "; window.auroraDecimalMark = '.';</script>" + auroraViewScript,
};

const pages = {
    docker: { ready: () => document.getElementById('docker_list')?.classList.contains('tp-ready') && document.querySelectorAll('#docker_list > tr.tp-group').length >= 3 },
    vms: { ready: () => document.querySelectorAll('#kvm_list > tr.tp-group').length > 0 },
    dashboard: { ready: () => document.querySelectorAll('#docker_view .tp-group-chip').length >= 3 && document.querySelectorAll('#vm_view .tp-group-chip').length >= 1 },
};

/**
 * Aurora's endpoints: saves to docker-groups.php are recorded in log.saves and every POST to
 * group-icons.php in log.posts. With AURORA_STACK they go on to that server; otherwise stand-ins
 * answer: they refuse multipart as Unraid does (by never answering there; here with an error),
 * store "uploads" under their SHA-1 and answer after 400 ms, so the progress shows.
 */
function endpoints(log) {
    /** Passes a request on to the stack server with its session cookie. */
    const forward = async route => {
        const request = route.request();
        const url = new URL(request.url());
        const response = await route.fetch({ url: stack + url.pathname + url.search, headers: { ...request.headers(), cookie: stackCookie } });
        return route.fulfill({ response });
    };
    const answer = (route, status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    return [
        ['**/plugins/Aurora-Theme/include/docker-groups.php**', route => {
            const request = route.request();
            if (request.method() === 'POST') {
                const groups = JSON.parse(new URLSearchParams(request.postData() || '').get('groups') || '[]');
                log.saves.push({ type: request.url().includes('type=vm') ? 'vm' : 'docker', groups });
                if (!stack) return answer(route, 200, { groups });
            }
            return stack ? forward(route) : answer(route, 200, { groups: dockerGroups });
        }],
        ['**/plugins/Aurora-Theme/include/group-icons.php**', async route => {
            const request = route.request();
            if (request.method() === 'POST') log.posts.push(request.headers()['content-type'] || '');
            if (stack) return forward(route);
            if (request.method() !== 'POST') return route.fulfill({ contentType: 'image/png', body: png });
            if (!/^application\/x-www-form-urlencoded/.test(request.headers()['content-type'] || '')) {
                return answer(route, 400, { error: 'not URL-encoded: Unraid\'s login check would hang' });
            }
            const fields = new URLSearchParams(request.postData() || '');
            if (fields.get('csrf_token') !== token) return answer(route, 403, { error: 'wrong csrf_token' });
            await new Promise(done => setTimeout(done, 400));
            if (fields.get('action') === 'upload') return answer(route, 200, { icon: iconOf(Buffer.from(fields.get('data') || '', 'base64'), 'png') });
            if (fields.get('action') === 'fetch') {
                return /example\.com/.test(fields.get('url') || '')
                    ? answer(route, 400, { error: 'This is not a PNG, JPEG, GIF or WebP image.' })
                    : answer(route, 200, { icon: 'upload:' + 'b'.repeat(40) + '.png' });
            }
            return answer(route, 400, { error: 'Unknown action.' });
        }],
        ['**/plugins/fixture/vm-icon.png', route => route.fulfill({ contentType: 'image/png', body: png })],
    ];
}

/** In the page: what a tab's section headers show as their icon, by group name. */
function headerIcons() {
    return Object.fromEntries([...document.querySelectorAll('tr.tp-group')].map(row => {
        const slot = row.querySelector('.tp-group-icon');
        const node = slot && !slot.hidden ? slot.firstElementChild : null;
        const name = row.querySelector('.tp-group-name').textContent;
        const label = node ? (node.tagName === 'IMG' ? 'img:' + node.getAttribute('src') : node.className) : '';
        const icon = node ? node.getBoundingClientRect() : null;
        const text = row.querySelector('.tp-group-name').getBoundingClientRect();
        // Nothing else drawn in the slot (Unraid draws a glyph for any [data-icon] element).
        const stray = slot ? getComputedStyle(slot, '::before').content !== 'none' || getComputedStyle(slot, '::after').content !== 'none' : false;
        return [name, { label, stray, overlaps: Boolean(icon && icon.right > text.left + 0.5), rotated: node && node.tagName === 'I' ? getComputedStyle(node).transform !== 'none' : false }];
    }));
}

/** In the page: the picker's status line, progress bar and problem as they are now. */
function pickerState() {
    const box = document.querySelector('.tp-icon-picker');
    if (!box) return null;
    const status = box.querySelector('.tp-icon-status');
    const progress = box.querySelector('.tp-icon-progress');
    return {
        status: status.hidden ? '' : status.textContent,
        progress: progress.hidden ? '' : (progress.classList.contains('tp-indeterminate') ? 'moving' : 'value ' + progress.getAttribute('aria-valuenow')),
        problem: box.querySelector('.tp-modal-problem').textContent,
    };
}

/** Opens the icon picker of the group named name from its header's button. */
async function openPicker(tab, name) {
    const header = tab.locator('tr.tp-group', { has: tab.locator('.tp-group-name', { hasText: new RegExp('^' + name + '$') }) });
    await header.locator('button.tp-group-icon-button').click();
    await tab.locator('.tp-icon-picker').waitFor();
}

/** Chooses a file in the open picker and waits until it shows a problem; returns the problem. */
async function refusedFile(tab, file) {
    await tab.locator('.tp-icon-picker input[type="file"]').setInputFiles(file);
    await tab.waitForFunction(() => document.querySelector('.tp-icon-picker .tp-modal-problem')?.textContent, null, { timeout: 10000 });
    return (await tab.evaluate(pickerState)).problem;
}

/** The icon the last save gave the group named name ('' for none), or undefined without a save. */
function savedIcon(saves, name) {
    const last = saves[saves.length - 1];
    const group = last && last.groups.find(entry => entry.name === name);
    return group ? (group.icon || '') : undefined;
}

const problems = [];
/** Records a failed expectation. */
const expect = (passed, message) => { if (!passed) problems.push(message); };
const run = stack ? 'stack server' : 'stand-ins';

const browser = await loadPlaywright(fv3).chromium.launch();
const host = await createFv3Host(fv3, { folders: 4, members: 12, vms: 6, vmFolders: 2 });
const count = { members: 12, vms: 6 };

// Docker tab: the stored icons, then every way to set one.
{
    const log = { saves: [], posts: [] };
    const saves = log.saves;
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.docker, name: 'docker', url: `${host.origin}/docker` }, count, aurora, endpoints(log));
    let icons = await tab.evaluate(headerIcons);
    expect(icons.Media?.label === 'fa fa-film', `Docker: Media shows "${icons.Media?.label}", not the film symbol`);
    expect((icons.Tools?.label || '').endsWith('group-icons.php?file=' + uploaded.slice('upload:'.length)), `Docker: Tools shows "${icons.Tools?.label}", not its uploaded image`);
    expect(icons.Backup?.label === '', 'Docker: Backup shows an icon although it has none');
    expect(icons.Ungrouped?.label === '', 'Docker: Ungrouped shows an icon');
    expect(Object.values(icons).every(icon => !icon.overlaps), 'Docker: an icon overlaps its group name');
    expect(Object.values(icons).every(icon => !icon.stray), 'Docker: something else is drawn in a group icon\'s place');
    if (stack) {
        await tab.waitForTimeout(500);
        const loaded = await tab.evaluate(() => [...document.querySelectorAll('tr.tp-group .tp-group-icon img')].every(image => image.complete && image.naturalWidth > 0));
        expect(loaded, 'Docker: an uploaded icon did not load from the server');
    }

    await openPicker(tab, 'Backup');
    const picker = await tab.evaluate(() => ({
        headings: [...document.querySelectorAll('.tp-icon-picker-heading')].map(node => node.textContent),
        pageIcons: document.querySelectorAll('.tp-icon-picker .tp-icon-grid')[0]?.querySelectorAll('img').length || 0,
        symbols: document.querySelectorAll('.tp-icon-picker .tp-icon-choice > i.fa').length,
        fits: document.querySelector('.tp-icon-picker').scrollWidth <= document.querySelector('.tp-icon-picker').clientWidth + 1,
    }));
    expect(picker.headings.join('|') === 'Container icons|Symbols|Your own image', `Docker: picker sections are "${picker.headings.join(', ')}"`);
    expect(picker.pageIcons >= 1, 'Docker: the picker offers no container icons');
    expect(picker.symbols >= 70, `Docker: the picker offers ${picker.symbols} symbols`);
    expect(picker.fits, 'Docker: the picker is wider than its window');
    if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await tab.waitForTimeout(400);
        await tab.screenshot({ path: path.join(shots, `group-icons-picker-${theme}.png`) });
    }

    // A symbol.
    await tab.locator('.tp-icon-picker button.tp-icon-choice[aria-label="music"]').click();
    expect(savedIcon(saves, 'Backup') === 'fa-music', `Docker: choosing a symbol saved "${savedIcon(saves, 'Backup')}"`);
    await tab.waitForTimeout(200);
    icons = await tab.evaluate(headerIcons);
    expect(icons.Backup?.label === 'fa fa-music', `Docker: after choosing a symbol Backup shows "${icons.Backup?.label}"`);

    // A container's icon.
    await openPicker(tab, 'Backup');
    await tab.locator('.tp-icon-picker .tp-icon-grid').first().locator('button.tp-icon-choice').first().click();
    expect(/^\/[^/].*\.png/.test(savedIcon(saves, 'Backup') || ''), `Docker: choosing a container icon saved "${savedIcon(saves, 'Backup')}"`);

    // Files from the PC the browser refuses before sending anything, each with its reason.
    await openPicker(tab, 'Backup');
    const postsBefore = log.posts.length;
    const refusals = [
        [{ name: 'large.png', mimeType: 'image/png', buffer: Buffer.concat([png, Buffer.alloc(1100000)]) }, /"large\.png" is 1\.05 MB; an icon can be at most 1 MB\./],
        [{ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('fixture text, not an image') }, /"notes\.png" is not a PNG, JPEG, GIF or WebP image\./],
        [{ name: 'banner.png', mimeType: 'image/png', buffer: pngOf(3000, 1) }, /"banner\.png" is 3000 × 1 pixels; an icon can be at most 2048 × 2048\./],
        [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.concat([png.subarray(0, 40), Buffer.alloc(40, 7)]) }, /"broken\.png" could not be read as an image/],
    ];
    for (const [file, reason] of refusals) {
        const problem = await refusedFile(tab, file);
        expect(reason.test(problem), `Docker: ${file.name} was refused with "${problem}"`);
    }
    expect(log.posts.length === postsBefore, 'Docker: a refused file was sent to the server');

    // A file from the PC: checked, uploaded with progress, saved.
    await tab.locator('.tp-icon-picker input[type="file"]').setInputFiles({ name: 'fixture-icon.png', mimeType: 'image/png', buffer: png });
    if (!stack) {
        await tab.waitForFunction(() => document.querySelector('.tp-icon-picker .tp-icon-progress:not([hidden])'));
        const during = await tab.evaluate(pickerState);
        expect(/"fixture-icon\.png" \(1 KB, 1 × 1 pixels\)/.test(during?.status || ''), `Docker: while uploading the picker says "${during?.status}"`);
        expect(/^(value \d+|moving)$/.test(during?.progress || ''), `Docker: while uploading the progress bar is "${during?.progress}"`);
        expect(during?.problem === '', `Docker: while uploading the picker shows the problem "${during?.problem}"`);
        if (shots) await tab.locator('.tp-icon-picker').screenshot({ path: path.join(shots, `group-icons-uploading-${theme}.png`) });
    }
    await tab.locator('.tp-icon-picker').waitFor({ state: 'detached', timeout: 30000 });
    expect(savedIcon(saves, 'Backup') === uploaded, `Docker: uploading saved "${savedIcon(saves, 'Backup')}"`);

    // A web address: a web page is refused (the message shows, the picker stays), then an image.
    await openPicker(tab, 'Backup');
    const before = saves.length;
    await tab.locator('.tp-icon-picker input[type="url"]').fill(pageUrl);
    await tab.locator('.tp-icon-picker button', { hasText: /^Fetch$/ }).click();
    if (!stack) {
        const during = await tab.evaluate(pickerState);
        expect(during?.progress === 'moving', `Docker: while the server downloads, the progress bar is "${during?.progress}"`);
    }
    await tab.waitForFunction(() => /not a PNG/.test(document.querySelector('.tp-icon-picker .tp-modal-problem')?.textContent || ''), null, { timeout: 30000 });
    const after = await tab.evaluate(pickerState);
    expect(after.progress === '' && after.status === '', 'Docker: the progress stays after a refused web address');
    expect(saves.length === before, 'Docker: a refused web address was saved');
    await tab.locator('.tp-icon-picker input[type="url"]').fill(imageUrl);
    await tab.locator('.tp-icon-picker input[type="url"]').press('Enter');
    await tab.locator('.tp-icon-picker').waitFor({ state: 'detached', timeout: 30000 });
    expect(/^upload:[0-9a-f]{40}\.png$/.test(savedIcon(saves, 'Backup') || ''), `Docker: a web address saved "${savedIcon(saves, 'Backup')}"`);
    expect(log.posts.length > 0 && log.posts.every(type => /^application\/x-www-form-urlencoded/.test(type)), `Docker: sent as ${[...new Set(log.posts)].join(', ')}, not only URL-encoded`);

    // Escape closes without saving; "Default icon" removes the icon.
    await openPicker(tab, 'Backup');
    const beforeEscape = saves.length;
    await tab.keyboard.press('Escape');
    await tab.locator('.tp-icon-picker').waitFor({ state: 'detached' });
    expect(saves.length === beforeEscape, 'Docker: Escape saved a change');
    await openPicker(tab, 'Backup');
    await tab.locator('.tp-icon-picker button', { hasText: /^Default icon$/ }).click();
    expect(savedIcon(saves, 'Backup') === '', `Docker: "Default icon" saved "${savedIcon(saves, 'Backup')}"`);
    await tab.waitForTimeout(200);
    icons = await tab.evaluate(headerIcons);
    expect(icons.Backup?.label === '', 'Docker: Backup still shows an icon after "Default icon"');

    // A collapsed group's symbol is not turned like its arrow.
    await tab.locator('tr.tp-group', { has: tab.locator('.tp-group-name', { hasText: /^Media$/ }) }).locator('button.tp-group-toggle').click();
    await tab.waitForTimeout(500);
    icons = await tab.evaluate(headerIcons);
    expect(!icons.Media?.rotated, 'Docker: the symbol of a collapsed group is turned');
    if (shots) await tab.locator('#docker_containers').screenshot({ path: path.join(shots, `group-icons-docker-${theme}.png`) });
    expect(!errors.length, 'Docker: script errors: ' + errors.join('; '));
    await context.close();
}

// Phone width: the picker fits, its web address field and button are on screen.
{
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.docker, name: 'docker', url: `${host.origin}/docker` }, count, aurora, endpoints({ saves: [], posts: [] }), { width: 390, height: 800 });
    await openPicker(tab, 'Media');
    const phone = await tab.evaluate(() => {
        const box = document.querySelector('.tp-icon-picker');
        const fetchButton = [...box.querySelectorAll('button')].find(button => button.textContent === 'Fetch');
        const right = fetchButton.getBoundingClientRect().right;
        return { fits: box.scrollWidth <= box.clientWidth + 1, buttonOnScreen: right <= window.innerWidth };
    });
    expect(phone.fits, 'Phone: the picker is wider than its window');
    expect(phone.buttonOnScreen, 'Phone: the Fetch button is off screen');
    if (shots) await tab.screenshot({ path: path.join(shots, `group-icons-picker-phone-${theme}.png`) });
    expect(!errors.length, 'Phone: script errors: ' + errors.join('; '));
    await context.close();
}

// VMs tab: the stored image icon, and the picker offers VM icons.
{
    const log = { saves: [], posts: [] };
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.vms, name: 'vms', url: `${host.origin}/vms` }, count, aurora, endpoints(log));
    const icons = await tab.evaluate(headerIcons);
    expect(icons.Desktops?.label === 'img:/plugins/fixture/vm-icon.png', `VMs: Desktops shows "${icons.Desktops?.label}"`);
    await openPicker(tab, 'Desktops');
    const heading = await tab.locator('.tp-icon-picker-heading').first().textContent();
    expect(heading === 'VM icons', `VMs: the picker's first section is "${heading}"`);
    await tab.locator('.tp-icon-picker button.tp-icon-choice[aria-label="desktop"]').click();
    expect(log.saves.length === 1 && log.saves[0].type === 'vm' && savedIcon(log.saves, 'Desktops') === 'fa-desktop', 'VMs: choosing a symbol was not saved as a VM group icon');
    expect(!errors.length, 'VMs: script errors: ' + errors.join('; '));
    await context.close();
}

// Dashboard: a group's own icon on its chip, the folder for the others.
{
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.dashboard, name: 'dashboard', url: `${host.origin}/dashboard` }, count, aurora, endpoints({ saves: [], posts: [] }));
    const stray = await tab.evaluate(() => [...document.querySelectorAll('.tp-group-chip-icon')].some(slot => getComputedStyle(slot, '::before').content !== 'none'));
    expect(!stray, 'Dashboard: something else is drawn in a group chip\'s icon place');
    const chips = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tp-group-chip')].map(chip => {
        const node = chip.querySelector('.tp-group-chip-icon').firstElementChild;
        return [chip.querySelector('.tp-group-chip-name').textContent, node ? (node.tagName === 'IMG' ? 'img:' + node.getAttribute('src') : node.className) : ''];
    })));
    expect(chips.Media === 'fa fa-film', `Dashboard: Media's chip shows "${chips.Media}"`);
    expect((chips.Tools || '').endsWith('group-icons.php?file=' + uploaded.slice('upload:'.length)), `Dashboard: Tools' chip shows "${chips.Tools}"`);
    expect(/^fa fa-folder/.test(chips.Backup || ''), `Dashboard: Backup's chip shows "${chips.Backup}", not the folder`);
    expect(chips.Desktops === 'img:/plugins/fixture/vm-icon.png', `Dashboard: Desktops' chip shows "${chips.Desktops}"`);
    if (shots) await tab.locator('#docker_view').screenshot({ path: path.join(shots, `group-icons-dashboard-${theme}.png`) });
    expect(!errors.length, 'Dashboard: script errors: ' + errors.join('; '));
    await context.close();
}

host.server.close();
await browser.close();
if (problems.length) {
    console.log(`FAIL group icons, ${theme}, ${run}:\n  ` + problems.join('\n  '));
    process.exit(1);
}
console.log(`ok   group icons, ${theme}, ${run}`);
