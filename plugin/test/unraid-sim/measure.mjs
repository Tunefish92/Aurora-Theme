// One page of the fake Unraid server, opened with Aurora off (cookie aurora_off) and on, with the
// same clicks in both, and what differs between the two: script errors, containers and folders
// listed and shown, text cut off, controls covered by something else, the page wider than the
// window, time the browser is blocked, and requests repeated more often (a reload loop).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { orderFiles } from './files.mjs';

export const { chromium } = createRequire(import.meta.url)('playwright');
export const ORIGIN = process.env.SIM_ORIGIN || 'http://127.0.0.1:8080';

// In the page: what is on screen now. Elements are named by tag, a class and their text, so the
// same element can be found in both runs.
export function snapshot() {
    const name = element => {
        const text = (element.innerText || element.value || element.title || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const cls = [...element.classList].filter(c => !/^(tp-|hover|active|focus)/.test(c)).slice(0, 2).join('.');
        return `${element.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ' "' + text + '"' : ''}`;
    };
    const visible = element => {
        if (!element.isConnected) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = getComputedStyle(element);
        return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    };
    const content = document.querySelector('#displaybox') || document.body;
    const list = document.getElementById('docker_list') || document.getElementById('kvm_list');
    const rows = list ? [...list.querySelectorAll('td.ct-name:not(.folder-name), td.vm-name:not(.folder-name)')].map(cell => cell.closest('tr')) : [];
    const result = {
        containers: rows.length,
        shown: rows.filter(visible).length,
        folders: list ? list.querySelectorAll('tr.folder').length : 0,
        foldersShown: list ? [...list.querySelectorAll('tr.folder')].filter(visible).length : 0,
        pageOverflow: Math.max(0, document.scrollingElement.scrollWidth - innerWidth),
        clipped: [], covered: [], offscreen: [], cutShare: {}, tableClipped: 0,
    };
    // A table wider than the box around it, where that box hides the rest.
    for (const table of content.querySelectorAll('table')) {
        if (!visible(table)) continue;
        let box = table.parentElement;
        while (box && box !== document.body) {
            const style = getComputedStyle(box);
            if (/(auto|scroll)/.test(style.overflowX)) break;
            if (/(hidden|clip)/.test(style.overflowX) && table.getBoundingClientRect().right > box.getBoundingClientRect().right + 2) {
                result.tableClipped = Math.max(result.tableClipped, Math.round(table.getBoundingClientRect().right - box.getBoundingClientRect().right));
                break;
            }
            box = box.parentElement;
        }
    }
    // Text cut off without an ellipsis: an element hiding overflow whose text is wider than it.
    const texts = content.querySelectorAll('td, td *, .folder-name *, button, a, span, label, th');
    let checked = 0;
    for (const element of texts) {
        if (checked++ > 4000) break;
        if (!element.childNodes.length || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
        if (!visible(element)) continue;
        const style = getComputedStyle(element);
        if (!/(hidden|clip)/.test(style.overflowX) || style.textOverflow === 'ellipsis') continue;
        if (element.scrollWidth <= element.clientWidth + 2) continue;
        // Where the text itself ends, against the box's inner edge (overflow into the padding
        // is still shown).
        const box = element.getBoundingClientRect();
        const inner = box.right - parseFloat(style.borderRightWidth);
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRight = Math.max(...[...range.getClientRects()].map(rect => rect.right));
        if (textRight > inner + 2) result.clipped.push(name(element));
    }
    // Controls: covered by another element at their centre, or out of reach sideways. Only the
    // part of a control its boxes let show counts (a folder hiding its second line of icons is
    // the plugin's choice); out of reach means outside the window with no scrolling to it.
    const scrollable = value => /(auto|scroll)/.test(value);
    const atEnd = document.scrollingElement.scrollTop + innerHeight >= document.scrollingElement.scrollHeight - 2;
    const controls = [...content.querySelectorAll('button, a[href], a[onclick], input:not([type=hidden]), select, .switch-button-background, [role=button], [role=tab]')].filter(visible).slice(0, 800);
    for (const control of controls) {
        const rect = control.getBoundingClientRect();
        let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom, reachable = true, scrolls = false, share = 1;
        for (let box = control.parentElement; box && box !== document.documentElement; box = box.parentElement) {
            const style = getComputedStyle(box);
            if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
            const outer = box.getBoundingClientRect();
            // More than a quarter of it cut off sideways, with no box between that scrolls to the
            // rest (of what the boxes inside let show: a name a box ends in "…" is that long).
            const shownX = Math.min(right, outer.right) - Math.max(left, outer.left);
            if (scrollable(style.overflowX)) scrolls = true;
            // A box that ends its text in "…" shortens it on purpose (a long name, with its tooltip).
            else if (!scrolls && style.textOverflow !== 'ellipsis') {
                share = Math.min(share, Math.max(0, shownX) / (right - left));
                if (shownX < (right - left) * 0.75) reachable = false;
            }
            if (style.overflowX !== 'visible') { left = Math.max(left, outer.left); right = Math.min(right, outer.right); }
            if (style.overflowY !== 'visible') { top = Math.max(top, outer.top); bottom = Math.min(bottom, outer.bottom); }
        }
        if (share < 1) result.cutShare[name(control)] = Math.min(share, result.cutShare[name(control)] ?? 1);
        if (!reachable) { result.offscreen.push(name(control)); continue; }
        if (right - left < 4 || bottom - top < 4) continue;
        if (bottom < 0 || top > innerHeight || right < 0 || left > innerWidth) continue;
        const x = Math.min(Math.max((left + right) / 2, 0), innerWidth - 1);
        const y = Math.min(Math.max((top + bottom) / 2, 0), innerHeight - 1);
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === control || control.contains(hit) || hit.contains(control)) continue;
        const label = hit.closest('label');
        if (label && label.contains(control)) continue;
        // A menu or popup the step opened covers what is under it.
        if (hit.closest('[role=menu], [role=dialog], [role=listbox], .dropdown-menu, .dropdown-context, [class*="popover"], [class*="quick-item"], [class*="menu"], .tooltipster-base, .sweet-alert, .ui-dialog')) continue;
        // Something fixed on screen (header, footer, a floating button): only a problem where the
        // page cannot scroll the control out from under it.
        // A bar at the top only hides what is scrolled under it.
        let fixed = false;
        for (let node = hit; node && node !== document.body; node = node.parentElement) if (/fixed|sticky/.test(getComputedStyle(node).position)) { fixed = true; break; }
        if (fixed && (!atEnd || y < innerHeight / 2)) continue;
        result.covered.push(name(control) + ' under ' + name(hit));
    }
    return result;
}

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const endpoint = url => { const u = new URL(url); return u.origin === ORIGIN ? u.pathname : u.host; };

// Opens the page once and runs the steps. page: { path, cookies, viewport, ready(), steps: [{ name, run(tab), wait }] }.
export async function visit(browser, page, auroraOn, shotDir, label) {
    const context = await browser.newContext({ viewport: page.viewport || { width: 1440, height: 900 } });
    const cookies = { ...(page.cookies || {}), ...(auroraOn ? {} : { aurora_off: '1' }) };
    await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value, url: ORIGIN })));
    await context.addInitScript(() => {
        window.tpBlocked = 0;
        new PerformanceObserver(list => list.getEntries().forEach(entry => { window.tpBlocked += entry.duration; })).observe({ type: 'longtask', buffered: true });
    });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', error => errors.push(error.message.split('\n')[0].slice(0, 200)));
    let navigations = 0;
    tab.on('framenavigated', frame => { if (frame === tab.mainFrame()) navigations++; });
    let requests = new Map();
    tab.on('request', request => bump(requests, request.method() + ' ' + endpoint(request.url())));
    const start = Date.now();
    const result = { steps: [] };
    try {
        await tab.goto(ORIGIN + page.path, { waitUntil: 'load', timeout: 60000 });
        await tab.waitForFunction(page.ready || (() => true), null, { timeout: 60000, polling: 250 });
        result.ready = Date.now() - start;
    } catch (error) {
        result.ready = null;
        result.errors = errors;
        await context.close();
        return result;
    }
    // Settling: the page finishing what it does after the list is there.
    await tab.evaluate(() => { window.tpBlocked = 0; });
    await tab.waitForTimeout(page.settle ?? 4000);
    result.settling = Math.round(await tab.evaluate(() => window.tpBlocked));
    // Steady: live values only. Requests counted from here.
    requests = new Map();
    navigations = 0;
    await tab.evaluate(() => { window.tpBlocked = 0; });
    await tab.waitForTimeout(page.steady ?? 6000);
    result.steady = Math.round(await tab.evaluate(() => window.tpBlocked));
    result.requests = Object.fromEntries(requests);
    result.navigations = navigations;
    result.steps.push({ name: 'loaded', ...await tab.evaluate(snapshot) });
    if (shotDir) await tab.screenshot({ path: path.join(shotDir, `${label}-0-loaded-${auroraOn ? 'aurora' : 'alone'}.png`) });
    for (const [index, step] of (page.steps || []).entries()) {
        let failed = '';
        try {
            await tab.evaluate(() => { window.tpBlocked = 0; });
            await step.run(tab);
            await tab.waitForTimeout(step.wait ?? 1500);
        } catch (error) {
            failed = error.message.split('\n')[0].slice(0, 160);
        }
        const blocked = Math.round(await tab.evaluate(() => window.tpBlocked).catch(() => 0));
        result.steps.push({ name: step.name, failed, blocked, ...await tab.evaluate(snapshot).catch(error => ({ failed: 'snapshot: ' + error.message })) });
        if (shotDir) await tab.screenshot({ path: path.join(shotDir, `${label}-${index + 1}-${step.name.replace(/\W+/g, '_')}-${auroraOn ? 'aurora' : 'alone'}.png`) }).catch(() => {});
    }
    result.navigationsAfter = navigations;
    // What was saved on the server (orders, autostart), without the plugins' random ids, tokens and times.
    if (page.files) {
        await tab.waitForTimeout(1500);
        const volatile = /(id|Id|At|at|time|Time|revision|stamp|nonce|hash|token)$/;
        const strip = value => Array.isArray(value) ? value.map(strip) : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).filter(([key]) => !volatile.test(key)).map(([key, item]) => [key, strip(item)])) : value;
        result.files = Object.fromEntries(Object.entries(orderFiles()).filter(([key]) => !/diagnostics|security|audit/.test(key)).map(([key, text]) => {
            try { return [key, JSON.stringify(strip(JSON.parse(text)))]; } catch { return [key, text]; }
        }));
    }
    result.errors = [...new Set(errors)];
    await context.close();
    return result;
}

