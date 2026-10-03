'use strict';
// Summarize AF_PROFILE runs (tests/fixtures.test.js writes one JSON line per fixture):
//   AF_PROFILE=/tmp/p1.jsonl node --test tests/fixtures.test.js   (repeat for p2, p3 ...)
//   node tools/profile-summary.js /tmp/p1.jsonl /tmp/p2.jsonl /tmp/p3.jsonl
// Per fixture: the MEDIAN pass time over the runs, the same without "fillPopup:unverified"
// (a saved page's dropdown with no harness config never opens and waits out every timeout:
// a test artifact), and the biggest parts. Then sums per ATS (adapter).
const fs = require('fs');

const runs = process.argv.slice(2).map((f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const ms = (n) => Math.round(n).toString().padStart(6);
const names = runs[0].map((r) => r.name);
const byAts = {};
for (const name of names) {
  const rows = runs.map((run) => run.find((r) => r.name === name)).filter(Boolean);
  const total = median(rows.map((r) => r.total));
  const dead = (r) => (r.parts['fillPopup:unverified'] || [0])[0];
  const adjusted = median(rows.map((r) => r.total - dead(r)));
  const parts = {};
  for (const r of rows) for (const [k, [t, n]] of Object.entries(r.parts || {})) (parts[k] = parts[k] || []).push([t, n]);
  const med = Object.entries(parts).map(([k, v]) => [k, median(v.map((x) => x[0])), v[0][1]]).sort((a, b) => b[1] - a[1]);
  const top = med.filter(([k]) => k !== 'fillPopup').slice(0, 5).map(([k, t, n]) => `${k} ${Math.round(t)}ms/${n}`).join(', ');
  console.log(`${ms(total)} ${ms(adjusted)}  ${name.replace(/^.*\//, '').slice(0, 56).padEnd(56)} ${top}`);
  const adapter = rows[0].adapter;
  const a = byAts[adapter] || (byAts[adapter] = { total: 0, adjusted: 0, n: 0, parts: {} });
  a.total += total;
  a.adjusted += adjusted;
  a.n++;
  for (const [k, t, n] of med) {
    const p = a.parts[k] || (a.parts[k] = [0, 0]);
    p[0] += t;
    p[1] += n;
  }
}
console.log('\n(columns: median pass ms, median ms without never-opened popups, fixture, top parts)\n');
console.log('Per ATS, sums of medians over its fixtures:');
for (const [ats, a] of Object.entries(byAts)) {
  const top = Object.entries(a.parts).filter(([k]) => k !== 'fillPopup').sort((x, y) => y[1][0] - x[1][0]).slice(0, 6)
    .map(([k, [t, n]]) => `${k} ${Math.round(t)}ms/${n}`).join(', ');
  console.log(`${ats.padEnd(10)} total ${ms(a.total)} | without dead popups ${ms(a.adjusted)} | ${a.n} fixture(s) | ${top}`);
}
