/*
 * core/widgets.js: the click guard and the generic dropdown routine, in real
 * Firefox, against small pages using the Workday-style harness widgets.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, injectScripts, ROOT, hasFixture, openCapture } = require('./helpers/browser');

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
  // setContent keeps the window: start every test with fresh harness counters.
  await page.evaluate(() => { delete window.__harness; });
  await page.addScriptTag({ path: path.join(ROOT, 'tests', 'harness', 'workday.js') });
  await injectScripts(page);
}

test('guard refuses navigation, submit, reset, links and plain buttons', async () => {
  await setup(`
    <form>
      <button id="submit">Submit</button>
      <input id="submit2" type="submit" value="Next">
      <button id="reset" type="reset">Cancel</button>
      <button id="plain" type="button">Next</button>
      <button id="save" type="button">Save and Continue</button>
      <a id="link" href="/apply/next">Continue</a>
      <div class="button-bar"><button id="bar" type="button" aria-haspopup="listbox">Back</button></div>
      <div data-automation-id="pageFooter"><button id="foot" type="button" role="combobox">Next</button></div>
      <div id="div">Continue</div>
      <input id="radio" type="radio" name="r"><input id="box" type="checkbox">
      <ul role="listbox"><li id="opt" role="option">Submit</li></ul>
      <button id="dd" type="button" aria-haspopup="listbox">Select One</button>
      <span id="combo" role="combobox"></span>
    </form>`);
  const out = await page.evaluate(() => {
    let clicks = 0;
    document.addEventListener('click', () => clicks++, true);
    document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); window.__submitted = true; });
    const ids = ['submit', 'submit2', 'reset', 'plain', 'save', 'link', 'bar', 'foot', 'div', 'radio', 'box', 'opt', 'dd', 'combo'];
    const res = {};
    for (const id of ids) {
      const before = clicks;
      const ok = AF.widgets.press(document.getElementById(id));
      res[id] = [ok, clicks - before];
    }
    return { res, submitted: !!window.__submitted };
  });
  for (const id of ['submit', 'submit2', 'reset', 'plain', 'save', 'link', 'bar', 'foot', 'div']) {
    assert.deepEqual(out.res[id], [false, 0], id);
  }
  for (const id of ['radio', 'box', 'opt', 'dd', 'combo']) {
    assert.deepEqual(out.res[id], [true, 1], id);
  }
  assert.equal(out.submitted, false);
});

const DROPDOWN = (id, opts, extra) =>
  `<div data-automation-id="formField-${id}"><label id="${id}-l">${id}</label>
   <button type="button" id="${id}" aria-haspopup="listbox" aria-labelledby="${id}-l ${id}" data-options="${opts}" ${extra || ''}>Select One</button></div>`;

function fillVia(id, key, value) {
  return page.evaluate(async ({ id, key, value }) => {
    const btn = document.getElementById(id);
    const doc = document;
    let before = AF.widgets.listboxes(doc);
    return AF.widgets.fillPopup({
      doc,
      key,
      value,
      current: () => (/^select one$/i.test(btn.textContent.trim()) ? '' : btn.textContent.trim()),
      open: () => { before = AF.widgets.listboxes(doc); return AF.widgets.press(btn); },
      popup: () => {
        const lb = btn.getAttribute('aria-expanded') === 'true' ? AF.widgets.newListbox(doc, before) : null;
        return lb;
      },
      options: (lb) => Array.from(lb.querySelectorAll('[role=option]')),
      verify: (t) => btn.textContent.trim() === t,
      close: () => AF.widgets.key(btn, 'Escape'),
    });
  }, { id, key, value });
}

test('no acceptable option: nomatch, popup closed, value untouched', async () => {
  await setup(DROPDOWN('country', 'United States Minor Outlying Islands|American Samoa'));
  const r = await fillVia('country', 'country', 'United States');
  assert.equal(r.status, 'nomatch');
  assert.equal(await page.textContent('#country'), 'Select One');
  assert.equal((await page.evaluate(() => window.__harness)).open, 0);
});

test('value does not stick once: retried, then filled', async () => {
  await setup(DROPDOWN('state', 'California|Virginia', 'data-flaky="1"'));
  const r = await fillVia('state', 'state', 'VA');
  assert.equal(r.status, 'filled');
  assert.equal(await page.textContent('#state'), 'Virginia');
  assert.equal((await page.evaluate(() => window.__harness)).opened, 2);
});

test('already has a value: skipped without opening', async () => {
  await setup(DROPDOWN('state', 'California|Virginia'));
  await page.evaluate(() => { document.getElementById('state').textContent = 'Virginia'; });
  const r = await fillVia('state', 'state', 'CA');
  assert.equal(r.status, 'skipped');
  assert.equal((await page.evaluate(() => window.__harness)).opened, 0);
});

test('concurrent calls are serialized: never two popups open', async () => {
  await setup(DROPDOWN('a', 'California|Virginia') + DROPDOWN('b', 'Canada|United States of America') + DROPDOWN('c', 'Cell|Home'));
  const statuses = await page.evaluate(async () => {
    const mk = (id, key, value) => {
      const btn = document.getElementById(id);
      let before = AF.widgets.listboxes(document);
      return AF.widgets.fillPopup({
        doc: document, key, value,
        current: () => (/^select one$/i.test(btn.textContent.trim()) ? '' : btn.textContent.trim()),
        open: () => { before = AF.widgets.listboxes(document); return AF.widgets.press(btn); },
        popup: () => (btn.getAttribute('aria-expanded') === 'true' ? AF.widgets.newListbox(document, before) : null),
        options: (lb) => Array.from(lb.querySelectorAll('[role=option]')),
        verify: (t) => btn.textContent.trim() === t,
        close: () => AF.widgets.key(btn, 'Escape'),
      });
    };
    const rs = await Promise.all([mk('a', 'state', 'CA'), mk('b', 'country', 'USA'), mk('c', 'phoneType', 'Mobile')]);
    return rs.map((r) => r.status);
  });
  assert.deepEqual(statuses, ['filled', 'filled', 'filled']);
  const h = await page.evaluate(() => window.__harness);
  assert.equal(h.maxOpen, 1);
  assert.deepEqual(
    await page.evaluate(() => ['a', 'b', 'c'].map((id) => document.getElementById(id).textContent)),
    ['California', 'United States of America', 'Cell']
  );
});

test('radio group: exact label only, existing answer kept', async () => {
  await setup(`
    <fieldset><legend>Do you have a preferred name?</legend>
      <input type="radio" name="p" id="y"><label for="y">Yes</label>
      <input type="radio" name="p" id="n"><label for="n">No</label></fieldset>
    <fieldset><legend>Pick</legend>
      <input type="radio" name="q" id="q1" checked><label for="q1">No</label>
      <input type="radio" name="q" id="q2"><label for="q2">Yes</label></fieldset>`);
  const out = await page.evaluate(() => {
    const g1 = AF.filler.fillChoice(document.querySelectorAll('[name=p]'), 'Yes', { key: 'hasPreferredName' });
    const g2 = AF.filler.fillChoice(document.querySelectorAll('[name=q]'), 'Yes', { key: 'hasPreferredName' });
    const g3 = AF.filler.fillChoice(document.querySelectorAll('[name=p]'), 'Maybe', {});
    return { g1: g1.status, g2: g2.status, g3: g3.status, y: document.getElementById('y').checked, q1: document.getElementById('q1').checked };
  });
  assert.deepEqual(out, { g1: 'filled', g2: 'skipped', g3: 'skipped', y: true, q1: true });
});

test('checkbox: "Yes" checks, "No" leaves alone, never unchecks', async () => {
  await setup('<input type="checkbox" id="a"><input type="checkbox" id="b"><input type="checkbox" id="c" checked>');
  const out = await page.evaluate(() => {
    const f = (id, v) => AF.filler.fillChoice([document.getElementById(id)], v, { key: 'hasPreferredName' }).status;
    return [f('a', 'Yes'), f('b', 'No'), f('c', 'No'), ['a', 'b', 'c'].map((id) => document.getElementById(id).checked)];
  });
  assert.deepEqual(out, ['filled', 'skipped', 'skipped', [true, false, true]]);
});

const AVATURE = 'avature/*_1790977944827.html';
test('guard refuses the real Avature button bar (Back, Continue, Cancel)', {
  skip: hasFixture(AVATURE) ? false : 'capture not on this machine (gitignored)',
}, async () => {
  await openCapture(page, AVATURE);
  await injectScripts(page);
  const out = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ButtonBarField button, form.tpt_wizard button[type=submit], form.tpt_wizard button[type=reset]'))
      .map((b) => [b.className.split(' ')[0], AF.widgets.isSafeTarget(b)])
  );
  assert.ok(out.length >= 3, 'expected the wizard buttons');
  assert.deepEqual(out.filter(([, ok]) => ok), []);
});
