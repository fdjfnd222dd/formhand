/*
 * core/company.js: hiring-company detection and the {company} placeholder, plus
 * everything that leans on it (matcher.normalize, qa.lookup / conversions,
 * standard.detect with companized labels).
 *
 * Pure-Node tests first; detect(doc) needs a real DOM, so those run in one
 * Firefox instance (RAM) at the end.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../core/matcher.js');
const std = require('../core/standard.js');
const qa = require('../core/qa.js');
const company = require('../core/company.js');
const { launch, injectScripts } = require('./helpers/browser');

const norm = (text, name) => company.normalizeText(text, company.make(name));

/* ------------------------------------------------------------------ */
/* matcher.normalize                                                    */
/* ------------------------------------------------------------------ */

test('normalize keeps the {company} token and is idempotent', () => {
  const once = m.normalize('Have you worked at {Company} before?');
  assert.equal(once, 'have you worked at {company} before');
  assert.equal(m.normalize(once), once);
  assert.equal(m.normalize('Have you worked at { COMPANY } before?'), once);
  assert.equal(m.normalize('{company}'), '{company}');
  assert.equal(m.normalize('Why {company}?'), 'why {company}');
  // ordinary text is untouched by the placeholder handling
  assert.equal(m.normalize('Have you worked here before?'), 'have you worked here before');
});

/* ------------------------------------------------------------------ */
/* make / variantsOf / shortName                                        */
/* ------------------------------------------------------------------ */

test('make: corporate suffixes and a leading "The" are dropped from the display name', () => {
  const v = company.make('The Acme Group, Inc.');
  assert.equal(v.name, 'Acme');
  assert.ok(v.variants.includes('acme'));
  assert.equal(company.shortName('The Acme Group, Inc.'), 'Acme');
  assert.equal(company.make('Globex Industries').name, 'Globex');
  assert.ok(company.make('Globex Industries').variants.includes('globex'));
  assert.equal(company.make('Summit Corporation').name, 'Summit');
  assert.ok(company.make('Summit Corporation').variants.includes('summit'));
  assert.equal(company.make('Contoso LLP').name, 'Contoso');
  assert.equal(company.make(''), null);
});

test('make: a three-word name gets its natural short forms and an acronym', () => {
  const b = company.make('Vandelay Kramer Benes Inc.');
  assert.equal(b.name, 'Vandelay Kramer Benes');
  for (const v of ['vandelay kramer benes', 'vandelay kramer', 'vkb']) assert.ok(b.variants.includes(v), v);
  // longest first
  assert.deepEqual(b.variants, b.variants.slice().sort((x, y) => y.length - x.length));
});

test('make: full names made of ordinary words still count', () => {
  assert.ok(company.make('National Data').variants.includes('national data'));
  assert.ok(company.make('General Health').variants.includes('general health'));
  assert.equal(norm('Why do you want to work at National Data?', 'National Data'), 'why do you want to work at {company}');
});

test('make: a single ordinary word is never a variant on its own', () => {
  const f = company.make('First Prairie Bank');
  assert.ok(!f.variants.includes('first'));
  assert.ok(!f.variants.includes('bank'));
  // so "first" in a normal question is not eaten
  assert.equal(norm('What was your first job?', 'First Prairie Bank'), 'what was your first job');
  const gm = company.make('General Health');
  assert.ok(!gm.variants.includes('general'));
  assert.ok(!gm.variants.includes('health'));
  assert.equal(norm('Do you have general experience?', 'General Health'), 'do you have general experience');
  const co = company.make('National Data');
  assert.ok(!co.variants.includes('national'));
  assert.ok(!company.make('American Widget').variants.includes('american'));
});

/* ------------------------------------------------------------------ */
/* normalizeText on real wordings                                       */
/* ------------------------------------------------------------------ */

