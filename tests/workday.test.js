/*
 * Workday adapter against hand-written pages in tests/harness/workday-*.html.
 * The pages copy the REAL markup of the Workday captures (fixtures/workday/,
 * 2026-10-02): fkit formFields, button dropdowns with a phantom input and a
 * portaled popup, multiselect prompts with pills, CheckboxGroups, rich-text
 * question legends, dateInputWrapper spinbuttons, repeater panels, the footer
 * outside the page container. tests/harness/workday.js brings the widgets to
 * life. The prompt's RESULTS popup was never captured: its markup is modelled
 * there, so prompt tests prove our assumptions, not Workday's behavior.
 *
 * Detection is by hostname (synthetic pages have none), so every pass here is forced with
 * { adapter: 'workday' }; real captures are detected from their og:url / canonical.
 * The real captures run through tests/fixtures.test.js (CASES, workday/...).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, injectScripts, openCapture, hasFixture, fixturePath, TEST_PROFILE, ROOT } = require('./helpers/browser');

let browser;
let page;

test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

const harnessUrl = (name) => 'file://' + path.join(ROOT, 'tests', 'harness', name);

// The owner's standard answers (same as tests/fixtures.test.js STD).
const STD = {
  workAuth: 'yes', sponsorship: 'no', gender: 'female', hispanic: 'no', race: 'two', veteran: 'not', disability: 'no',
  privacyAck: '', otherPositions: 'yes', previouslyEmployed: 'no', clientEmployed: 'no', relatives: 'no', referred: 'no',
};

/**
 * Things the extension must never touch on a Workday page: header buttons (the
 * language picker is an aria-haspopup=listbox button), footer Back / Next, the
 * Add / Delete buttons, the label-less SMS opt-in box, the calendar icon, pills,
 * the file picker. Any pointer / key / change event on them is recorded in
 * window.__never (independent of the harness's own watch).
 */
function watchNever() {
  window.__never = [];
  const sel = [
    'header *', '[data-automation-id="utilityButtonBar"] *', '[data-automation-id="pageFooter"] *',
    '[data-automation-id="backToJobPosting"]', '[data-automation-id="add-button"]', '[data-automation-id="phone-sms-opt-in"]',
    '[data-automation-id="dateIcon"]', '[data-automation-id="select-files"]', '[data-automation-id="selectedItem"]',
    '[data-automation-id="DELETE_charm"]', 'a[href]',
  ].join(', ');
  const events = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'change', 'input'];
  for (const type of events) {
    document.addEventListener(type, (e) => {
      const t = e.target && e.target.closest ? e.target.closest(sel) : null;
      if (t) window.__never.push(`${type} ${t.id || t.getAttribute('data-automation-id') || t.tagName}`);
      // Any other plain button (Delete): only dropdown openers and popup rows are ours.
      const b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (b && !b.hasAttribute('aria-haspopup') && !b.closest('[data-behavior-click-outside-close]') && !t) {
        window.__never.push(`${type} button ${b.textContent.trim().slice(0, 12)}`);
      }
    }, true);
  }
}

/** Open a synthetic page and run one forced Workday pass. */
async function runOn(name, opts) {
  const o = opts || {};
  await page.goto(harnessUrl(name));
  await page.evaluate(watchNever);
  await injectScripts(page);
  return page.evaluate(async ({ profile, o }) => {
    const options = {
      profile, adapter: 'workday', quiet: true, standardAnswers: o.standard || {},
      company: o.noCompany ? null : AF.company.make('Acme'),
    };
    const r = await AF.autofill.run(options);
    return {
      adapter: r.adapter,
      step: r.step,
      fallback: r.fallback,
      company: r.company && r.company.name,
      counts: r.counts,
      byId: Object.fromEntries(r.results.map((x) => [x.el.id, [x.match && x.match.key, x.status, x.state]])),
    };
  }, { profile: TEST_PROFILE, o });
}

const $ = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const textOf = (sel) => page.evaluate((s) => document.querySelector(s).textContent.trim(), sel);
const valueOf = (sel) => page.evaluate((s) => document.querySelector(s).value, sel);
const checkedOf = (sel) => page.evaluate((s) => document.querySelector(s).checked, sel);
const harness = () => page.evaluate(() => window.__harness);
const never = () => page.evaluate(() => window.__never);

/** data-af-state of the element that carries the outline for `id` (the input, or its widget box). */
const outlineOf = (id) =>
  page.evaluate((i) => {
    const e = document.getElementById(i);
    const box = e.closest('[data-automation-id="multiselectInputContainer"], [data-automation-id="dateInputWrapper"]') || e;
    return box.getAttribute('data-af-state');
  }, id);

