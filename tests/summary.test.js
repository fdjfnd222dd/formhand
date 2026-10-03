/*
 * The summary panel (core/feedback.js summary): counts, click-to-scroll,
 * labelled to-do list, replaced on a second pass, never focuses or clicks a
 * page field, and invisible to the next fill pass.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, injectScripts, fixtureUrl, TEST_PROFILE } = require('./helpers/browser');

let browser;
let page;
test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

const STD = { workAuth: 'yes', sponsorship: 'no', relatives: 'no', previouslyEmployed: 'no' };

async function fillCompliance() {
  await page.goto(fixtureUrl('generic/compliance.html'));
  await injectScripts(page);
  // Record any click / focus a page field receives from here on.
  await page.evaluate(() => {
    window.__events = [];
    for (const type of ['click', 'mousedown', 'focusin']) {
      document.addEventListener(type, (e) => {
        if (!e.target.closest || !e.target.closest('#af-summary')) window.__events.push(type + ':' + (e.target.id || e.target.tagName));
      }, true);
    }
  });
  return page.evaluate(([p, std]) => AF.autofill.run({ profile: p, standardAnswers: std, profileName: 'Home address' })
    .then((r) => ({ counts: r.counts })), [TEST_PROFILE, STD]);
}

test('panel: title and count buttons agree with the pass; to-do items are labelled', async () => {
  const { counts } = await fillCompliance();
  const panel = await page.evaluate(() => {
    const p = document.getElementById('af-summary');
    return {
      title: p.querySelector('.af-title').textContent,
      counts: Array.from(p.querySelectorAll('.af-count')).map((b) => [b.textContent, b.disabled]),
      items: Array.from(p.querySelectorAll('.af-item')).map((b) => [b.className.replace('af-item ', ''), b.textContent]),
      inputs: p.querySelectorAll('input, select, textarea').length,
    };
  });
  assert.equal(panel.title, `Formhand (Home address): ${counts.filled} filled · ${counts.review} to review · ${counts.unknown} need you`);
  assert.deepEqual(panel.counts, [
    [`${counts.filled} filled`, counts.filled === 0],
    [`${counts.review} to review`, counts.review === 0],
    [`${counts.unknown} need you`, counts.unknown === 0],
  ]);
  assert.ok(panel.items.length > 0 && panel.items.length <= 9);
  assert.ok(panel.items.every(([, label]) => label && label !== '(unlabelled field)'), JSON.stringify(panel.items));
  assert.equal(panel.inputs, 0, 'no form controls in the panel');
});

test('panel: a count steps through its fields by scrolling only (no focus, no click on the page)', async () => {
  await fillCompliance();
  const before = await page.evaluate(() => window.__events.length);
  const steps = await page.evaluate(async () => {
    const b = document.querySelector('#af-summary .af-count.af-unknown');
    const out = [];
    const targets = Array.from(document.querySelectorAll('[data-af-state="unknown"]'));
    for (let i = 0; i < Math.min(3, targets.length + 1); i++) {
      const active = document.activeElement;
      b.click();
      const flashed = document.querySelector('[data-af-flash]');
      out.push({ flashed: flashed ? targets.indexOf(flashed) : -2, label: b.textContent, focusKept: document.activeElement === active || document.activeElement === b });
      flashed && flashed.removeAttribute('data-af-flash');
    }
    return { out, n: targets.length };
  });
  assert.ok(steps.n >= 2, 'fixture has several yellow fields');
  assert.deepEqual(steps.out.map((s) => s.flashed), [0, 1, 2].slice(0, steps.out.length).map((i) => i % steps.n));
  assert.match(steps.out[0].label, /need you \(1\/\d+\)$/);
  assert.ok(steps.out.every((s) => s.focusKept));
  assert.deepEqual(await page.evaluate((n) => window.__events.slice(n), before), []);
});

test('panel: clicking a to-do item scrolls to that field; close removes the panel', async () => {
  await page.setViewportSize({ width: 1280, height: 300 });
  try {
    await fillCompliance();
    const r = await page.evaluate(async () => {
      window.scrollTo(0, 0);
      const items = Array.from(document.querySelectorAll('#af-summary .af-item'));
      const last = items[items.length - 1];
      last.click();
      await new Promise((res) => setTimeout(res, 800));
      const flashed = document.querySelector('[data-af-flash]');
      const rect = flashed.getBoundingClientRect();
      document.querySelector('#af-summary .af-close').click();
      return { y: window.scrollY, inView: rect.top >= 0 && rect.bottom <= window.innerHeight + 2, gone: !document.getElementById('af-summary') };
    });
    assert.ok(r.y > 0, 'scrolled');
    assert.ok(r.inView, 'field in view');
    assert.ok(r.gone);
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test('panel: a second pass replaces it (one panel), and the pass ignores it', async () => {
  await fillCompliance();
  const again = await page.evaluate(([p, std]) => AF.autofill.run({ profile: p, standardAnswers: std }).then((r) => ({
    panels: document.querySelectorAll('#af-summary').length,
    inPanel: r.results.filter((x) => x.el.closest('#af-summary')).length,
  })), [TEST_PROFILE, STD]);
  assert.equal(again.panels, 1);
  assert.equal(again.inPanel, 0);
});

test('panel: a notice shown while it is open sits above it', async () => {
  await fillCompliance();
  const r = await page.evaluate(() => {
    AF.feedback.notify(document, 'Saved: something', 3000);
    const t = document.getElementById('af-feedback-toast').getBoundingClientRect();
    const p = document.getElementById('af-summary').getBoundingClientRect();
    return t.bottom <= p.top;
  });
  assert.ok(r);
});

test('a second pass keeps the first pass\'s green / orange outlines (filled fields come back "skipped")', async () => {
  const { counts } = await fillCompliance();
  const again = await page.evaluate(([p, std]) => AF.autofill.run({ profile: p, standardAnswers: std, quiet: true })
    .then((r) => ({ counts: r.counts, refilled: r.results.filter((x) => x.status === 'filled').length })), [TEST_PROFILE, STD]);
  assert.equal(again.refilled, 0, 'nothing written twice');
  assert.equal(again.counts.filled, counts.filled);
  assert.equal(again.counts.review, counts.review);
});
