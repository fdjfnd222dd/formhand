/*
 * core/filler.js in real Firefox (Playwright).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { launch, injectScripts } = require('./helpers/browser');

let browser;
let page;

test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

async function setup(html) {
  await page.setContent(`<!doctype html><body>${html}</body>`);
  await injectScripts(page);
}

test('text input: sets value and fires input, change, blur in that order', async () => {
  await setup('<input id="a">');
  const out = await page.evaluate(() => {
    const el = document.getElementById('a');
    const events = [];
    ['focus', 'input', 'change', 'blur'].forEach((t) => el.addEventListener(t, () => events.push(t)));
    const r = AF.filler.fill(el, 'hello', {});
    return { r, value: el.value, events };
  });
  assert.equal(out.r.status, 'filled');
  assert.equal(out.value, 'hello');
  assert.deepEqual(out.events, ['focus', 'input', 'change', 'blur']);
});

test('input and change events bubble (React listens at the root)', async () => {
  await setup('<div id="root"><input id="a"></div>');
  const seen = await page.evaluate(() => {
    const seen = [];
    document.getElementById('root').addEventListener('input', () => seen.push('input'));
    document.getElementById('root').addEventListener('change', () => seen.push('change'));
    AF.filler.fill(document.getElementById('a'), 'x', {});
    return seen;
  });
  assert.deepEqual(seen, ['input', 'change']);
});

test('textarea', async () => {
  await setup('<textarea id="t"></textarea>');
  const v = await page.evaluate(() => {
    AF.filler.fill(document.getElementById('t'), 'line', {});
    return document.getElementById('t').value;
  });
  assert.equal(v, 'line');
});

test('never overwrites an existing value unless force is set', async () => {
  await setup('<input id="a" value="mine"><select id="s"><option value="">Select</option><option selected>Yes</option><option>No</option></select>');
  const out = await page.evaluate(() => {
    const a = document.getElementById('a');
    const s = document.getElementById('s');
    const r1 = AF.filler.fill(a, 'theirs', {});
    const r2 = AF.filler.fill(s, 'No', {});
    const before = [a.value, s.value];
    const r3 = AF.filler.fill(a, 'forced', { force: true });
    return { r1, r2, before, r3, after: a.value };
  });
  assert.equal(out.r1.status, 'skipped');
  assert.equal(out.r2.status, 'skipped');
  assert.deepEqual(out.before, ['mine', 'Yes']);
  assert.equal(out.r3.status, 'filled');
  assert.equal(out.after, 'forced');
});

test('empty value reports nomatch and leaves the field alone', async () => {
  await setup('<input id="a">');
  const out = await page.evaluate(() => {
    const r = AF.filler.fill(document.getElementById('a'), '', {});
    return { r, v: document.getElementById('a').value };
  });
  assert.equal(out.r.status, 'nomatch');
  assert.equal(out.v, '');
});

test('React-style controlled input: native setter survives re-render, plain assignment does not', async () => {
  // Same tracker imitation as fixtures/generic/basic.html.
  await setup('<input id="ctl"><input id="naive">');
  const out = await page.evaluate(async () => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    function controlled(el) {
      let tracked = '';
      let state = '';
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return proto.get.call(this); },
        set(v) { tracked = String(v); proto.set.call(this, v); },
      });
      el.addEventListener('input', () => {
        const dom = proto.get.call(el);
        if (dom !== tracked) state = dom;
        setTimeout(() => { proto.set.call(el, state); tracked = state; }, 0);
      });
    }
    const ctl = document.getElementById('ctl');
    const naive = document.getElementById('naive');
    controlled(ctl);
    controlled(naive);

    AF.filler.fill(ctl, 'kept', {});
    naive.value = 'lost';
    naive.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    return { ctl: ctl.value, naive: naive.value };
  });
  assert.equal(out.ctl, 'kept');
  assert.equal(out.naive, '', 'sanity check: the imitation really reverts plain assignment');
});

test('native select: matches by text, by value, and by state abbreviation', async () => {
  await setup(`
    <select id="st"><option value="">Please select</option><option value="1">Arizona</option><option value="2">California</option></select>
    <select id="cc"><option value="">--</option><option value="CAN">Canada</option><option value="USA">United States of America</option></select>
    <select id="mo"><option value="">Month</option><option value="01">Jan</option><option value="05">May</option></select>`);
  const out = await page.evaluate(() => {
    const changed = [];
    document.body.addEventListener('change', (e) => changed.push(e.target.id));
    const st = AF.filler.fill(document.getElementById('st'), 'CA', { key: 'state' });
    const cc = AF.filler.fill(document.getElementById('cc'), 'United States', { key: 'country' });
    const mo = AF.filler.fill(document.getElementById('mo'), '5', { key: 'gradMonth' });
    return {
      st, cc, mo, changed,
      vals: ['st', 'cc', 'mo'].map((id) => document.getElementById(id).value),
    };
  });
  assert.deepEqual(out.vals, ['2', 'USA', '05']);
  assert.equal(out.st.status, 'filled');
  assert.deepEqual(out.changed, ['st', 'cc', 'mo']);
});

test('native select: no plausible option -> nomatch, placeholder kept', async () => {
  await setup('<select id="s"><option value="">Select...</option><option>Red</option><option>Blue</option></select>');
  const out = await page.evaluate(() => {
    const r = AF.filler.fill(document.getElementById('s'), 'Green', {});
    return { r, idx: document.getElementById('s').selectedIndex };
  });
  assert.equal(out.r.status, 'nomatch');
  assert.equal(out.idx, 0);
});

test('degree family fallback picks the single matching option with low confidence', async () => {
  await setup(`<select id="d"><option value="">Select</option><option>Associate's Degree</option>
    <option>Bachelor's Degree</option><option>Master's Degree</option></select>`);
  const out = await page.evaluate(() => {
    const r = AF.filler.fill(document.getElementById('d'), 'Bachelor of Science', { key: 'degree' });
    return { r, text: document.getElementById('d').selectedOptions[0].textContent };
  });
  assert.equal(out.text, "Bachelor's Degree");
  assert.ok(out.r.confidence < 0.75);
});

test('unsupported controls are left alone', async () => {
  await setup('<input id="c" type="checkbox"><input id="f" type="file"><input id="p" type="password">');
  const out = await page.evaluate(() =>
    ['c', 'f', 'p'].map((id) => AF.filler.fill(document.getElementById(id), 'x', {}).status)
  );
  assert.deepEqual(out, ['unsupported', 'unsupported', 'unsupported']);
});

test('a formatted phone longer than maxlength is filled as digits, ZIP+4 as the ZIP; anything else still fails', async () => {
  await setup('<input id="p" maxlength="10"><input id="p2" maxlength="10"><input id="z" maxlength="5"><input id="n" maxlength="4">');
  const out = await page.evaluate(() => ({
    p: [AF.filler.fill(document.getElementById('p'), '(555) 123-4567', { key: 'phone' }).status, document.getElementById('p').value],
    p2: [AF.filler.fill(document.getElementById('p2'), '+1 555 123 4567', { key: 'phone' }).status, document.getElementById('p2').value],
    z: [AF.filler.fill(document.getElementById('z'), '92101-1234', { key: 'postalCode' }).status, document.getElementById('z').value],
    n: [AF.filler.fill(document.getElementById('n'), 'Alexandra', { key: 'firstName' }).status, document.getElementById('n').value],
  }));
  assert.deepEqual(out.p, ['filled', '5551234567']);
  assert.deepEqual(out.p2, ['filled', '5551234567']);
  assert.deepEqual(out.z, ['filled', '92101']); // ZIP+4 in a 5-character box: the ZIP
  assert.deepEqual(out.n, ['failed', '']);
});
