/*
 * End-to-end: load each fixture in Firefox, run one fill pass with
 * TEST_PROFILE, assert value + outline state per field id.
 *
 * Two kinds of fixture:
 *   - hand-written (fixtures/generic/), committed;
 *   - real captures (fixtures/<ats>/), gitignored because they hold personal
 *     data. These are sanitized in the page first (helpers/browser.js
 *     sanitizeInPage) and SKIPPED when the file is not on this machine.
 * Saved pages cannot run their own JS, so custom dropdowns get a harness
 * (tests/harness/) that mimics the real popup seen in the _dropdown_ captures.
 *
 * To add a fixture: drop the HTML under fixtures/<ats>/ and add an entry to
 * CASES: { capture: true if real, harness?: async (page) => {}, adapter?,
 * expect: { id: [value, state] } }. state is 'filled' | 'review' | 'unknown' | null.
 * Optional `standard` (standard answers, core/standard.js) and `qa` (Q&A bank
 * entries) are passed to the pass along with TEST_PROFILE.
 * The value read is: input/textarea value; native select option value; the
 * shown text of a react-select or select2 widget; the checked radio's label;
 * 'checked'/'' for a checkbox.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  launch, injectScripts, fixtureUrl, fixturePath, hasFixture, openCapture, TEST_PROFILE: P, ROOT,
} = require('./helpers/browser');

// The company-built form (no ATS) names one radio after the company's own referral program. The
// name is read from the capture's file name ("careers_<company>_com_<stamp>.html") so it is not in this file.
const OWN_FORM = '*/*_1790983662890.html';
const ownFormCompany = () => {
  const n = path.basename(fixturePath(OWN_FORM)).split('_')[1] || '';
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const harness = (name) => (page) => page.addScriptTag({ path: path.join(ROOT, 'tests', 'harness', name) });

// Greenhouse "Country" is the phone dial-code picker: options show flag + name + code.
const GH_COUNTRIES = [
  { label: 'American Samoa', code: '+1' },
  { label: 'Canada', code: '+1' },
  { label: 'United States', code: '+1' },
  { label: 'United States Minor Outlying Islands', code: '+1' },
];

// Greenhouse (second board) work authorization, captured open.
const GH_WORK_AUTH = [
  'Yes, I have US work authorization as a US Citizen or US Permanent Resident/Green Card Holder',
  'Yes, I have US Work authorization via a non-immigrant visa (H-1B, L-1, F-1 OPT OR CPT, TN, E-3, O-1, Dependent Visa)',
  'No, I am not currently authorized to work in the United States',
];

// Greenhouse (second board) dropdowns; only work authorization was captured open.
const secondBoardHarness = async (page) => {
  await harness('react-select.js')(page);
  await page.evaluate(([countries, auth]) => window.installReactSelect({
    country: { options: countries },
    'candidate-location': { options: ['San Diego, California, United States', 'San Diego County, California, United States'] },
    'school--1': { options: ['San Diego Christian College', 'San Diego State University'] },
    question_69577159: { options: auth },
    question_69577160: { options: ['Yes', 'No'] },
    question_69577161: { options: ['Yes', 'No'] },
    question_69577163: { options: ['2025', '2026', '2027', '2028'] },
  }), [GH_COUNTRIES, GH_WORK_AUTH]);
};

// The owner's answers to the standard questions, for the cases that use them.
const STD = {
  workAuth: 'yes',
  sponsorship: 'no',
  gender: 'female',
  hispanic: 'no',
  race: 'two',
  veteran: 'not',
  disability: 'no',
  privacyAck: '',
  otherPositions: 'yes',
  previouslyEmployed: 'no',
  clientEmployed: 'no',
  relatives: 'no',
  referred: 'no',
  citizenship: 'lpr', // a permanent resident: "U.S. person" Yes, "U.S. citizen" No
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const now = new Date();
const TODAY = [now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('/') + '/' + now.getFullYear();
const qa = (question, answer) => ({ id: 'qa-' + question.length, question, aliases: [], answer, sensitive: '' });

// Eightfold comboboxes. Only the Yes/No list was captured open; the other
// option lists are guesses in Eightfold's usual wording.
// `over` replaces single widgets' configs.
const eightfoldHarness = (over) => async (page) => {
  await harness('eightfold.js')(page);
  await page.evaluate((o) => {
    const yn = { options: ['Yes', 'No'] };
    window.installEightfold({
      Contact_Information_q_cust_sameName: yn,
      'Contact_Information_q_phone-country-code': { options: ['Canada (+1)', 'United States (+1)', 'United Kingdom (+44)'] },
      Contact_Information_q_country: { options: ['Canada', 'United States', 'United Kingdom'], delay: 60 },
      Contact_Information_q_state: { options: ['California', 'North Carolina', 'Virginia', 'West Virginia'] },
      Work_Authorization___United_States_q_cust_workLegalAuth: yn,
      Work_Authorization___United_States_q_cust_empEligibility: yn,
      Self_identification___US_Puerto_Rico_q_cust_ethnicityUS: { options: [
        'Asian (Not Hispanic or Latino)', 'Hispanic or Latino', 'Two or More Races (Not Hispanic or Latino)',
        'White (Not Hispanic or Latino)', 'I do not wish to self-identify',
      ] },
      Self_identification___US_Puerto_Rico_q_cust_gender: { options: ['Female', 'Male', 'I do not wish to self-identify'] },
      Self_identification___US_Puerto_Rico_q_cust_armedForcesUS: yn,
      Self_identification___US_Puerto_Rico_q_cust_veteranStatusUS: { options: [
        'I am not a protected veteran',
        'I identify as one or more of the classifications of protected veteran',
        'I do not wish to self-identify',
      ] },
      Candidate_questions_q_cust_employedbyGovt: yn,
      Candidate_questions_q_cust_signedNonDisclosure: yn,
      Candidate_questions_q_cust_prevMSEmployee: yn,
      Candidate_questions_q_cust_prevMSSubsdiaryEmployee: yn,
      ...o,
    });
  }, over || {});
};

// Workday (one tenant, 2026-10-02): the saved pages' button dropdowns and multiselect prompts come
// alive through tests/harness/workday.js, which copies the real popup markup. Only two option
// lists were captured open (the Degree list and a Yes/No question); every other list is a guess,
// so those fields prove our handling, not Workday's lists. A dropdown button's `value` is the
// harness's option id: wdOpt() builds it. A prompt's (School, Field of Study, phone code) shown
// pick is a pill, not the search input's value, so its expectation reads '' with state 'filled';
// tests/workday.test.js checks the pills on the synthetic pages.
const WD_YN = ['Yes', 'No'];
const WD_DEGREES = ['LLM - Master of Laws', 'M.S.T. - Master of Science in Taxation', 'Graduate Degree', 'Bachelor of Music',
  'Undergraduate Degree', 'Undergraduate Degree or Equivalent Experience', 'EdD - Doctor of Education', 'A.S. - Associate of Science',
  'PsyD - Doctor of Psychology', 'HS - High School', 'M.D. - Medical Doctor', 'MBA - Master of Business Administration',
  'PhD - Doctor of Philosophy', 'B.A. - Bachelor of Arts', 'Bachelor of Business Administration', 'GED - General Equivalency Diploma',
  'B.S. - Bachelor of Science', 'M.A. - Master of Arts', 'A.A. - Associate of Arts', 'Bachelor of Commerce', 'JD - Juris Doctor',
  'M.S. - Master of Science'];
const WD_COUNTRIES = ['Canada', 'United States Minor Outlying Islands', 'United States of America'];
const WD_STATES = ['Arizona', 'California', 'Virginia', 'West Virginia'];
const WD_GENDERS = ['Male', 'Female', 'Decline to Self Identify'];
const wdOpt = (id, list, text) => `${id}-opt${list.indexOf(text)}`;
const wdHarness = (cfg) => async (page) => {
  await harness('workday.js')(page);
  await page.evaluate((c) => window.installWorkday(c), cfg);
};
// Every real dropdown the passes reach. Questionnaire dropdowns ('*') are Yes/No guesses.
const WD_CFG = {
  '*': { options: WD_YN },
  'country--country': { options: WD_COUNTRIES },
  'address--countryRegion': { options: WD_STATES },
  'phoneNumber--phoneType': { options: ['Mobile', 'Home', 'Work'] },
  'source--source': { options: ['LinkedIn', 'Indeed'], categories: ['Job Board', 'Social Media'] },
  'phoneNumber--countryPhoneCode': { options: ['American Samoa (+1)', 'Canada (+1)', 'United States of America (+1)'] },
  'education-896--degree': { options: WD_DEGREES },
  'education-896--school': { options: ['San Diego Christian College', 'San Diego State University'] },
  'education-896--fieldOfStudy': { options: ['Computer Engineering', 'Computer Science'] },
  'skills--skills': { options: ['Python', 'JavaScript'] },
  'personalInfoUS--gender': { options: WD_GENDERS },
  'personalInfoUS--veteranStatus': {
    options: ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', 'I do not wish to self-identify'],
  },
};
// The same, but the Degree list and the Yes/No question come from the popup frozen open in the capture.
const { 'education-896--degree': _degree, ...WD_CFG_HARVEST } = WD_CFG;
// Application-question ids (32 hex, per requisition).
const WQ = {
  citizen: '1b2264de5a9410018ab392622cb70000',
  sponsorship: '1b2264de5a9410018ab39395f95d0001',
  workWith: '1b2264de5a9410018ab39395f95d0004',
  temp: '1b2264de5a9410018ab3942fc6640000',
  agency: '1b2264de5a9410018ab3942fc6640004',
  interviewed: '1b2264de5a9410018ab3942fc6640008',
  obligations: '1b2264de5a9410018ab394c9d29a0003',
  finraFirstBox: '2409c7ecf8821001f050dab6313a0000-1b2264de5a9410018ab39563ec300001',
  finraText: '1b2264de5a9410018ab395fd8b820002',
  certsFirstBox: 'e0b0be3717991001f063193dae780000-1b2264de5a9410018ab395fd8b820003',
  crd: '1b2264de5a9410018ab395fd8b820007',
  political: '1b2264de5a9410018ab3969749a70002',
  relatives: '1b2264de5a9410018ab3969749a70006',
  govOfficial: '1b2264de5a9410018ab39730db700003',
  relatedGov: '1b2264de5a9410018ab39730db700007',
  relatedClient: '1b2264de5a9410018ab397caa6a90003',
  referred: '1b2264de5a9410018ab397caa6a90007',
  aiConsent: '1b2264de5a9410018ab8d1b30c810000',
};
const wq = (k) => 'primaryQuestionnaire--' + WQ[k];
const WD_QUESTIONS = (extra) => ({
  // "citizen, lawful permanent resident, refugee, or asylee?": citizenship standard answer (lpr -> Yes), always orange.
  [wq('citizen')]: [wdOpt(wq('citizen'), WD_YN, 'Yes'), 'review'],
  [wq('sponsorship')]: [wdOpt(wq('sponsorship'), WD_YN, 'No'), 'filled'],
  [wq('workWith')]: [wdOpt(wq('workWith'), WD_YN, 'No'), 'review'], // "work for, or with {company}": previously employed
  [wq('temp')]: [wdOpt(wq('temp'), WD_YN, 'No'), 'review'], // temporary work for {company}: previously employed
  [wq('agency')]: ['', 'unknown'],
  [wq('interviewed')]: ['', 'unknown'],
  [wq('obligations')]: ['', 'unknown'],
  [WQ.finraFirstBox]: ['', 'unknown'], // CheckboxGroup: ONE yellow outline for the whole question
  [wq('finraText')]: ['', null], // optional textarea
  [WQ.certsFirstBox]: ['', 'unknown'],
  [wq('crd')]: ['', 'unknown'],
  [wq('political')]: ['', 'unknown'],
  [wq('relatives')]: [wdOpt(wq('relatives'), WD_YN, 'No'), 'review'], // legend lists guardian / spouse: still the relatives answer
  [wq('govOfficial')]: ['', 'unknown'],
  [wq('relatedGov')]: ['', 'unknown'],
  [wq('relatedClient')]: ['', 'unknown'],
  [wq('referred')]: [wdOpt(wq('referred'), WD_YN, 'No'), 'review'],
  [wq('aiConsent')]: ['', 'unknown'], // consent to ML use of your data: not the "other positions" answer
  ...extra,
});

const CASES = {
  'generic/basic.html': {
    expect: {
      'legal-first': [P.firstName, 'filled'],
      'middle': [P.middleName, 'filled'],
      'legal-last': [P.lastName, 'filled'],
      'preferred': [P.preferredName, 'filled'],
      'email': [P.email, 'filled'],
      'email-confirm': ['typed-by-hand@example.com', null], // pre-filled: untouched
      'phone': [P.phone, 'filled'], // React-style controlled input
      'phone-ext': ['', null],
      'addr1': [P.addressLine1, 'filled'], // data-automation-id only
      'addr2': [P.addressLine2, 'filled'],
      'city': [P.city, 'filled'], // nearby text
      'state': ['CA', 'filled'], // option value for "California"
      'zip': [P.postalCode, 'filled'], // placeholder only
      'country': ['United States of America', 'filled'],
      'ec-name': ['', null], // required, but emergency contact: no outline
      'ec-phone': ['', null],
      'ec-email': ['', null],
      'ec-rel': ['', null],
      'ec-first': ['', null],
      'linkedin': [P.linkedin, 'filled'],
      'github': [P.github, 'filled'],
      'website': [P.portfolio, 'filled'],
      'school': [P.school, 'filled'],
      'degree': ["Bachelor's Degree", 'review'], // degree-family fallback
      'major': [P.major, 'filled'],
      'minor': [P.minor, 'filled'],
      'grad-month': ['05', 'filled'],
      'grad-year': [P.gradYear, 'filled'],
      'gpa': [P.gpa, 'filled'],
      'salary': ['', null], // required, but salary is ignored: no fill, no outline
      'auth': ['', 'unknown'], // required, mentions "United States"
      'hear': ['', null], // optional, no answer
      'hidden-first': ['', null],
      'invisible-email': ['', null],
      'disabled-city': ['', null],
    },
  },

  // Hand-written: standard answers in many wordings, Q&A bank, consent, signature.
  // A legend is context only inside its own fieldset: the questions after an
  // emergency-contact / references fieldset are the applicant's own.
  'generic/sections.html': {
    standard: STD,
    qa: [qa('name', 'Should never be used')],
    expect: {
      'first': [P.firstName, 'filled'],
      'phone': [P.phone, 'filled'],
      'linkedin': [P.linkedin, 'filled'],
      'ec-name': ['', null], // emergency contact: ignored, never outlined
      'ec-phone': ['', null],
      'city': [P.city, 'filled'],
      'email': [P.email, 'filled'],
      'ref-name': ['', null], // references: ignored
      'auth': ['1', 'filled'],
      'ecrel-parent': ['', null], // emergency contact: ignored
      'zip': [P.postalCode, 'filled'], // after it, inside a legend-less wrapper fieldset: the applicant's own
      'dis-yes': ['No, I do not have a disability and have not had one in the past', 'filled'],
    },
  },
  'generic/compliance.html': {
    standard: { ...STD, privacyAck: 'acknowledge' },
    qa: [
      qa('how did you hear about us', 'LinkedIn'),
      qa('what is your desired salary', '90000'),
      qa('are you willing to relocate', 'Yes'),
      qa('have you been convicted of a felony', 'No'),
      qa('do you have any relatives employed by acme', 'No'),
      qa('i agree to the terms and conditions', 'Yes'),
      qa('signature', 'Alexandra Rivera'),
      qa('additional information', 'Yes'),
    ],
    expect: {
      'hear': ['LinkedIn', 'filled'], // bank, exact
      'salary': ['', null], // salary: never filled or outlined, even with a bank entry
      'relocate': ['Yes', 'filled'],
      'felony-yes': ['', 'unknown'], // sensitive: one word off is not enough
      'relatives-yes': ['No', 'review'], // standard answer "relatives" (always orange); was a bank entry
      'auth': ['1', 'filled'], // standard: work authorization
      'sponsor': ['n', 'filled'], // "No, I will not require sponsorship"
      'other-yes': ['Yes', 'filled'],
      'prev-yes': ['No', 'review'], // always orange
      'client-yes': ['No', 'review'], // always orange
      'privacy': ['checked', 'review'], // owner chose "Acknowledge"; always orange
      'terms': ['', 'unknown'], // consent: never, even with an exact bank entry
      'alerts': ['', null], // marketing opt-in mentioning the Privacy Policy
      'customers': ['', null], // "working with customers" is not the client question
      'py-yes': ['', null], // "worked with Python" is not "previously employed"
      'signature': ['', 'unknown'], // never
      'gender': ['F', 'filled'],
      'hispanic': ['No', 'filled'],
      'race-white': ['Two or More Races (Not Hispanic or Latino)', 'filled'],
      'veteran': ['', 'unknown'], // two options mean "not protected": yellow
      'orientation': ['', null],
      'dis-yes': ['', null], // CC-305 checkboxes: only the "No" box is ticked
      'dis-no': ['checked', 'filled'],
      'dis-decline': ['', null],
      'eeo-name': [`${P.firstName} ${P.lastName}`, 'filled'],
      'eeo-date': [TODAY, 'review'],
      'ec-hear': ['', null], // emergency contact section: bank never used
      'agree-bare': ['', null], // "I agree" under a neutral legend: consent, never ticked
    },
  },

  // Phenom: contact step. Native selects; Country -> State rescan.
  'phenom/*_1790975061988.html': {
    capture: true,
    adapterName: 'phenom',
    expect: {
      'country': ['USA', 'filled'],
      'cntryFields.firstName': [P.firstName, 'filled'],
      'cntryFields.lastName': [P.lastName, 'filled'],
      'cntryFields.preferredName': ['Yes', 'filled'], // "Do you have a preferred name?"
      'cntryFields.addressLine1': [P.addressLine1, 'filled'],
      'cntryFields.city': [P.city, 'filled'],
      'cntryFields.region': ['USA-CA', 'filled'],
      'cntryFields.postalCode': [P.postalCode, 'filled'],
      'email': [P.email, 'filled'],
      'deviceType': ['Mobile', 'filled'],
      'phoneWidget.countryPhoneCode': ['USA_1', 'filled'], // "United States of America (+1)"
      'phoneWidget.phoneNumber': [P.phone, 'filled'],
      'source': ['', 'unknown'], // Q&A bank (Phase 3)
      'applicantSource': ['', 'unknown'],
      'noticeAgreement': ['', 'unknown'], // consent: never ticked
    },
  },
  // Phenom: EEO step. Standard answers across Phenom's wording.
  'phenom/*_1790974954664.html': {
    capture: true,
    adapterName: 'phenom',
    standard: STD,
    expect: {
      'eeoUSA.gender': ['Female', 'filled'], // "Please select your gender"
      // "...the ethnicity which most accurately describes...": option text
      // "Two or More Races (Not Hispanic or Latino) (United States of America)"
      'eeoUSA.ethnicity': ['Two_or_More_Races_United_States_of_America', 'filled'],
      'eeoUSA.veteranStatus': ['No, I am not a protected veteran', 'filled'],
      'eeoUSA.hispanicOrLatino': ['No', 'filled'],
      'agreementCheck': ['', 'unknown'], // e-signature authorization: never ticked
    },
  },
  // Same page, standard answers left blank: nothing EEO is filled.
  'phenom/*_dropdown_1790974977786.html': {
    capture: true,
    adapterName: 'phenom',
    standard: {},
    expect: {
      'eeoUSA.gender': ['', 'unknown'],
      'eeoUSA.ethnicity': ['', 'unknown'],
      'eeoUSA.veteranStatus': ['', 'unknown'],
      'eeoUSA.hispanicOrLatino': ['', null],
      'agreementCheck': ['', 'unknown'],
    },
  },

  // Greenhouse (first board): react-select dropdowns via harness.
  'greenhouse/job_boards_greenhouse_io_1790977356144.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: async (page) => {
      await harness('react-select.js')(page);
      await page.evaluate(([countries, months]) => window.installReactSelect({
        country: { options: countries },
        question_12114510007: { options: ['Yes', 'No'] },
        question_12114513007: { options: ['Yes', 'No'] },
        question_12114514007: { options: ['Yes', 'No'] },
        gender: { options: ['Male', 'Female', 'Decline To Self Identify'] },
        hispanic_ethnicity: { options: ['Yes', 'No', 'Decline To Self Identify'] },
        veteran_status: { options: [
          'I am not a protected veteran',
          'I identify as one or more of the classifications of protected veteran',
          "I don't wish to answer",
        ] },
        'school--0': { options: ['San Diego Christian College', 'San Diego State University'] },
        'degree--0': { options: ["Associate's Degree", "Bachelor's Degree", "Master's Degree"] },
        'discipline--0': { options: ['Computer Engineering', 'Computer Science'] },
        'end-month--0': { options: months },
      }), [GH_COUNTRIES, MONTH_NAMES]);
    },
    standard: STD,
    qa: [qa('are you willing to work in person for 12 weeks during the internship', 'Yes')],
    expect: {
      'first_name': [P.firstName, 'filled'],
      'last_name': [P.lastName, 'filled'],
      'email': [P.email, 'filled'],
      'country': ['+1', 'filled'], // shows flag + dial code once chosen
      'phone': [P.phone, 'filled'],
      'question_12114508007': [P.portfolio, 'filled'], // Website
      'question_12114509007': [P.linkedin, 'filled'], // LinkedIn Profile
      'question_12114510007': ['Yes', 'filled'], // Q&A bank, exact
      'question_12114513007': ['Yes', 'filled'], // "U.S. WORK AUTHORIZATION": standard
      'question_12114514007': ['No', 'filled'], // sponsorship: standard
      'question_12114516007': ['', null],
      'gender': ['Female', 'filled'],
      'hispanic_ethnicity': ['No', 'filled'],
      'veteran_status': ['I am not a protected veteran', 'filled'],
      // First (only) education entry, from the profile.
      'school--0': [P.school, 'filled'],
      'degree--0': ["Bachelor's Degree", 'review'], // degree family
      'discipline--0': [P.major, 'filled'],
      'end-month--0': ['May', 'filled'],
      'end-year--0': [P.gradYear, 'filled'],
    },
  },
  // Greenhouse, before the resume was attached: the required upload is outlined.
  'greenhouse/job_boards_greenhouse_io_1790976804905.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: async (page) => {
      await harness('react-select.js')(page);
      await page.evaluate((countries) => window.installReactSelect({ country: { options: countries } }), GH_COUNTRIES);
    },
    expect: {
      'first_name': [P.firstName, 'filled'],
      'resume': ['', 'unknown'], // required upload: outlined yellow, never touched
    },
  },
  'greenhouse/job_boards_greenhouse_io_dropdown_1790976825184.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: async (page) => {
      await harness('react-select.js')(page);
      await page.evaluate((countries) => window.installReactSelect({
        country: { options: countries, delay: 80 },
        'school--1': { options: ['San Diego State University'], delay: 80 },
      }), GH_COUNTRIES);
    },
    expect: {
      'first_name': [P.firstName, 'filled'],
      'preferred_name': [P.preferredName, 'filled'],
      'country': ['+1', 'filled'], // async options this time
      'school--1': [P.school, 'filled'], // first entry, even with index 1
    },
  },

  // Greenhouse (second board, the /embed/job_app page opened directly): work authorization
  // splits "Yes" into citizen / visa, a geo "Location (City)" typeahead, multi-select
  // demographics. Only question_69577159's options were captured; the rest are guesses.
  'greenhouse/job_boards_greenhouse_io_1790982739915.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: secondBoardHarness,
    standard: STD, // workAuth 'yes': two "Yes" options, cannot tell which
    expect: {
      'first_name': [P.firstName, 'filled'],
      'email': [P.email, 'filled'],
      'phone': [P.phone, 'filled'],
      'candidate-location': ['', 'unknown'], // "City, State, Country" options: no exact match
      'resume': ['', 'unknown'],
      'school--1': [P.school, 'filled'],
      'question_69577159': ['', 'unknown'],
      'question_69577160': ['No', 'filled'],
      'question_69577161': ['', 'unknown'], // relocate to NYC: bank only
      'question_69577162': [P.linkedin, 'filled'],
      'question_69577163': [P.gradYear, 'review'], // long label
    },
  },
  // Same page, owner's work authorization stored as "Yes: U.S. citizen or permanent resident".
  'greenhouse/job_boards_greenhouse_io_dropdown_1790982747340.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: secondBoardHarness,
    standard: { ...STD, workAuth: 'citizen' },
    expect: {
      'question_69577159': [GH_WORK_AUTH[0], 'filled'],
    },
  },

  // Greenhouse (third board, /embed/job_app page opened directly, 2026-10-02). No dropdown was
  // captured open: every option list below is a guess in Greenhouse's usual wording.
  // "Point of Data Transfer" is the GDPR notice: the privacyAck standard answer when its option acknowledges.
  'greenhouse/job_boards_greenhouse_io_1790995427463.html': {
    capture: true,
    adapterName: 'greenhouse',
    harness: async (page) => {
      await harness('react-select.js')(page);
      await page.evaluate((countries) => window.installReactSelect({
        country: { options: countries },
        'candidate-location': { options: ['San Diego, California, United States'] },
        question_69051876: { options: ['Yes', 'No'] },
        question_67493661: { options: ['Yes', 'No'] },
        question_67493662: { options: ['Yes', 'No'] },
        question_67493663: { options: ['I acknowledge'] },
        question_67493664: { options: ['Yes', 'No'] },
        gender: { options: ['Male', 'Female', 'Decline To Self Identify'] },
        hispanic_ethnicity: { options: ['Yes', 'No', 'Decline To Self Identify'] },
        veteran_status: { options: [
          'I am not a protected veteran',
          'I identify as one or more of the classifications of protected veteran',
          "I don't wish to answer",
        ] },
      }), GH_COUNTRIES);
    },
    standard: { ...STD, privacyAck: 'acknowledge' },
    expect: {
      'first_name': [P.firstName, 'filled'],
      'last_name': [P.lastName, 'filled'],
      'email': [P.email, 'filled'],
      'country': ['+1', 'filled'],
      'phone': [P.phone, 'filled'],
      'candidate-location': ['', 'unknown'], // geo typeahead: "City, State, Country" options, no exact match
      'resume': ['', 'unknown'],
      'question_67493660': [P.linkedin, 'filled'],
      'question_69051876': ['', 'unknown'], // "graduating in Spring 2028 or later?": bank / learn mode
      'question_67493661': ['Yes', 'filled'],
      'question_67493662': ['No', 'filled'],
      'question_67493663': ['I acknowledge', 'review'], // privacyAck: always orange
      'question_67493664': ['Yes', 'filled'], // "{company} may choose to consider you for other positions"
      'gender': ['Female', 'filled'],
      'hispanic_ethnicity': ['No', 'filled'],
      'veteran_status': ['I am not a protected veteran', 'filled'],
    },
  },
  // Same page, privacy acknowledgment left blank (the default): never filled, yellow (required).
  'greenhouse/job_boards_greenhouse_io_1790995427463.html#blank-privacy': {
    capture: true,
    file: 'greenhouse/job_boards_greenhouse_io_1790995427463.html',
    adapterName: 'greenhouse',
    harness: async (page) => {
      await harness('react-select.js')(page);
      await page.evaluate(() => window.installReactSelect({ question_67493663: { options: ['I acknowledge'] } }));
    },
    standard: STD,
    expect: {
      'question_67493663': ['', 'unknown'],
    },
  },

  // A company's own Next.js form (no ATS markers): generic adapter.
  // Radios sit one per <fieldset id="<name>">; the question is <label for="<name>">.
  [OWN_FORM]: {
    capture: true,
    adapterName: 'generic',
    standard: STD,
    expect: {
      'fullName': [`${P.firstName} ${P.lastName}`, 'filled'],
      'email': [P.email, 'filled'],
      'phone': [P.phone, 'filled'],
      'city': [P.city, 'filled'],
      'state': [P.state, 'filled'],
      'country': ['United States', 'filled'],
      'linkedin': [P.linkedin, 'filled'],
      'github': [P.github, 'filled'],
      [`radioBadge_${ownFormCompany()} Employee Referral_referral`]: ['', 'unknown'], // how did you hear: bank
      'radioBadge_High School / Secondary School_educationalBackground': ['', 'unknown'], // "highest ... completed": not the degree in progress
      'radioBadge_Yes_workAuthorization': ['Yes', 'filled'],
      'radioBadge_Yes_visaSponsorship': ['No', 'filled'],
      'cXVlczqSbdKDySzvR7B8-SqhOjSq': [`0${P.gradMonth}/${P.gradYear}`, 'review'], // "(month and year)"
      'cXVlczrGmGCEjZDAgtWL-WYVZ2QT': [P.major, 'review'],
      'radioBadge_Yes_demographicSurvey': ['', null], // opt-in, label not linked
      'radioBadge_Male_genderIdentity': ['Female', 'filled'],
      'radioBadge_Heterosexual / Straight_sexualOrientation': ['', null],
      'radioBadge_Asian (not Hispanic or Latino)_ethnicBackground': ['', 'unknown'], // no "two or more" option
      'radioBadge_Yes_disabled': ['No', 'filled'],
      'radioBadge_I am a veteran_veteranStatus': ['I am not a veteran', 'filled'],
    },
  },

  // CareerPuck: the Greenhouse form is in a cross-origin iframe; nothing to fill on top.
  'careerpuck/app_careerpuck_com_1790982298714.html': {
    capture: true,
    adapterName: 'generic',
    embedded: ['job-boards.greenhouse.io'], // iframe#grnhse_iframe
    expect: {},
  },

  // A company careers page (2026-10-02): the same Greenhouse embed (iframe#grnhse_iframe, ?for=<company>),
  // plus a hidden Google Tag Manager frame that is not a form.
  'embedded/*_1790994874513.html': {
    capture: true,
    adapterName: 'generic',
    embedded: ['job-boards.greenhouse.io'],
    expect: {},
  },

  // Avature step 3: personal info, select2 Country/State via harness.
  'avature/*_1790977944827.html': {
    capture: true,
    adapterName: 'avature',
    harness: async (page) => {
      await harness('select2.js')(page);
      await page.evaluate(() => window.installSelect2({
        9007: { options: ['Canada', 'United States of America', 'United States Minor Outlying Islands'] },
        9008: { options: ['CALIFORNIA', 'NORTH CAROLINA', 'VIRGINIA', 'WEST VIRGINIA'], delay: 120 },
        9016: { options: ['Yes', 'No'] },
      }));
    },
    expect: {
      '10473': [P.firstName, 'filled'],
      '9000': [P.middleName, 'filled'],
      '10474': [P.lastName, 'filled'],
      '9002_37': ['Yes', 'review'], // long preferred-name yes/no ("please select yes below; otherwise..."): orange
      '9005': [P.addressLine1, 'filled'],
      '9006': [P.addressLine2, 'filled'],
      '9007': ['United States of America', 'filled'],
      '9008': ['CALIFORNIA', 'filled'],
      '9009': [P.city, 'filled'],
      '9010': [P.postalCode, 'filled'],
      '9011': [P.email, 'filled'],
      '9012': [P.phone, 'filled'],
      '9016': ['', 'unknown'],
      '32764': ['', 'unknown'],
      '20527_1043734': ['', 'unknown'], // consent radio: never ticked
      '34681': ['', null], // WizardFieldHidden
      // Education dataset, first row: from the profile.
      '37299-1-0': [P.degree, 'filled'], // Degree name
      '37299-2-0': ['20', 'review'], // Type of Degree: "Bachelor's Degree" (family)
      '37299-3-0': [P.school, 'filled'], // University
      '37299-4-0_month': ['5', 'filled'], // End date = graduation
      '37299-4-0_year': [P.gradYear, 'filled'],
      '37299-5-0_month': ['', null], // Start date: no profile key
      '9017-1-0': ['', 'unknown'], // work history row: skipped, required -> yellow
    },
  },
  // Avature step 4: questions; education select2s revealed by a Yes answer.
  'avature/*_1790978063910.html': {
    capture: true,
    adapterName: 'avature',
    harness: async (page) => {
      await harness('select2.js')(page);
      await page.evaluate(() => window.installSelect2({
        10500: { options: ['San Diego Christian College', 'San Diego State University', 'University of San Diego'] },
        18199: { options: ["Associate's Degree", "Bachelor's Degree", "Master's Degree"] },
        46593: { options: ['Computer Engineering', 'Computer Science'] },
        10478: { options: ['LinkedIn', 'Job Board'] },
        12706: { options: ['Asian', 'Two or More Races', 'White', 'I do not wish to answer'] },
        12710: { options: [
          'Armed forces service medal veteran', 'Newly separated veteran', 'Non-Veteran',
          'Other Protected Veteran', 'Disabled veteran', 'Recently Separated Veteran',
          'I am a protected veteran but I choose not to self-identify the classifications to which I belong',
          'Veteran of the Vietnam Era - Disabled',
        ] },
      }));
    },
    standard: STD,
    expect: {
      '10500': [P.school, 'review'], // long label
      '18199': ["Bachelor's Degree", 'review'], // degree family
      '46593': [P.major, 'filled'],
      '10499': ['', 'unknown'], // country of the school, not home country
      '10478': ['', 'unknown'],
      '10480_37': ['Yes', 'filled'], // work authorization: standard
      '10530_37': ['No', 'review'], // "Have you ever worked at {company} before?": always orange
      '10522_37': ['', 'unknown'], // other LOCATIONS: not the standard question
      '12704_93': ['Female', 'filled'],
      '12705_741422': ['Non-Hispanic', 'filled'], // "Ethnicity" = Hispanic yes/no here
      '12706': ['Two or More Races', 'filled'],
      '12707_741285': ['No', 'filled'], // "Are you a veteran?"
      '12708_741285': ['No', 'filled'], // "Are you a protected veteran?"
      '12710': ['Non-Veteran', 'filled'],
      '13602_1182073': ['', null], // consent checkbox: never ticked
      '10498_37': ['', 'unknown'],
      '35979_month': ['', 'unknown'], // birth date: sensitive
      '12711': [`${P.firstName} ${P.lastName}`, 'filled'],
      '12712': ['', null], // WizardFieldHidden
      '21272': ['', 'unknown'], // required resume upload
    },
  },
  // Eightfold PCS: one-page form, custom comboboxes via harness.
  'eightfold/*_1790984477330.html': {
    capture: true,
    adapterName: 'eightfold',
    harness: eightfoldHarness(),
    standard: STD,
    expect: {
      'input-3': ['', 'unknown'], // resume picker: never filled, required
      'Contact_Information_firstname': [P.preferredName, 'filled'], // "Preferred First Name"
      'Contact_Information_lastname': [P.lastName, 'review'],
      'Contact_Information_email': ['', null], // readonly: comes from the account
      'input-15': ['No', 'review'], // legal name same as preferred? (Alex != Alexandra)
      'Contact_Information_q_phone-country-code-picker': ['United States (+1)', 'filled'],
      'Contact_Information_q_phone': [P.phone, 'filled'],
      'Contact_Information_q_cust_altPhoneNo': ['', null], // alternate phone: left empty
      'Contact_Information_q_address': [P.addressLine1, 'filled'],
      'Contact_Information_q_addressLine2': [P.addressLine2, 'filled'],
      'input-7': ['United States', 'filled'], // country, options load late
      'input-51': ['California', 'filled'],
      'Contact_Information_q_city': [P.city, 'filled'],
      'Contact_Information_q_zip': [P.postalCode, 'filled'],
      'input-42': ['Yes', 'filled'], // work authorization: standard
      'input-45': ['No', 'filled'], // sponsorship: standard
      'input-48': ['Two or More Races (Not Hispanic or Latino)', 'filled'],
      'input-54': ['Female', 'filled'],
      'input-57': ['', 'unknown'], // "U.S. Armed Forces Status": not a standard question
      'input-60': ['I am not a protected veteran', 'filled'],
      'input-30': ['', 'unknown'], // government employment: bank only
      'input-33': ['', 'unknown'], // non-compete
      'input-36': ['No', 'review'], // "ever worked with {company} as ... employee": previously employed
      'input-39': ['', 'unknown'], // subsidiary employee: not the client question
      'Job_specific_questions_200058986_1-0.0': ['', 'unknown'],
      'Acknowledgment_q_cust_disclaimer-56608-0': ['', 'unknown'], // consent: never
      'Acknowledgment_q_cust_disclaimer2-56608-0': ['', 'unknown'], // privacy ack left blank
      'Acknowledgment_q_cust_Candidatecodeofconduct-56608-0': ['', 'unknown'],
    },
  },
  // Same form: privacy ack opted in; a "yes" bank entry must not tick the other boxes.
  'eightfold/*_dropdown_1790984490034.html': {
    capture: true,
    adapterName: 'eightfold',
    // No California on this list: the typed query must not stay behind as an answer.
    harness: eightfoldHarness({ Contact_Information_q_state: { options: ['Texas', 'Virginia'] } }),
    standard: { ...STD, privacyAck: 'acknowledge' },
    qa: [qa('yes', 'Yes')],
    expect: {
      'input-15': ['No', 'review'], // captured open: closed by the sanitizer, reopened by us
      'input-51': ['', 'unknown'], // State: nothing matches, query cleared
      'Acknowledgment_q_cust_disclaimer-56608-0': ['', 'unknown'],
      'Acknowledgment_q_cust_disclaimer2-56608-0': ['checked', 'review'], // "agree to the Data Privacy Notice"
      'Acknowledgment_q_cust_Candidatecodeofconduct-56608-0': ['', 'unknown'],
    },
  },

  // Avature step 6: only hidden fields.
  'avature/*_1790977929206.html': {
    capture: true,
    adapterName: 'avature',
    expect: {
      '13227': ['', null],
    },
  },

  // Workday (one tenant, 5 steps), real captures. The adapter is forced (file://), the company comes from the page.
  // Step 1: My Information.
  'workday/*_1790992329739.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: STD,
    expect: {
      'source--source': ['', 'unknown'], // required prompt, no profile key
      'v98l6': ['No', 'review'], // "worked for or with {company}": previously employed answer, always orange
      'country--country': [wdOpt('country--country', WD_COUNTRIES, 'United States of America'), 'filled'],
      'name--legalName--firstName': [P.firstName, 'filled'],
      'name--legalName--lastName': [P.lastName, 'filled'],
      'name--preferredCheck': ['checked', 'filled'], // derived: Alex != Alexandra
      'address--addressLine1': [P.addressLine1, 'filled'],
      'address--city': [P.city, 'filled'],
      'address--countryRegion': [wdOpt('address--countryRegion', WD_STATES, 'California'), 'filled'],
      'address--postalCode': [P.postalCode, 'filled'],
      'address--regionSubdivision1': ['', null], // County (optional): not the state
      'phoneNumber--phoneType': [wdOpt('phoneNumber--phoneType', ['Mobile', 'Home', 'Work'], 'Mobile'), 'filled'],
      'phoneNumber--countryPhoneCode': ['', 'filled'], // prompt: the pick is a pill
      'phoneNumber--phoneNumber': [P.phone, 'filled'],
      'phoneNumber--extension': ['', null],
      'v98l5': ['', null], // label-less SMS opt-in: never ticked, not even outlined
    },
  },
  // Step 2, early: one empty Work Experience, no education yet.
  'workday/*_1790992818101.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: STD,
    expect: {
      'workExperience-6--jobTitle': ['', 'unknown'], // repeaters are skipped; required ones yellow
      'workExperience-6--companyName': ['', 'unknown'],
      'workExperience-6--startDate-dateSectionMonth-input': ['', 'unknown'], // From*
      'workExperience-6--endDate-dateSectionMonth-input': ['', 'unknown'], // To*
      'workExperience-6--location': ['', null],
      'skills--skills': ['', null],
    },
  },
  // Step 2, full: three work experiences (the third is "currently work here": no To date) and Education 1.
  'workday/*_1790993112312.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: STD,
    expect: {
      'workExperience-893--jobTitle': ['', 'unknown'],
      'workExperience-893--companyName': ['', 'unknown'],
      'workExperience-893--location': ['', null],
      'workExperience-893--currentlyWorkHere': ['', null], // never ticked
      'workExperience-893--startDate-dateSectionMonth-input': ['', 'unknown'],
      'workExperience-893--endDate-dateSectionMonth-input': ['', 'unknown'],
      'workExperience-894--jobTitle': ['', 'unknown'],
      'workExperience-895--companyName': ['', 'unknown'],
      'workExperience-895--startDate-dateSectionMonth-input': ['', 'unknown'],
      // Education 1: from the profile.
      'education-896--school': ['', 'filled'], // prompt: pill
      'education-896--degree': [wdOpt('education-896--degree', WD_DEGREES, 'B.S. - Bachelor of Science'), 'filled'],
      'education-896--fieldOfStudy': ['', 'filled'], // prompt: pill
      'education-896--gradeAverage': [P.gpa, 'filled'],
      'education-896--firstYearAttended-dateSectionYear-input': ['', null], // "From": no profile key
      'education-896--lastYearAttended-dateSectionYear-input': [P.gradYear, 'filled'], // "To (Actual or Expected)": year-only
      'skills--skills': ['', null],
    },
  },
  // Same page with the Degree dropdown frozen open: the harness removes it and takes its rows as the options.
  'workday/*_dropdown_1790993120469.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG_HARVEST),
    standard: STD,
    expect: {
      'education-896--degree': [wdOpt('education-896--degree', WD_DEGREES, 'B.S. - Bachelor of Science'), 'filled'], // "B.S. - Bachelor of Science"
      'education-896--school': ['', 'filled'],
      'education-896--lastYearAttended-dateSectionYear-input': [P.gradYear, 'filled'],
      'workExperience-893--jobTitle': ['', 'unknown'],
    },
  },
  // Step 3: Application Questions.
  'workday/*_1790993102051.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: STD,
    expect: WD_QUESTIONS(),
  },
  // Same page, the owner holds none of the statuses: "No"; left blank: never filled (yellow, required).
  'workday/*_1790993102051.html#citizenship-none': {
    capture: true,
    file: 'workday/*_1790993102051.html',
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: { ...STD, citizenship: 'none' },
    expect: { [wq('citizen')]: [wdOpt(wq('citizen'), WD_YN, 'No'), 'review'] },
  },
  'workday/*_1790993102051.html#citizenship-blank': {
    capture: true,
    file: 'workday/*_1790993102051.html',
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: { ...STD, citizenship: '' },
    expect: { [wq('citizen')]: ['', 'unknown'] },
  },
  // Same page with question 1 (Yes / No) frozen open.
  'workday/*_dropdown_1790993107997.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG_HARVEST),
    standard: STD,
    expect: WD_QUESTIONS(),
  },
  // Step 4: Voluntary Disclosures. EEO CheckboxGroup = one question, one box ticked.
  'workday/*_1790993097547.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness(WD_CFG),
    standard: STD,
    expect: {
      'personalInfoUS--gender': [wdOpt('personalInfoUS--gender', WD_GENDERS, 'Female'), 'filled'],
      'b81c649a5bdc101fb1a2441a8cbfec66-ethnicityMulti': ['', 'filled'], // the group's result (first box); American Indian: not ticked
      'b81c649a5bdc101fb1a2503a80a9ec78-ethnicityMulti': ['', null], // Hispanic or Latino: not ticked
      'b81c649a5bdc101fb1a2488448b1ec6d-ethnicityMulti': ['checked', null], // Two or More Races: the race answer
      'b81c649a5bdc101fb1a251ab5a33ec7b-ethnicityMulti': ['', null], // White
      'personalInfoUS--veteranStatus': [wdOpt('personalInfoUS--veteranStatus', ['I am not a protected veteran',
        'I identify as one or more of the classifications of protected veteran', 'I do not wish to self-identify'], 'I am not a protected veteran'), 'filled'],
      'termsAndConditions--acceptTermsAndAgreements': ['', 'unknown'], // consent: never ticked, yellow (required)
    },
  },
  // Step 5: Review. Read-only echoes: no fields, and the Workday adapter (not the generic one) says so.
  'workday/*_1790993092492.html': {
    capture: true,
    adapterName: 'workday',
    harness: wdHarness({}),
    standard: STD,
    expect: {},
  },
};

