// Plugin controls inside Unraid's `.unapi` marker: plugins such as StaXX put `unapi` on their own
// page so Unraid's form rules leave their controls alone, and style those controls with two
// classes. Aurora gives Unraid's own components its font there, but must not outweigh the
// plugin's rules: StaXX's Compose editor draws its coloured text in a monospace layer over a
// transparent textarea, and with the textarea in Aurora's font the caret no longer sat under the
// text (#39). This check builds such an editor (made-up class names, StaXX's structure), loads
// Aurora's theme.css from this working tree, and fails when the textarea's text metrics differ
// from the layer's, or when a plain control in Unraid's own components loses Aurora's font.
//
// Usage: node plugin/test/plugin_controls.mjs   (THEME=white for the light palette)
import fs from 'node:fs';
import path from 'node:path';
import { repo, loadPlaywright } from './compat_lib.mjs';

const { chromium } = loadPlaywright(repo);
const theme = process.env.THEME === 'white' ? 'white' : 'black';

const yaml = 'services:\n  fixture-app-1:\n    image: example/fixture-app:1.0\n    container_name: fixture-app-1\n    restart: unless-stopped';

// Unraid's component bundle resets controls under .unapi (a Tailwind build, (0,1,1)); the
// made-up plugin styles its editor at (0,2,0), as StaXX does.
const pageHtml = `<!doctype html><html class="Theme--${theme}"><head><meta charset="utf-8">
<title>Tower/Stacks</title>
<style>
html { font-size: 62.5%; }
.unapi button, .unapi input, .unapi select, .unapi textarea { font: inherit; letter-spacing: inherit; color: inherit; }
.fixture-scaffold .fixture-wrap { position: relative; width: 600px; height: 200px; }
.fixture-scaffold .fixture-code,
.fixture-scaffold .fixture-ink {
    position: absolute; inset: 0; box-sizing: border-box; margin: 0; border: 0;
    padding: 1.2rem 1.4rem 1.2rem 0.9rem;
    font-family: ui-monospace, "Cascadia Code", Consolas, "Liberation Mono", monospace;
    font-size: 1.3rem; line-height: 1.45; tab-size: 2; white-space: pre;
}
.fixture-scaffold .fixture-code { color: transparent; background: transparent; resize: none; }
.fixture-scaffold .fixture-ink { pointer-events: none; }
.fixture-scaffold .fixture-field { font-family: ui-monospace, monospace; }
</style>
<link rel="stylesheet" href="/plugins/Aurora-Theme/styles/theme.css">
</head><body>
<div class="fixture-scaffold unapi">
  <div class="fixture-wrap">
    <div class="fixture-ink" id="ink"></div>
    <textarea class="fixture-code" id="code" wrap="off" spellcheck="false"></textarea>
  </div>
  <input class="fixture-field" id="field" type="text" value="fixture-app-1">
</div>
<div class="unapi" id="component"><textarea id="plain"></textarea><input id="plain-input" type="text"></div>
</body></html>`;

/** Serves the test page and Aurora's theme.css (the repo's unraid-tapeory.css) and fonts. */
async function serve(tab) {
    await tab.route('http://aurora.test/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/Stacks') return route.fulfill({ contentType: 'text/html', body: pageHtml });
        const rel = url.pathname.replace('/plugins/Aurora-Theme/', '');
        const file = rel === 'styles/theme.css' ? path.join(repo, 'unraid-tapeory.css') : path.join(repo, 'plugin/src', rel);
        if (!file.startsWith(repo) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
        const type = file.endsWith('.css') ? 'text/css' : 'font/woff2';
        return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
}

/** In the page: what differs between the editor's textarea and its text layer, and the fonts. */
function inspect(text) {
    const code = document.getElementById('code');
    const ink = document.getElementById('ink');
    code.value = text;
    ink.textContent = text;
    const a = getComputedStyle(code);
    const b = getComputedStyle(ink);
    const props = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-feature-settings', 'font-variant-numeric', 'padding-top', 'padding-left', 'border-top-width', 'border-left-width', 'tab-size'];
    const differ = props.filter(prop => a.getPropertyValue(prop) !== b.getPropertyValue(prop))
        .map(prop => `${prop}: textarea "${a.getPropertyValue(prop)}", layer "${b.getPropertyValue(prop)}"`);
    // Where the caret lands after the longest line, in the textarea's font, against the layer's text.
    const canvas = document.createElement('canvas').getContext('2d');
    const longest = text.split('\n').reduce((x, y) => (y.length > x.length ? y : x), '');
    canvas.font = `${a.fontWeight} ${a.fontSize} ${a.fontFamily}`;
    const caret = canvas.measureText(longest).width;
    canvas.font = `${b.fontWeight} ${b.fontSize} ${b.fontFamily}`;
    const drawn = canvas.measureText(longest).width;
    return {
        differ,
        drift: Math.abs(caret - drawn),
        field: getComputedStyle(document.getElementById('field')).fontFamily,
        plain: getComputedStyle(document.getElementById('plain')).fontFamily,
        plainInput: getComputedStyle(document.getElementById('plain-input')).fontFamily,
    };
}

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
tab.on('pageerror', error => errors.push(error.message));
await serve(tab);
await tab.goto('http://aurora.test/Stacks');
await tab.evaluate(() => document.fonts.ready);
const result = await tab.evaluate(inspect, yaml);
await browser.close();

const problems = errors.map(message => 'script error: ' + message);
problems.push(...result.differ.map(line => 'editor textarea and text layer differ, ' + line));
if (result.drift > 0.5) problems.push(`caret ${result.drift.toFixed(1)} px away from the drawn text at the end of the longest line`);
if (!/monospace/.test(result.field)) problems.push(`plugin's own input lost its font: "${result.field}"`);
if (!/^"?Inter"?/.test(result.plain)) problems.push(`textarea in Unraid's components has "${result.plain}", not Aurora's font`);
if (!/^"?Inter"?/.test(result.plainInput)) problems.push(`input in Unraid's components has "${result.plainInput}", not Aurora's font`);

if (problems.length) {
    console.log(`FAIL plugin controls, ${theme}:\n  ` + problems.join('\n  '));
    process.exit(1);
}
console.log(`ok   plugin controls, ${theme}`);
