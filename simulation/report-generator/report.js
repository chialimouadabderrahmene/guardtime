'use strict';

const fs = require('fs');
const path = require('path');

function generate({ results, load, chaos, resources, meta }) {
  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const executed = results.filter((r) => r.status === 'PASS' || r.status === 'FAIL');
  const passRate = executed.length
    ? Math.round((100 * (counts.PASS || 0)) / executed.length)
    : 0;

  const json = { meta, counts, passRate, results, load, chaos, resources };
  const outDir = path.resolve(__dirname, '..');
  fs.writeFileSync(path.join(outDir, 'simulation-report.json'), JSON.stringify(json, null, 2));

  const byGroup = {};
  for (const r of results) (byGroup[r.group] = byGroup[r.group] || []).push(r);

  const lines = [];
  lines.push('# GuardTime Simulation Lab — Report');
  lines.push('');
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Target: \`${meta.baseUrl}\`${meta.isProd ? ' (PRODUCTION — heavy load & server chaos disabled)' : ''}`);
  lines.push(`- Executed assertions: ${executed.length} · PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · WARN ${counts.WARN || 0} · NOT_EXECUTED ${counts.NOT_EXECUTED || 0}`);
  lines.push(`- Pass rate (of executed): **${passRate}%**`);
  lines.push('');

  for (const group of Object.keys(byGroup)) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Scenario | Result | Detail |');
    lines.push('|---|---|---|');
    for (const r of byGroup[group]) {
      const detail = (r.detail || '').replace(/\|/g, '\\|').slice(0, 160);
      lines.push(`| ${r.name} | ${r.status} | ${detail} |`);
    }
    lines.push('');
    const fails = byGroup[group].filter((r) => r.status === 'FAIL' && r.error);
    for (const f of fails) {
      lines.push(`<details><summary>stack: ${f.name}</summary>`);
      lines.push('');
      lines.push('```');
      lines.push(String(f.error).slice(0, 1200));
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }
  }

  if (load && load.tiers && load.tiers.length) {
    lines.push('## Load results');
    lines.push('');
    lines.push('| Devices | Requests | avg ms | p50 | p95 | max | errors | throughput/s |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const t of load.tiers) {
      lines.push(`| ${t.devices} | ${t.requests} | ${t.avgMs} | ${t.p50Ms} | ${t.p95Ms} | ${t.maxMs} | ${t.errors} | ${t.throughput} |`);
    }
    lines.push('');
    if (load.note) lines.push(`> ${load.note}`);
    lines.push('');
  }

  if (chaos && chaos.length) {
    lines.push('## Chaos results');
    lines.push('');
    lines.push('| Fault | Result | Detail |');
    lines.push('|---|---|---|');
    for (const c of chaos) lines.push(`| ${c.name} | ${c.status} | ${(c.detail || '').replace(/\|/g, '\\|')} |`);
    lines.push('');
  }

  lines.push('## Simulator resource use (this Node process)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(resources, null, 2));
  lines.push('```');
  lines.push('');

  fs.writeFileSync(path.join(outDir, 'simulation-report.md'), lines.join('\n'));
  return { passRate, counts, mdPath: path.join(outDir, 'simulation-report.md') };
}

module.exports = { generate };
