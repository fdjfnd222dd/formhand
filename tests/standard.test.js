/*
 * Pure-logic tests for core/standard.js (standard compliance / EEO questions).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../core/matcher.js');
const std = require('../core/standard.js');

const det = (label, extra) => {
  const r = std.detect({ label, hints: [], context: '', inputType: 'text', ...(extra || {}) });
  return r ? r.id : null;
};

test('detect: work authorization wordings', () => {
  for (const l of [
    'Are you legally authorized to work in the United States?',
    'U.S. WORK AUTHORIZATION',
    'Are you eligible to work in the US?',
    'Do you have the right to work in this country?',
    'Are you authorized to work in the US? *',
  ]) assert.equal(det(l), 'workAuth', l);
});

test('detect: sponsorship wordings', () => {
  for (const l of [
    'Will you now or in the future require sponsorship for employment visa status (e.g. H-1B visa status)?',
    'If you are currently authorized to work in the US, will you require Initech sponsorship for an employment visa in the future? Please answer yes or no.',
    'Do you require visa sponsorship?',
    'Will you require immigration sponsorship to work for Acme?',
  ]) assert.equal(det(l), 'sponsorship', l);
});

test('detect: gender, hispanic, race, veteran, disability wordings', () => {
  for (const l of ['Gender', 'Please select your gender', 'What is your gender?', 'Gender identity']) assert.equal(det(l), 'gender', l);
  for (const l of ['Are you Hispanic/Latino?', 'Are you Hispanic or Latino?']) assert.equal(det(l), 'hispanic', l);
  for (const l of [
    'Please identify your race',
    'Race/Ethnicity',
    'Please select the ethnicity which most accurately describes how you identify yourself',
  ]) assert.equal(det(l), 'race', l);
  for (const l of ['Veteran Status', 'Please identify your veteran status.', 'Are you a protected veteran?']) assert.equal(det(l), 'veteran', l);
  for (const l of ['Disability Status', 'Voluntary Self-Identification of Disability']) assert.equal(det(l), 'disability', l);
});

test('detect: privacy acknowledgment wordings', () => {
  assert.equal(
    det('You consent to Initech processing the information you provide in this application. Your personal information may be transferred outside the country.'),
    'privacyAck'
  );
  assert.equal(det('I acknowledge that I have read the Privacy Notice and consent to the transfer of my personal data'), 'privacyAck');
});

test('detect: a bare notice title is the privacy acknowledgment only on a dropdown / radio group', () => {
  // Greenhouse: "Point of Data Transfer*" dropdown, GDPR notice text below it.
  assert.equal(det('Point of Data Transfer*', { inputType: 'select' }), 'privacyAck');
  assert.equal(det('Data Privacy Notice', { inputType: 'radio' }), 'privacyAck');
  // Never a checkbox (the title alone would tick it), a text field, or a longer question.
  assert.equal(det('Point of Data Transfer', { inputType: 'checkbox' }), null);
  assert.equal(det('Point of Data Transfer', { inputType: 'text' }), null);
  assert.equal(det('Point of data transfer country', { inputType: 'select' }), null);
  assert.equal(det('Data privacy and marketing emails', { inputType: 'select' }), null);
  // The option still has to acknowledge: a country list or a "No" picks nothing.
  const opts = (texts) => texts.map((text) => ({ text, value: text }));
  assert.equal(std.matchOption(opts(['United States', 'Ireland']), 'privacyAck', 'acknowledge'), null);
  assert.deepEqual(std.matchOption(opts(['Select...', 'I acknowledge']), 'privacyAck', 'acknowledge'), { index: 1, confidence: 1 });
  assert.equal(std.matchOption(opts(['No']), 'privacyAck', 'acknowledge'), null);
});

test('detect: other positions, previous employment, client employment', () => {
  for (const l of ['May we consider you for other positions?', 'Would you like to be considered for other opportunities at Acme?'])
    assert.equal(det(l), 'otherPositions', l);
  for (const l of ['Have you ever worked at Initech before?', 'Have you previously been employed by Acme?', 'Are you a former employee of Acme?'])
    assert.equal(det(l), 'previouslyEmployed', l);
  assert.equal(det('Are you currently employed by a client of Contoso?'), 'clientEmployed');
  // Phase 5 (2026-10-02): relatives / referral are standard questions too.
  assert.equal(det('Do you have any relatives employed by Acme?'), 'relatives');
});

test('detect: negatives that must not be detected', () => {
  for (const l of [
    'If a position is not available in your preferred locations, would you like to be considered for positions in other locations?',
    'Are you authorized to work in the US without sponsorship?',
    'I hereby authorize the below electronic signature submittal to serve as my legal signature.',
    'Sexual orientation',
    'Preferred pronouns',
    'Email',
    'Your name',
  ]) assert.equal(det(l), null, l);
});

test('detect: context fallback for choice fields with a generic label', () => {
  const ctx = 'Voluntary Self-Identification of Disability';
  const r = std.detect({ label: 'Please check one of the boxes below', inputType: 'checkbox', context: ctx });
  assert.equal(r.id, 'disability');
  assert.equal(r.source, 'context');
  assert.equal(det('Please check one of the boxes below', { inputType: 'radio', context: ctx }), 'disability');
  assert.equal(det('Please check one of the boxes below', { inputType: 'text', context: ctx }), null);
  assert.equal(det('Favorite color', { inputType: 'select', context: ctx }), null);
  assert.equal(det('Desired salary', { inputType: 'radio', context: ctx }), null);
});

const cls = (qid, text) => std.classify(qid, text);

test('classify: veteran', () => {
  for (const t of ['I am not a protected veteran', 'No, I am not a protected veteran', 'Non-Veteran']) assert.equal(cls('veteran', t), 'not', t);
  for (const t of ['I identify as one or more of the classifications of protected veteran', 'Yes, I am a protected veteran']) assert.equal(cls('veteran', t), 'protected', t);
  for (const t of ["I don't wish to answer", 'I choose not to disclose']) assert.equal(cls('veteran', t), 'decline', t);
  assert.notEqual(cls('veteran', 'I am a protected veteran but I choose not to self-identify the classifications to which I belong'), 'decline');
});

test('classify: race', () => {
  assert.equal(cls('race', 'Two or More Races (Not Hispanic or Latino)'), 'two');
  assert.equal(cls('race', 'Two or More Races (Not Hispanic or Latino) (United States of America)'), 'two');
  assert.equal(cls('race', 'White (Not Hispanic or Latino)'), 'white');
  assert.equal(cls('race', 'Hispanic or Latino'), 'hispanic');
  assert.equal(cls('race', 'American Indian or Alaskan Native (Not Hispanic or Latino)'), 'native');
  assert.equal(cls('race', 'Not Declaring (United States of America)'), 'decline');
  assert.equal(cls('race', 'Decline To Self Identify'), 'decline');
  assert.equal(cls('race', 'Black or African American (Not Hispanic or Latino)'), 'black');
  assert.equal(cls('race', 'Native Hawaiian or Other Pacific Islander'), 'pacific');
});

test('classify: disability (CC-305 options)', () => {
  assert.equal(cls('disability', 'Yes, I have a disability, or have had one in the past'), 'yes');
  assert.equal(cls('disability', 'No, I do not have a disability and have not had one in the past'), 'no');
  assert.equal(cls('disability', 'I do not want to answer'), 'decline');
  assert.equal(cls('disability', "I don't wish to answer"), 'decline');
  assert.equal(cls('disability', 'Yes, I have a disability (or previously had a disability)'), 'yes');
});

test('classify: gender, hispanic, privacyAck, yes/no', () => {
  assert.equal(cls('gender', 'Male'), 'male');
  assert.equal(cls('gender', 'Female'), 'female');
  assert.equal(cls('gender', 'Choose not to Disclose'), 'decline');
  assert.equal(cls('gender', 'Do not wish to declare'), 'decline');
  assert.equal(cls('gender', 'Non-binary'), 'nonbinary');
  assert.equal(cls('hispanic', 'Yes'), 'yes');
  assert.equal(cls('hispanic', 'No'), 'no');
  assert.equal(cls('hispanic', 'Hispanic'), 'yes');
  assert.equal(cls('hispanic', 'Non-Hispanic'), 'no');
  assert.equal(cls('privacyAck', 'I consent to Initech processing the information'), 'acknowledge');
  assert.equal(cls('privacyAck', 'I do not consent to Initech processing the information'), null);
  assert.equal(cls('sponsorship', 'Yes, I will require sponsorship'), 'yes');
  assert.equal(cls('sponsorship', 'No, I will not require sponsorship'), 'no');
  assert.equal(cls('workAuth', 'Please Select'), null);
});

test('matchOption: single matching option, null on none / ambiguity / placeholder / empty answer', () => {
  const opts = [{ text: 'Please Select' }, { text: 'Male' }, { text: 'Female' }, { text: 'I do not wish to answer' }];
  assert.deepEqual(std.matchOption(opts, 'gender', 'female'), { index: 2, confidence: 1 });
  assert.deepEqual(std.matchOption(opts, 'gender', 'decline'), { index: 3, confidence: 1 });
  assert.equal(std.matchOption(opts, 'gender', 'nonbinary'), null); // no such option
  assert.equal(std.matchOption(opts, 'gender', ''), null);
  assert.equal(std.matchOption(opts, 'gender', undefined), null);
  // placeholder is never an answer, even for decline-like words
  assert.equal(std.matchOption([{ text: 'Please Select' }, { text: 'Select...' }], 'gender', 'male'), null);
  // two options mean the same answer: do not guess
  const dup = [{ text: 'I am not a veteran' }, { text: 'I am a veteran, but not a protected veteran' }];
  assert.equal(std.classify('veteran', dup[0].text), 'not');
  assert.equal(std.classify('veteran', dup[1].text), 'not');
  assert.equal(std.matchOption(dup, 'veteran', 'not'), null);
  // disabled options are skipped
  assert.deepEqual(std.matchOption([{ text: 'Male', disabled: true }, { text: 'Male' }], 'gender', 'male'), { index: 1, confidence: 1 });
  // text empty: falls back to value
  assert.deepEqual(std.matchOption([{ text: '', value: 'Female' }], 'gender', 'female'), { index: 0, confidence: 1 });
});

test('matchOption: race falls back to the Hispanic answer for Hispanic / Non-Hispanic lists', () => {
  const opts = [{ text: 'Hispanic' }, { text: 'Non-Hispanic' }];
  std.setAnswers({ hispanic: 'no' });
  assert.deepEqual(std.matchOption(opts, 'race', 'white'), { index: 1, confidence: 1 });
  std.setAnswers({});
  assert.equal(std.matchOption(opts, 'race', 'white'), null);
  std.setAnswers({ hispanic: 'yes' });
  assert.deepEqual(std.matchOption(opts, 'race', 'white'), { index: 0, confidence: 1 });
  std.setAnswers({});
});

test('matcher.matchOption with std: keys delegates to standard', () => {
  const opts = [{ text: 'Select' }, { text: 'No, I am not a protected veteran' }, { text: 'Yes, I am a protected veteran' }];
  assert.deepEqual(m.matchOption(opts, 'std:veteran', 'not'), { index: 1, confidence: 1 });
  assert.deepEqual(m.matchOption(opts, 'std:veteran', 'protected'), { index: 2, confidence: 1 });
  assert.equal(m.matchOption(opts, 'std:veteran', 'decline'), null);
});

test('fillValue: select / radio / checkbox / text', () => {
  const fv = (qid, ans, desc, cb) => std.fillValue(qid, ans, { label: '', ...desc }, cb);
  assert.equal(fv('gender', 'male', { inputType: 'select' }), 'male');
  assert.equal(fv('gender', 'female', { inputType: 'radio' }), 'female');
  // checkbox whose own label means the answer
  assert.equal(fv('disability', 'yes', { inputType: 'checkbox' }, 'Yes, I have a disability'), 'Yes');
  assert.equal(fv('disability', 'no', { inputType: 'checkbox' }, 'Yes, I have a disability'), '');
  assert.equal(fv('disability', 'no', { inputType: 'checkbox' }, 'No, I do not have a disability and have not had one in the past'), 'Yes');
  // the question text is the box
  assert.equal(fv('privacyAck', 'acknowledge', { inputType: 'checkbox', label: 'I acknowledge the privacy notice' }), 'Yes');
  assert.equal(fv('workAuth', 'yes', { inputType: 'checkbox', label: 'Authorized to work?' }), '');
  // text input: only when the label reads as a yes/no question
  assert.equal(fv('workAuth', 'yes', { inputType: 'text', label: 'Are you authorized to work in the US?' }), 'Yes');
  assert.equal(fv('sponsorship', 'no', { inputType: 'text', label: 'Will you require sponsorship?' }), 'No');
  assert.equal(fv('workAuth', 'yes', { inputType: 'text' }), '');
  assert.equal(fv('gender', 'male', { inputType: 'text' }), '');
  // blank answer
  assert.equal(fv('workAuth', '', { inputType: 'select' }), '');
  assert.equal(fv('workAuth', undefined, { inputType: 'text' }), '');
});

test('default-"No" questions do not swallow look-alikes (they fill on every site)', () => {
  const det = (label, inputType) => {
    const r = std.detect({ label, inputType: inputType || 'radio', context: '' });
    return r ? r.id : null;
  };
  assert.equal(det('Describe your experience working with customers', 'textarea'), null);
  assert.equal(det('Have you ever worked with Python?'), null);
  assert.equal(det('In your past roles, how have you worked with stakeholders?'), null);
  assert.equal(det('Have you worked in a customer-facing role?'), null);
  assert.equal(det('Have you previously been employed by Acme?'), 'previouslyEmployed');
  assert.equal(det('Are you a former employee of Acme?'), 'previouslyEmployed');
  assert.equal(det('Are you currently employed by a client of Contoso?'), 'clientEmployed');
  // Section veto: nothing in a references block is about the owner.
  assert.equal(std.detect({ label: 'Have you previously worked for this reference?', inputType: 'radio', context: 'References' }), null);
});

test('privacy acknowledgment needs an acknowledgment verb and is never a marketing opt-in', () => {
  const det = (label) => {
    const r = std.detect({ label, inputType: 'checkbox', context: '' });
    return r ? r.id : null;
  };
  assert.equal(det('Send me job alerts. See our Privacy Policy.'), null);
  assert.equal(det('I agree to receive text messages (SMS). Privacy Policy applies.'), null);
  assert.equal(det('Join our talent community; I consent to the Privacy Notice'), null);
  assert.equal(det('I agree to receive marketing emails about future opportunities (Privacy Policy)'), null);
  assert.equal(det('Privacy Policy'), null);
  assert.equal(det('I acknowledge the Privacy Notice'), 'privacyAck');
});

test('fillValue never writes into a textarea, and text only for yes/no-shaped labels', () => {
  assert.equal(std.fillValue('clientEmployed', 'no', { inputType: 'textarea', label: 'Are you employed by a client?' }), '');
  assert.equal(std.fillValue('workAuth', 'yes', { inputType: 'text', label: 'Are you legally authorized to work in the US?' }), 'Yes');
  assert.equal(std.fillValue('workAuth', 'yes', { inputType: 'text', label: 'U.S. work authorization status' }), '');
  assert.equal(std.fillValue('disability', 'no', { inputType: 'checkboxes', label: 'Please check one of the boxes below' }), 'no');
});

// Phase 4 captures: Eightfold, a company-built form, a second Greenhouse board.
test('detect: Phase 4 wordings', () => {
  assert.equal(det('Are you legally authorized to work in the country/region you are applying for?'), 'workAuth');
  assert.equal(det("In order to obtain or maintain employment eligibility, will you now or in the future require the company's sponsorship for an immigration-related employment benefit (i.e., a work visa, work permit, etc.)?"), 'sponsorship');
  assert.equal(det('Ethnicity/Race'), 'race');
  assert.equal(det('What is your race/ethnic background?'), 'race');
  assert.equal(det('What is your gender identity?'), 'gender');
  assert.equal(det('What is your Veteran status?'), 'veteran');
  assert.equal(det('Have you ever worked with Example Corp as a full-time / part-time employee, intern, vendor, agency temporary, or business guest? If yes, please provide as much information about your former employment as you can.'), 'previouslyEmployed');
  assert.equal(det('Have you ever worked with a Fabrikam employee on a project?'), null);
  assert.equal(det('Are you currently employed by an Example Corp subsidiary (e.g., FabriKam, LitWare, Gaming Studios)?'), null);
  assert.equal(det('By checking this you agree to the Example Corp Data Privacy Notice (DPN).', { inputType: 'checkbox' }), 'privacyAck');
});

test('workAuth: citizen / visa pick between two "Yes" options; plain Yes does not guess', () => {
  const o = [
    'Yes, I have US work authorization as a US Citizen or US Permanent Resident/Green Card Holder',
    'Yes, I have US Work authorization via a non-immigrant visa (H-1B, L-1, F-1 OPT OR CPT, TN, E-3, O-1, Dependent Visa)',
    'No, I am not currently authorized to work in the United States',
  ].map((text) => ({ text, value: '' }));
  assert.equal(std.matchOption(o, 'workAuth', 'yes'), null);
  assert.equal(std.matchOption(o, 'workAuth', 'citizen').index, 0);
  assert.equal(std.matchOption(o, 'workAuth', 'visa').index, 1);
  assert.equal(std.matchOption(o, 'workAuth', 'no').index, 2);
  // A plain Yes / No list: citizen and visa both mean Yes.
  const yn = [{ text: 'Yes', value: '' }, { text: 'No', value: '' }];
  assert.equal(std.matchOption(yn, 'workAuth', 'citizen').index, 0);
  assert.equal(std.matchOption(yn, 'workAuth', 'visa').index, 0);
  // Text inputs and single boxes read citizen as Yes.
  const q = { label: 'Are you authorized to work in the US?', inputType: 'text' };
  assert.equal(std.fillValue('workAuth', 'citizen', q), 'Yes');
});

test('race: a company-built form list (Indigenous, "Black or African", "Prefer not to inform")', () => {
  assert.equal(std.classify('race', 'Indigenous Peoples'), 'native');
  assert.equal(std.classify('race', 'Black or African'), 'black');
  assert.equal(std.classify('race', 'Prefer not to inform'), 'decline');
  assert.equal(std.classify('veteran', 'I am not a veteran'), 'not');
});

/* ------------------------------------------------------------------ */
/* U.S. citizenship / "U.S. person" (export control)                    */
/* ------------------------------------------------------------------ */