test('normalizeText: wordings from real captures', () => {
  assert.equal(
    norm('Have you ever worked at Initech before? Please answer Yes if you were employed by Initech as a regular, fixed term, or intern.', 'Initech'),
    'have you ever worked at {company} before please answer yes if you were employed by {company} as a regular fixed term or intern'
  );
  assert.equal(
    norm('Will you require sponsorship from Globex for employment now or in the future (e.g, H1B visa)?', 'Globex Industries'),
    'will you require sponsorship from {company} for employment now or in the future e g h 1 b visa'
  );
  assert.equal(norm('How did you hear about Globex?', 'Globex Industries'), 'how did you hear about {company}');
  assert.equal(
    norm('Have you ever worked with Example Corp as a full-time / part-time employee, intern, vendor, agency temporary, or business guest?', 'Example Corp'),
    'have you ever worked with {company} as a full time part time employee intern vendor agency temporary or business guest'
  );
  assert.equal(
    norm('Are you currently employed by an Example Corp subsidiary (e.g., FabriKam, LitWare Games)?', 'Example Corp'),
    'are you currently employed by an {company} subsidiary e g fabri kam lit ware games'
  );
});

test('normalizeText: short and long forms of the name give the same result', () => {
  const co = company.make('Vandelay Kramer Benes Inc.');
  const a = company.normalizeText('Do you have relatives employed by Vandelay Kramer?', co);
  const b = company.normalizeText('Do you have relatives employed by Vandelay Kramer Benes?', co);
  const c = company.normalizeText('Do you have relatives employed by Vandelay Kramer Benes Inc.?', co);
  assert.equal(a, 'do you have relatives employed by {company}');
  assert.equal(b, a);
  assert.equal(c, a);
});

test('normalizeText: possessives (straight and curly) and "the ... Group"', () => {
  assert.equal(norm("What do you like about Contoso's culture?", 'Contoso LLP'), 'what do you like about {company} culture');
  assert.equal(norm('What do you like about Initech’s culture?', 'Initech'), 'what do you like about {company} culture');
  assert.equal(norm('Why do you want to join the Acme Group?', 'The Acme Group, Inc.'), 'why do you want to join {company}');
  assert.equal(norm('Why do you want to join Acme?', 'The Acme Group, Inc.'), 'why do you want to join {company}');
  assert.equal(norm('the Acme Group', 'Acme'), '{company}');
});

test('normalizeText: text that does not name the company is only normalized', () => {
  assert.equal(norm('Are you legally authorized to work in the United States?', 'Contoso LLP'), 'are you legally authorized to work in the united states');
  assert.equal(norm('American Indian or Alaska Native', 'American Widget'), 'american indian or alaska native');
  assert.equal(norm('Do you have a contour-mapping portfolio?', 'Contoso LLP'), 'do you have a contour mapping portfolio'); // "contour" is not "contoso"
  // no company: plain normalize
  assert.equal(company.normalizeText('Why Contoso?', null), 'why contoso');
  assert.equal(company.normalizeText('', company.make('Contoso')), '');
});

test('applyToDesc: companized copy, original untouched, same object when nothing changes', () => {
  const co = company.make('Acme');
  const desc = { label: 'Have you ever interviewed at Acme?', hints: [], context: 'About Acme', inputType: 'text' };
  const c = company.applyToDesc(desc, co);
  assert.equal(c.label, 'have you ever interviewed at {company}');
  assert.equal(c.context, 'about {company}');
  assert.equal(c.companized, true);
  assert.equal(desc.label, 'Have you ever interviewed at Acme?');
  const plain = { label: 'Phone', hints: [], context: '', inputType: 'text' };
  assert.equal(company.applyToDesc(plain, co), plain);
  assert.equal(company.applyToDesc(desc, null), desc);
  assert.equal(company.mentions('why acme', co), true);
  assert.equal(company.mentions('why us', co), false);
});

/* ------------------------------------------------------------------ */
/* Answers                                                              */
/* ------------------------------------------------------------------ */

