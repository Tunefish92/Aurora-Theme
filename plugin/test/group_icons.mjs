// Group icons (#40) on the real Docker, VMs and Dashboard pages of the FolderView3 host
// (fv3_host.mjs) in Aurora's view: the icons stored with the groups show in the tabs' section
// headers and on the Dashboard's group chips, and the picker sets one from every source (an icon
// on the page, a symbol, a file from the PC, a web address, back to the default) and saves it.
// Aurora's PHP endpoints are answered by this check, which records what the page sends; the
// server side is checked by group_icons_lib.php.
//
//   FV3=/tmp/fv3 node plugin/test/group_icons.mjs   (FV3 as for fv3_compat.mjs; UNRAID_WEBGUI,
//   THEME=white and SCREENSHOTS=dir work as there)
//
// Needs Playwright with Chromium. Exits with 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { createFv3Host } from './fv3_host.mjs';
import { loadPlaywright, openWithAurora, repo, requireCheckout } from './compat_lib.mjs';

const fv3 = requireCheckout('FV3', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/docker.js', 'Set FV3 to a FolderView3 checkout (see fv3_compat.mjs).');
const theme = process.env.THEME === 'white' ? 'white' : 'black';
const shots = process.env.SCREENSHOTS || '';

const auroraPage = fs.readFileSync(path.join(repo, 'plugin/src/AuroraTheme.page'), 'utf8');
const auroraViewScript = auroraPage.match(/<\?php if \(\$auroraDockerView === 'aurora'\): \?>\s*([\s\S]*?)<\?php endif; \?>/)[1];

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const uploaded = 'upload:' + 'a'.repeat(40) + '.png';
const fetched = 'upload:' + 'b'.repeat(40) + '.png';

// Media: a symbol; Tools: an uploaded image; Backup: no icon (it gets one in the steps).
const dockerGroups = [
    { name: 'Media', containers: ['fixture-app-1', 'fixture-app-2'], icon: 'fa-film' },
    { name: 'Tools', containers: ['fixture-app-3', 'fixture-app-4'], icon: uploaded },
    { name: 'Backup', containers: ['fixture-app-5'] },
];
const vmGroups = [{ name: 'Desktops', containers: ['fixture-vm-0', 'fixture-vm-1'], icon: '/plugins/fixture/vm-icon.png' }];
const aurora = {
    dockerView: { folderView: true, plus: false, mode: 'aurora' },
    head: '<script>window.auroraDockerGroups = ' + JSON.stringify(dockerGroups) + '; window.auroraVmGroups = ' + JSON.stringify(vmGroups)
        + "; window.auroraDecimalMark = '.';</script>" + auroraViewScript,
};

const pages = {
    docker: { ready: () => document.getElementById('docker_list')?.classList.contains('tp-ready') && document.querySelectorAll('#docker_list > tr.tp-group').length >= 3 },
    vms: { ready: () => document.querySelectorAll('#kvm_list > tr.tp-group').length > 0 },
    dashboard: { ready: () => document.querySelectorAll('#docker_view .tp-group-chip').length >= 3 && document.querySelectorAll('#vm_view .tp-group-chip').length >= 1 },
};

/**
 * Answers Aurora's endpoints: docker-groups.php records each save, group-icons.php serves an
 * image and stores "uploads" (a web address with "bad" in it is refused, as a non-image would be).
 */
function endpoints(saves) {
    return [
        ['**/plugins/Aurora-Theme/include/docker-groups.php**', route => {
            const request = route.request();
            if (request.method() === 'POST') {
                const groups = JSON.parse(new URLSearchParams(request.postData() || '').get('groups') || '[]');
                saves.push({ type: request.url().includes('type=vm') ? 'vm' : 'docker', groups });
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ groups }) });
            }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ groups: dockerGroups }) });
        }],
        ['**/plugins/Aurora-Theme/include/group-icons.php**', route => {
            const request = route.request();
            if (request.method() !== 'POST') return route.fulfill({ contentType: 'image/png', body: png });
            const body = (request.postDataBuffer() || Buffer.alloc(0)).toString('latin1');
            if (/name="action"\r\n\r\nupload/.test(body) && /name="icon"; filename="/.test(body)) {
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ icon: uploaded }) });
            }
            if (/name="action"\r\n\r\nfetch/.test(body)) {
                return /bad/.test(body)
                    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'This is not a PNG, JPEG, GIF or WebP image.' }) })
                    : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ icon: fetched }) });
            }
            return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown action.' }) });
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

