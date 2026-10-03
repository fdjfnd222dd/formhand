/*
 * Options page tests: options.html is loaded from disk with an in-memory
 * stand-in for browser.storage.local (kept in sessionStorage so it survives a
 * reload), plus scripted prompt()/confirm() answers.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, ROOT } = require('./helpers/browser');

const URL = 'file://' + path.join(ROOT, 'options/options.html');

// `seed` (optional) is written to the store only when the session has none yet.
const stub = (seed) => `
  window.__store = JSON.parse(sessionStorage.getItem('store') || 'null');
  if (!window.__store) { window.__store = ${JSON.stringify(seed || {})}; sessionStorage.setItem('store', JSON.stringify(window.__store)); }
  const save = () => sessionStorage.setItem('store', JSON.stringify(window.__store));
  window.__prompts = [];      // answers handed to prompt(), first in first out
  window.__confirm = true;    // answer for confirm()
  window.prompt = () => (window.__prompts.length ? window.__prompts.shift() : null);
  window.confirm = () => window.__confirm;
  window.browser = {
    storage: {
      local: {
        async get(keys) { const o = {}; for (const k of [].concat(keys)) if (k in __store) o[k] = __store[k]; return o; },
        async set(obj) { Object.assign(__store, obj); save(); },
        async remove(keys) { for (const k of [].concat(keys)) delete __store[k]; save(); },
        async clear() { for (const k of Object.keys(__store)) delete __store[k]; save(); },
      },
      onChanged: { addListener(fn) { window.__onChanged = fn; } },
    },
  };`;

async function open(seed) {
  const { browser, page } = await launch();
  await page.addInitScript(stub(seed));
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('#profile-select option').length > 0);
  return { browser, page };
}

const visibleRows = (page) => page.$$eval('#qa-body tr:not([hidden])', (r) => r.length);
const rowOrder = (page) => page.$$eval('#qa-body tr:not([hidden])', (r) => r.map((t) => t.dataset.id));
const countText = (page) => page.textContent('#qa-count');

const status = (page, text) =>
  page.waitForFunction((t) => document.getElementById('status').textContent.includes(t), text);

test('options page saves and reloads the profile with a schema version', async () => {
  const { browser, page } = await open();
  try {
    await page.fill('input[name=firstName]', 'Alexandra');
    await page.fill('input[name=preferredName]', 'Alex');
    await page.selectOption('select[name=gradMonth]', '5');
    await page.selectOption('select[name=phoneType]', 'Mobile');
    await page.click('button[type=submit][form=profile-form]');
    await status(page, 'Saved.');

    const stored = await page.evaluate(() => window.__store);
    assert.equal(stored.schemaVersion, 3);
    assert.equal(stored.profile, undefined);
    const d = stored.profiles[0].data;
    assert.equal(d.firstName, 'Alexandra');
    assert.equal(d.gradMonth, '5');
    assert.equal(d.phoneType, 'Mobile');

    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[name=firstName]')?.value === 'Alexandra');
    assert.equal(await page.inputValue('input[name=preferredName]'), 'Alex');
  } finally {
    await browser.close();
  }
});

test('migration v2 -> v3 wraps the profile in a default profiles list', () => {
  const storage = require('../core/storage.js');
  const out = storage.migrate({ schemaVersion: 2, profile: { firstName: 'Alexandra', phoneType: 'Home' } });
  assert.equal(out.schemaVersion, 3);
  assert.equal(out.profile, undefined);
  assert.deepEqual(out.profiles[0], { id: 'default', name: 'Default', data: { firstName: 'Alexandra', phoneType: 'Home' } });
  assert.equal(out.activeProfileId, 'default');
});

test('migration v1 -> v3 keeps the data and adds an empty phoneType', () => {
  const storage = require('../core/storage.js');
  const out = storage.migrate({ schemaVersion: 1, profile: { firstName: 'Alexandra' } });
  assert.equal(out.schemaVersion, 3);
  assert.deepEqual(out.profiles[0].data, { firstName: 'Alexandra', phoneType: '' });
});

test('duplicate a profile, edit its city, make it active, reload', async () => {
  const { browser, page } = await open();
  try {
    await page.fill('input[name=city]', 'Springfield');
    await page.fill('input[name=state]', 'IL');
    await page.click('button[type=submit][form=profile-form]');
    await status(page, 'Saved.');

    await page.evaluate(() => window.__prompts.push('Campus address'));
    await page.click('#profile-duplicate');
    await status(page, 'created');
    // The editor switched to the copy, which carries the original data.
    assert.equal(await page.inputValue('input[name=city]'), 'Springfield');
    await page.fill('input[name=city]', 'Urbana');
    await page.fill('input[name=state]', 'IL');
    await page.click('button[type=submit][form=profile-form]');
    await status(page, 'Saved.');

    // Not active yet: the marker names the profile that fills pages.
    assert.match(await page.textContent('#active-marker'), /Filling uses: Default/);
    await page.click('#use-profile');
    await status(page, 'Now filling');
    assert.match(await page.textContent('#active-marker'), /Active/);

    const stored = await page.evaluate(() => window.__store);
    assert.equal(stored.profiles.length, 2);
    const campus = stored.profiles.find((p) => p.name === 'Campus address');
    assert.equal(stored.activeProfileId, campus.id);
    assert.equal(campus.data.city, 'Urbana');
    assert.equal(stored.profiles.find((p) => p.id === 'default').data.city, 'Springfield');

    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[name=city]')?.value === 'Urbana');
    assert.equal(await page.$$eval('#profile-select option', (o) => o.length), 2);

    // Switch the editor to Default: its own data shows, and it is not the active one.
    await page.selectOption('#profile-select', 'default');
    assert.equal(await page.inputValue('input[name=city]'), 'Springfield');
    assert.equal(await page.isDisabled('#use-profile'), false);

    // Delete the campus profile; the last remaining one cannot be deleted.
    await page.selectOption('#profile-select', campus.id);
    await page.click('#profile-delete');
    await status(page, 'deleted');
    assert.equal(await page.$$eval('#profile-select option', (o) => o.length), 1);
    assert.equal(await page.isDisabled('#profile-delete'), true);
  } finally {
    await browser.close();
  }
});

test('standard answers save and reload', async () => {
  const { browser, page } = await open();
  try {
    // Defaults come from storage.js; blank by default for the rest.
    assert.equal(await page.inputValue('#standard-form select[name=previouslyEmployed]'), 'no');
    assert.equal(await page.inputValue('#standard-form select[name=gender]'), '');
    assert.match(await page.textContent('#standard-form'), /always outlined orange/);
    assert.match(await page.textContent('#standard-form'), /EEO/);

    await page.selectOption('#standard-form select[name=workAuth]', 'yes');
    await page.selectOption('#standard-form select[name=previouslyEmployed]', '');
    await page.click('button[type=submit][form=standard-form]');
    await status(page, 'Standard answers saved');
    const stored = await page.evaluate(() => window.__store.standardAnswers);
    assert.equal(stored.workAuth, 'yes');
    assert.equal(stored.previouslyEmployed, '');

    await page.reload();
    await page.waitForFunction(() => document.querySelector('#standard-form select[name=workAuth]')?.value === 'yes');
    assert.equal(await page.inputValue('#standard-form select[name=previouslyEmployed]'), '');
  } finally {
    await browser.close();
  }
});

test('Q&A bank: add, edit, search, delete; learn mode switch', async () => {
  const { browser, page } = await open();
  try {
    const add = async (q, aliases, a) => {
      await page.fill('#qa-add .add-question', q);
      await page.fill('#qa-add .add-aliases', aliases);
      await page.fill('#qa-add .add-answer', a);
      await page.click('#qa-add-btn');
      await status(page, 'Entry added');
    };
    await add('Favourite Colour?', 'Preferred colour, Colour you like', 'Green');
    await add('Why do you want to work here?', '', 'Good fit');
    assert.equal(await page.$$eval('#qa-body tr', (r) => r.length), 2);

    let entries = await page.evaluate(() => window.__store.qaBank.entries);
    assert.equal(entries[0].question, 'favourite colour'); // normalized
    assert.deepEqual(entries[0].aliases, ['preferred colour', 'colour you like']);
    const colourRow = `#qa-body tr[data-id="${entries[0].id}"]`; // rows are newest-first, so no nth-child

    // Edit the colour row's answer and mark it sensitive.
    await page.fill(colourRow + ' .answer', 'Blue');
    await page.selectOption(colourRow + ' .sensitive', 'background');
    await page.click(colourRow + ' .row-save');
    await status(page, 'Entry saved');
    entries = await page.evaluate(() => window.__store.qaBank.entries);
    assert.equal(entries[0].answer, 'Blue');
    assert.equal(entries[0].sensitive, 'background');

    // Search matches question, answer and aliases, case-insensitively (non-matching rows are hidden).
    await page.fill('#qa-search', 'COLOUR YOU');
    assert.equal(await visibleRows(page), 1);
    await page.fill('#qa-search', 'good fit');
    assert.equal(await visibleRows(page), 1);
    await page.fill('#qa-search', 'zzz');
    assert.equal(await visibleRows(page), 0);
    await page.fill('#qa-search', '');
    assert.equal(await visibleRows(page), 2);

    await page.click(colourRow + ' .row-delete');
    await status(page, 'Entry deleted');
    entries = await page.evaluate(() => window.__store.qaBank.entries);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].question, 'why do you want to work here');

    await page.check('#learn-mode');
    await status(page, 'Learn mode on');
    assert.equal(await page.evaluate(() => window.__store.settings.learnMode), true);
  } finally {
    await browser.close();
  }
});

test('import merges a profile and a Q&A entry and deletes nothing', async () => {
  const seed = {
    schemaVersion: 3,
    profiles: [{ id: 'default', name: 'Default', data: { firstName: 'Alexandra' } }],
    activeProfileId: 'default',
    qaBank: { entries: [{ id: 'qa-1', question: 'existing question', aliases: [], answer: 'Keep me', sensitive: '', createdAt: 1, updatedAt: 1 }] },
  };
  const { browser, page } = await open(seed);
  try {
    const file = {
      format: 'job-autofill-export',
      profiles: [{ name: 'Home address', data: { city: 'Springfield', state: 'IL' } }],
      qaBank: { entries: [{ question: 'Imported Question?', aliases: ['Same thing'], answer: 'Yes' }] },
      standardAnswers: { workAuth: 'yes' },
    };
    await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await status(page, 'Imported');
    assert.match(await page.textContent('#status'), /Profiles: 1 added/);

    const stored = await page.evaluate(() => window.__store);
    assert.deepEqual(stored.profiles.map((p) => p.name), ['Default', 'Home address']);
    assert.equal(stored.profiles[0].data.firstName, 'Alexandra');
    assert.deepEqual(stored.qaBank.entries.map((e) => e.question), ['existing question', 'imported question']);
    assert.equal(stored.qaBank.entries[0].answer, 'Keep me');
    assert.equal(stored.standardAnswers.workAuth, 'yes');
    // The table shows both entries.
    assert.equal(await page.$$eval('#qa-body tr', (r) => r.length), 2);

    // Declining the confirm() imports nothing.
    await page.evaluate(() => { window.__confirm = false; });
    const again = { profiles: [{ name: 'Other', data: {} }] };
    await page.setInputFiles('#import-file', { name: 'y.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(again)) });
    await status(page, 'cancelled');
    assert.equal((await page.evaluate(() => window.__store.profiles)).length, 2);

    // Garbage is reported, not thrown.
    await page.setInputFiles('#import-file', { name: 'z.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
    await status(page, 'Not valid JSON');
  } finally {
    await browser.close();
  }
});

test('export saves a JSON blob in the export format through an <a download> (no downloads permission)', async () => {
  const { browser, page } = await open();
  try {
    // Capture the anchor's download attributes at click time (and keep the browser from saving a file).
    await page.evaluate(() => {
      document.addEventListener('click', (e) => {
        if (e.target.id === 'export-link') { window.__a = { download: e.target.download, href: e.target.href }; e.preventDefault(); }
      }, true);
    });
    await page.click('#export-btn');
    await page.waitForFunction(() => window.__a);
    const { a, text } = await page.evaluate(async () => ({ a: window.__a, text: await (await fetch(window.__a.href)).text() }));
    assert.match(a.download, /^formhand-export-\d{4}-\d{2}-\d{2}\.json$/);
    assert.match(a.href, /^blob:/);
    assert.ok((await page.textContent('#status')).includes(a.download), 'status names the file');
    const obj = JSON.parse(text);
    assert.equal(obj.format, 'job-autofill-export');
    assert.equal(obj.profiles.length, 1);
    assert.ok(obj.qaBank && obj.standardAnswers);
  } finally {
    await browser.close();
  }
});

test('export: a plain-text personal data warning sits next to the Export button', async () => {
  const { browser, page } = await open();
  try {
    const warning = (await page.textContent('#export-warning')).replace(/\s+/g, ' ');
    assert.match(warning, /personal data in plain text/);
    assert.match(warning, /unencrypted/);
    assert.equal(await page.getAttribute('#export-btn', 'aria-describedby'), 'export-warning');
    // Next to the button: same section, right before it, and visible.
    assert.equal(await page.$eval('#export-warning', (w) => w.closest('section').id), 'export-section');
    assert.equal(await page.$eval('#export-warning', (w) => w.nextElementSibling.contains(document.getElementById('export-btn'))), true);
    assert.ok(await page.isVisible('#export-warning'));
  } finally {
    await browser.close();
  }
});

const FULL_STORE = {
  schemaVersion: 3,
  profiles: [
    { id: 'default', name: 'Home address', data: { firstName: 'Alexandra', city: 'Springfield' } },
    { id: 'p-2', name: 'Campus address', data: { firstName: 'Alexandra', city: 'Urbana' } },
  ],
  activeProfileId: 'p-2',
  qaBank: { entries: [{ id: 'qa-1', question: 'why do you want to work at {company}', aliases: [], answer: 'The mission', sensitive: '', createdAt: 1, updatedAt: 1 }] },
  settings: { learnMode: true, companies: ['Example Corp'] },
  standardAnswers: { workAuth: 'yes', sponsorship: 'no', gender: 'female', previouslyEmployed: 'no' },
};

test('delete all my data: declining the confirm step deletes nothing', async () => {
  const { browser, page } = await open(FULL_STORE);
  try {
    await page.evaluate(() => { window.__confirm = false; });
    await page.click('#delete-all');
    await status(page, 'Nothing was deleted.');
    assert.deepEqual(await page.evaluate(() => window.__store), FULL_STORE);
    assert.equal(await page.inputValue('input[name=city]'), 'Urbana');
  } finally {
    await browser.close();
  }
});

test('delete all my data: confirming wipes storage and the page, unsaved edits included', async () => {
  const { browser, page } = await open(FULL_STORE);
  try {
    await page.waitForFunction(() => document.querySelectorAll('#qa-body tr').length === 1);
    // Unsaved edits everywhere: profile form, standard answers, a Q&A row, the add row, company names.
    await page.fill('input[name=lastName]', 'Unsaved');
    await page.selectOption('#standard-form select[name=gender]', { index: 0 });
    await page.fill('#qa-body tr textarea.answer', 'unsaved answer');
    await page.fill('#qa-add .add-question', 'typed but not added');
    await page.fill('#company-names', 'Example Corp');

    await page.evaluate(() => { window.__confirm = true; });
    await page.click('#delete-all');
    await status(page, 'All Formhand data was deleted');

    assert.deepEqual(await page.evaluate(() => window.__store), {}, 'nothing left in storage.local');
    // The page shows a fresh install: one empty Default profile, no Q&A, learn mode off.
    assert.deepEqual(await page.$$eval('#profile-select option', (o) => o.map((x) => x.textContent.replace(/\s*\(.*\)$/, ''))), ['Default']);
    for (const name of ['firstName', 'lastName', 'city']) assert.equal(await page.inputValue(`input[name=${name}]`), '', name);
    assert.equal(await page.$$eval('#qa-body tr', (r) => r.length), 0);
    assert.equal(await page.inputValue('#qa-add .add-question'), '');
    assert.equal(await page.inputValue('#company-names'), '');
    assert.equal(await page.isChecked('#learn-mode'), false);
    assert.equal(await page.$eval('#standard-form select[name=gender]', (s) => s.value), '');
    assert.equal(await page.$eval('#standard-form select[name=workAuth]', (s) => s.value), '');
    assert.equal(await page.isHidden('#profile-notice'), true);

    // A later reload still shows the empty state (the wipe did not write defaults back).
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('#profile-select option').length > 0);
    assert.equal(await page.inputValue('input[name=firstName]'), '');
  } finally {
    await browser.close();
  }
});

test('storage.clearAll falls back to remove() when storage.local has no clear()', async () => {
  const storage = require('../core/storage.js');
  const store = { schemaVersion: 3, profiles: [], qaBank: { entries: [] }, other: 1 };
  const saved = globalThis.browser;
  globalThis.browser = { storage: { local: {
    async get(keys) { return keys === null ? { ...store } : {}; },
    async remove(keys) { for (const k of keys) delete store[k]; },
  } } };
  try {
    await storage.clearAll();
    assert.deepEqual(store, {});
  } finally {
    globalThis.browser = saved;
  }
});

test('live updates: clean form reloads, dirty form shows a notice instead', async () => {
  const { browser, page } = await open({ schemaVersion: 3, profiles: [{ id: 'default', name: 'Default', data: {} }], activeProfileId: 'default' });
  try {
    const elsewhere = (name) => page.evaluate(async (n) => {
      const s = window.__store;
      s.profiles = [{ ...s.profiles[0], data: { ...s.profiles[0].data, firstName: n } }];
      s.qaBank = { entries: [{ id: 'qa-x', question: 'from a page', aliases: [], answer: 'learned', sensitive: '', createdAt: 1, updatedAt: 1 }] };
      await window.__onChanged({});
    }, name);

    // Clean form: follows the change, and the Q&A table gains the learned entry.
    await elsewhere('Remote');
    await page.waitForFunction(() => document.querySelector('input[name=firstName]').value === 'Remote');
    assert.equal(await page.$$eval('#qa-body tr', (r) => r.length), 1);

    // Dirty form: keeps the typed text and warns.
    await page.fill('input[name=firstName]', 'Typing');
    await elsewhere('Remote2');
    await page.waitForFunction(() => !document.getElementById('profile-notice').hidden);
    assert.equal(await page.inputValue('input[name=firstName]'), 'Typing');
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- {company} placeholder

const entry = (id, question, answer, extra) => ({ id, question, aliases: [], answer, sensitive: '', createdAt: 1, updatedAt: 1, ...(extra || {}) });

const companySeed = (settingsExtra) => ({
  schemaVersion: 3,
  profiles: [{ id: 'default', name: 'Default', data: {} }],
  activeProfileId: 'default',
  settings: { learnMode: false, companies: ['Contoso LLP', 'Initech'], ...(settingsExtra || {}) },
  qaBank: {
    entries: [
      entry('e1', 'have you ever worked at contoso before', 'No'),
      entry('e2', 'have you ever worked at initech before', 'No'), // same question + answer as e1 once converted: merge
      entry('e3', 'how did you hear about contoso', 'LinkedIn'),
      entry('e4', 'how did you hear about initech', 'Referral'), // same question, different answer: conflict
      entry('e5', 'why do you want to work at contoso', "I like Contoso's mission"), // the answer names the company
      entry('e6', 'favourite colour', 'Green'), // names no company: not listed
    ],
  },
});

const liTexts = (page) => page.$$eval('#company-matches > li', (lis) => lis.map((li) => ({
  id: li.dataset.id,
  text: li.textContent,
  to: li.querySelector('strong').textContent,
  disabled: li.querySelector('button.company-convert').disabled,
})));

const storedEntries = (page) => page.evaluate(() => Object.fromEntries(window.__store.qaBank.entries.map((e) => [e.id, e])));

test('company names panel: summary, one row per conversion, merge and conflict notes', async () => {
  const { browser, page } = await open(companySeed());
  try {
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length > 0);
    assert.equal(await page.isHidden('#company-summary'), false);
    assert.match(await page.textContent('#company-summary'), /^5 saved questions name a company/);

    const rows = await liTexts(page);
    assert.deepEqual(rows.map((r) => r.id), ['e1', 'e2', 'e3', 'e4', 'e5']);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(by.e1.to, 'have you ever worked at {company} before');
    assert.equal(by.e2.to, 'have you ever worked at {company} before');
    assert.equal(by.e3.to, 'how did you hear about {company}');
    assert.equal(by.e4.to, 'how did you hear about {company}');
    assert.equal(by.e5.to, 'why do you want to work at {company}');
    for (const r of rows) assert.match(r.to, /\{company\}/);

    // The answer that names the company is shown in its template form.
    assert.match(by.e5.text, /Answer: I like \{company\}'s mission/);
    // e2 merges into e1 (same answer); e4 conflicts with e3 (different answer).
    assert.match(by.e2.text, /the two become one/);
    assert.match(by.e4.text, /different answer/);
    assert.equal(by.e4.disabled, true);
    for (const id of ['e1', 'e2', 'e3', 'e5']) assert.equal(by[id].disabled, false, id);
    // Two or more doable conversions: "Convert all" is offered.
    assert.equal(await page.isHidden('#company-convert-all'), false);
    // Nothing changed in storage just by looking.
    assert.equal((await page.evaluate(() => window.__store.qaBank.entries)).length, 6);
  } finally {
    await browser.close();
  }
});

test('company names panel: Convert on one row rewrites just that entry', async () => {
  const { browser, page } = await open(companySeed());
  try {
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length === 5);
    await page.click('#company-matches > li[data-id=e5] button.company-convert');
    await status(page, 'Entry converted');
    const e = await storedEntries(page);
    assert.equal(e.e5.question, 'why do you want to work at {company}');
    assert.equal(e.e5.answer, "I like {company}'s mission");
    // The others are untouched.
    assert.equal(e.e1.question, 'have you ever worked at contoso before');
    assert.equal(e.e4.question, 'how did you hear about initech');
    assert.equal(Object.keys(e).length, 6);
    // The Q&A table shows the new text and the row left the conversion list.
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length === 4);
    assert.equal(await page.inputValue('#qa-body tr[data-id=e5] .q'), 'why do you want to work at {company}');
    assert.equal(await page.inputValue('#qa-body tr[data-id=e5] .answer'), "I like {company}'s mission");
  } finally {
    await browser.close();
  }
});

test('company names panel: Convert all converts the non-conflicting ones and merged duplicates disappear', async () => {
  const { browser, page } = await open(companySeed());
  try {
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length === 5);
    await page.click('#company-convert-all');
    await status(page, 'entries converted');
    const e = await storedEntries(page);
    // e2 was merged into e1 and is gone.
    assert.equal(e.e2, undefined);
    assert.equal(e.e1.question, 'have you ever worked at {company} before');
    assert.equal(e.e1.answer, 'No');
    assert.equal(e.e3.question, 'how did you hear about {company}');
    assert.equal(e.e5.question, 'why do you want to work at {company}');
    assert.equal(e.e5.answer, "I like {company}'s mission");
    // The conflicting one is left alone, and so is the unrelated one.
    assert.equal(e.e4.question, 'how did you hear about initech');
    assert.equal(e.e4.answer, 'Referral');
    assert.equal(e.e6.question, 'favourite colour');
    assert.equal(Object.keys(e).length, 5);

    // Only the conflict remains in the panel, still disabled.
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length === 1);
    const rows = await liTexts(page);
    assert.equal(rows[0].id, 'e4');
    assert.equal(rows[0].disabled, true);
    assert.equal(await page.isHidden('#company-convert-all'), true);
    assert.equal(await page.$$eval('#qa-body tr', (r) => r.length), 5);
  } finally {
    await browser.close();
  }
});

test('company names panel: typed names win over the remembered ones and #company-scan applies them', async () => {
  const seed = companySeed({ companies: [] });
  seed.qaBank.entries = [entry('v1', 'why do you want to work at acme', 'I like Acme'), entry('c1', 'why contoso', 'Because')];
  const { browser, page } = await open(seed);
  try {
    // No remembered companies and nothing typed: nothing to show.
    await page.waitForFunction(() => document.querySelectorAll('#qa-body tr').length === 2);
    assert.equal(await page.$$eval('#company-matches > li', (l) => l.length), 0);
    assert.equal(await page.isHidden('#company-summary'), true);

    await page.fill('#company-names', 'Acme');
    await page.click('#company-scan');
    const rows = await liTexts(page);
    assert.deepEqual(rows.map((r) => r.id), ['v1']);
    assert.equal(rows[0].to, 'why do you want to work at {company}');
    assert.match(rows[0].text, /Answer: I like \{company\}/);
    assert.match(await page.textContent('#company-summary'), /^1 saved question names a company/);

    // A different typed list finds a different entry.
    await page.fill('#company-names', 'Contoso, Acme');
    await page.click('#company-scan');
    assert.deepEqual((await liTexts(page)).map((r) => r.id), ['v1', 'c1']);

    // Convert uses the typed names too.
    await page.click('#company-matches > li[data-id=c1] button.company-convert');
    await status(page, 'Entry converted');
    const e = await storedEntries(page);
    assert.equal(e.c1.question, 'why {company}');
    assert.equal(e.v1.question, 'why do you want to work at acme');
  } finally {
    await browser.close();
  }
});

test('company names panel: remembered companies are the default and show as the placeholder', async () => {
  const { browser, page } = await open(companySeed());
  try {
    await page.waitForFunction(() => document.querySelectorAll('#company-matches > li').length > 0);
    assert.equal(await page.getAttribute('#company-names', 'placeholder'), 'Contoso LLP, Initech');
    // Typing a name that matches nothing hides the list (typed names win).
    await page.fill('#company-names', 'Nonexistent Corp');
    await page.click('#company-scan');
    assert.equal(await page.$$eval('#company-matches > li', (l) => l.length), 0);
    assert.equal(await page.isHidden('#company-summary'), true);
  } finally {
    await browser.close();
  }
});

test('Q&A row editor keeps {company} when saving a row, and the add form too', async () => {
  const seed = companySeed();
  seed.qaBank.entries = [entry('t1', 'why do you want to work at {company}', "I like {company}'s mission")];
  const { browser, page } = await open(seed);
  try {
    await page.waitForFunction(() => document.querySelectorAll('#qa-body tr').length === 1);
    assert.equal(await page.inputValue('#qa-body tr .q'), 'why do you want to work at {company}');

    await page.fill('#qa-body tr .answer', 'I admire {company} and its people');
    await page.click('#qa-body tr .row-save');
    await status(page, 'Entry saved');
    let e = await storedEntries(page);
    assert.equal(e.t1.question, 'why do you want to work at {company}');
    assert.equal(e.t1.answer, 'I admire {company} and its people');

    // Typed with capitals and punctuation: normalized, the placeholder survives.
    await page.fill('#qa-body tr .q', 'Why do you want to work at {Company}?');
    await page.fill('#qa-body tr .aliases', 'Why {company}?, Why us');
    await page.click('#qa-body tr .row-save');
    await status(page, 'Entry saved');
    e = await storedEntries(page);
    assert.equal(e.t1.question, 'why do you want to work at {company}');
    assert.deepEqual(e.t1.aliases, ['why {company}', 'why us']);

    // The add form as well.
    await page.fill('#qa-add .add-question', 'Have you worked at {company} before?');
    await page.fill('#qa-add .add-answer', 'No');
    await page.click('#qa-add-btn');
    await status(page, 'Entry added');
    const all = await page.evaluate(() => window.__store.qaBank.entries.map((x) => x.question));
    assert.ok(all.includes('have you worked at {company} before'), all.join(' | '));
  } finally {
    await browser.close();
  }
});

test('standard answers form lists "relatives" and "referred", defaulting to no, always orange', async () => {
  const { browser, page } = await open();
  try {
    for (const id of ['relatives', 'referred']) {
      const label = page.locator(`#standard-form label:has(select[name=${id}])`);
      assert.equal(await label.count(), 1, id);
      assert.match(await label.textContent(), /always outlined orange/, id);
      assert.equal(await page.inputValue(`#standard-form select[name=${id}]`), 'no', id);
      const opts = await page.$$eval(`#standard-form select[name=${id}] option`, (o) => o.map((x) => x.value));
      assert.deepEqual(opts, ['', 'yes', 'no'], id);
    }
    assert.match(await page.textContent('#standard-form label:has(select[name=relatives])'), /[Rr]elatives/);
    assert.match(await page.textContent('#standard-form label:has(select[name=referred])'), /[Rr]eferred/);
    // The other defaults are unchanged.
    assert.equal(await page.inputValue('#standard-form select[name=previouslyEmployed]'), 'no');
    assert.equal(await page.inputValue('#standard-form select[name=gender]'), '');

    // Blank one and save: stays blank after a reload (blank = never filled).
    await page.selectOption('#standard-form select[name=referred]', 'yes');
    await page.selectOption('#standard-form select[name=relatives]', '');
    await page.click('button[type=submit][form=standard-form]');
    await status(page, 'Standard answers saved');
    const stored = await page.evaluate(() => window.__store.standardAnswers);
    assert.equal(stored.referred, 'yes');
    assert.equal(stored.relatives, '');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#standard-form select[name=referred]')?.value === 'yes');
    assert.equal(await page.inputValue('#standard-form select[name=relatives]'), '');
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- Phase 5 polish: Q&A bank table

const bankSeed = () => ({
  schemaVersion: 3,
  profiles: [{ id: 'default', name: 'Default', data: {} }],
  activeProfileId: 'default',
  qaBank: {
    entries: [
      entry('a', 'favourite colour', 'Green', { updatedAt: 100 }),
      entry('b', 'are you authorized to work in the us', 'Yes', { updatedAt: 300, sensitive: 'work-authorization' }),
      entry('c', 'why do you want to work at {company}', "I like {company}'s mission", { updatedAt: 200 }),
    ],
  },
});

const openBank = async () => {
  const r = await open(bankSeed());
  await r.page.waitForFunction(() => document.querySelectorAll('#qa-body tr').length === 3);
  return r;
};

test('Q&A search hides rows and never loses an unsaved row edit', async () => {
  const { browser, page } = await openBank();
  try {
    await page.fill('#qa-body tr[data-id=a] .answer', 'Edited green');
    await page.fill('#qa-search', 'authorized');
    assert.deepEqual(await rowOrder(page), ['b']);
    // The edited row is hidden, not rebuilt; no refusal message.
    assert.equal(await page.inputValue('#qa-body tr[data-id=a] .answer'), 'Edited green');
    assert.ok(await page.$eval('#qa-body tr[data-id=a]', (tr) => tr.hidden));
    assert.doesNotMatch(await page.textContent('#status'), /Save or discard/);

    await page.fill('#qa-search', '');
    assert.equal(await visibleRows(page), 3);
    assert.equal(await page.inputValue('#qa-body tr[data-id=a] .answer'), 'Edited green');
    assert.ok(await page.$eval('#qa-body tr[data-id=a]', (tr) => tr.classList.contains('row-dirty')));

    // Search sees what the row shows now: the edited text is findable before it is saved.
    await page.fill('#qa-search', 'edited green');
    assert.deepEqual(await rowOrder(page), ['a']);
    // Nothing was written to storage.
    assert.equal((await page.evaluate(() => window.__store.qaBank.entries.find((e) => e.id === 'a'))).answer, 'Green');
  } finally {
    await browser.close();
  }
});

test('Q&A count: "N entries", then "M of N shown" while filtering', async () => {
  const { browser, page } = await openBank();
  try {
    assert.equal(await countText(page), '3 entries');
    await page.fill('#qa-search', 'work');
    assert.equal(await countText(page), '2 of 3 shown');
    await page.fill('#qa-search', 'authorized');
    assert.equal(await countText(page), '1 of 3 shown');
    await page.fill('#qa-search', 'zzz');
    assert.equal(await countText(page), '0 of 3 shown');
    assert.equal(await page.isVisible('#qa-empty'), true);
    await page.fill('#qa-search', '');
    assert.equal(await countText(page), '3 entries');
    assert.equal(await page.isHidden('#qa-empty'), true);
  } finally {
    await browser.close();
  }
});

test('Q&A sensitivity filter: All / Not sensitive / each category, edits survive', async () => {
  const { browser, page } = await openBank();
  try {
    const labels = await page.$$eval('#qa-filter option', (o) => o.map((x) => x.textContent));
    assert.deepEqual(labels.slice(0, 3), ['All', 'Not sensitive', 'Work authorization']);
    assert.equal(labels.length, 1 + 7); // All + every AF.qa.CATEGORIES entry

    await page.fill('#qa-body tr[data-id=a] .answer', 'Edited green');
    await page.selectOption('#qa-filter', { label: 'Not sensitive' });
    assert.deepEqual((await rowOrder(page)).sort(), ['a', 'c']);
    assert.equal(await countText(page), '2 of 3 shown');
    await page.selectOption('#qa-filter', { label: 'Work authorization' });
    assert.deepEqual(await rowOrder(page), ['b']);
    await page.selectOption('#qa-filter', { label: 'EEO / self-identification' });
    assert.deepEqual(await rowOrder(page), []);
    await page.selectOption('#qa-filter', { label: 'All' });
    assert.equal(await visibleRows(page), 3);
    assert.equal(await page.inputValue('#qa-body tr[data-id=a] .answer'), 'Edited green');

    // Filter and search combine.
    await page.selectOption('#qa-filter', { label: 'Not sensitive' });
    await page.fill('#qa-search', 'colour');
    assert.deepEqual(await rowOrder(page), ['a']);
  } finally {
    await browser.close();
  }
});

test('Q&A sort: recently updated first by default, Question A-Z on request, edits survive', async () => {
  const { browser, page } = await openBank();
  try {
    assert.equal(await page.inputValue('#qa-sort'), 'recent');
    assert.deepEqual(await rowOrder(page), ['b', 'c', 'a']); // updatedAt 300, 200, 100

    await page.fill('#qa-body tr[data-id=c] .answer', 'Edited c');
    const rowC = await page.$('#qa-body tr[data-id=c]');
    await page.selectOption('#qa-sort', { label: 'Question A–Z' });
    // are you... / favourite... / why...
    assert.deepEqual(await rowOrder(page), ['b', 'a', 'c']);
    assert.equal(await page.inputValue('#qa-body tr[data-id=c] .answer'), 'Edited c');
    // Same element, just moved.
    assert.equal(await rowC.evaluate((tr) => tr.isConnected && tr.dataset.id), 'c');

    await page.selectOption('#qa-sort', { label: 'Recently updated first' });
    assert.deepEqual(await rowOrder(page), ['b', 'c', 'a']);
    assert.equal(await page.inputValue('#qa-body tr[data-id=c] .answer'), 'Edited c');
  } finally {
    await browser.close();
  }
});

test('Q&A row-dirty highlight and Revert restore the stored values', async () => {
  const { browser, page } = await openBank();
  try {
    const row = '#qa-body tr[data-id=a]';
    const isDirty = () => page.$eval(row, (tr) => tr.classList.contains('row-dirty'));
    assert.equal(await isDirty(), false);
    assert.equal(await page.isHidden(row + ' .row-revert'), true);

    await page.fill(row + ' .answer', 'Teal');
    await page.fill(row + ' .aliases', 'hue');
    await page.selectOption(row + ' .sensitive', 'background');
    assert.equal(await isDirty(), true);
    assert.equal(await page.isVisible(row + ' .row-revert'), true);
    // The other rows are untouched.
    assert.equal(await page.$$eval('#qa-body tr.row-dirty', (r) => r.length), 1);

    await page.click(row + ' .row-revert');
    assert.equal(await page.inputValue(row + ' .answer'), 'Green');
    assert.equal(await page.inputValue(row + ' .aliases'), '');
    assert.equal(await page.inputValue(row + ' .sensitive'), '');
    assert.equal(await isDirty(), false);
    assert.equal(await page.isHidden(row + ' .row-revert'), true);

    // Typing the stored text back also clears the mark.
    await page.fill(row + ' .answer', 'x');
    assert.equal(await isDirty(), true);
    await page.fill(row + ' .answer', 'Green');
    assert.equal(await isDirty(), false);

    // Nothing was ever written by editing or reverting.
    const stored = await page.evaluate(() => window.__store.qaBank.entries.find((e) => e.id === 'a'));
    assert.equal(stored.answer, 'Green');
    assert.equal(stored.updatedAt, 100);
  } finally {
    await browser.close();
  }
});

test('Q&A saving one row keeps the unsaved edits of another row; Save clears the mark', async () => {
  const { browser, page } = await openBank();
  try {
    await page.fill('#qa-body tr[data-id=a] .answer', 'Saved green');
    await page.fill('#qa-body tr[data-id=c] .answer', 'Still typing');
    await page.click('#qa-body tr[data-id=a] .row-save');
    await status(page, 'Entry saved');
    assert.equal((await page.evaluate(() => window.__store.qaBank.entries.find((e) => e.id === 'a'))).answer, 'Saved green');
    assert.equal(await page.inputValue('#qa-body tr[data-id=a] .answer'), 'Saved green');
    assert.equal(await page.$eval('#qa-body tr[data-id=a]', (tr) => tr.classList.contains('row-dirty')), false);
    assert.equal(await page.inputValue('#qa-body tr[data-id=c] .answer'), 'Still typing');
    assert.equal(await page.$eval('#qa-body tr[data-id=c]', (tr) => tr.classList.contains('row-dirty')), true);
    // The saved row is now the most recently updated one.
    assert.equal((await rowOrder(page))[0], 'a');

    // Delete still confirms: declining keeps the entry.
    await page.evaluate(() => { window.__confirm = false; });
    await page.click('#qa-body tr[data-id=b] .row-delete');
    assert.equal((await page.evaluate(() => window.__store.qaBank.entries)).length, 3);
    await page.evaluate(() => { window.__confirm = true; });
    await page.click('#qa-body tr[data-id=b] .row-delete');
    await status(page, 'Entry deleted');
    assert.equal(await visibleRows(page), 2);
    assert.equal(await page.inputValue('#qa-body tr[data-id=c] .answer'), 'Still typing');
  } finally {
    await browser.close();
  }
});

test('Q&A add row: Enter in any text box adds the entry', async () => {
  const { browser, page } = await open();
  try {
    await page.fill('#qa-add .add-question', 'Favourite Colour?');
    await page.press('#qa-add .add-question', 'Enter');
    await status(page, 'Entry added');
    let entries = await page.evaluate(() => window.__store.qaBank.entries);
    assert.deepEqual(entries.map((e) => e.question), ['favourite colour']);
    // The boxes were cleared.
    assert.equal(await page.inputValue('#qa-add .add-question'), '');

    await page.fill('#qa-add .add-question', 'Second thing');
    await page.fill('#qa-add .add-answer', 'Answer two');
    await page.press('#qa-add .add-answer', 'Enter');
    await page.waitForFunction(() => window.__store.qaBank.entries.length === 2);
    entries = await page.evaluate(() => window.__store.qaBank.entries);
    assert.equal(entries[1].answer, 'Answer two');
    assert.equal(await countText(page), '2 entries');

    // An empty question is refused, as with the button.
    await page.press('#qa-add .add-aliases', 'Enter');
    await status(page, 'A question is required');
    assert.equal((await page.evaluate(() => window.__store.qaBank.entries)).length, 2);
  } finally {
    await browser.close();
  }
});

test('Q&A rows use auto-growing textareas and tag {company} entries', async () => {
  const { browser, page } = await openBank();
  try {
    assert.equal(await page.$eval('#qa-body tr[data-id=a] .q', (e) => e.tagName), 'TEXTAREA');
    assert.equal(await page.$eval('#qa-body tr[data-id=a] .answer', (e) => e.tagName), 'TEXTAREA');
    // Every control still has an accessible name.
    for (const sel of ['.q', '.aliases', '.answer', '.sensitive']) {
      assert.ok(await page.$eval('#qa-body tr[data-id=a] ' + sel, (e) => e.getAttribute('aria-label')), sel);
    }

    // Tag: shown for c (question and answer name {company}), hidden for a.
    assert.equal(await page.isVisible('#qa-body tr[data-id=c] .company-tag'), true);
    assert.equal(await page.textContent('#qa-body tr[data-id=c] .company-tag'), '{company}');
    assert.equal(await page.isHidden('#qa-body tr[data-id=a] .company-tag'), true);
    // It follows what is typed.
    await page.fill('#qa-body tr[data-id=a] .answer', 'I admire {company}');
    assert.equal(await page.isVisible('#qa-body tr[data-id=a] .company-tag'), true);
    await page.fill('#qa-body tr[data-id=a] .answer', 'Green');
    assert.equal(await page.isHidden('#qa-body tr[data-id=a] .company-tag'), true);

    // A long Workday-style question grows the textarea, and it shrinks back.
    const h = () => page.$eval('#qa-body tr[data-id=a] .q', (e) => e.offsetHeight);
    const before = await h();
    await page.fill('#qa-body tr[data-id=a] .q', 'do you have a relationship with an employee '.repeat(30));
    const grown = await h();
    assert.ok(grown > before * 3, `grew ${before} -> ${grown}`);
    assert.ok(await page.$eval('#qa-body tr[data-id=a] .q', (e) => e.scrollHeight <= e.clientHeight + 1), 'no inner scrolling');
    await page.fill('#qa-body tr[data-id=a] .q', 'short');
    assert.ok((await h()) < grown);

    // Rows hidden while typing are sized correctly once shown again.
    await page.fill('#qa-body tr[data-id=c] .answer', 'long answer text '.repeat(60));
    await page.fill('#qa-search', 'zzz-nothing');
    await page.fill('#qa-search', '');
    assert.ok(await page.$eval('#qa-body tr[data-id=c] .answer', (e) => e.scrollHeight <= e.clientHeight + 1));
  } finally {
    await browser.close();
  }
});

test('page has a section nav and no inline styles or scripts', async () => {
  const { browser, page } = await open();
  try {
    const hrefs = await page.$$eval('nav a', (a) => a.map((x) => x.getAttribute('href')));
    assert.deepEqual(hrefs, ['#profiles-section', '#standard-section', '#qa-section', '#export-section', '#delete-section']);
    for (const h of hrefs) assert.equal(await page.locator(h).count(), 1, h);
    assert.equal(await page.$$eval('[style]', (e) => e.length), 0, 'no style="" attributes in the markup');
    assert.equal(await page.$$eval('script:not([src])', (e) => e.length), 0);
  } finally {
    await browser.close();
  }
});