let browser;
let page;

test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

/** Records anything that looks like navigation: clicks on buttons/links, submit, reset. */
function watchNavigation() {
  window.__nav = [];
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('button, a[href], input[type=submit], input[type=reset]');
    // Dropdown openers and options inside a listbox are form widgets (Eightfold
    // options are <button type=button role=option>); every other button counts.
    const widget = t && (t.getAttribute('aria-haspopup') === 'listbox' ||
      (t.getAttribute('role') === 'option' && t.closest('[role=listbox]')));
    if (t && !widget) window.__nav.push('click ' + t.tagName + ' ' + (t.id || t.className));
  }, true);
  document.addEventListener('submit', () => window.__nav.push('submit'), true);
  document.addEventListener('reset', () => window.__nav.push('reset'), true);
}

// In-page timing wrappers for AF_PROFILE runs: { total, parts: { name: [ms, calls] } }.
function profileHooks() {
  const prof = (window.__prof = { parts: {} });
  const wrap = (obj, key, name) => {
    const fn = obj && obj[key];
    if (typeof fn !== 'function' || fn.__wrapped) return;
    const w = function (...args) {
      const t = performance.now();
      const done = () => {
        const p = prof.parts[name] || (prof.parts[name] = [0, 0]);
        p[0] += performance.now() - t;
        p[1]++;
      };
      const r = fn.apply(this, args);
      if (r && typeof r.then === 'function') return r.finally(done);
      done();
      return r;
    };
    w.__wrapped = true;
    obj[key] = w;
  };
  wrap(AF.widgets, 'settle', 'settle');
  // fillPopup, bucketed by outcome: a widget the saved page cannot open (no harness
  // config) waits out every timeout and would dominate the totals.
  const popup = AF.widgets.fillPopup;
  AF.widgets.fillPopup = function (...args) {
    const t = performance.now();
    return popup.apply(this, args).then((r) => {
      const name = 'fillPopup:' + (r && r.status);
      const p = prof.parts[name] || (prof.parts[name] = [0, 0]);
      p[0] += performance.now() - t;
      p[1]++;
      return r;
    });
  };
  wrap(AF.widgets, 'waitFor', 'waitFor(direct)');
  wrap(AF.filler, 'fill', 'filler.fill');
  wrap(AF.filler, 'fillChoice', 'filler.fillChoice');
  wrap(AF.company, 'detect', 'company.detect');
  wrap(AF.standard, 'detect', 'standard.detect');
  wrap(AF.matcher, 'matchField', 'matcher.matchField');
  wrap(AF.qa, 'lookup', 'qa.lookup');
  for (const [n, a] of Object.entries(AF.adapters)) {
    wrap(a, 'findFields', 'findFields');
    wrap(a, 'detect', 'detect:' + n);
  }
}