/** Opens the icon picker of the group named name from its header's button. */
async function openPicker(tab, name) {
    const header = tab.locator('tr.tp-group', { has: tab.locator('.tp-group-name', { hasText: new RegExp('^' + name + '$') }) });
    await header.locator('button.tp-group-icon-button').click();
    await tab.locator('.tp-icon-picker').waitFor();
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

const browser = await loadPlaywright(fv3).chromium.launch();
const host = await createFv3Host(fv3, { folders: 4, members: 12, vms: 6, vmFolders: 2 });
const count = { members: 12, vms: 6 };

// Docker tab: the stored icons, then every way to set one.
{
    const saves = [];
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.docker, name: 'docker', url: `${host.origin}/docker` }, count, aurora, endpoints(saves));
    let icons = await tab.evaluate(headerIcons);
    expect(icons.Media?.label === 'fa fa-film', `Docker: Media shows "${icons.Media?.label}", not the film symbol`);
    expect(/^img:.*group-icons\.php\?file=a{40}\.png$/.test(icons.Tools?.label || ''), `Docker: Tools shows "${icons.Tools?.label}", not its uploaded image`);
    expect(icons.Backup?.label === '', 'Docker: Backup shows an icon although it has none');
    expect(icons.Ungrouped?.label === '', 'Docker: Ungrouped shows an icon');
    expect(Object.values(icons).every(icon => !icon.overlaps), 'Docker: an icon overlaps its group name');
    expect(Object.values(icons).every(icon => !icon.stray), 'Docker: something else is drawn in a group icon\'s place');

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

    // A file from the PC.
    await openPicker(tab, 'Backup');
    await tab.locator('.tp-icon-picker input[type="file"]').setInputFiles({ name: 'fixture-icon.png', mimeType: 'image/png', buffer: png });
    await tab.locator('.tp-icon-picker').waitFor({ state: 'detached' });
    expect(savedIcon(saves, 'Backup') === uploaded, `Docker: uploading saved "${savedIcon(saves, 'Backup')}"`);

    // A web address: refused first (the message shows, the picker stays), then accepted.
    await openPicker(tab, 'Backup');
    const before = saves.length;
    await tab.locator('.tp-icon-picker input[type="url"]').fill('https://example.com/bad.txt');
    await tab.locator('.tp-icon-picker button', { hasText: /^Fetch$/ }).click();
    await tab.waitForFunction(() => /not a PNG/.test(document.querySelector('.tp-icon-picker .tp-modal-problem')?.textContent || ''));
    expect(saves.length === before, 'Docker: a refused web address was saved');
    await tab.locator('.tp-icon-picker input[type="url"]').fill('https://example.com/icon.png');
    await tab.locator('.tp-icon-picker input[type="url"]').press('Enter');
    await tab.locator('.tp-icon-picker').waitFor({ state: 'detached' });
    expect(savedIcon(saves, 'Backup') === fetched, `Docker: a web address saved "${savedIcon(saves, 'Backup')}"`);

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
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.docker, name: 'docker', url: `${host.origin}/docker` }, count, aurora, endpoints([]), { width: 390, height: 800 });
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
    const saves = [];
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.vms, name: 'vms', url: `${host.origin}/vms` }, count, aurora, endpoints(saves));
    const icons = await tab.evaluate(headerIcons);
    expect(icons.Desktops?.label === 'img:/plugins/fixture/vm-icon.png', `VMs: Desktops shows "${icons.Desktops?.label}"`);
    await openPicker(tab, 'Desktops');
    const heading = await tab.locator('.tp-icon-picker-heading').first().textContent();
    expect(heading === 'VM icons', `VMs: the picker's first section is "${heading}"`);
    await tab.locator('.tp-icon-picker button.tp-icon-choice[aria-label="desktop"]').click();
    expect(saves.length === 1 && saves[0].type === 'vm' && savedIcon(saves, 'Desktops') === 'fa-desktop', 'VMs: choosing a symbol was not saved as a VM group icon');
    expect(!errors.length, 'VMs: script errors: ' + errors.join('; '));
    await context.close();
}

// Dashboard: a group's own icon on its chip, the folder for the others.
{
    const { context, tab, errors } = await openWithAurora(browser, { ...pages.dashboard, name: 'dashboard', url: `${host.origin}/dashboard` }, count, aurora, endpoints([]));
    const stray = await tab.evaluate(() => [...document.querySelectorAll('.tp-group-chip-icon')].some(slot => getComputedStyle(slot, '::before').content !== 'none'));
    expect(!stray, 'Dashboard: something else is drawn in a group chip\'s icon place');
    const chips = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('.tp-group-chip')].map(chip => {
        const node = chip.querySelector('.tp-group-chip-icon').firstElementChild;
        return [chip.querySelector('.tp-group-chip-name').textContent, node ? (node.tagName === 'IMG' ? 'img:' + node.getAttribute('src') : node.className) : ''];
    })));
    expect(chips.Media === 'fa fa-film', `Dashboard: Media's chip shows "${chips.Media}"`);
    expect(/group-icons\.php\?file=a{40}\.png$/.test(chips.Tools || ''), `Dashboard: Tools' chip shows "${chips.Tools}"`);
    expect(/^fa fa-folder/.test(chips.Backup || ''), `Dashboard: Backup's chip shows "${chips.Backup}", not the folder`);
    expect(chips.Desktops === 'img:/plugins/fixture/vm-icon.png', `Dashboard: Desktops' chip shows "${chips.Desktops}"`);
    if (shots) await tab.locator('#docker_view').screenshot({ path: path.join(shots, `group-icons-dashboard-${theme}.png`) });
    expect(!errors.length, 'Dashboard: script errors: ' + errors.join('; '));
    await context.close();
}

host.server.close();
await browser.close();
if (problems.length) {
    console.log(`FAIL group icons, ${theme}:\n  ` + problems.join('\n  '));
    process.exit(1);
}
console.log(`ok   group icons, ${theme}`);