const detCit = (label, inputType) => std.detect({ label, hints: [], context: '', inputType: inputType || 'select' });

test('citizenship: wordings detected, with the statuses each one asks about', () => {
  const ALL = ['citizen', 'lpr', 'asylee'];
  for (const [label, scope] of [
    // Workday
    ['Are you a U.S. citizen, lawful permanent resident, refugee, or asylee?', ALL],
    ['Are you a U.S. Person as defined by ITAR (22 CFR 120.62)?', ALL],
    ['This position requires access to export-controlled information (ITAR/EAR). Are you a "U.S. person"?', ALL],
    ['Are you a US Person?', ALL],
    ['Are you a citizen, lawful permanent resident, refugee or asylee of the United States?', ALL],
    ['Are you a U.S. citizen?', ['citizen']],
    ['Are you a citizen of the United States?', ['citizen']],
    ['Do you have U.S. citizenship?', ['citizen']],
    ['Are you a United States citizen or national?', ['citizen']],
    ['This position requires a security clearance, which requires U.S. citizenship. Are you a U.S. citizen?', ['citizen']],
    ['Are you a U.S. citizen or permanent resident?', ['citizen', 'lpr']],
    ['Are you a US citizen or green card holder?', ['citizen', 'lpr']],
    ['U.S. Citizenship Status', 'status'],
    // Greenhouse: the dropdown's label is only the export-control notice.
    ['EXPORT CONTROLS - This position requires access to information and technology that is subject to U.S. export controls. Your responses to the questions below will be used solely to determine your eligibility under U.S. law to receive information and materials subject to U.S. export controls.', 'status'],
    ['What is your citizenship status?', 'status'],
  ]) {
    const r = detCit(label);
    assert.ok(r, 'not detected: ' + label);
    assert.equal(r.id, 'citizenship', label);
    assert.deepEqual(r.scope, scope, label);
  }
});

