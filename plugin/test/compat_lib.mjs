// Shared by the FolderView compatibility checks (fvplus_compat.mjs, fv3_compat.mjs): loads a
// page of the folder plugin once alone and once with Aurora from this working tree added the
// way AuroraTheme.page adds it, and compares the two.
//
// Measured per page: when the plugin's folders are drawn, how long the browser is blocked in the
// "settling" window after that (the plugin finishing its page) and in the "steady" window after
// that (live updates only), and what the page's inspect() reports (folders, rows, theme
// elements where the plugin owns the list). Two runs each way; the quieter one counts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadPlaywright(fallbackDir) {
    try { return createRequire(import.meta.url)('playwright'); }
    catch (error) { return createRequire(path.join(fallbackDir, 'package.json'))('playwright'); }
}

// Aurora's files as installed: theme.css is the repo's unraid-tapeory.css.
const auroraFiles = {
    'styles/theme.css': path.join(repo, 'unraid-tapeory.css'),
    'styles/enhance.css': path.join(repo, 'plugin/src/styles/enhance.css'),
    'styles/layout-sidebar.css': path.join(repo, 'plugin/src/styles/layout-sidebar.css'),
    'scripts/enhance.js': path.join(repo, 'plugin/src/scripts/enhance.js'),
};

// Options from the environment:
//   UNRAID_WEBGUI  a checkout of https://github.com/unraid/webgui: the pages then get Unraid's own
//                  stylesheets in Unraid's order (and the page's sheet), as on a server; without
//                  it only Unraid's root font size is set.
//   THEME          black (default) or white, Unraid's Dynamix theme.
//   SCREENSHOTS    a directory: each page is saved alone and with Aurora, for the visual review.
//   QUICK          1: the small scenario only, one run each way (for screenshots and a first look).
export const quick = process.env.QUICK === '1';
//   PAGES, SIZES   only these pages (docker,dashboard,...) / scenarios (90,300), to look into one case.
export const onlyPages = name => !process.env.PAGES || process.env.PAGES.split(',').includes(name);
export const onlySizes = list => (quick ? list.slice(0, 1) : list).filter(scenario => !process.env.SIZES || process.env.SIZES.split(',').includes(String(scenario.members)));
const webgui = process.env.UNRAID_WEBGUI ? path.join(process.env.UNRAID_WEBGUI, 'emhttp') : '';
const theme = process.env.THEME === 'white' ? 'white' : 'black';
const screenshots = process.env.SCREENSHOTS || '';
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });
const unraidSheets = ['default-fonts', 'default-cases', 'font-awesome', 'context.standalone', 'jquery.sweetalert', 'jquery.ui',
    'default-color-palette', 'default-base', 'default-dynamix'].map(name => `/webGui/styles/${name}.css`)
    .concat(`/webGui/styles/themes/${theme}.css`, '/webGui/styles/jquery.switchbutton.css');
const pageSheets = { docker: '/plugins/dynamix.docker.manager/sheets/DockerContainers.css', vms: '/plugins/dynamix.vm.manager/sheets/VMMachines.css', dashboard: '/plugins/dynamix/sheets/DashStats.css' };

