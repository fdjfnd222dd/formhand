/*
 * Pure-logic tests for core/qa.js (Q&A bank lookup, sensitivity, consent, learn).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../core/matcher.js');
const qa = require('../core/qa.js');

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
const look = (label, entries, extra) => qa.lookup({ label, hints: [], context: '', inputType: 'text', ...(extra || {}) }, entries);

test('similarity: identical 1, disjoint 0, stopwords ignored', () => {
  assert.equal(qa.similarity('desired salary', 'desired salary'), 1);
  assert.equal(qa.similarity('desired salary', 'favorite color'), 0);
  assert.equal(qa.similarity('what is your desired salary', 'desired salary'), 1);
  assert.equal(qa.similarity('', 'desired salary'), 0);
  assert.equal(qa.similarity('the of and', 'the of and'), 0); // only stopwords: nothing to compare
  assert.ok(qa.similarity('desired salary range', 'what is your desired salary') > 0.75);
});

test('sensitiveCategory classifies the sensitive question families', () => {
  const cat = (q, ctx) => qa.sensitiveCategory(q, ctx);
  assert.equal(cat('Are you legally authorized to work in the United States?'), 'work-authorization');
  assert.equal(cat('Do you require visa sponsorship?'), 'sponsorship');
  assert.equal(cat('Do you have any relatives employed by Acme?'), 'relationships');
  assert.equal(cat('Have you previously worked for Acme?'), 'prior-employment');
  assert.equal(cat('Have you ever been convicted of a felony?'), 'background');
  assert.equal(cat('Gender'), 'eeo');
  assert.equal(cat('Veteran status'), 'eeo');
  assert.equal(cat('Do you have a disability?'), 'eeo');
  assert.equal(cat('Please check one of the boxes below', 'Voluntary Self-Identification of Disability'), 'eeo');
  assert.equal(cat('How did you hear about us?'), '');
  assert.equal(cat('How did you hear about us?', 'Application questions'), '');
});

test('isConsent: agreements, acknowledgements, signatures, certifications', () => {
  assert.equal(qa.isConsent('I agree to the Terms and Conditions'), true);
  assert.equal(qa.isConsent('I acknowledge the privacy notice'), true);
  assert.equal(qa.isConsent('Signature'), true);
  assert.equal(qa.isConsent('I certify that the information above is true'), true);
  assert.equal(qa.isConsent('Desired salary'), false);
  assert.equal(qa.isConsent('How did you hear about us?'), false);
});

test('lookup: exact question and exact alias are confidence 1', () => {
  const e = entry('How did you hear about us?', 'LinkedIn', { aliases: [m.normalize('Where did you find this job?')] });
  let r = look('How did you hear about us?', [e]);
  assert.equal(r.entry, e);
  assert.equal(r.confidence, 1);
  assert.equal(r.source, 'qa-exact');
  r = look('Where did you find this job?', [e]);
  assert.equal(r.entry, e);
  assert.equal(r.confidence, 1);
  assert.equal(r.source, 'qa-exact');
});

test('lookup: no label or no entries -> null', () => {
  assert.equal(look('', [entry('desired salary', '1')]), null);
  assert.equal(look('Desired salary', []), null);
  assert.equal(look('Desired salary', null), null);
});

test('lookup: fuzzy match for non-sensitive questions, confidence = sim x 0.85', () => {
  const e = entry('What is your desired salary?', '120000');
  const r = look('Desired salary range', [e]);
  assert.ok(r, 'fuzzy match expected');
  assert.equal(r.source, 'qa-fuzzy');
  const sim = qa.similarity(m.normalize('Desired salary range'), e.question);
  assert.ok(sim >= qa.FUZZY_MIN);
  assert.ok(Math.abs(r.confidence - sim * 0.85) < 1e-9);
});

test('lookup: below FUZZY_MIN -> null', () => {
  const e = entry('What is your desired salary?', '120000');
  assert.equal(look('Desired salary range expectations and benefits', [e]), null);
  assert.equal(look('Favorite programming language', [e]), null);
});

test('lookup: single-word labels never fuzzy-match', () => {
  const e = entry('Salary expectations', '120000');
  assert.equal(look('Salary', [e]), null);
  // ...but an exact one-word question still works
  assert.equal(look('Salary', [entry('Salary', '1')]).source, 'qa-exact');
});

test('lookup: sensitive page question needs similarity >= 0.95, exact still works', () => {
  const stored = entry('Have you been convicted of a felony?', 'No');
  assert.equal(look('Have you ever been convicted of a felony?', [stored]), null);
  const exact = entry('Have you ever been convicted of a felony?', 'No');
  const r = look('Have you ever been convicted of a felony?', [exact]);
  assert.equal(r.source, 'qa-exact');
  assert.equal(r.confidence, 1);
  // near-identical wording (same content words) passes the 0.95 bar
  const r2 = look('Have you EVER been convicted of a felony', [exact, entry('unrelated thing here', 'x')]);
  assert.equal(r2.source, 'qa-exact');
});

test('lookup: EEO page questions are exact only', () => {
  const stored = entry('Sexual orientation', 'Prefer not to say');
  assert.equal(look('Sexual orientation', [stored]).source, 'qa-exact');
  assert.equal(look('Please state your sexual orientation', [entry('state your sexual orientation', 'x')]), null);
  // generic label under an EEO section: only exact
  assert.equal(
    look('Please check one of the boxes', [entry('please check the boxes', 'x')], { context: 'Voluntary Self-Identification of Disability' }),
    null
  );
});

test('lookup: a non-sensitive stored entry cannot fuzzy-match a sensitive page question', () => {
  const stored = entry('Have you worked here?', 'No');
  assert.equal(qa.sensitiveCategory(stored.question), '');
  // page is prior-employment: identical content words would be sim 0.8, below the 0.95 bar
  assert.equal(look('Have you ever worked here?', [stored]), null);
  // the same pair is a fuzzy hit when the page question is not sensitive
  assert.equal(look('Salary range desired', [entry('Desired salary range', '1')]).source, 'qa-fuzzy');
});

test('lookup: a stored entry flagged sensitive needs >= 0.95', () => {
  const flagged = entry('What is your desired salary?', '120000', { sensitive: 'background' });
  assert.equal(look('Desired salary range', [flagged]), null);
  const same = entry('What is your preferred start date?', 'Immediately', { sensitive: 'background' });
  const r = look('Your preferred start date', [same]);
  assert.ok(r && r.source === 'qa-fuzzy');
});

test('lookup: consent labels never answered, even with an exact entry', () => {
  const e = entry('I agree to the Terms and Conditions', 'Yes');
  assert.equal(look('I agree to the Terms and Conditions', [e]), null);
  const s = entry('Signature', 'Alexandra Rivera');
  assert.equal(look('Signature', [s]), null);
});

test('lookup: context veto (Emergency Contact) -> null even for an exact entry', () => {
  const e = entry('Name', 'Someone');
  assert.equal(look('Name', [e], { context: 'Emergency Contact' }), null);
  assert.equal(look('Name', [e], { context: 'References' }), null);
});

test('lookup: label veto (relatives) allows exact only', () => {
  const stored = entry('Do you have any relatives employed by Acme?', 'No');
  assert.equal(look('Do you have any relatives employed by Acme?', [stored]).source, 'qa-exact');
  assert.equal(look('Do you have relatives employed by Acme?', [stored]), null);
});

test('lookup: two different answers nearly tied -> null; same answers -> one hit', () => {
  const a = entry('Desired salary range expectations', '100000');
  const b = entry('Desired salary range requirement', '150000');
  assert.equal(look('Desired salary range', [a, b]), null);
  const c = entry('Desired salary range requirement', '100000');
  const r = look('Desired salary range', [a, c]);
  assert.ok(r && r.entry.answer === '100000');
});

test('learn: creates a normalized entry with the sensitive category set', () => {
  const { entries, entry: e, created } = qa.learn([], 'Have you ever been convicted of a felony? *', 'No', '');
  assert.equal(created, true);
  assert.equal(entries.length, 1);
  assert.equal(e.question, m.normalize('Have you ever been convicted of a felony? *'));
  assert.equal(e.question, 'have you ever been convicted of a felony');
  assert.equal(e.answer, 'No');
  assert.equal(e.sensitive, 'background');
  assert.deepEqual(e.aliases, []);
  assert.ok(e.id && e.createdAt && e.updatedAt);

  const plain = qa.learn([], 'How did you hear about us?', 'LinkedIn').entry;
  assert.equal(plain.sensitive, '');
  const ctx = qa.learn([], 'Please check one of the boxes', 'x', 'Voluntary Self-Identification of Disability').entry;
  assert.equal(ctx.sensitive, 'eeo');
});

test('learn: second call updates the answer (same id, new updatedAt), also via aliases', async () => {
  const first = qa.learn([], 'How did you hear about us?', 'LinkedIn');
  await new Promise((r) => setTimeout(r, 5));
  const second = qa.learn(first.entries, 'how did you hear about us', 'Referral');
  assert.equal(second.created, false);
  assert.equal(second.entries.length, 1);
  assert.equal(second.entry.id, first.entry.id);
  assert.equal(second.entry.answer, 'Referral');
  assert.ok(second.entry.updatedAt > first.entry.updatedAt);
  assert.equal(second.entry.createdAt, first.entry.createdAt);
  assert.equal(first.entries[0].answer, 'LinkedIn', 'input array not mutated');

  const withAlias = [{ ...first.entry, aliases: ['where did you find us'] }];
  const third = qa.learn(withAlias, 'Where did you find us?', 'Twitter');
  assert.equal(third.created, false);
  assert.equal(third.entry.id, first.entry.id);
  assert.equal(third.entry.answer, 'Twitter');
});

test('isConsent: authorizations, permissions, declarations and opt-ins; not credential questions', () => {
  const m = require('../core/matcher.js');
  for (const t of ['I authorize the company to conduct a background check', 'I hereby authorize the release of my records',
    'I give permission to contact my references', 'I opt in to receive SMS messages', 'I would like to receive job alerts',
    'I confirm that I am 18 years of age', 'I declare that the above is true', 'Please add me to your talent community',
    'If you provide inaccurate responses to these questions, Initech could immediately discontinue your application. I certify']) {
    assert.equal(qa.isConsent(m.normalize(t)), true, t);
  }
  for (const t of ['Do you have a certification in project management?', 'Are you authorized to work in the United States?',
    'Do you have authorization to work in the US?', 'How did you hear about us?', 'List any professional certifications']) {
    assert.equal(qa.isConsent(m.normalize(t)), false, t);
  }
});

test('lookup: short questions with a swapped subject never fuzzy-match; an added word still does', () => {
  const m = require('../core/matcher.js');
  const e = [{ id: 'a', question: m.normalize('How many years of experience do you have with Python?'), aliases: [], answer: '7', sensitive: '' },
    { id: 'b', question: m.normalize('How did you hear about us?'), aliases: [], answer: 'LinkedIn', sensitive: '' }];
  const look = (label) => qa.lookup({ label, hints: [], context: '' }, e);
  assert.equal(look('How many years of experience do you have with Java?'), null);
  assert.equal(look('How many years of experience do you have with SQL?'), null);
  const hit = look('How did you first hear about us?');
  assert.ok(hit && hit.entry.id === 'b' && hit.source === 'qa-fuzzy');
});