test('citizenship: look-alikes are not this question', () => {
  for (const label of [
    'What is your country of citizenship?',
    'Country of Citizenship',
    'Do you hold dual citizenship?',
    'Are you a citizen of any country other than the United States?',
    'Are you a citizen of Cuba, Iran, North Korea, Syria or the Crimea region?',
    'Please list all countries of citizenship',
    'Can you provide proof of U.S. citizenship?',
    'Are you a non-U.S. person?',
    'Are you a foreign national?',
    'Are you a U.S. citizen with an active security clearance?',
    'Do you hold an active clearance? (U.S. citizens only)',
    'Nationality',
    'Is your spouse a U.S. citizen?',
  ]) {
    const r = detCit(label);
    assert.ok(!r || r.id !== 'citizenship', label + ' -> ' + (r && r.id));
  }
  // Work authorization / sponsorship keep their questions.
  assert.equal(detCit('Are you a U.S. citizen or otherwise legally authorized to work in the United States?').id, 'workAuth');
  assert.equal(detCit('Are you a U.S. citizen or will you require visa sponsorship?').id, 'sponsorship');
});

test('citizenship: yes/no answer depends on the stored status and the scope of the question', () => {
  const yn = [{ text: 'Select One', value: '' }, { text: 'Yes', value: '1' }, { text: 'No', value: '2' }];
  const pick = (label, status, options) => {
    const d = detCit(label);
    const v = std.fillValue('citizenship', status, { label, inputType: 'select' }, undefined, d);
    const r = std.matchOption(options || yn, 'citizenship', v);
    return r ? (options || yn)[r.index].text : null;
  };
  const PERSON = 'Are you a U.S. citizen, lawful permanent resident, refugee, or asylee?';
  const CITIZEN = 'Are you a U.S. citizen?';
  assert.equal(pick(PERSON, 'citizen'), 'Yes');
  assert.equal(pick(PERSON, 'lpr'), 'Yes');
  assert.equal(pick(PERSON, 'asylee'), 'Yes');
  assert.equal(pick(PERSON, 'none'), 'No');
  assert.equal(pick(CITIZEN, 'citizen'), 'Yes');
  assert.equal(pick(CITIZEN, 'lpr'), 'No', 'a permanent resident is not a citizen');
  assert.equal(pick(CITIZEN, 'asylee'), 'No');
  assert.equal(pick('Are you a U.S. citizen or permanent resident?', 'asylee'), 'No');
  assert.equal(pick('Are you a U.S. citizen or permanent resident?', 'lpr'), 'Yes');
  // A status question with yes/no options: unclear, never guessed.
  assert.equal(pick('Citizenship status', 'citizen'), null);
});

