// Dashboard, Processor tile: Aurora turns Unraid's core rows into a grid of small tiles. This
// check builds the tile from Unraid 7.3's markup (DashStats.page) for several CPUs, loads
// Aurora's theme.css, enhance.css and enhance.js from this working tree, and fails when a core
// tile's label ("10 · 11" and its "P"/"E" badge) or its loads are cut off at any width from
// 220 to 900 px with one-, two- and three-digit loads (#38). No PHP or Unraid checkout needed.
//
// Usage: node plugin/test/dashboard_cores.mjs   (THEME=white for the light palette,
//        SCREENSHOTS=dir to save each CPU's tile at 560 px)
import fs from 'node:fs';
import path from 'node:path';
import { repo, loadPlaywright } from './compat_lib.mjs';

const { chromium } = loadPlaywright(repo);
const theme = process.env.THEME === 'white' ? 'white' : 'black';
const shots = process.env.SCREENSHOTS || '';

// Made-up CPUs: an Intel hybrid (8 P-cores with hyper-threading, 8 E-cores), a 16-core AMD with
// SMT, and a 128-core Threadripper with SMT (thread numbers up to 255).
const cpus = {
    hybrid: { pairs: 8, pairStep: 1, singles: 8, types: true },
    amd16: { pairs: 16, pairStep: 16, singles: 0, types: false },
    threadripper128: { pairs: 128, pairStep: 128, singles: 0, types: false },
};

/** Unraid's row for one core: a pair of threads, or a single thread when cpu2 is null. */
function coreRow(cpu1, cpu2, type) {
    const label = type ? `CPU ${cpu1} (${type}) ` : `CPU ${cpu1} `;
    const load = n => `<span class='cpu${n} load resize'>0%</span><div class='usage-disk sys'><span id='cpu${n}'></span><span></span></div>`;
    if (cpu2 !== null) {
        return `<tr class='cpu_open'><td><span class='w26'>${label}- HT ${cpu2} </span><span class='dashboard w36'>${load(cpu1)}</span><span class='dashboard w36'>${load(cpu2)}</span></td></tr>`;
    }
    return `<tr class='cpu_open'><td><span class='w26'>${label}</span><span class='w72'>${load(cpu1)}</span></td></tr>`;
}

/** The test page: the Processor tile of one CPU, hidden at first when hidden is true. */
function pageHtml(cpu, hidden) {
    let rows = '';
    let thread = 0;
    for (let core = 0; core < cpu.pairs; core++) {
        const first = cpu.pairStep === 1 ? thread : core;
        rows += coreRow(first, first + (cpu.pairStep === 1 ? 1 : cpu.pairStep), cpu.types ? 'P-Core' : '');
        thread += 2;
    }
    for (let index = 0; index < cpu.singles; index++) {
        rows += coreRow(cpu.pairs * 2 + index, null, 'E-Core');
    }
    return `<!doctype html><html class="Theme--${theme} tp-enhance tp-on-dashboard"><head><meta charset="utf-8">
<title>Tower/Dashboard</title>
<style>html { font-size: 62.5%; } body { margin: 0; } #wrap { width: var(--w); }</style>
<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/theme.css">
<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/enhance.css">
</head><body><div id="wrap"${hidden ? ' style="display: none"' : ''}><table class="dashboard"><tbody title="Processor">
<tr><td><span id='cpu-total-power'><i class='fa fa-fw fa-plug'></i>Total Power: N/A</span></td></tr>
<tr><td><span class='w26'>Overall Load:</span><span class='w72'><span class='cpu load resize'>0%</span><div class='usage-disk sys'><span id='cpu'></span><span></span></div></span></td></tr>
${rows}
</tbody></table></div>
<script src="/plugins/Aurora-Theme/scripts/enhance.js"></script></body></html>`;
}

/** Serves the test page and Aurora's files (theme.css is the repo's unraid-tapeory.css). */
async function serve(tab, html) {
    await tab.route('http://aurora.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/Dashboard') return route.fulfill({ contentType: 'text/html', body: html });
        const rel = url.pathname.replace('/plugins/Aurora-Theme/', '');
        const file = rel === 'styles/theme.css' ? path.join(repo, 'unraid-tapeory.css') : path.join(repo, 'plugin/src', rel);
        if (!file.startsWith(repo) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'font/woff2';
        return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
}

/** In the page: the core tiles whose label or loads are cut off at the given width and load. */
function cutTiles({ width, load }) {
    document.getElementById('wrap').style.setProperty('--w', width + 'px');
    document.querySelectorAll('tbody.tp-cpu-tile tr.tp-core .load').forEach(node => { node.textContent = load; });
    const cut = [];
    for (const row of document.querySelectorAll('tbody.tp-cpu-tile tr.tp-core')) {
        const label = row.querySelector('span.w26');
        const cell = row.querySelector('td');
        const badge = label.querySelector('.tp-core-type');
        const labelCut = label.scrollWidth > label.clientWidth + 0.5 || (badge && badge.getBoundingClientRect().right > label.getBoundingClientRect().right + 0.5);
        const loadOut = [...cell.querySelectorAll('.load')].some(node => node.getBoundingClientRect().right > cell.getBoundingClientRect().right + 0.5);
        if (labelCut || loadOut) cut.push(label.textContent);
    }
    return cut;
}

const browser = await chromium.launch();
let failures = 0;
for (const [name, cpu] of Object.entries(cpus)) {
    for (const hidden of [false, true]) {
        const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const errors = [];
        tab.on('pageerror', error => errors.push(error.message));
        await serve(tab, pageHtml(cpu, hidden));
        await tab.goto('http://aurora.test/Dashboard');
        await tab.waitForSelector('tbody.tp-cpu-tile', { state: 'attached' });
        await tab.evaluate(() => document.fonts.ready);
        if (hidden) {
            // Shown later, as when the tile was closed: the width is measured once it has a size.
            await tab.evaluate(() => new Promise(done => {
                document.getElementById('wrap').style.display = '';
                requestAnimationFrame(() => requestAnimationFrame(done));
            }));
        }
        // Wait for the theme's fonts, so the measurement after they load has run.
        await tab.waitForFunction(() => [...document.fonts].every(face => face.status !== 'loading'));
        const problems = [...errors.map(message => 'script error: ' + message)];
        for (const load of ['9%', '17%', '100%']) {
            for (let width = 220; width <= 900; width += 20) {
                const cut = await tab.evaluate(cutTiles, { width, load });
                if (cut.length) problems.push(`${width} px, loads ${load}: ${cut.length} tiles cut off (${cut.slice(0, 3).join(', ')})`);
            }
        }
        const label = `${name}${hidden ? ', shown later' : ''}, ${theme}`;
        if (problems.length) {
            failures++;
            console.log(`FAIL ${label}:\n  ` + problems.slice(0, 8).join('\n  '));
        } else {
            console.log(`ok   ${label}`);
        }
        if (shots && !hidden) {
            fs.mkdirSync(shots, { recursive: true });
            await tab.evaluate(() => {
                document.getElementById('wrap').style.setProperty('--w', '560px');
                document.querySelectorAll('tbody.tp-cpu-tile .load').forEach((node, index) => { node.textContent = (index % 3 ? 17 : 100) + '%'; });
            });
            await tab.locator('#wrap').screenshot({ path: path.join(shots, `dashboard-cores-${name}-${theme}.png`) });
        }
        await tab.close();
    }
}
await browser.close();
process.exit(failures ? 1 : 0);
