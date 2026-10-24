// FolderView Plus compatibility check: loads FolderView Plus's real production Docker page (its
// own unmodified scripts and styles, on the synthetic Unraid host from its benchmark fixture),
// once alone and once with Aurora from this working tree added the way AuroraTheme.page adds
// it, and compares how long the folders take to appear and how busy the page is afterwards.
// Unraid's live CPU / memory values are simulated, as on the real Docker page.
//
//   git clone --depth 1 https://github.com/alexphillips-dev/FolderView-Plus.git /tmp/fvp
//   (cd /tmp/fvp && npm install --no-save jquery@3.7.1)
//   FVP=/tmp/fvp node plugin/test/fvplus_compat.mjs
//
// Needs Playwright with Chromium. Exits with 1 when Aurora makes the page hang or keeps it
// noticeably busier than FolderView Plus alone. Uses fixture code from FolderView Plus's tests,
// which may change with its releases.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fvp = process.env.FVP;
if (!fvp || !fs.existsSync(path.join(fvp, 'scripts/lib/production-perf-fixture.mjs'))) {
    console.error('Set FVP to a FolderView Plus checkout (see the top of this file).');
    process.exit(2);
}
let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); }
catch (error) { playwright = createRequire(path.join(fvp, 'package.json'))('playwright'); }
const { createProductionPerfFixture } = await import(path.join(fvp, 'scripts/lib/production-perf-fixture.mjs'));

// Aurora's files as installed: theme.css is the repo's unraid-tapeory.css.
const auroraFiles = {
    'styles/theme.css': path.join(repo, 'unraid-tapeory.css'),
    'styles/enhance.css': path.join(repo, 'plugin/src/styles/enhance.css'),
    'scripts/enhance.js': path.join(repo, 'plugin/src/scripts/enhance.js'),
};

// Unraid's page frame and its live values: every container's CPU and memory, every second.
const unraidHost = html => html
    .replace(/data-name="([^"]+)"([\s\S]*?)<td>bridge<\/td><td><\/td>/g, (match, name, between) =>
        `data-name="${name}"${between}<td>bridge</td><td class="advanced"><span class="cpu-${name}">0.5%</span><br><span class="mem-${name}">20MiB / 15GiB</span></td>`)
    .replace('<div class="canvas">', '<div id="header"><div id="UserProfile"></div></div><div id="menu"><div class="nav-tile"><div class="nav-item active"><a href="/Docker">Docker</a></div></div></div><div id="displaybox"><div class="title"><span class="left">Docker Containers</span></div><div class="canvas">')
    .replace('</tbody></table></div>', '</tbody></table></div></div>')
    .replace('</body>', `<script>setInterval(() => document.querySelectorAll('[class^="cpu-"]:not([class*="folder"])').forEach(cell => {
        cell.textContent = (Math.random() * 9).toFixed(1) + '%';
        const memory = cell.parentElement.querySelector('[class^="mem-"]');
        if (memory) memory.textContent = (Math.random() * 900 | 0) + 'MiB / 15GiB';
    }), 1000);</script></body>`);

// What AuroraTheme.page adds with FolderView Plus installed (Black theme, page enhancements on).
const withAurora = html => html
    .replace('<html>', '<html class="Theme--black tp-enhance tp-fvplus tp-on-docker">')
    .replace('</head>', '<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/theme.css">'
        + '<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/enhance.css">'
        + "<script>window.auroraDockerView = { folderView: true, plus: true, mode: 'folderview' };</script>"
        + '<script defer src="/plugins/Aurora-Theme/scripts/enhance.js"></script></head>');

async function measure(browser, origin, scenario, aurora) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
        window.tpBlocked = 0;
        new PerformanceObserver(list => list.getEntries().forEach(entry => { window.tpBlocked += entry.duration; })).observe({ type: 'longtask', buffered: true });
    });
    await page.route('**/plugins/Aurora-Theme/**', route => {
        const file = auroraFiles[new URL(route.request().url()).pathname.replace('/plugins/Aurora-Theme/', '')];
        return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    await page.route(origin + '/docker', async route => {
        const response = await route.fetch();
        let html = unraidHost(await response.text());
        if (aurora) html = withAurora(html);
        await route.fulfill({ response, body: html, headers: { ...response.headers(), 'content-type': 'text/html' } });
    });
    const start = Date.now();
    try {
        await page.goto(origin + '/docker', { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(count => document.querySelectorAll('#docker_list tr.folder').length === count, scenario.folders, { timeout: 60000 });
    } catch (error) {
        await context.close();
        return { ready: null, errors };
    }
    const ready = Date.now() - start;
    await page.evaluate(() => { window.tpBlocked = 0; });
    await page.waitForTimeout(10000);
    const result = await page.evaluate(() => ({
        blocked: Math.round(window.tpBlocked),
        rows: document.querySelectorAll('#docker_containers tr[id^="ct-"]').length,
    }));
    await context.close();
    return { ready, errors, ...result };
}

const scenarios = [{ folders: 10, members: 90, nestedFolders: 2 }, { folders: 30, members: 300, nestedFolders: 5 }];
const browser = await playwright.chromium.launch();
let failed = false;
for (const scenario of scenarios) {
    const fixture = createProductionPerfFixture(fvp, scenario, 'en');
    await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${fixture.server.address().port}`;
    // Two runs each; the better one counts, so a slow moment of the machine does not fail it.
    const runs = { alone: [], aurora: [] };
    for (let run = 0; run < 2; run++) {
        runs.alone.push(await measure(browser, origin, scenario, false));
        runs.aurora.push(await measure(browser, origin, scenario, true));
    }
    fixture.server.close();
    const best = list => list.filter(item => item.ready !== null).sort((a, b) => a.blocked - b.blocked)[0] || list[0];
    const alone = best(runs.alone);
    const aurora = best(runs.aurora);
    const label = `${scenario.members} containers in ${scenario.folders} folders`;
    const line = item => item.ready === null ? 'never ready' : `ready after ${item.ready} ms, then blocked ${item.blocked} ms in 10 s`;
    console.log(`${label}\n  FolderView Plus alone: ${line(alone)}\n  with Aurora:           ${line(aurora)}`);
    const problems = [];
    if (aurora.ready === null) problems.push('the folders never appeared');
    else {
        if (aurora.rows !== scenario.members) problems.push(`${aurora.rows} of ${scenario.members} container rows`);
        if (aurora.blocked > Math.max(200, alone.blocked * 1.3)) problems.push('the page stays busier than with FolderView Plus alone');
        if (aurora.ready > alone.ready * 2 + 1500) problems.push('the folders take much longer to appear');
    }
    const auroraErrors = [...new Set(aurora.errors)].filter(message => !alone.errors.includes(message));
    if (auroraErrors.length) problems.push('script errors: ' + auroraErrors.join('; '));
    if (problems.length) {
        failed = true;
        console.log('  FAILED: ' + problems.join(', '));
    }
}
await browser.close();
process.exit(failed ? 1 : 0);