test('citizenship: status lists and mixed yes/no lists', () => {
  const opts = (texts) => texts.map((text) => ({ text, value: text }));
  const pick = (label, status, texts) => {
    const d = detCit(label);
    const v = std.fillValue('citizenship', status, { label, inputType: 'radio' }, undefined, d);
    const o = opts(texts);
    const r = std.matchOption(o, 'citizenship', v);
    return r ? o[r.index].text : null;
  };
  const STATUS = ['U.S. Citizen or National', 'Lawful Permanent Resident (Green Card Holder)', 'Refugee / Asylee', 'Non-citizen (none of the above)'];
  assert.equal(pick('Citizenship Status', 'citizen', STATUS), STATUS[0]);
  assert.equal(pick('Citizenship Status', 'lpr', STATUS), STATUS[1]);
  assert.equal(pick('Citizenship Status', 'asylee', STATUS), STATUS[2]);
  assert.equal(pick('Citizenship Status', 'none', STATUS), STATUS[3]);
  const MIXED = ['Yes, I am a U.S. citizen', 'Yes, I am a lawful permanent resident', 'Yes, I am a refugee or asylee', 'No'];
  const PERSON = 'Are you a U.S. person (citizen, lawful permanent resident, refugee or asylee)?';
  assert.equal(pick(PERSON, 'lpr', MIXED), MIXED[1]);
  assert.equal(pick(PERSON, 'none', MIXED), 'No');
  // "Yes, I am a U.S. citizen" is never a permanent resident's Yes.
  assert.equal(pick(PERSON, 'lpr', ['Yes, I am a U.S. citizen', 'No']), null);
  assert.equal(pick('Are you a U.S. citizen?', 'lpr', ['Yes', 'No, but I am a permanent resident', 'No']), 'No, but I am a permanent resident');
  assert.equal(pick('Are you a U.S. citizen?', 'none', ['Yes', 'No, but I am a permanent resident', 'No']), 'No');
  assert.equal(pick('Are you a U.S. citizen?', 'none', ['Yes', 'No, I am not a U.S. citizen']), 'No, I am not a U.S. citizen');
});

