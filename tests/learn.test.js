/*
 * Learn mode (core/learn.js) in real Firefox. Learning only reacts to TRUSTED
 * events, so the "owner" actions use real Playwright input; the synthetic test
 * proves script-made events learn nothing. browser.storage.local is stubbed
 * in memory (window.__store); storage.updateQA reads/writes qaBank through it.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, injectScripts, ROOT, TEST_PROFILE } = require('./helpers/browser');

const URL = 'file://' + path.join(ROOT, 'tests/harness/learn.html');

const STUB = `
  window.__store = { settings: { learnMode: true } };
  window.__qaWrites = 0;
  window.browser = { storage: { local: {
    async get(keys) { const o = {}; for (const k of [].concat(keys)) if (k in __store) o[k] = JSON.parse(JSON.stringify(__store[k])); return o; },
    async set(obj) { if (obj.qaBank) window.__qaWrites++; Object.assign(__store, JSON.parse(JSON.stringify(obj))); },
    async remove(keys) { for (const k of [].concat(keys)) delete __store[k]; },
  } } };`;

async function setup(prefill) {
  const { browser, page } = await launch();
  await page.addInitScript(STUB);
  await page.goto(URL);
  if (prefill) await page.evaluate(prefill);
  await injectScripts(page);
  await page.evaluate(async (profile) => {
    await AF.autofill.run({ profile, quiet: true });
    AF.running = false;
    AF.learn.attach(document, AF.adapters.generic);
  }, TEST_PROFILE);
  return { browser, page };
}

const bank = (page) => page.evaluate(() => (window.__store.qaBank ? window.__store.qaBank.entries : []));
const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, AF.learn.DEBOUNCE_MS + 500)));

test('learn: hand answers are saved; profile, standard, consent and vetoed fields are not', async () => {
  const { browser, page } = await setup();
  try {
    // sanity: the fill pass did its job on the profile field and left the rest empty
    assert.equal(await page.inputValue('#email'), TEST_PROFILE.email);
    assert.equal(await page.inputValue('#hear'), '');

    await page.fill('#hear', 'LinkedIn');
    await page.click('legend'); // leave the field: trusted change + focusout
    await page.check('input[value=hybrid]');
    await page.check('#terms');
    await page.check('#ack-0'); // a bare "Yes" box: its question is the legend (consent)
    await page.check('#agree-bare'); // "I agree" under a neutral legend: still consent
    await page.fill('#ecname', 'Someone Else');
    await page.fill('#email', 'other@example.com');
    await page.click('legend');

    // Select: keyboard on a focused closed <select> is trusted in Firefox.
    await page.focus('#gender');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.inputValue('#gender'), 'male', 'ArrowDown should change the select');
    await page.focus('#relocate');
    await page.keyboard.press('ArrowDown'); // Please select -> Yes
    assert.equal(await page.inputValue('#relocate'), 'yes');
    await page.click('legend');

    await settle(page);
    const entries = await bank(page);
    const got = Object.fromEntries(entries.map((e) => [e.question, e.answer]));
    assert.deepEqual(got, {
      'how did you hear about us': 'LinkedIn',
      'preferred work arrangement': 'Hybrid',
      'are you willing to relocate': 'Yes',
    });
    assert.equal(entries.length, 3);
    for (const e of entries) assert.equal(e.sensitive, '');

    const toast = await page.evaluate(() => {
      const t = document.getElementById('af-feedback-toast');
      return t ? t.textContent : null;
    });
    assert.ok(toast && toast.startsWith('Saved:'), 'toast text: ' + toast);
  } finally {
    await browser.close();
  }
});

test('learn: synthetic (untrusted) changes learn nothing', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(() => {
      const t = document.getElementById('hear');
      t.value = 'x';
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
      t.dispatchEvent(new Event('focusout', { bubbles: true }));
      const s = document.getElementById('relocate');
      s.value = 'no';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(page);
    assert.deepEqual(await bank(page), []);
    assert.equal(await page.evaluate(() => !!document.getElementById('af-feedback-toast')), false);
  } finally {
    await browser.close();
  }
});

test('learn: an unchanged pre-existing value is not learned; re-answering updates the same entry', async () => {
  const { browser, page } = await setup(() => {
    document.getElementById('hear').value = 'Careers page'; // present before attach
  });
  try {
    // Trusted events with no value change: focus, click, blur.
    await page.click('#hear');
    await page.click('legend');
    await settle(page);
    assert.deepEqual(await bank(page), [], 'baseline value must not be learned');

    await page.fill('#hear', 'LinkedIn');
    await page.click('legend');
    await settle(page);
    let entries = await bank(page);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].question, 'how did you hear about us');
    assert.equal(entries[0].answer, 'LinkedIn');
    const id = entries[0].id;

    await page.fill('#hear', 'Referral');
    await page.click('legend');
    await settle(page);
    entries = await bank(page);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, id);
    assert.equal(entries[0].answer, 'Referral');
  } finally {
    await browser.close();
  }
});

test('learn: a second Alt+Z (re-injection) leaves exactly one learner', async () => {
  const { browser, page } = await setup();
  try {
    // Second press on the same page: every file is injected again, a new pass runs.
    await injectScripts(page);
    await page.evaluate(async (profile) => {
      await AF.autofill.run({ profile, quiet: true });
      AF.running = false;
      AF.learn.attach(document, AF.adapters.generic);
    }, TEST_PROFILE);
    await page.fill('#hear', 'LinkedIn');
    await page.click('legend');
    await settle(page);
    assert.equal(await page.evaluate(() => window.__qaWrites), 1);
    assert.equal((await bank(page)).length, 1);
  } finally {
    await browser.close();
  }
});

test('learn: switching learn mode off stops a page that is already listening', async () => {
  const { browser, page } = await setup();
  try {
    await page.evaluate(() => { window.__store.settings = { learnMode: false }; });
    await page.fill('#hear', 'LinkedIn');
    await page.click('legend');
    await settle(page);
    assert.deepEqual(await bank(page), []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- {company} placeholder

// Fields added in the page (the harness html is shared and stays untouched).
const COMPANY_FIELDS = () => {
  const form = document.getElementById('f');
  const add = (id, label) => {
    const div = document.createElement('div');
    div.innerHTML = `<label for="${id}">${label}</label><input type="text" id="${id}" name="${id}">`;
    form.appendChild(div);
  };
  add('why', 'Why do you want to work at Acme?');
  add('rel', 'Do you have any relatives employed by Acme?');
  add('ref', 'Were you referred by a current Acme employee?');
  add('prev', 'Have you previously worked for Acme?');
};

/** Like setup(), but with the extra fields and a hiring company handed to run() and attach(). */
async function setupCompany(companyName) {
  const { browser, page } = await launch();
  await page.addInitScript(STUB);
  await page.goto(URL);
  await page.evaluate(COMPANY_FIELDS);
  await injectScripts(page);
  await page.evaluate(async ({ profile, companyName }) => {
    const company = AF.company.make(companyName);
    await AF.autofill.run({ profile, quiet: true, company });
    AF.running = false;
    AF.learn.attach(document, AF.adapters.generic, company);
  }, { profile: TEST_PROFILE, companyName });
  return { browser, page };
}

