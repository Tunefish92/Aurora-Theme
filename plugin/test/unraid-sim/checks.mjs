// Runs the cases of cases.mjs on the fake Unraid server (started by run.sh / inside.sh): each
// with Aurora off and on, compared by measure.mjs. node checks.mjs [regex of case names].
// SHOTS: a directory for the screenshots and report.json. SHARD=i/n: every n-th case from the
// i-th. Exits with 1 when a case finds Aurora doing worse.
import fs from 'node:fs';
import { applyScenario } from './scenario.mjs';
import { chromium, compareCase, ensureDir } from './measure.mjs';
import { cases } from './cases.mjs';

const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
// SHARD=i/n: every n-th case from the i-th, to share the cases between fake servers.
const [shard, shards] = (process.env.SHARD || '0/1').split('/').map(Number);
const shots = ensureDir(process.env.SHOTS || '');
const browser = await chromium.launch();
const report = [];
let failed = 0;
// A plugin without a checkout (FVP, FV3) has its cases left out.
const available = entry => !entry.scenario.plugin || process.env[{ fvplus: 'FVP', fv3: 'FV3' }[entry.scenario.plugin]];
for (const item of cases.filter((entry, index) => (!filter || filter.test(entry.name)) && available(entry) && index % shards === shard)) {
    const started = Date.now();
    const { alone, aurora, problems } = await compareCase(browser, item.page, shots, item.name, () => applyScenario(item.scenario));
    const summary = side => side.ready === null ? 'never ready' : `ready ${side.ready} ms, blocked ${side.settling}+${side.steady} ms, ${side.steps.at(-1)?.containers} containers / ${side.steps.at(-1)?.folders} folders`;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${item.name} (${Math.round((Date.now() - started) / 1000)} s)\n     alone:  ${summary(alone)}\n     aurora: ${summary(aurora)}`);
    problems.forEach(problem => console.log('     - ' + problem));
    if (problems.length) failed++;
    report.push({ name: item.name, problems, alone, aurora });
    if (shots) fs.writeFileSync(`${shots}/report-${shard}.json`, JSON.stringify(report, null, 1));
}
await browser.close();
console.log(`${report.length - failed} of ${report.length} cases fine`);
process.exit(failed ? 1 : 0);