/** The pills a prompt shows (aria-labels of its selectedItem elements, "<text>, press delete..."). */
const pillsOf = (id) =>
  page.evaluate((i) => {
    const box = document.getElementById(i).closest('[data-automation-id="multiselectInputContainer"]');
    return Array.from(box.querySelectorAll('[data-automation-id="selectedItem"]')).map((p) =>
      p.getAttribute('aria-label').replace(/, press delete to clear value\.$/, '')
    );
  }, id);

/** Every property the pass must leave alone, whatever page it ran on. */
async function assertNothingNavigated() {
  assert.deepEqual(await never(), [], 'header / footer / Add / Delete / SMS opt-in / pills must never be touched');
  const h = await harness();
  assert.deepEqual(h.forbidden, [], 'harness saw a click on something the extension must never click');
  assert.equal(h.open, 0, 'a popup was left open');
  assert.ok(h.maxOpen <= 1, 'two popups were open at once');
  assert.equal(h.pillClicks, 0, 'a selected-item pill was clicked');
  assert.deepEqual(h.phantom, [], 'the phantom input after a dropdown was touched');
  const dirty = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-haspopup="listbox"] + input')).filter((i) => i.value !== '').length
  );
  assert.equal(dirty, 0, 'a phantom input holds a value');
}

test('detection is by hostname only (saved pages: the URL they were saved from)', async () => {
  await page.goto(harnessUrl('workday-my-information.html'));
  await injectScripts(page);
  const name = await page.evaluate(() => AF.autofill.pickAdapter(document).name);
  assert.notEqual(name, 'workday', 'a file:// page full of Workday markup is not Workday');
  const hosts = await page.evaluate(() =>
    ['contoso.wd12.myworkdayjobs.com', 'acme.wd5.myworkdayjobs.com', 'wd5.myworkday.com', 'acme.wd1.myworkdaysite.com', 'careers.contoso.com', 'myworkdayjobs.com.evil.example']
      .map((h) => AF.adapters.workday.detect({ location: { hostname: h } }))
  );
  assert.deepEqual(hosts, [true, true, true, true, false, false]);
  // A saved page: the URL it was saved from counts, links in the content do not.
  const saved = await page.evaluate(() => {
    const at = (html) => {
      const d = document.implementation.createHTMLDocument('x');
      d.head.innerHTML = html;
      return AF.adapters.workday.detect(d);
    };
    return [
      at('<meta property="og:url" content="https://acme.wd5.myworkdayjobs.com/en-US/x/job/y">'),
      at('<meta name="af-capture-url" content="https://acme.wd1.myworkdaysite.com/a">'),
      at('<link rel="canonical" href="https://careers.contoso.com/job/1"><a href="https://contoso.wd12.myworkdayjobs.com/x">apply</a>'),
    ];
  });
  assert.deepEqual(saved, [true, true, false]);
});

test('harness popup has the real shape: portaled to body, disabled "Select One" first row', async () => {
  await page.goto(harnessUrl('workday-my-information.html'));
  const shape = await page.evaluate(() => {
    const btn = document.getElementById('country--country');
    btn.click();
    const p = document.body.querySelector(':scope > div[data-behavior-click-outside-close][data-popper-placement]');
    const ul = p && p.querySelector(':scope > div[visibility="opened"] > ul[role="listbox"]');
    const rows = ul ? Array.from(ul.querySelectorAll(':scope > li[role="option"][data-value=""]')) : [];
    const out = {
      portaled: !!p,
      expanded: btn.getAttribute('aria-expanded'),
      controls: btn.getAttribute('aria-controls') === (ul && ul.id),
      first: rows[0] ? [rows[0].id, rows[0].getAttribute('aria-disabled'), rows[0].textContent] : null,
      rows: rows.length,
      phantomAfter: btn.nextElementSibling.tagName + btn.nextElementSibling.getAttribute('type'),
    };
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.closed = !document.querySelector('[data-behavior-click-outside-close]') && btn.getAttribute('aria-expanded') === 'false';
    return out;
  });
  assert.deepEqual(shape, {
    portaled: true, expanded: 'true', controls: true, first: ['select-one', 'true', 'Select One'], rows: 4,
    phantomAfter: 'INPUTtext', closed: true,
  });
});