test('learn: the hiring company becomes {company} in the saved question and answer; the toast says so', async () => {
  const { browser, page } = await setupCompany('Acme');
  try {
    await page.fill('#why', "I like Acme's mission");
    await page.click('legend');
    await settle(page);

    const entries = await bank(page);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].question, 'why do you want to work at {company}');
    assert.equal(entries[0].answer, "I like {company}'s mission");
    assert.equal(entries[0].sensitive, '');

    const toast = await page.evaluate(() => {
      const t = document.getElementById('af-feedback-toast');
      return t ? t.textContent : null;
    });
    assert.ok(toast && toast.startsWith('Saved:'), 'toast text: ' + toast);
    assert.ok(toast.includes('{company}'), 'toast names the placeholder: ' + toast);
    assert.ok(!/acme/i.test(toast), 'toast does not name the company: ' + toast);
  } finally {
    await browser.close();
  }
});

test('learn: the {company} entry fills a later page of another company, outlined orange', async () => {
  const first = await setupCompany('Acme');
  let entries;
  try {
    await first.page.fill('#why', "I like Acme's mission");
    await first.page.click('legend');
    await settle(first.page);
    entries = await bank(first.page);
    assert.equal(entries.length, 1);
  } finally {
    await first.browser.close();
  }

  // A fresh page: the Contoso application asks the same question.
  const { browser, page } = await launch();
  try {
    await page.addInitScript(STUB);
    await page.goto(URL);
    await page.evaluate(COMPANY_FIELDS);
    await page.evaluate(() => {
      document.querySelector('label[for=why]').textContent = 'Why do you want to work at Contoso?';
    });
    await injectScripts(page);
    const out = await page.evaluate(async ({ profile, entries }) => {
      const r = await AF.autofill.run({ profile, quiet: true, qaEntries: entries, company: AF.company.make('Contoso') });
      const why = document.getElementById('why');
      return { value: why.value, state: why.getAttribute('data-af-state'), status: r.results.find((x) => x.el === why).status };
    }, { profile: TEST_PROFILE, entries });
    assert.equal(out.value, "I like Contoso's mission");
    assert.equal(out.status, 'filled');
    assert.equal(out.state, 'review', 'an answer that names the company is always orange');

    // The same entry on a page whose company is unknown: question matches, answer needs a name: not filled.
    await page.evaluate(() => { document.getElementById('why').value = ''; });
    const unknown = await page.evaluate(async ({ profile, entries }) => {
      AF.running = false;
      await AF.autofill.run({ profile, quiet: true, qaEntries: entries, company: null });
      return document.getElementById('why').value;
    }, { profile: TEST_PROFILE, entries });
    assert.equal(unknown, '', 'no company known: a {company} answer must not be filled');
  } finally {
    await browser.close();
  }
});