test('templateAnswer / renderAnswer round trip', () => {
  const tpl = company.templateAnswer("I admire The Acme Group, Inc.'s mission", company.make('The Acme Group, Inc.'));
  assert.equal(tpl, "I admire {company}'s mission");
  assert.equal(company.templateAnswer("I admire The Acme Group, Inc.'s mission", company.make('Acme')), "I admire {company}'s mission");
  assert.equal(company.renderAnswer(tpl, company.make('Contoso LLP')), "I admire Contoso's mission");
  assert.equal(company.hasPlaceholder(tpl), true);
  assert.equal(company.hasPlaceholder('plain'), false);
});

test('renderAnswer: unknown company -> null for a placeholder answer; plain answers pass through', () => {
  assert.equal(company.renderAnswer("I admire {company}'s mission", null), null);
  assert.equal(company.renderAnswer('{company}', undefined), null);
  assert.equal(company.renderAnswer('No', null), 'No');
  assert.equal(company.renderAnswer('No', company.make('Contoso')), 'No');
  assert.equal(company.renderAnswer('', null), '');
  assert.equal(company.renderAnswer('{company} and {company}', company.make('Contoso')), 'Contoso and Contoso');
});

test('templateAnswer: answers without the company, or with no company known, are unchanged', () => {
  assert.equal(company.templateAnswer('LinkedIn', company.make('Contoso LLP')), 'LinkedIn');
  assert.equal(company.templateAnswer('I worked at Contoso', null), 'I worked at Contoso');
  assert.equal(company.templateAnswer(null, company.make('Contoso')), '');
});

/* ------------------------------------------------------------------ */
/* qa.lookup / learn with {company}                                     */
/* ------------------------------------------------------------------ */

const entry = (question, answer, extra) => ({
  id: 'qa-' + question.replace(/\W+/g, '-'),
  question: m.normalize(question),
  aliases: [],
  answer,
  sensitive: '',
  createdAt: 1,
  updatedAt: 1,
  ...(extra || {}),
});

function lookupFor(label, entries, name) {
  const desc = { label, hints: [], context: '', inputType: 'text' };
  return qa.lookup(company.applyToDesc(desc, company.make(name)), entries, desc);
}

test('lookup: a {company} entry answers the page question for any company (raw passed separately)', () => {
  const e = entry('have you ever interviewed at {company}', 'No');
  assert.equal(e.question, 'have you ever interviewed at {company}');
  const r = lookupFor('Have you ever interviewed at Acme?', [e], 'Acme');
  assert.ok(r, 'hit');
  assert.equal(r.entry, e);
  assert.equal(r.source, 'qa-exact');
  assert.equal(r.confidence, 1);
  // another company, same entry
  assert.equal(lookupFor('Have you ever interviewed at Contoso?', [e], 'Contoso LLP').entry, e);
  // without company detection the placeholder entry does not match
  assert.equal(qa.lookup({ label: 'Have you ever interviewed at Acme?', hints: [], context: '', inputType: 'text' }, [e]), null);
});

test('lookup: an OLD entry that names the company still matches exactly via raw', () => {
  const e = entry('have you ever interviewed at acme', 'Yes');
  const r = lookupFor('Have you ever interviewed at Acme?', [e], 'Acme');
  assert.ok(r);
  assert.equal(r.entry, e);
  assert.equal(r.source, 'qa-exact');
});

test('lookup: the "company" veto does not block companized labels; fuzzy matching works', () => {
  const e = entry('why do you want to work at {company}', 'Because of the mission');
  const r = lookupFor('Why do you want to work for Contoso?', [e], 'Contoso LLP');
  assert.ok(r, 'fuzzy hit on a companized label');
  assert.equal(r.entry, e);
  assert.equal(r.source, 'qa-fuzzy');
  assert.ok(r.confidence >= 0.75 * 0.85);
  // unrelated question: no hit
  assert.equal(lookupFor('Describe your favorite project', [e], 'Contoso LLP'), null);
});