test('My Information: real dropdowns + popup, prompt + pill, reveals, no phantom writes', async () => {
  const r = await runOn('workday-my-information.html');
  assert.equal(r.step, 'myInformation');
  assert.equal(r.adapter, 'workday');
  assert.equal(r.fallback, null);

  // Button dropdown, alias "United States" -> "United States of America", never the Minor Outlying Islands.
  assert.equal(await textOf('#country--country'), 'United States of America');
  assert.equal(await page.evaluate(() => document.getElementById('country--country').getAttribute('aria-label')), 'Country United States of America Required');
  assert.deepEqual(r.byId['country--country'], ['country', 'filled', 'filled']);

  // Dependent: State + Postal Code appeared after Country (revealed after City) and were filled on the rescan.
  assert.equal(await textOf('#address--countryRegion'), 'California'); // profile "CA"
  assert.equal(await valueOf('#address--postalCode'), TEST_PROFILE.postalCode);
  assert.equal(r.byId['address--postalCode'][2], 'filled');

  // "Mobile" (profile) vs "Cell" (option).
  assert.equal(await textOf('#phoneNumber--phoneType'), 'Cell');

  // Multiselect prompt: the input (no type, no role) was opened, the leaf picked, and a real pill shows it.
  assert.deepEqual(await pillsOf('phoneNumber--countryPhoneCode'), ['United States of America (+1)']);
  assert.deepEqual(r.byId['phoneNumber--countryPhoneCode'], ['phoneCountryCode', 'filled', 'filled']);
  assert.equal(await outlineOf('phoneNumber--countryPhoneCode'), 'filled');
  assert.equal((await harness()).categoryClicks, undefined, 'a category row was clicked');
  const pillShape = await page.evaluate(() => {
    const list = document.querySelector('#phoneNumber--countryPhoneCode').closest('[data-automation-id="multiselectInputContainer"]')
      .querySelector('ul[role="listbox"][data-automation-id="selectedItemList"]');
    const pill = list && list.querySelector(':scope > li[data-automation-id="menuItem"] > div[role="option"][data-automation-id="selectedItem"]');
    return !!pill && !!pill.querySelector('[data-automation-id="DELETE_charm"]') && !!pill.querySelector('p[data-automation-id="promptOption"]');
  });
  assert.equal(pillShape, true);

  // Plain text inputs (controls carry no automation id; the wrapper does).
  assert.equal(await valueOf('#name--legalName--firstName'), TEST_PROFILE.firstName);
  assert.equal(await valueOf('#name--legalName--lastName'), TEST_PROFILE.lastName);
  assert.equal(await valueOf('#address--addressLine1'), TEST_PROFILE.addressLine1);
  assert.equal(await valueOf('#address--city'), TEST_PROFILE.city);
  assert.equal(await valueOf('#phoneNumber--phoneNumber'), TEST_PROFILE.phone);

  // Checkbox derived from the profile (preferred name differs) reveals a field we then fill.
  assert.equal(await checkedOf('#name--preferredCheck'), true);
  assert.equal(await valueOf('#name--legalName--preferredFirstName'), TEST_PROFILE.preferredName);

  // County (optional) is not the state; the extension is empty; the SMS opt-in box is a consent box.
  assert.equal(await valueOf('#address--regionSubdivision1'), '');
  assert.equal(r.byId['address--regionSubdivision1'][0], null, 'County must not get a profile key');
  assert.equal(await outlineOf('address--regionSubdivision1'), null);
  assert.equal(await page.evaluate(() => document.querySelector('[data-automation-id="phone-sms-opt-in"]').checked), false);
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-automation-id="phone-sms-opt-in"]').hasAttribute('data-af-state')), false,
    'the SMS opt-in box is not outlined either'
  );
  const smsId = await page.evaluate(() => document.querySelector('[data-automation-id="phone-sms-opt-in"]').id);
  assert.ok(!(smsId in r.byId), 'the SMS opt-in box is not even a field');

  // No standard answer stored: the previous-worker radio and "How did you hear" stay yellow, untouched.
  assert.equal(await page.evaluate(() => !!document.querySelector('input[name=candidateIsPreviousWorker]:checked')), false);
  const radioState = await page.evaluate(() => document.getElementById('previousWorker--candidateIsPreviousWorker').closest('fieldset').getAttribute('data-af-state'));
  assert.equal(radioState, 'unknown');
  assert.equal(r.byId['source--source'][1], 'nomatch');
  assert.equal(await outlineOf('source--source'), 'unknown');
  assert.deepEqual(await pillsOf('source--source'), []);

  await assertNothingNavigated();
});

test('second run changes nothing (no overwrite)', async () => {
  const again = await page.evaluate(async (profile) => {
    const r = await AF.autofill.run({ profile, adapter: 'workday', quiet: true, company: AF.company.make('Acme') });
    return r.results.filter((x) => x.status === 'filled').map((x) => x.el.id);
  }, TEST_PROFILE);
  assert.deepEqual(again, []);
  assert.deepEqual(await never(), []);
});

test('My Information with standard answers: "worked for Acme" radio answered, orange', async () => {
  const r = await runOn('workday-my-information.html', { standard: STD });
  const radio = await page.evaluate(() => {
    const on = document.querySelector('input[name=candidateIsPreviousWorker]:checked');
    return [on && on.labels[0].textContent, document.querySelector('fieldset').getAttribute('data-af-state')];
  });
  assert.deepEqual(radio, ['No', 'review']); // previouslyEmployed is always outlined orange
  assert.equal(r.counts.unknown, 1, 'only "How did you hear" stays yellow');
  await assertNothingNavigated();
});