test('learn: relatives / referred / previously-employed (standard questions) are not learned', async () => {
  const { browser, page } = await setupCompany('Acme');
  try {
    // The learnable check says no for each of them...
    const verdicts = await page.evaluate(() => {
      const fields = AF.adapters.generic.findFields(document);
      const out = {};
      for (const id of ['why', 'rel', 'ref', 'prev']) out[id] = AF.learn.learnable(fields.find((f) => f.el.id === id));
      return out;
    });
    assert.deepEqual(verdicts, { why: true, rel: false, ref: false, prev: false });

    // ...and a real hand-typed session saves only the ordinary question.
    await page.fill('#rel', 'Yes, my cousin');
    await page.click('legend');
    await page.fill('#ref', 'Yes, Jordan referred me');
    await page.click('legend');
    await page.fill('#prev', 'Yes, in 2019');
    await page.click('legend');
    await page.fill('#why', "I like Acme's mission");
    await page.click('legend');
    await settle(page);
    const entries = await bank(page);
    assert.deepEqual(entries.map((e) => e.question), ['why do you want to work at {company}']);
  } finally {
    await browser.close();
  }
});

test('learn: standard questions are not learned when no hiring company is known either', async () => {
  // Attached with no company: the raw wording still matches the standard patterns.
  const { browser, page } = await setup(COMPANY_FIELDS);
  try {
    await page.fill('#rel', 'No');
    await page.click('legend');
    await page.fill('#ref', 'No');
    await page.click('legend');
    await settle(page);
    assert.deepEqual(await bank(page), []);
  } finally {
    await browser.close();
  }
});

test('learn: identity numbers and dates of birth are never learned; ordinary yes/no questions are', async () => {
  const { browser, page } = await launch();
  await page.goto(URL);
  await injectScripts(page);
  const out = await page.evaluate(() => {
    const f = (label, inputType) => AF.learn.learnable({ desc: { label, hints: [], context: '', inputType: inputType || 'text' } });
    return {
      no: ['Social Security Number', 'Date of Birth', 'Please indicate your day and month of birth', "Driver's License Number",
        'Passport number', 'Bank account number', 'National ID'].map((l) => [l, f(l)]),
      yes: [["Do you have a valid driver's license?", f("Do you have a valid driver's license?", 'radio')],
        ['Are you willing to relocate?', f('Are you willing to relocate?', 'select')]],
    };
  });
  await browser.close();
  for (const [l, v] of out.no) assert.equal(v, false, l);
  for (const [l, v] of out.yes) assert.equal(v, true, l);
});