test('lookup: consent labels naming the company are still refused', () => {
  const e = entry('i agree to the terms of {company}', 'Yes');
  assert.equal(lookupFor('I agree to the terms of Contoso', [e], 'Contoso LLP'), null);
});

test('learn: a {company} question is stored as is and found again', () => {
  const co = company.make('Acme');
  const q = company.normalizeText('Why do you want to work at Acme?', co);
  const a = company.templateAnswer('I admire Acme’s customer-owned model', co);
  assert.equal(a, 'I admire {company}’s customer-owned model');
  const r1 = qa.learn([], q, a, '');
  assert.equal(r1.created, true);
  assert.equal(r1.entry.question, 'why do you want to work at {company}');
  // second learn of the same question (other company) updates, not duplicates
  const r2 = qa.learn(r1.entries, company.normalizeText('Why do you want to work at Contoso?', company.make('Contoso')), 'x', '');
  assert.equal(r2.created, false);
  assert.equal(r2.entries.length, 1);
});

/* ------------------------------------------------------------------ */
/* Conversions (options page)                                           */
/* ------------------------------------------------------------------ */

test('companyConversions: same question+answer for two companies merge into one {company} entry', () => {
  const entries = [
    entry('have you ever interviewed at contoso', 'No'),
    entry('have you ever interviewed at initech', 'No'),
  ];
  const conv = qa.companyConversions(entries, ['Contoso LLP', 'Initech']);
  assert.equal(conv.length, 2);
  assert.equal(conv[0].to.question, 'have you ever interviewed at {company}');
  assert.equal(conv[0].mergeInto, undefined);
  assert.equal(conv[1].to.question, 'have you ever interviewed at {company}');
  assert.equal(conv[1].mergeInto, entries[0].id);
  assert.ok(!conv[0].conflict && !conv[1].conflict);
  const out = qa.applyCompanyConversions(entries, ['Contoso LLP', 'Initech'], entries.map((e) => e.id));
  assert.equal(out.length, 1);
  assert.equal(out[0].question, 'have you ever interviewed at {company}');
  assert.equal(out[0].answer, 'No');
});

test('companyConversions: aliases are converted and merged', () => {
  const entries = [
    entry('have you ever interviewed at contoso', 'No', { aliases: [m.normalize('Did you interview at Contoso before?')] }),
    entry('have you ever interviewed at initech', 'No', { aliases: [m.normalize('Did you interview at Initech before?')] }),
  ];
  const out = qa.applyCompanyConversions(entries, ['Contoso', 'Initech'], entries.map((e) => e.id));
  assert.equal(out.length, 1);
  assert.equal(out[0].question, 'have you ever interviewed at {company}');
  assert.deepEqual(out[0].aliases, ['did you interview at {company} before']);
});

test('companyConversions: same question, different answers is a conflict and is left alone', () => {
  const entries = [
    entry('have you ever interviewed at contoso', 'No'),
    entry('have you ever interviewed at initech', 'Yes'),
  ];
  const conv = qa.companyConversions(entries, ['Contoso', 'Initech']);
  assert.equal(conv[0].conflict, undefined);
  assert.equal(conv[1].conflict, true);
  const out = qa.applyCompanyConversions(entries, ['Contoso', 'Initech'], entries.map((e) => e.id));
  assert.equal(out.length, 2);
  assert.equal(out[0].question, 'have you ever interviewed at {company}'); // the first converts
  assert.equal(out[1].question, 'have you ever interviewed at initech'); // the conflicting one is untouched
  assert.equal(out[1].answer, 'Yes');
});