test('Application Questions: rich-text legends, standard answers, CheckboxGroups = one question', async () => {
  const r = await runOn('workday-application-questions.html', { standard: STD });
  assert.equal(r.step, 'applicationQuestions');
  assert.equal(r.adapter, 'workday');
  assert.equal(r.fallback, null);
  assert.equal(r.company, 'Acme');
  const id = (k) => 'primaryQuestionnaire--1b2264de5a9410018ab392622cb7' + k.toString(16).padStart(4, '0');
  const val = (k) => textOf('#' + id(k));

  // Sponsorship: standard answer "no", green.
  assert.equal(await val(2), 'No');
  assert.deepEqual(r.byId[id(2)], ['std:sponsorship', 'filled', 'filled']);
  // "work for, or with Acme": previously employed, always orange.
  assert.equal(await val(3), 'No');
  assert.deepEqual(r.byId[id(3)], ['std:previouslyEmployed', 'filled', 'review']);
  // Relatives: its OWN legend lists "guardian" and "spouse" (vetoed as a section); answered from the standard answer, orange.
  assert.equal(await val(9), 'No');
  assert.deepEqual(r.byId[id(9)], ['std:relatives', 'filled', 'review']);
  // Referred by a government official / client employee.
  assert.equal(await val(11), 'No');
  assert.deepEqual(r.byId[id(11)], ['std:referred', 'filled', 'review']);
  // No answer for these: yellow, untouched (never a guess).
  for (const k of [1, 4, 8, 10]) {
    assert.equal(await val(k), 'Select One', `question ${k}`);
    assert.equal(r.byId[id(k)][2], 'unknown', `question ${k}`);
  }
  // Consent to AI processing of your data: the owner's "other positions: yes" answer must NOT answer it.
  assert.equal(await val(12), 'Select One');
  assert.equal(r.byId[id(12)][2], 'unknown');
  // Optional textarea whose only label is the legend: never outlined.
  assert.equal(await valueOf('#' + id(6)), '');
  assert.equal(r.byId[id(6)][2], null);

  // CheckboxGroups: ONE field per question, not one per box. The required FINRA group
  // (no answer for it) gets ONE yellow outline, on the fieldset.
  const finra = await page.evaluate((gid) => {
    const fs = document.getElementById(gid);
    const marked = [fs, ...fs.querySelectorAll('*')].filter((n) => n.hasAttribute('data-af-state'));
    return {
      boxes: fs.querySelectorAll('input[type=checkbox]').length,
      marked: marked.map((n) => [n.tagName, n.getAttribute('data-af-state')]),
      ticked: fs.querySelectorAll('input:checked').length,
    };
  }, id(5));
  assert.deepEqual(finra, { boxes: 8, marked: [['FIELDSET', 'unknown']], ticked: 0 });
  const certs = await page.evaluate((gid) => {
    const fs = document.getElementById(gid);
    return [fs, ...fs.querySelectorAll('*')].filter((n) => n.hasAttribute('data-af-state')).map((n) => n.tagName);
  }, id(7));
  assert.deepEqual(certs, ['FIELDSET']);
  // The group's field is keyed by its first box: label = the outer legend, not "SIE".
  const groupResults = Object.keys(r.byId).filter((k) => /^f1x\d+-|^c1x\d+-/.test(k));
  assert.equal(groupResults.length, 2, 'one result per CheckboxGroup');
  assert.equal(r.counts.unknown, 7); // Q1, Q4, FINRA, certifications, Q8 (CRD), Q10, Q12

  await assertNothingNavigated();
});

test('Application Questions without standard answers or company: nothing guessed, no crash', async () => {
  const r = await runOn('workday-application-questions.html', { noCompany: true });
  assert.equal(r.adapter, 'workday');
  assert.equal(r.company, null);
  assert.equal(r.counts.filled, 0);
  assert.equal(r.counts.review, 0);
  // Every required question is yellow, the optional textarea is not.
  assert.equal(r.counts.unknown, 11);
  await assertNothingNavigated();
});