test('citizenship: text boxes get Yes/No only for a yes/no question; checkboxes are never ticked', () => {
  const fv = (label, status, inputType) => std.fillValue('citizenship', status, { label, inputType }, undefined, detCit(label, inputType));
  assert.equal(fv('Are you a U.S. citizen?', 'citizen', 'text'), 'Yes');
  assert.equal(fv('Are you a U.S. citizen?', 'lpr', 'text'), 'No');
  assert.equal(fv('Citizenship status', 'citizen', 'text'), '');
  assert.equal(fv('Are you a U.S. citizen?', 'citizen', 'textarea'), '');
  assert.equal(fv('I am a U.S. person as defined by ITAR', 'citizen', 'checkbox'), '');
  // Defined, opt-in, always orange.
  const q = std.byId('citizenship');
  assert.ok(q.alwaysReview);
  assert.deepEqual(q.answers.map((a) => a.id), ['citizen', 'lpr', 'asylee', 'none']);
});

test('privacyAck: bundled agreements are never the privacy acknowledgment (never ticked)', () => {
  for (const l of [
    'I have read and agree to the Privacy Policy and Terms and Conditions',
    'I consent to a background check and to the processing of my personal data',
    'I certify that all information is true and I accept the privacy notice',
    'I authorize the company to verify my personal information and I acknowledge the privacy notice',
  ]) {
    assert.notEqual(det(l, { inputType: 'checkbox' }), 'privacyAck', l);
  }
});