test('companyConversions: an answer naming the company is templated; unrelated entries untouched', () => {
  const entries = [
    entry('why do you want to work at contoso', 'I admire Contoso LLP and its people'),
    entry('how did you hear about us', 'LinkedIn'),
  ];
  const conv = qa.companyConversions(entries, ['Contoso LLP']);
  assert.equal(conv.length, 1);
  assert.equal(conv[0].id, entries[0].id);
  assert.equal(conv[0].to.answer, 'I admire {company} and its people');
  const out = qa.applyCompanyConversions(entries, ['Contoso LLP'], [entries[0].id]);
  assert.equal(out[0].question, 'why do you want to work at {company}');
  assert.equal(out[0].answer, 'I admire {company} and its people');
  assert.deepEqual(out[1], entries[1]);
});

test('applyCompanyConversions: ids not listed are not converted', () => {
  const entries = [
    entry('have you ever interviewed at contoso', 'No'),
    entry('why do you want to work at contoso', 'Culture'),
  ];
  const out = qa.applyCompanyConversions(entries, ['Contoso'], [entries[1].id]);
  assert.equal(out[0].question, 'have you ever interviewed at contoso');
  assert.equal(out[1].question, 'why do you want to work at {company}');
  assert.deepEqual(qa.applyCompanyConversions(entries, ['Contoso'], []), entries);
  assert.deepEqual(qa.applyCompanyConversions(entries, [], [entries[0].id]), entries);
});

/* ------------------------------------------------------------------ */
/* standard.detect with companized labels                               */
/* ------------------------------------------------------------------ */

// What core/autofill.js decide() does: as written, then with {company}.
function detectWith(label, name, extra) {
  const desc = { label, hints: [], context: '', inputType: 'text', ...(extra || {}) };
  const r = std.detect(desc) || std.detect(company.applyToDesc(desc, company.make(name)));
  return r ? r.id : null;
}
const V = 'Acme';

test('standard.detect: {company}-anchored previouslyEmployed wordings (only via the companized label)', () => {
  const l1 = 'Have you, or do you currently work for, or with Acme?';
  assert.equal(std.detect({ label: l1, hints: [], context: '', inputType: 'text' }), null, 'as written there is no hook');
  assert.equal(detectWith(l1, V), 'previouslyEmployed');
  assert.equal(detectWith('Have you ever performed temporary work for Acme or any of its subsidiaries?', V), 'previouslyEmployed');
  assert.equal(detectWith('Are you a current or former Acme employee?', V), 'previouslyEmployed');
  assert.equal(detectWith('Have you ever worked for Acme?', V), 'previouslyEmployed');
});

test('standard.detect: referred', () => {
  assert.equal(detectWith('To the best of your knowledge, did either of the following refer or recommend you for this or any other position with Acme?', V), 'referred');
  assert.equal(detectWith('Were you referred by a current employee?', V), 'referred');
  assert.equal(detectWith('Employee referral', V, { inputType: 'select' }), 'referred');
});

test('standard.detect: relatives (a long policy paragraph)', () => {
  const label = 'Under the Employment policy of Acme or any of its subsidiaries, relatives may not work in the same area of responsibility or within the same transactional audit trail. A relative is defined as aunt/uncle, child/stepchild, cousin, sister/brother, and spouse/domestic partner. To help us ensure compliance with this policy, do you have any relatives employed at Acme or any of its subsidiaries?';
  assert.equal(detectWith(label, V), 'relatives');
  assert.equal(detectWith('Do you have relatives employed by Vandelay Kramer?', 'Vandelay Kramer Benes'), 'relatives');
});

