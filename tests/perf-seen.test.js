/*
 * Perf: the `seen` API (adapter.findFields(doc, { seen })) and the Greenhouse
 * "No options" wait.
 *
 * - generic.findFields with options.seen leaves out handled elements (plain
 *   controls, radio groups by their first radio, checkboxes) and returns the
 *   identical descriptors for the rest.
 * - The react-select harness renders its notices inside the list (as v5 does), so
 *   a search that filters to nothing answers `nomatch` at once instead of waiting
 *   out the 4 s results timeout.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, injectScripts, fixtureUrl } = require('./helpers/browser');

const ROOT = path.resolve(__dirname, '..');

const GH_PAGE = `<!doctype html><html><body>
<form id="application-form" class="application--form">
  <div class="select__container">
    <label id="degree-label" for="degree">Degree</label>
    <div class="select__control"><div class="select__value-container">
      <div class="select__placeholder">Select...</div>
      <input id="degree" class="select__input" role="combobox" aria-labelledby="degree-label" aria-required="true">
    </div></div>
  </div>
</form></body></html>`;

test('generic.findFields: options.seen omits handled elements, the rest is identical', async () => {
  const { browser, page } = await launch();
  try {
    for (const rel of ['generic/compliance.html', 'generic/basic.html', 'generic/sections.html']) {
      await page.goto(fixtureUrl(rel));
      await injectScripts(page);
      const result = await page.evaluate(() => {
        const g = AF.adapters.generic;
        const sig = (f) => JSON.stringify([f.el.tagName, f.el.id || f.el.name || '', f.desc, !!f.outlineOnly]);
        const all = g.findFields(document);
        const elsIndex = new Map(all.map((f, i) => [f.el, i]));
        // Mark every other field as handled, then every field.
        const out = { total: all.length, runs: [] };
        for (const mod of [2, 3, 1]) {
          const seen = new WeakSet();
          all.forEach((f, i) => { if (i % mod === 0) seen.add(f.el); });
          const part = g.findFields(document, { seen });
          const expected = all.filter((f, i) => i % mod !== 0).map(sig);
          out.runs.push({ mod, got: part.map(sig), expected, noSeen: part.every((f) => !seen.has(f.el)), order: part.every((f, i, a) => !i || elsIndex.get(a[i - 1].el) < elsIndex.get(f.el)) });
        }
        return out;
      });
      assert.ok(result.total > 0, rel);
      for (const run of result.runs) {
        assert.deepEqual(run.got, run.expected, `${rel} mod ${run.mod}`);
        assert.ok(run.noSeen && run.order, `${rel} mod ${run.mod}: no seen element, document order`);
      }
    }
  } finally {
    await browser.close();
  }
});

test('greenhouse + harness: terms that filter to nothing do not wait out the results timeout', async () => {
  const { browser, page } = await launch();
  try {
    await page.setContent(GH_PAGE);
    await injectScripts(page);
    await page.addScriptTag({ path: path.join(ROOT, 'tests', 'harness', 'react-select.js') });
    await page.evaluate(() => window.installReactSelect({ degree: { options: ['Associate of Arts', 'Doctorate'] } }));
    // The harness renders the notice inside the list, like react-select v5.
    const shape = await page.evaluate(async () => {
      const input = document.getElementById('degree');
      input.closest('.select__control').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      input.value = 'zzz';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const none = document.querySelector('.select__menu-notice--no-options');
      const inList = !!none && !!none.closest('.select__menu-list[role="listbox"]');
      input.value = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { inList, open: !!document.querySelector('.select__menu') };
    });
    assert.equal(shape.inList, true);
    assert.equal(shape.open, false);

    const t0 = Date.now();
    const res = await page.evaluate(() => AF.adapters.greenhouse.findFields(document)[0].fill('Bachelor of Science', { key: 'degree' }));
    const ms = Date.now() - t0;
    assert.equal(res.status, 'nomatch');
    assert.ok(ms < 1000, `took ${ms} ms`);
  } finally {
    await browser.close();
  }
});