test('My Experience: repeaters skipped (required ones yellow), Education 1 filled, prompts + pills', async () => {
  const r = await runOn('workday-my-experience.html');
  assert.equal(r.step, 'myExperience');
  assert.equal(r.adapter, 'workday');
  assert.equal(r.fallback, null);

  // Work Experience panels: nothing typed, required text inputs and DATES outlined yellow.
  for (const p of [893, 894]) {
    assert.equal(await valueOf(`#workExperience-${p}--jobTitle`), '');
    assert.equal(await valueOf(`#workExperience-${p}--companyName`), '');
    assert.deepEqual(r.byId[`workExperience-${p}--jobTitle`], [null, 'skipped', 'unknown']);
    assert.deepEqual(r.byId[`workExperience-${p}--companyName`], [null, 'skipped', 'unknown']);
    assert.equal(await outlineOf(`workExperience-${p}--startDate-dateSectionMonth-input`), 'unknown', `From of panel ${p}`);
    assert.equal(await valueOf(`#workExperience-${p}--startDate-dateSectionMonth-input`), '');
    assert.equal(await valueOf(`#workExperience-${p}--startDate-dateSectionYear-input`), '');
  }
  assert.equal(await outlineOf('workExperience-893--endDate-dateSectionMonth-input'), 'unknown', 'To of panel 1');
  assert.equal(await $('#workExperience-894--endDate'), false, 'panel 2 is "currently work here": no To date');
  // Optional fields and the currently-work-here boxes: untouched, no outline.
  for (const p of [893, 894]) {
    assert.equal(await valueOf(`#workExperience-${p}--location`), '');
    assert.equal(await checkedOf(`#workExperience-${p}--currentlyWorkHere`), false);
    assert.equal(await outlineOf(`workExperience-${p}--currentlyWorkHere`), null);
    assert.equal(await outlineOf(`workExperience-${p}--roleDescription`), null);
  }

  // Education 1 is filled from the profile...
  assert.deepEqual(await pillsOf('education-896--school'), [TEST_PROFILE.school]);
  assert.deepEqual(r.byId['education-896--school'], ['school', 'filled', 'filled']);
  assert.equal(await textOf('#education-896--degree'), 'B.S. - Bachelor of Science');
  assert.equal(r.byId['education-896--degree'][0], 'degree');
  assert.deepEqual(await pillsOf('education-896--fieldOfStudy'), [TEST_PROFILE.major]);
  assert.deepEqual(r.byId['education-896--fieldOfStudy'], ['major', 'filled', 'filled']);
  assert.equal(await valueOf('#education-896--gradeAverage'), TEST_PROFILE.gpa);
  // ...year-only dates: "To (Actual or Expected)" gets the graduation year, "From" has no profile key.
  assert.equal(await valueOf('#education-896--lastYearAttended-dateSectionYear-input'), TEST_PROFILE.gradYear);
  assert.deepEqual(r.byId['education-896--lastYearAttended-dateSectionYear-input'], ['gradYear', 'filled', 'filled']);
  assert.equal(await textOf('#education-896--lastYearAttended-dateSectionYear-display'), TEST_PROFILE.gradYear);
  assert.equal(await valueOf('#education-896--firstYearAttended-dateSectionYear-input'), '');
  assert.equal(await outlineOf('education-896--firstYearAttended-dateSectionYear-input'), null);

  // Education 2 (a later entry): skipped; its required School is yellow.
  assert.deepEqual(await pillsOf('education-897--school'), []);
  assert.deepEqual(r.byId['education-897--school'], [null, 'skipped', 'unknown']);
  assert.equal(await textOf('#education-897--degree'), 'Select One');

  // Skills (optional, no profile key), the resume block and Websites: untouched, no outline.
  assert.deepEqual(await pillsOf('skills--skills'), []);
  assert.equal(await outlineOf('skills--skills'), null);
  assert.equal(await outlineOf('resumeAttachments--attachments'), null);

  // The pill lists of earlier prompts are role=listbox elements: they were never mistaken for a popup.
  const h = await harness();
  assert.equal(h.pillClicks, 0);
  assert.equal(h.categoryClicks, undefined);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-automation-id="selectedItem"]').length), 2);
  await assertNothingNavigated();
});

test('a pill list that appeared after a prompt was described is not that prompt\'s popup', async () => {
  await page.goto(harnessUrl('workday-my-experience.html'));
  await page.evaluate(watchNever);
  await injectScripts(page);
  const out = await page.evaluate(async (school) => {
    // Describe every field first (the prompts remember the listboxes present NOW)...
    const fields = AF.adapters.workday.findFields(document);
    const study = fields.find((f) => f.el.id === 'education-896--fieldOfStudy');
    // ...then a pick lands on the School prompt: its pills are a role=listbox of role=option elements,
    // new since the Field of Study prompt was described.
    const box = document.getElementById('education-896--school').closest('[data-automation-id="multiselectInputContainer"]');
    box.insertAdjacentHTML('beforeend',
      '<div tabindex="-1"><ul role="listbox" tabindex="0" data-automation-id="selectedItemList" aria-label="items selected" data-uxi-widget-type="selectinputlist">' +
      '<li role="presentation" data-automation-id="menuItem"><div role="option" data-automation-id="selectedItem" aria-label="' + school + ', press delete to clear value." tabindex="-1">' +
      '<div data-automation-id="DELETE_charm" role="presentation" aria-hidden="true"></div><p data-automation-id="promptOption">' + school + '</p></div></li></ul></div>');
    const opened = window.__harness.opened;
    const res = await study.fill('Computer Science', { key: 'major' });
    return { status: res.status, opened: window.__harness.opened - opened, pressed: (window.__harness.promptClicks || {})['education-896--fieldOfStudy'] || 0 };
  }, TEST_PROFILE.school);
  // pressed: the extension clicked the Field of Study input to open it (had it taken the School pills for an
  // already-open popup it would have skipped the press and read the pills as results).
  assert.deepEqual(out, { status: 'filled', opened: 1, pressed: 1 }, 'the pills were taken for the popup, or the real popup never opened');
  assert.deepEqual(await pillsOf('education-896--fieldOfStudy'), [TEST_PROFILE.major]);
  assert.deepEqual(await pillsOf('education-896--school'), [TEST_PROFILE.school], 'the School pill was not touched');
  await assertNothingNavigated();
});