test('standard.detect: look-alikes are not relatives / referred / otherPositions / previouslyEmployed', () => {
  for (const [label, extra] of [
    ['Name of the employee who referred you', undefined],
    ['How did you hear about us?', undefined],
    ['Referral source', undefined],
    ['Are you a current or former Government Official? Government Officials include...', undefined],
    ['Are you related to, by birth, adoption or marriage, or a close associate of a current or former Government Official at an entity that interacts or may interact with Acme in a business or regulatory context?', undefined],
    ['Acme would like to consider you for additional and future job openings at Acme using tools that rely on machine learning (also referred to as Artificial Intelligence or AI).', undefined],
  ]) {
    const id = detectWith(label, V, extra);
    assert.ok(!['relatives', 'referred', 'otherPositions'].includes(id), `${label.slice(0, 50)} -> ${id}`);
    assert.equal(id, null, label.slice(0, 50));
  }
  assert.equal(detectWith('Have you ever interviewed for a position at Acme or any of its subsidiaries?', V), null);
});

/* ------------------------------------------------------------------ */
/* detect(doc) in Firefox                                               */
/* ------------------------------------------------------------------ */

let browser;
let page;
test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

async function detectIn(html) {
  await page.setContent(html);
  await injectScripts(page);
  return page.evaluate(() => {
    const c = AF.company.detect(document);
    return c && { name: c.name, variants: c.variants, source: c.source };
  });
}

test('detect: JSON-LD hiringOrganization (Workday-style) agrees with the tenant host', async () => {
  const c = await detectIn(`<!doctype html><html><head><title>Apply</title>
    <meta name="af-capture-url" content="https://acme.wd5.myworkdayjobs.com/en-US/acme_external/job/x">
    <script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"@type":"Organization","name":"The Acme Group, Inc."}}</script>
    </head><body><form></form></body></html>`);
  assert.equal(c.name, 'Acme');
  assert.ok(c.variants.includes('acme'));
});

test('detect: Greenhouse title "... at <Company>" plus the board slug', async () => {
  const c = await detectIn(`<!doctype html><html><head><title>Job Application for Engineer at Globex Industries</title>
    <meta property="og:url" content="https://job-boards.greenhouse.io/globexindustries/jobs/1"></head><body></body></html>`);
  assert.equal(c.name, 'Globex');
  assert.ok(c.variants.includes('globex'));
});

test('detect: og:site_name', async () => {
  const c = await detectIn('<!doctype html><html><head><title>Confirm</title><meta property="og:site_name" content="Initech"></head><body></body></html>');
  assert.equal(c.name, 'Initech');
});

test('detect: a lower-case logo alt does not decide the display name; "X Careers | X" site names', async () => {
  const c = await detectIn(`<!doctype html><html><head><title>Product Management Intern | Northwind Careers</title>
    <meta property="og:site_name" content="Northwind Careers | Northwind">
    <link rel="canonical" href="https://careers.northwindhq.com/detail/8108241/"></head>
    <body><header><img alt="northwind logo" src="x.png"></header></body></html>`);
  assert.equal(c.name, 'Northwind');
  assert.ok(c.variants.includes('northwind'));
});

test('detect: only the capture URL host (careers.contoso.com)', async () => {
  const c = await detectIn('<!doctype html><html><head><meta name="af-capture-url" content="https://careers.contoso.com/job/123"></head><body><p>Hello</p></body></html>');
  assert.equal(c.name, 'Contoso');
});

test('detect: no company on the page -> null', async () => {
  assert.equal(await detectIn('<!doctype html><html><head><title>Apply</title></head><body><form><input></form></body></html>'), null);
  assert.equal(await detectIn(''), null);
});

test('detect: a generic logo alt ("Company Logo") is not a company', async () => {
  assert.equal(await detectIn('<!doctype html><html><head></head><body><img alt="Company Logo" src="x.png"></body></html>'), null);
});

test('detect: one weak source alone is not trusted', async () => {
  // a dangling "at" in the title
  assert.equal(await detectIn('<!doctype html><html><head><title>Senior Engineer at</title></head><body></body></html>'), null);
  // a stray "Careers at X" in the nav, nothing else agreeing
  assert.equal(await detectIn('<!doctype html><html><head><title>Apply</title></head><body><nav>Careers at Acme</nav></body></html>'), null);
});