function readValues(ids) {
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) {
      out[id] = '(missing)';
      continue;
    }
    let v;
    const s2 = el.tagName === 'SELECT' && el.closest('.fieldSpec') && el.closest('.fieldSpec').querySelector('.select2-selection__rendered');
    if (el.matches('input.select__input')) {
      const sv = el.closest('.select__container').querySelector('.select__single-value');
      v = sv ? sv.textContent.trim() : '';
    } else if (s2) {
      v = s2.querySelector('.select2-selection__placeholder') ? '' : s2.textContent.trim();
    } else if (el.tagName === 'SELECT') {
      v = el.selectedIndex >= 0 && el.value === '' ? '' : el.value || el.selectedOptions[0].textContent;
    } else if (el.type === 'radio') {
      const on = document.querySelector(`input[type=radio][name="${el.name}"]:checked`);
      v = on ? (on.labels[0] ? on.labels[0].textContent.trim() : on.value) : '';
    } else if (el.type === 'checkbox') {
      v = el.checked ? 'checked' : '';
    } else {
      v = el.value;
    }
    out[id] = v;
  }
  return out;
}

// A CASES key may carry a "#variant" suffix (same page, other answers): `file` names the page then.
for (const [name, c] of Object.entries(CASES)) {
  const file = c.file || name;
  const skip = c.capture && !hasFixture(file) ? 'capture not on this machine (gitignored)' : false;
  test(`fixture ${name}`, { skip }, async (t) => {
    if (c.capture) await openCapture(page, file);
    else await page.goto(fixtureUrl(file));
    await page.evaluate(watchNavigation);
    if (c.harness) await c.harness(page);
    await injectScripts(page);

    const data = { profile: P, qaEntries: c.qa || [], standardAnswers: c.standard || {} };
    // AF_PROFILE=1: time the pass and its parts (measurement only; no behavior change).
    if (process.env.AF_PROFILE) await page.evaluate(profileHooks);
    const out = await page.evaluate(async (d) => {
      const t0 = performance.now();
      const r = await AF.autofill.run({ ...d, quiet: true });
      if (window.__prof) window.__prof.total = performance.now() - t0;
      window.__lastResults = r.results.map((x) => [x.el.tagName, x.el.id || x.el.name || '', x.desc.label, x.desc.hints,
        x.desc.context, x.desc.inputType, !!x.desc.required, x.match && x.match.key, x.status, x.state]);
      return {
        adapter: r.adapter,
        counts: r.counts,
        embedded: r.embedded,
        states: Object.fromEntries(r.results.map((x) => [x.el.id, x.state])),
        marked: Array.from(document.querySelectorAll('[data-af-state]')).map((n) => n.getAttribute('data-af-state')),
      };
    }, data);
    // Let React-style imitations re-render before reading values.
    await page.waitForTimeout(50);
    const values = await page.evaluate(readValues, Object.keys(c.expect));

    // AF_DUMP=<file>: the pass's results, structure only (no values): an equivalence
    // check for refactors (same fields, same order, same descriptors and outcomes).
    if (process.env.AF_DUMP) {
      const dump = await page.evaluate(async () => (window.__lastResults || []));
      fs.appendFileSync(process.env.AF_DUMP, JSON.stringify({ name, results: dump }) + '\n');
    }
    if (process.env.AF_PROFILE) {
      const prof = await page.evaluate(() => window.__prof);
      fs.appendFileSync(process.env.AF_PROFILE, JSON.stringify({ name, adapter: out.adapter, ...prof }) + '\n');
    }
    if (c.adapterName) {
      await t.test('adapter detected', () => assert.equal(out.adapter, c.adapterName));
    }
    if (c.embedded) {
      await t.test('embedded ATS frame reported', () => assert.deepEqual(out.embedded, c.embedded));
    }
    for (const id of Object.keys(c.expect)) {
      await t.test(id, () => assert.deepEqual([values[id], out.states[id] || null], c.expect[id]));
    }

    await t.test('no navigation: nothing pressed, no submit/reset', async () => {
      assert.deepEqual(await page.evaluate(() => window.__nav), []);
      assert.equal(await page.evaluate(() => window.__clicked), undefined);
    });

    await t.test('summary counts agree with outlines on the page', () => {
      for (const s of ['filled', 'review', 'unknown']) {
        assert.equal(out.counts[s], out.marked.filter((x) => x === s).length, s);
      }
    });

    await t.test('no popup left open', async () => {
      const h = await page.evaluate(() => window.__harness || { open: 0, maxOpen: 0 });
      assert.equal(h.open, 0);
      assert.ok(h.maxOpen <= 1, 'two popups were open at once');
    });

    await t.test('running twice changes nothing (no overwrite)', async () => {
      const again = await page.evaluate(async (d) => {
        const r = await AF.autofill.run({ ...d, quiet: true });
        return r.results.filter((x) => x.status === 'filled').map((x) => x.el.id);
      }, data);
      assert.deepEqual(again, []);
    });
  });
}