test('Voluntary Disclosures: EEO CheckboxGroup ticks exactly one box, terms never ticked', async () => {
  const r = await runOn('workday-voluntary-disclosures.html', { standard: STD });
  assert.equal(r.step, 'voluntaryDisclosures');
  assert.equal(r.adapter, 'workday');
  assert.equal(await textOf('#personalInfoUS--gender'), 'Female');
  assert.equal(await textOf('#personalInfoUS--veteranStatus'), 'I am not a protected veteran');
  assert.deepEqual(r.byId['personalInfoUS--gender'], ['std:gender', 'filled', 'filled']);

  // Ethnicity: one question, the race standard answer ("Two or More Races") ticks exactly one box.
  const eth = await page.evaluate(() => {
    const fs = document.getElementById('personalInfoUS--ethnicityMulti');
    return {
      boxes: fs.querySelectorAll('input[type=checkbox]').length,
      ticked: Array.from(fs.querySelectorAll('input:checked')).map((b) => b.labels[0].textContent),
      marked: [fs, ...fs.querySelectorAll('*')].filter((n) => n.hasAttribute('data-af-state')).map((n) => [n.tagName, n.getAttribute('data-af-state')]),
    };
  });
  assert.deepEqual(eth, { boxes: 7, ticked: ['Two or More Races (United States of America)'], marked: [['FIELDSET', 'filled']] });

  // Terms and Conditions: a consent box, never ticked, yellow because it is required.
  assert.equal(await checkedOf('#termsAndConditions--acceptTermsAndAgreements'), false);
  assert.equal(r.byId['termsAndConditions--acceptTermsAndAgreements'][2], 'unknown');
  await assertNothingNavigated();
});

test('Voluntary Disclosures with blank EEO answers: nothing ticked, optional group not outlined', async () => {
  await runOn('workday-voluntary-disclosures.html', { standard: {} });
  const ticked = await page.evaluate(() => document.querySelectorAll('input:checked').length);
  assert.equal(ticked, 0);
  assert.equal(await page.evaluate(() => document.getElementById('personalInfoUS--ethnicityMulti').hasAttribute('data-af-state')), false);
  assert.equal(await textOf('#personalInfoUS--gender'), 'Select One');
  await assertNothingNavigated();
});