// What Aurora changes for the worse. Returns a list of problems ([] = fine).
export function compare(alone, aurora, page = {}) {
    const problems = [];
    if (alone.ready === null) return ['the page never got ready without Aurora (case out of date?)'];
    if (aurora.ready === null) return ['the page never got ready with Aurora'];
    if (aurora.ready > alone.ready * 1.5 + 1500) problems.push(`ready after ${aurora.ready} ms instead of ${alone.ready} ms`);
    if (aurora.settling > alone.settling * 1.5 + 400) problems.push(`blocked ${aurora.settling} ms while settling instead of ${alone.settling} ms`);
    if (aurora.steady > alone.steady * 1.5 + 200) problems.push(`blocked ${aurora.steady} ms in 8 s of live updates instead of ${alone.steady} ms`);
    if (aurora.navigations > alone.navigations) problems.push(`page reloaded ${aurora.navigations} times`);
    for (const [key, count] of Object.entries(aurora.requests || {})) {
        // Aurora's own endpoints (its Dashboard processor fallback, stats) have no counterpart.
        if (key.includes('/plugins/Aurora-Theme/')) continue;
        const before = (alone.requests || {})[key] || 0;
        if (count > before + 2 && count > before * 1.5) problems.push(`${key} requested ${count} times instead of ${before}`);
    }
    const errors = aurora.errors.filter(message => !alone.errors.includes(message));
    if (errors.length) problems.push('script errors: ' + errors.join(' | '));
    for (const [key, text] of Object.entries(aurora.files || {})) {
        if (text !== (alone.files || {})[key]) problems.push(`saved ${key} differs: ${String(text).replace(/\s+/g, ' ').slice(0, 120)} instead of ${String((alone.files || {})[key]).replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    aurora.steps.forEach((step, index) => {
        const base = alone.steps[index];
        if (!base) return;
        const at = `[${step.name}] `;
        if (step.failed && !base.failed) problems.push(at + 'step failed: ' + step.failed);
        // A step that failed without Aurora too (the plugin still busy) compares nothing.
        if (base.failed) return;
        for (const key of page.sameFolders === false ? ['containers'] : ['containers', 'folders']) if (step[key] !== base[key]) problems.push(at + `${step[key]} ${key} instead of ${base[key]}`);
        for (const key of page.sameShown === false ? [] : ['shown', 'foldersShown']) if (step[key] !== base[key]) problems.push(at + `${step[key]} ${key} instead of ${base[key]}`);
        if (step.blocked > base.blocked * (page.blockedFactor || 1.5) + (page.blockedAllowance || 300)) problems.push(at + `blocked ${step.blocked} ms instead of ${base.blocked} ms`);
        if (step.pageOverflow > base.pageOverflow + 2) problems.push(at + `page ${step.pageOverflow} px wider than the window`);
        if (step.tableClipped > base.tableClipped + 2) problems.push(at + `table cut off by ${step.tableClipped} px`);
        const fresh = key => (step[key] || []).filter(item => !(base[key] || []).includes(item));
        const clipped = fresh('clipped');
        if (clipped.length) problems.push(at + `${clipped.length} texts cut off: ` + clipped.slice(0, 4).join(', '));
        const covered = fresh('covered');
        if (covered.length) problems.push(at + `${covered.length} controls covered: ` + covered.slice(0, 4).join(', '));
        // Cut off as far as without Aurora (to a twentieth of its width) is not worse.
        const offscreen = fresh('offscreen').filter(item => !(item in (base.cutShare || {})) || step.cutShare[item] < base.cutShare[item] - 0.05);
        if (offscreen.length) problems.push(at + `${offscreen.length} controls outside the window: ` + offscreen.slice(0, 4).join(', '));
    });
    return problems;
}

// reset(): puts the server back to the case's start (plugins remember open folders and more).
export async function compareCase(browser, page, shotDir, label, reset = () => {}) {
    reset();
    const alone = await visit(browser, page, false, shotDir, label);
    reset();
    const aurora = await visit(browser, page, true, shotDir, label);
    return { alone, aurora, problems: compare(alone, aurora, page) };
}

export function ensureDir(dir) { if (dir) fs.mkdirSync(dir, { recursive: true }); return dir; }