test('work authorization / sponsorship for another country is not the stored (U.S.) answer', () => {
  for (const l of ['Are you legally authorized to work in Canada?', 'Do you have the right to work in the UK?', 'Are you eligible to work in India?',
    'Will you require sponsorship to work in the United Kingdom?', 'Do you hold an EU work permit?']) {
    assert.equal(det(l), null, l);
  }
  assert.equal(det('Are you authorized to work in the US or Canada?'), 'workAuth');
  assert.equal(det('Are you legally authorized to work in Canada? Please let us know.'), null);
  assert.equal(det('Do you have the right to work in this country?'), 'workAuth');
});

test('otherPositions / previouslyEmployed look-alikes (reviewed 2026-10-03)', () => {
  for (const l of ['Have you applied for other positions with us before?', 'Are you currently interviewing for other positions?',
    'Do you have offers for other jobs?', 'Are you interviewing with other companies or for other roles?']) assert.notEqual(det(l), 'otherPositions', l);
  for (const l of ['May we consider you for other positions?', 'Would you like to be considered for future openings?',
    'Depending on your previous experience, Fabrikam may choose to consider you for other positions']) assert.equal(det(l), 'otherPositions', l);
  for (const l of ['Have you ever been employed by the U.S. Government?', 'Have you ever worked for a competitor of this company?',
    'Have you ever worked for a federal contractor?', 'Have you ever been employed by a staffing agency?',
    'Are you a former employee of a government agency?']) assert.notEqual(det(l), 'previouslyEmployed', l);
  for (const l of ['Have you ever worked at Initech before?', 'Are you a former employee of Acme?',
    'Have you ever worked with Example Corp as a full-time / part-time employee, intern, vendor or contractor?']) assert.equal(det(l), 'previouslyEmployed', l);
});

test('classify: "Not sure" / "Unsure" is not a No (a Yes / No / Not sure list still answers No)', () => {
  assert.equal(std.classify('sponsorship', 'Not sure'), null);
  assert.equal(std.classify('sponsorship', 'Unsure'), null);
  const opts = ['Yes', 'No', 'Not sure'].map((text) => ({ text, value: text }));
  assert.deepEqual(std.matchOption(opts, 'sponsorship', 'no'), { index: 1, confidence: 1 });
});