test('review step: zero fields, still the Workday adapter (no generic fallback)', async () => {
  const r = await runOn('workday-review.html', { standard: STD });
  assert.equal(r.step, 'review');
  assert.equal(r.adapter, 'workday');
  assert.equal(r.fallback, null);
  assert.deepEqual(r.byId, {});
  assert.deepEqual(r.counts, { filled: 0, review: 0, unknown: 0 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-af-state]').length), 0);
  await assertNothingNavigated();

  // Even with a stray input inside the review container, nothing is filled or marked.
  await page.setContent(`<div data-automation-id="applyFlowReviewPage"><h3>Review</h3>
    <label for="x">First Name</label><input id="x"></div>`);
  await injectScripts(page);
  const out = await page.evaluate(async (profile) => {
    const res = await AF.autofill.run({ profile, adapter: 'workday', quiet: true });
    return { step: res.step, adapter: res.adapter, fallback: res.fallback, n: res.results.length, v: document.getElementById('x').value };
  }, TEST_PROFILE);
  assert.deepEqual(out, { step: 'review', adapter: 'workday', fallback: null, n: 0, v: '' });
});

test('step() names all five steps, from the page container or the progress bar alone', async () => {
  const names = ['myInformation', 'myExperience', 'applicationQuestions', 'voluntaryDisclosures', 'review'];
  const pages = ['workday-my-information.html', 'workday-my-experience.html', 'workday-application-questions.html',
    'workday-voluntary-disclosures.html', 'workday-review.html'];
  for (let i = 0; i < 5; i++) {
    await page.goto(harnessUrl(pages[i]));
    await injectScripts(page);
    assert.equal(await page.evaluate(() => AF.adapters.workday.step(document)), names[i], pages[i]);
    // Remove the page container and the step heading: only the progress bar says where we are.
    // The two labels carry no whitespace between them ("current step 1 of 5My Information").
    const fromBar = await page.evaluate(() => {
      document.querySelectorAll('[data-automation-id^="applyFlow"][data-automation-id$="Page"]:not([data-automation-id="applyFlowPage"])').forEach((n) => n.remove());
      document.querySelectorAll('h3').forEach((n) => n.remove());
      const active = document.querySelector('[data-automation-id="progressBarActiveStep"]');
      return { text: active.textContent.replace(/\s+/g, ' '), step: AF.adapters.workday.step(document) };
    });
    assert.match(fromBar.text, /current step \d of 5\S/, 'labels are glued together, as on the real page');
    assert.equal(fromBar.step, names[i], 'progress bar only: ' + pages[i]);
  }
});

test('company: a pass with a company, with null, and a company-less default all work', async () => {
  const withCompany = await runOn('workday-application-questions.html', { standard: STD });
  assert.equal(withCompany.company, 'Acme');
  assert.equal(withCompany.adapter, 'workday');
  const without = await runOn('workday-application-questions.html', { standard: STD, noCompany: true });
  assert.equal(without.company, null);
  assert.equal(without.adapter, 'workday');
  // Sponsorship does not depend on the company.
  const key = 'primaryQuestionnaire--1b2264de5a9410018ab392622cb70002';
  assert.deepEqual(without.byId[key], ['std:sponsorship', 'filled', 'filled']);
  assert.deepEqual(withCompany.byId[key], ['std:sponsorship', 'filled', 'filled']);
});

test('UNVERIFIED variants: day sections, masked date, picks that never stick, popups that never open', async () => {
  const r = await runOn('workday-unverified.html');
  assert.equal(r.adapter, 'workday');

  // MM/YYYY sections: Workday stores the month UNPADDED; the fill must still count as verified.
  assert.deepEqual([await valueOf('#grad-mm'), await valueOf('#grad-yyyy')], ['5', '2027']);
  assert.equal(r.byId['grad-mm'][1], 'filled');
  assert.equal(r.byId['grad-mm'][2], 'filled');
  // MM/DD/YYYY sections: no day in the profile -> 01, flagged for review.
  assert.deepEqual([await valueOf('#done-mm'), await valueOf('#done-dd'), await valueOf('#done-yyyy')], ['5', '01', '2027']);
  assert.equal(r.byId['done-mm'][2], 'review');
  // Masked text input.
  assert.equal(await valueOf('#grad-masked'), '05/2027');

  // Value never sticks: tried twice, orange, the button still says "Select One".
  assert.deepEqual(r.byId.flaky, ['state', 'unverified', 'review']);
  assert.equal(await textOf('#flaky'), 'Select One');
  // Popup never opens: also orange after the timeout, no hang.
  assert.deepEqual(r.byId.dead, ['country', 'unverified', 'review']);
  await assertNothingNavigated();
});

/* ------------------------------------------------------------------ */
/* The real captures (gitignored, skipped when absent)                  */
/* ------------------------------------------------------------------ */

const CAPTURES = {
  'My Information': '1790992329739',
  'My Experience': '1790993112312',
  'My Experience (Degree dropdown open)': 'dropdown_1790993120469',
  'Application Questions': '1790993102051',
  'Application Questions (question 1 open)': 'dropdown_1790993107997',
  'Voluntary Disclosures': '1790993097547',
  'Review': '1790993092492',
};
// Capture files are named "<tenant>_wd5_myworkdayjobs_com_<tag>.html" (gitignored, never published).
const capture = (tag) => `workday/*_${tag}.html`;
// The hiring company detected on the captures is the tenant (JSON-LD agrees with the host).
const tenantOf = (tag) => path.basename(fixturePath(capture(tag))).split('_')[0];

// One generic list for every dropdown on the captures: the pass picks what it needs.
// (Only the Degree list and a Yes/No question were captured open; tests/fixtures.test.js has the exact lists.)
const CAPTURE_CFG = {
  '*': { options: ['Yes', 'No', 'Canada', 'United States of America', 'California', 'Mobile', 'Female', 'I am not a protected veteran', 'B.S. - Bachelor of Science'] },
  '*prompt': { options: [TEST_PROFILE.school, TEST_PROFILE.major, 'United States of America (+1)'] },
};

async function runOnCapture(tag, standard) {
  await openCapture(page, capture(tag));
  await page.addScriptTag({ path: path.join(ROOT, 'tests', 'harness', 'workday.js') });
  await page.evaluate((cfg) => window.installWorkday(cfg), CAPTURE_CFG);
  await page.evaluate(watchNever);
  await injectScripts(page);
  return page.evaluate(async ({ profile, standard }) => {
    const r = await AF.autofill.run({ profile, standardAnswers: standard, quiet: true, adapter: 'workday' });
    return {
      adapter: r.adapter, fallback: r.fallback, step: r.step, company: r.company && r.company.name, counts: r.counts,
      statuses: r.results.map((x) => x.status),
    };
  }, { profile: TEST_PROFILE, standard });
}

for (const [name, tag] of Object.entries(CAPTURES)) {
  test(`real capture, ${name}: header, footer, Add / Delete, SMS opt-in, pills, phantoms untouched`, {
    skip: hasFixture(capture(tag)) ? false : 'capture not on this machine (gitignored)',
  }, async () => {
    const r = await runOnCapture(tag, STD);
    assert.equal(r.adapter, 'workday');
    assert.equal(r.fallback, null);
    assert.equal(String(r.company).toLowerCase(), tenantOf(tag));
    await assertNothingNavigated();
    // A saved page's frozen popup was replaced by the harness's live one.
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-behavior-click-outside-close]').length), 0);
  });
}