// Unraid's part of the page: its stylesheets and theme class, or only its root font size.
function withUnraid(html, surface) {
    if (!webgui) return html.replace('<head>', '<head><style>html { font-size: 62.5%; }</style>').replace(/<html[^>]*>/, '<html>');
    const sheets = unraidSheets.concat(pageSheets[surface] || []).map(href => `<link type="text/css" rel="stylesheet" href="${href}">`).join('');
    return html
        .replace(/<style>body\s*\{[^<]*<\/style>/g, '')
        .replace(/<html[^>]*>/, `<html class="Theme--${theme} Theme--nav-top">`)
        .replace('<head>', '<head>' + sheets);
}

// Serves Unraid's stylesheets, fonts and images from the webgui checkout; everything else
// (Unraid's includes, which the hosts answer) is passed on.
async function routeUnraid(tab) {
    if (!webgui) return;
    await tab.route(/\/(webGui|plugins\/dynamix[^/]*)\/[^?#]*\.(css|woff2?|ttf|eot|svg|png|gif|jpe?g)(\?|#|$)/, route => {
        const pathname = new URL(route.request().url()).pathname;
        const file = pathname.startsWith('/webGui/') ? path.join(webgui, 'plugins/dynamix', pathname.slice('/webGui/'.length)) : path.join(webgui, pathname);
        return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.fallback();
    });
}

// What AuroraTheme.page adds to every page (page enhancements on): the root classes, the
// stylesheets, window.auroraDockerView when a FolderView plugin is installed, and enhance.js.
// aurora: { classes: [...], dockerView: {...} | null, head: '...' }.
function withAurora(html, surface, aurora) {
    const classes = [`Theme--${theme}`, 'Theme--nav-top', 'tp-enhance', `tp-on-${surface}`, ...(aurora.classes || [])].join(' ');
    return html
        .replace(/<html[^>]*>/, `<html class="${classes}">`)
        .replace('</head>', '<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/theme.css">'
            + '<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/enhance.css">'
            + (aurora.dockerView ? `<script>window.auroraDockerView = ${JSON.stringify(aurora.dockerView)};</script>` : '')
            + (aurora.head || '')
            + '<script defer src="/plugins/Aurora-Theme/scripts/enhance.js"></script></head>');
}

// One page load. page: { url, ready(count), inspect(), prepare(html), sameLists }; aurora: as above or null.
async function measureOnce(browser, page, count, aurora) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
        window.tpBlocked = 0;
        new PerformanceObserver(list => list.getEntries().forEach(entry => { window.tpBlocked += entry.duration; })).observe({ type: 'longtask', buffered: true });
    });
    await tab.route('**/plugins/Aurora-Theme/**', route => {
        const file = auroraFiles[new URL(route.request().url()).pathname.replace('/plugins/Aurora-Theme/', '')];
        return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
    });
    await routeUnraid(tab);
    await tab.route(page.url, async route => {
        const response = await route.fetch();
        let html = await response.text();
        if (page.prepare) html = page.prepare(html);
        html = withUnraid(html, page.name);
        if (aurora) html = withAurora(html, page.name, aurora);
        await route.fulfill({ response, body: html, headers: { ...response.headers(), 'content-type': 'text/html' } });
    });
    const start = Date.now();
    try {
        await tab.goto(page.url, { waitUntil: 'load', timeout: 60000 });
        await tab.waitForFunction(page.ready, count, { timeout: 60000 });
    } catch (error) {
        await context.close();
        return { ready: null, errors };
    }
    const ready = Date.now() - start;
    const windowMs = 8000;
    const blockedFor = async () => {
        await tab.evaluate(() => { window.tpBlocked = 0; });
        await tab.waitForTimeout(windowMs);
        return Math.round(await tab.evaluate(() => window.tpBlocked));
    };
    const settling = await blockedFor();
    const steady = await blockedFor();
    const result = { ready, errors, settling, steady, ...await tab.evaluate(page.inspect) };
    if (screenshots && page.shot) await tab.screenshot({ path: path.join(screenshots, `${page.shot}-${aurora ? 'aurora' : 'alone'}-${theme}.png`) });
    if (page.after) result.extra = await tab.evaluate(page.after);
    await context.close();
    return result;
}

// Measures a page alone and with Aurora, prints both, returns the problems found ([] = pass).
// expect: compare(alone, aurora) => extra problems, for checks particular to the plugin.
export async function comparePage(browser, page, count, aurora, label, compare) {
    const runs = { alone: [], aurora: [] };
    for (let run = 0; run < (quick ? 1 : 2); run++) {
        const shot = run === 0 ? page.shot : undefined;
        runs.alone.push(await measureOnce(browser, { ...page, shot }, count, null));
        runs.aurora.push(await measureOnce(browser, { ...page, shot }, count, aurora));
    }
    const best = list => list.filter(item => item.ready !== null).sort((a, b) => (a.settling + a.steady) - (b.settling + b.steady))[0] || list[0];
    const alone = best(runs.alone);
    const withTheme = best(runs.aurora);
    const line = item => item.ready === null ? 'never ready'
        : `ready after ${item.ready} ms, blocked ${item.settling} ms settling + ${item.steady} ms steady (8 s each)`;
    console.log(`${label}\n  plugin alone: ${line(alone)}\n  with Aurora:  ${line(withTheme)}`);
    const problems = [];
    if (alone.ready === null) problems.push('the plugin alone never got ready (fixture out of date?)');
    if (withTheme.ready === null) problems.push('the folders never appeared with Aurora');
    else if (alone.ready !== null) {
        // page.sameLists false: Aurora draws the lists itself (its own view), so folders and rows
        // are checked by compare() instead.
        if (page.sameLists !== false && withTheme.folders !== alone.folders) problems.push(`${withTheme.folders} folders instead of ${alone.folders}`);
        if (page.sameLists !== false && withTheme.rows !== alone.rows) problems.push(`${withTheme.rows} rows or chips instead of ${alone.rows}`);
        if (withTheme.aurora) problems.push(`${withTheme.aurora} theme elements where the plugin owns the list`);
        if (withTheme.steady > Math.max(alone.steady * 1.3, alone.steady + 150)) problems.push('the page stays busier than with the plugin alone');
        if (withTheme.settling > alone.settling * 2 + 300) problems.push('the page takes much longer to settle');
        if (withTheme.ready > alone.ready * 2 + 1500) problems.push('the folders take much longer to appear');
        if (compare) problems.push(...compare(alone, withTheme));
    }
    const newErrors = [...new Set(withTheme.errors)].filter(message => !alone.errors.includes(message));
    if (newErrors.length) problems.push('script errors: ' + newErrors.join('; '));
    if (problems.length) console.log('  FAILED: ' + problems.join(', '));
    return problems;
}

export function requireCheckout(envName, marker, usage) {
    const dir = process.env[envName];
    if (!dir || !fs.existsSync(path.join(dir, marker))) {
        console.error(usage);
        process.exit(2);
    }
    return dir;
}
