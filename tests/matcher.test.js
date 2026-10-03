/*
 * Pure-logic tests for core/matcher.js. No browser needed.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../core/matcher.js');

const key = (label, extra) => {
  const r = m.matchField({ label, ...(extra || {}) });
  return r ? r.key : null;
};

test('normalize: case, punctuation, asterisks, filler phrases, camelCase', () => {
  assert.equal(m.normalize('Legal First Name *'), 'legal first name');
  assert.equal(m.normalize('State/Province (required)'), 'state province');
  assert.equal(m.normalize('Country -- Please select'), 'country');
  assert.equal(m.normalize('legalNameSection_firstName'), 'legal name section first name');
  assert.equal(m.normalize('addressSection_addressLine1'), 'address section address line 1');
  assert.equal(m.normalize("Bachelor's Degree"), 'bachelors degree');
  assert.equal(m.normalize('  E-mail:  '), 'e mail');
});

test('preferred first name beats generic first name', () => {
  assert.equal(key('Preferred First Name'), 'preferredName');
  assert.equal(key('First Name (Preferred)'), 'preferredName');
  assert.equal(key('Preferred name'), 'preferredName');
  assert.equal(key('Nickname'), 'preferredName');
  assert.equal(key('What should we call you?'), 'preferredName');
  assert.equal(key('First Name'), 'firstName');
  assert.equal(key('Legal First Name *'), 'firstName');
  assert.equal(key('Given name'), 'firstName');
});

test('name variants', () => {
  assert.equal(key('Last Name'), 'lastName');
  assert.equal(key('Surname'), 'lastName');
  assert.equal(key('Middle Name'), 'middleName');
  assert.equal(key('Middle Initial'), 'middleInitial');
  assert.equal(key('Name'), 'fullName');
  assert.equal(key('Full Legal Name'), 'fullName');
  assert.equal(key('First and Last Name'), 'fullName');
  // Preferred last name: fill, but flagged for review.
  const r = m.matchField({ label: 'Preferred Last Name' });
  assert.equal(r.key, 'lastName');
  assert.ok(r.confidence < m.HIGH_CONFIDENCE);
});

test('emergency contact and other people match NOTHING', () => {
  const nope = [
    'Emergency Contact Name',
    'Emergency Contact First Name',
    'Emergency contact phone number',
    'Emergency Contact Email',
    'Emergency Contact Relationship',
    'Next of kin',
    'Reference Name',
    'Reference 1 Email',
    'Referred by (name)',
    'Supervisor Name',
    'Manager Email',
    "Employer's Phone",
    'Company Address',
    'Relationship to applicant',
  ];
  for (const label of nope) assert.equal(key(label), null, label);
});

test('emergency veto also applies via section context, hints and autocomplete', () => {
  assert.equal(key('Name', { context: 'Emergency Contact' }), null);
  assert.equal(key('Phone', { context: 'Emergency Contact Information' }), null);
  assert.equal(key('Email', { context: 'Professional References' }), null);
  assert.equal(key('', { hints: ['emergencyContactPhone'], inputType: 'tel' }), null);
  assert.equal(key('', { hints: ['emergency_first'], autocomplete: 'given-name' }), null);
  // Harmless headings do not block.
  assert.equal(key('Name', { context: 'Personal Information' }), 'fullName');
  assert.equal(key('Email', { context: 'Job Reference ID 12345' }), 'email');
});

test('contact and address', () => {
  assert.equal(key('Email Address'), 'email');
  assert.equal(key('E-mail'), 'email');
  assert.equal(key('Confirm Email'), 'email');
  assert.equal(key('Phone Number'), 'phone');
  assert.equal(key('Mobile'), 'phone');
  assert.equal(key('Phone Extension'), null);
  assert.equal(key('Phone Device Type'), 'phoneType');
  assert.equal(key('Work Phone'), null);
  assert.equal(key('Address Line 1'), 'addressLine1');
  assert.equal(key('Street Address'), 'addressLine1');
  assert.equal(key('Address Line 2'), 'addressLine2');
  assert.equal(key('Apartment, suite, etc.'), 'addressLine2');
  assert.equal(key('City'), 'city');
  assert.equal(key('State / Province'), 'state');
  assert.equal(key('ZIP Code'), 'postalCode');
  assert.equal(key('Postal code'), 'postalCode');
  assert.equal(key('Country'), 'country');
  assert.equal(key('Country of citizenship'), null);
  assert.equal(key('School City'), null);
  assert.equal(key('Email Address'), 'email');
});

test('"United States" in a question is not the State field', () => {
  assert.equal(key('Are you legally authorized to work in the United States?'), null);
  assert.equal(key('Will you require sponsorship to work in the state of California?'), null);
});

test('links', () => {
  assert.equal(key('LinkedIn Profile URL'), 'linkedin');
  assert.equal(key('Linked In'), 'linkedin');
  assert.equal(key('GitHub'), 'github');
  assert.equal(key('Personal Website'), 'portfolio');
  assert.equal(key('Portfolio URL'), 'portfolio');
  assert.equal(key('Website'), 'portfolio');
});

test('education', () => {
  assert.equal(key('School or University *'), 'school');
  assert.equal(key('College'), 'school');
  assert.equal(key('High School'), null);
  assert.equal(key('Degree'), 'degree');
  assert.equal(key('Highest level of education'), 'degree');
  assert.equal(key('Major / Field of Study'), 'major');
  assert.equal(key('Minor'), 'minor');
  assert.equal(key('Are you a minor?'), null);
  assert.equal(key('Expected Graduation Month'), 'gradMonth');
  assert.equal(key('Graduation Year'), 'gradYear');
  assert.equal(key('Expected Graduation Date'), 'gradDate');
  assert.equal(key('Cumulative GPA'), 'gpa');
  assert.equal(key('GPA Scale'), null);
});

test('attribute hints when there is no label', () => {
  assert.equal(key('', { hints: ['addressSection_addressLine1'] }), 'addressLine1');
  assert.equal(key('', { hints: ['legalNameSection_firstName'] }), 'firstName');
  assert.equal(key('', { hints: ['input_7'] }), null);
  assert.equal(key('', { autocomplete: 'family-name' }), 'lastName');
  assert.equal(key('', { inputType: 'email' }), 'email');
  // A real question label that matched nothing is not overridden by attribute noise.
  assert.equal(key('Why do you want to work here?', { hints: ['first_name_q'] }), null);
});

test('long question-like labels never match', () => {
  assert.equal(
    key('Please describe a time you had to share your first name and email with a large team at once'),
    null
  );
});

test('valueFor and valueVariants', () => {
  const p = { firstName: 'Alexandra', lastName: 'Rivera', middleName: 'jane', gradMonth: '5', gradYear: '2027' };
  assert.equal(m.valueFor('fullName', p), 'Alexandra Rivera');
  assert.equal(m.valueFor('preferredName', p), 'Alexandra'); // falls back to first name
  assert.equal(m.valueFor('preferredName', { ...p, preferredName: 'Alex' }), 'Alex');
  assert.equal(m.valueFor('middleInitial', p), 'J');
  assert.equal(m.valueFor('gradMonth', p, 'text'), 'May');
  assert.equal(m.valueFor('gradDate', p, 'text'), '05/2027');
  assert.equal(m.valueFor('gradDate', p, 'month'), '2027-05');
  assert.equal(m.valueFor('email', p), '');
  assert.ok(m.valueVariants('state', 'CA').includes('California'));
  assert.ok(m.valueVariants('state', 'california').includes('CA'));
  assert.ok(m.valueVariants('country', 'USA').includes('United States of America'));
  assert.deepEqual(m.valueVariants('gradMonth', '5'), ['5', '05', 'May']);
});

// Real labels from fixtures/{phenom,greenhouse,avature} captures (Phase 2).
test('phone type and dial-code pickers (Phenom, Workday)', () => {
  assert.equal(key('Phone device type*'), 'phoneType');
  assert.equal(key('Phone Type'), 'phoneType');
  assert.equal(key('Country phone code*'), 'phoneCountryCode');
  assert.equal(key('Country/Territory Phone Code'), 'phoneCountryCode');
  assert.equal(key('Phone number*'), 'phone');
  assert.equal(key('Country*'), 'country');
  assert.equal(key('Zip code/Postal code *'), 'postalCode');
});

test('yes/no questions never match a profile value (Avature, Greenhouse)', () => {
  const nope = [
    'Is the residential address you provided in your application different from your permanent address?',
    'Attended university or higher education degree program?',
    'If a position is not available in your preferred locations, would you like to be considered for positions in other locations?',
    'Have you ever worked at Initech before? Please answer Yes if you were employed by Initech as a regular, fixed term, or intern.',
    'Are you currently legally authorized to work in the United States?',
    'Will you be returning to school at the end of the internship to continue your degree?',
    'Are you a resident of China or South Korea? *',
    'Please select the country where your University or School program is/was located',
    'Source*',
    'How did you hear about us?*',
    'End date month*', // only via the Greenhouse adapter's key hint, and education is skipped in Phase 2
  ];
  for (const label of nope) assert.equal(key(label), null, label);
});

test('preferred-name yes/no is its own key', () => {
  assert.equal(key('Do you have a preferred name?'), 'hasPreferredName');
  assert.equal(key('I have a preferred name'), 'hasPreferredName');
  assert.equal(key('Preferred First Name'), 'preferredName');
  const p = { firstName: 'Alexandra', preferredName: 'Alex' };
  assert.equal(m.valueFor('hasPreferredName', p), 'Yes');
  assert.equal(m.valueFor('hasPreferredName', { firstName: 'Alexandra' }), 'No');
  assert.equal(m.valueFor('hasPreferredName', { firstName: 'Alexandra', preferredName: 'alexandra' }), 'No');
  assert.equal(m.valueFor('hasPreferredName', {}), '');
});

test('education labels from Avature', () => {
  assert.equal(key('Degree obtained or currently in progress'), 'degree');
  assert.equal(key('Study/Specialization of Degree obtained'), 'major');
  assert.equal(key('Type of Degree'), 'degree');
  assert.equal(key('Degree name'), 'degree');
  assert.equal(key('University'), 'school');
  const r = m.matchField({
    label: 'Please select the university or higher-education institution where you completed your highest or latest degree',
  });
  assert.equal(r.key, 'school');
  assert.ok(r.confidence < m.HIGH_CONFIDENCE, 'long label: review');
});

test('adapter key hint wins, but vetoes still apply', () => {
  assert.equal(key('End date month*', { keyHint: 'gradMonth' }), 'gradMonth');
  assert.equal(key('Emergency contact', { keyHint: 'phone' }), null);
});

const opts = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], text: x[1] } : { value: x, text: x }));

test('matchOption: exact first, then explicit aliases only', () => {
  // Phenom dial-code list (option values/text as captured).
  const codes = opts([['', 'Please Select'], ['ASM_1', 'American Samoa (+1)'], ['USA_1', 'United States of America (+1)'],
    ['UMI_1', 'United States Minor Outlying Islands (+1)']]);
  assert.deepEqual(m.matchOption(codes, 'phoneCountryCode', 'United States'), { index: 2, confidence: 0.9 });
  // Phenom device type: "Mobile" vs "Cell".
  const dev = opts([['', 'Please Select'], ['Mobile', 'Mobile'], ['Telephone', 'Other']]);
  assert.equal(m.matchOption(dev, 'phoneType', 'Cell').index, 1);
  assert.equal(m.matchOption(dev, 'phoneType', 'Mobile').confidence, 1);
  // "VA" is Virginia, never West Virginia.
  assert.equal(m.matchOption(opts(['Select One', 'West Virginia', 'Virginia']), 'state', 'VA').index, 2);
  // United States vs United States of America.
  assert.equal(m.matchOption(opts(['Canada', 'United States of America']), 'country', 'United States').index, 1);
  assert.equal(m.matchOption(opts(['Canada', 'United States']), 'country', 'USA').index, 1);
});

test('matchOption: weak or ambiguous matches pick nothing', () => {
  assert.equal(m.matchOption(opts(['United States Minor Outlying Islands', 'American Samoa']), 'country', 'United States'), null);
  assert.equal(m.matchOption(opts(['Computer Science and Engineering']), 'major', 'Computer Science'), null);
  assert.equal(m.matchOption(opts(['Mobile', 'Mobile Phone']), 'phoneType', 'Cell'), null);
  assert.equal(m.matchOption(opts(['Bachelors', 'Bachelor of Arts']), 'degree', 'Bachelor of Science'), null);
  assert.equal(m.matchOption(opts(['Select...', '----']), 'state', 'CA'), null);
  // Degree family with a single candidate: review confidence.
  assert.equal(m.matchOption(opts(['Associate', "Bachelor's Degree", "Master's"]), 'degree', 'Bachelor of Science').confidence, 0.65);
});

test('signatures match nothing, even when they say "name" (Phase 3)', () => {
  assert.equal(key('Signature'), null);
  assert.equal(key('Electronic Signature (type your full name)'), null);
  assert.equal(key('E-Signature'), null);
  assert.equal(key('Initials'), null);
  assert.equal(key('Middle Initial'), 'middleInitial');
  assert.equal(key('Your name'), 'fullName'); // Avature EEO step: a plain name field
});

test("today's date: exact labels, and a bare 'Date' for review", () => {
  assert.equal(key("Today's Date"), 'todayDate');
  assert.equal(key('Current date'), 'todayDate');
  const bare = m.matchField({ label: 'Date' });
  assert.equal(bare.key, 'todayDate');
  assert.ok(bare.confidence < m.HIGH_CONFIDENCE);
  assert.match(m.valueFor('todayDate', {}, 'text'), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.match(m.valueFor('todayDate', {}, 'date'), /^\d{4}-\d{2}-\d{2}$/);
});

test('isVetoed: label vs section context', () => {
  assert.equal(m.isVetoed({ label: 'Do you have any relatives employed by us?' }, 'label'), true);
  assert.equal(m.isVetoed({ label: 'Name', context: 'Emergency Contact' }, 'context'), true);
  assert.equal(m.isVetoed({ label: 'Name', context: 'Personal information' }, 'context'), false);
});

test('Q&A answers match yes/no options through aliases', () => {
  assert.deepEqual(m.matchOption([{ text: 'Y', value: 'Y' }, { text: 'N', value: 'N' }], 'qa', 'No'), { index: 1, confidence: 0.95 });
});

test('"Choose not to Disclose" is an answer, not a placeholder', () => {
  assert.equal(m.isPlaceholderText('Choose not to Disclose'), false);
  assert.equal(m.isPlaceholderText('Choose one'), true);
  assert.equal(m.isPlaceholderText('Select...'), true);
});

test('salary and emergency-contact fields are ignored (no fill, no outline)', () => {
  assert.equal(m.isIgnored({ label: 'Desired salary *' }), true);
  assert.equal(m.isIgnored({ label: 'What are your compensation expectations?' }), true);
  assert.equal(m.isIgnored({ label: 'Expected pay range' }), true);
  assert.equal(m.isIgnored({ label: 'Emergency Contact First Name' }), true);
  assert.equal(m.isIgnored({ label: 'Name', context: 'Emergency Contact' }), true);
  assert.equal(m.isIgnored({ label: 'Phone', context: 'References' }), true);
  assert.equal(m.isIgnored({ label: 'Name', context: 'Personal information' }), false);
  assert.equal(m.isIgnored({ label: 'Email' }), false);
});

test('references by label are ignored too; reference numbers are not (Phase 4)', () => {
  assert.equal(m.isIgnored({ label: 'Reference 1 Name' }), true);
  assert.equal(m.isIgnored({ label: 'Professional references' }), true);
  assert.equal(m.isIgnored({ label: 'Referee email' }), true);
  assert.equal(m.isIgnored({ label: 'What is your desired hourly rate?' }), true);
  assert.equal(m.isIgnored({ label: 'Job reference number' }), false);
  assert.equal(m.isIgnored({ label: 'How did you hear about us? (referral)' }), false);
});

test('new labels from Phase 4 captures (Eightfold, a company-built form)', () => {
  // Eightfold: an alternate phone would only repeat the main one.
  assert.equal(key('Alternate Phone Number', { hints: ['Contact_Information_q_cust_altPhoneNo'] }), null);
  assert.equal(key('Is your legal name the same as your preferred name?'), 'legalNameSame');
  assert.equal(m.valueFor('legalNameSame', { firstName: 'Alexandra', preferredName: 'Alex' }), 'No');
  assert.equal(m.valueFor('legalNameSame', { firstName: 'Alexandra' }), 'Yes');
  // The company-built form: a free-text "(month and year)" date, and "highest ... completed".
  assert.equal(key('What is your expected graduation date (month and year)?*'), 'gradDate');
  assert.equal(m.valueFor('gradDate', { gradMonth: '5', gradYear: '2027' }, 'text'), '05/2027');
  assert.equal(key('Expected Graduation Month'), 'gradMonth');
  assert.equal(key('Highest Level of Education Completed*'), null);
  assert.equal(key('Highest level of education'), 'degree');
});

test('Workday (real captures, 2026-10-02): County, degree list, {company}', () => {
  // "County" with hint address--regionSubdivision1 used to match state at 0.55.
  assert.equal(key('County', { hints: ['regionSubdivision1', 'address--regionSubdivision1'] }), null);
  assert.equal(key('State', { hints: ['countryRegion', 'address--countryRegion'] }), 'state');
  // Degree options read "B.S. - Bachelor of Science".
  const opts = ['Select One', 'B.A. - Bachelor of Arts', 'B.S. - Bachelor of Science', 'M.S. - Master of Science',
    'Bachelor of Music', 'HS - High School'].map((text, i) => ({ text, value: '', disabled: i === 0 }));
  assert.deepEqual(m.matchOption(opts, 'degree', 'Bachelor of Science'), { index: 2, confidence: 0.9 });
  assert.deepEqual(m.matchOption(opts, 'degree', 'Master of Science'), { index: 3, confidence: 0.9 });
  assert.equal(m.matchOption(opts, 'degree', 'Bachelor of Engineering'), null);
  // The placeholder survives normalization (core/company.js).
  assert.equal(m.normalize('Worked at {company} before?'), 'worked at {company} before');
});

test('answering instructions do not make a label "too long" (Avature preferred-name radio)', () => {
  const r = m.matchField({ label: 'If you have a preferred name that is different from your legal name, please select yes below; otherwise, please select no.', inputType: 'radio' });
  assert.equal(r.key, 'hasPreferredName');
  assert.ok(r.confidence < m.HIGH_CONFIDENCE, 'review, not green');
  // A genuinely long question still matches nothing.
  assert.equal(key('Please describe in detail a time when you had to explain a complicated technical idea to someone without your background, and what happened'), null);
});

test('salary / pay wordings are ignored completely (more wordings, 2026-10-03)', () => {
  for (const l of ['Expected CTC', 'Current CTC', 'Rate of pay desired', 'How much do you expect to be paid?', 'Desired annual earnings',
    'Pay expected', 'Annual income', 'Starting pay', 'Expected stipend', 'Expected hourly rate', 'Minimum base salary']) {
    assert.equal(m.isIgnored({ label: l, hints: [], context: '' }), true, l);
  }
  for (const l of ['Payment method', 'Expected graduation date', 'Current employer', 'Starting date', 'Base location']) {
    assert.equal(m.isIgnored({ label: l, hints: [], context: '' }), false, l);
  }
});

test('high-school questions never get the college graduation date / GPA', () => {
  for (const l of ['High School Graduation Year', 'Year of high school graduation', 'High school graduation date', 'High School GPA',
    'Secondary school graduation month']) assert.equal(key(l), null, l);
  assert.equal(key('Graduation Year'), 'gradYear');
  assert.equal(key('GPA'), 'gpa');
});

test('free-text prompts and textareas are not profile fields by keyword', () => {
  for (const l of ['Please state your reasons for applying', 'Email marketing experience', 'Mobile development experience',
    'City planning experience', 'Website development experience', 'Major projects you have led',
    'Describe a time you resolved a conflict with a coworker at school']) assert.equal(key(l), null, l);
  assert.equal(key('Tell us about your school projects', { inputType: 'textarea' }), null);
  const ta = m.matchField({ label: 'What is your major or field of study?', inputType: 'textarea' });
  assert.equal(ta.key, 'major');
  assert.ok(ta.confidence < m.HIGH_CONFIDENCE, 'a textarea keyword match is orange');
  assert.equal(key('Email'), 'email');
  assert.equal(key('Mobile phone'), 'phone');
  assert.equal(key('Personal website'), 'portfolio');
});

test('"State of residence" is the state (the "state of" exclusion stays for other wordings)', () => {
  assert.equal(key('State of Residence *'), 'state');
  assert.equal(key('State of birth'), null);
});