test('real capture, Application Questions with NO standard answers: nothing answered, every required question yellow', {
  skip: hasFixture(capture(CAPTURES['Application Questions'])) ? false : 'capture not on this machine (gitignored)',
}, async () => {
  const r = await runOnCapture(CAPTURES['Application Questions'], {});
  assert.equal(r.counts.filled, 0);
  assert.equal(r.counts.review, 0);
  assert.equal(r.counts.unknown, 17); // 15 dropdowns, 2 CheckboxGroups; the one textarea is optional
  const answered = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-haspopup="listbox"]')).filter((b) => b.closest('[data-automation-id^="applyFlow"]') && b.textContent.trim() !== 'Select One').length
  );
  assert.equal(answered, 0);
  assert.equal(await page.evaluate(() => document.querySelectorAll('input:checked').length), 0);
  await assertNothingNavigated();
});

test('real capture, Degree dropdown open: the frozen popup supplies the options, the pass fills it', {
  skip: hasFixture(capture(CAPTURES['My Experience (Degree dropdown open)'])) ? false : 'capture not on this machine (gitignored)',
}, async () => {
  await openCapture(page, capture(CAPTURES['My Experience (Degree dropdown open)']));
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-behavior-click-outside-close] [role="listbox"]').length), 1, 'the capture holds one open popup');
  await page.addScriptTag({ path: path.join(ROOT, 'tests', 'harness', 'workday.js') });
  await page.evaluate((cfg) => window.installWorkday(cfg), { '*': { options: ['Yes', 'No', 'California'] }, '*prompt': { options: [TEST_PROFILE.school, TEST_PROFILE.major] } });
  assert.deepEqual(await page.evaluate(() => window.__harness.harvested), ['education-896--degree']);
  await page.evaluate(watchNever);
  await injectScripts(page);
  await page.evaluate(async (profile) => {
    await AF.autofill.run({ profile, quiet: true, adapter: 'workday' });
  }, TEST_PROFILE);
  assert.equal(await textOf('#education-896--degree'), 'B.S. - Bachelor of Science');
  await assertNothingNavigated();
});

// findFields(doc, { seen }): the shared "already handled" contract. Fields whose el is in
// `seen` are omitted; every other field keeps its el, descriptor and order.
for (const name of ['workday-my-information.html', 'workday-my-experience.html', 'workday-application-questions.html', 'workday-voluntary-disclosures.html']) {
  test(`findFields(doc, { seen }) on ${name}: same fields minus the seen ones, same order`, async () => {
    await page.goto(harnessUrl(name), { waitUntil: 'domcontentloaded' });
    await injectScripts(page);
    const r = await page.evaluate(() => {
      const w = AF.adapters.workday;
      const shape = (fs) => fs.map((f) => ({ el: f.el, desc: JSON.stringify(f.desc), markEl: f.markEl, outlineOnly: !!f.outlineOnly }));
      const full = shape(w.findFields(document));
      const none = shape(w.findFields(document, { seen: new WeakSet() }));
      // Mark every other field as seen, then every field.
      const half = new WeakSet(full.filter((_, i) => i % 2 === 0).map((f) => f.el));
      const all = new WeakSet(full.map((f) => f.el));
      const sameRows = (a, b) => a.length === b.length && a.every((x, i) => x.el === b[i].el && x.desc === b[i].desc && x.markEl === b[i].markEl && x.outlineOnly === b[i].outlineOnly);
      return {
        n: full.length,
        noneSame: sameRows(full, none),
        halfSame: sameRows(full.filter((f) => !half.has(f.el)), shape(w.findFields(document, { seen: half }))),
        allEmpty: w.findFields(document, { seen: all }).length,
      };
    });
    assert.ok(r.n > 0);
    assert.ok(r.noneSame, 'an empty seen set changes nothing');
    assert.ok(r.halfSame, 'seen fields are omitted, the others are unchanged');
    assert.equal(r.allEmpty, 0);
  });
}
