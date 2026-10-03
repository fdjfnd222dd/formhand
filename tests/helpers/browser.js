/*
 * Shared Playwright (Firefox) helpers for the DOM tests.
 *
 * We do not load the packaged extension here: we inject the same script files
 * background.js injects (minus core/run.js, which needs browser.storage) and
 * call AF.autofill.run() with a test profile. That exercises the real code in
 * real Firefox without the extension plumbing.
 *
 * Real captures under fixtures/<ats>/ are gitignored (they hold personal data),
 * so tests that use them skip when the file is missing, and every page is
 * loaded with the network blocked: saved pages still reference CDNs/trackers.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { firefox } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');

// Same order as background.js FILES, without core/run.js (it needs browser.storage).
const SCRIPTS = [
  'core/matcher.js',
  'core/standard.js',
  'core/qa.js',
  'core/company.js',
  'core/embed.js',
  'core/filler.js',
  'core/widgets.js',
  'core/feedback.js',
  'core/storage.js',
  'adapters/generic.js',
  'adapters/greenhouse.js',
  'adapters/avature.js',
  'adapters/phenom.js',
  'adapters/workday.js',
  'adapters/eightfold.js',
  'core/autofill.js',
  'core/learn.js',
];

const TEST_PROFILE = {
  firstName: 'Alexandra',
  middleName: 'Jane',
  lastName: 'Rivera',
  preferredName: 'Alex',
  email: 'alex.rivera@example.com',
  phone: '555-123-4567',
  phoneType: 'Mobile',
  addressLine1: '123 Main St',
  addressLine2: 'Apt 4B',
  city: 'San Diego',
  state: 'CA',
  postalCode: '92101',
  country: 'United States',
  linkedin: 'https://www.linkedin.com/in/alexrivera',
  github: 'https://github.com/alexrivera',
  portfolio: 'https://alexrivera.dev',
  school: 'San Diego State University',
  degree: 'Bachelor of Science',
  major: 'Computer Science',
  minor: 'Mathematics',
  gradMonth: '5',
  gradYear: '2027',
  gpa: '3.7',
};

async function launch() {
  const browser = await firefox.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Offline: saved pages must never phone home from a test run.
  await page.route('**/*', (route) =>
    route.request().url().startsWith('file:') ? route.continue() : route.abort()
  );
  return { browser, page };
}

async function injectScripts(page) {
  for (const s of SCRIPTS) await page.addScriptTag({ path: path.join(ROOT, s) });
}

/*
 * A capture can be named by a pattern, "<dir>/*_<timestamp>.html" ("*" as <dir> = any
 * folder): capture file names carry the host they were saved from, and the public tests
 * should not. The timestamp is unique; no match (capture not on this machine) gives a
 * path that does not exist, so the test skips.
 */
function fixturePath(rel) {
  if (!rel.includes('*')) return path.join(ROOT, 'fixtures', rel);
  const [dirPat, filePat] = rel.split('/');
  const re = new RegExp('^' + filePat.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  const base = path.join(ROOT, 'fixtures');
  const dirs = dirPat === '*'
    ? (fs.existsSync(base) ? fs.readdirSync(base).filter((d) => !['generic', 'stripped'].includes(d)) : [])
    : [dirPat];
  const hits = [];
  for (const d of dirs) {
    const dir = path.join(base, d);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) if (re.test(f)) hits.push(path.join(dir, f));
  }
  if (hits.length > 1) throw new Error(`capture pattern ${rel} matches ${hits.length} files`);
  return hits[0] || path.join(base, rel);
}

function fixtureUrl(rel) {
  return 'file://' + fixturePath(rel);
}

function hasFixture(rel) {
  return fs.existsSync(fixturePath(rel));
}

/**
 * Turn a capture taken mid-application back into a blank form, inside the page.
 * Runs before our scripts are injected. Without this every field is already
 * filled (no-overwrite would skip it) and a failing assertion would print the
 * real values. Covers what the captures actually contain: plain inputs,
 * native selects, radios/checkboxes, react-select single values (Greenhouse),
 * select2 rendered text and ajax-loaded options (Avature).
 */
function sanitizeInPage() {
  for (const el of document.querySelectorAll('input, textarea')) {
    const t = (el.type || '').toLowerCase();
    if (t === 'radio' || t === 'checkbox') {
      el.checked = false;
      el.removeAttribute('checked');
      if (el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', 'false');
    } else if (t !== 'hidden' && t !== 'file' && t !== 'submit' && t !== 'button') {
      el.value = '';
      el.removeAttribute('value');
    }
  }
  document.querySelectorAll('[role=radiogroup][aria-activedescendant]').forEach((g) => g.removeAttribute('aria-activedescendant'));
  for (const s of document.querySelectorAll('select')) {
    // Avature ajax selects hold only the placeholder plus the current value.
    if (s.closest('.AutoCompleteField, .AutocompleteSelectFieldUIWidget')) {
      Array.from(s.options).forEach((o) => { if (o.value !== '') o.remove(); });
    }
    Array.from(s.options).forEach((o) => { o.selected = false; o.removeAttribute('selected'); });
    s.selectedIndex = s.options.length && s.options[0].value === '' ? 0 : -1;
  }
  // Avature: hidden "selected value" echo inside labels, select2 rendered text.
  document.querySelectorAll('.screenReaderVisibility[id$="-labelValue"]').forEach((n) => { n.textContent = ''; });
  document.querySelectorAll('.select2-selection__rendered').forEach((n) => {
    n.textContent = '';
    n.removeAttribute('title');
    const ph = document.createElement('span');
    ph.className = 'select2-selection__placeholder';
    ph.textContent = 'Select an option';
    n.appendChild(ph);
  });
  // Eightfold: a popup frozen open renders inline in the widget.
  document.querySelectorAll('[class*="select-module_select-dropdown-overlay"]').forEach((n) => n.remove());
  document.querySelectorAll('[class*="select-module_select-wrapper"][aria-owns]').forEach((n) => n.removeAttribute('aria-owns'));
  // Close any popup frozen open in a _dropdown_ capture.
  document.querySelectorAll('.select2-container--open').forEach((c) => {
    if (c.querySelector('.select2-dropdown') && !c.querySelector('.select2-selection')) c.remove();
    else c.classList.remove('select2-container--open');
  });
  document.querySelectorAll('[aria-expanded="true"]').forEach((n) => n.setAttribute('aria-expanded', 'false'));
  // Greenhouse react-select: drop single values, restore placeholders, close menus.
  document.querySelectorAll('.select__menu').forEach((m) => m.remove());
  document.querySelectorAll('.select__value-container').forEach((vc) => {
    vc.classList.remove('select__value-container--has-value');
    vc.querySelectorAll('.select__single-value, .select__multi-value').forEach((n) => n.remove());
    if (!vc.querySelector('.select__placeholder')) {
      const ph = document.createElement('div');
      ph.className = 'select__placeholder';
      ph.textContent = 'Select...';
      vc.insertBefore(ph, vc.firstChild);
    }
  });
  document.querySelectorAll('input[role=combobox]').forEach((i) => i.removeAttribute('aria-controls'));
  // Workday: dropdown buttons show the answer (text, aria-label, value), prompts
  // show selected pills, dates echo their sections, uploads show the file name.
  document.querySelectorAll('[data-automation-id^="applyFlow"] button[aria-haspopup="listbox"]').forEach((b) => {
    const label = (b.getAttribute('aria-label') || '').replace(/\s+Required$/, '');
    const shown = b.textContent.trim();
    b.textContent = 'Select One';
    b.setAttribute('value', '');
    if (label) {
      const name = shown && label.endsWith(shown) ? label.slice(0, -shown.length).trim() : label.split(' ')[0];
      b.setAttribute('aria-label', name + ' Select One' + (/Required$/.test(b.getAttribute('aria-label')) ? ' Required' : ''));
    }
  });
  document.querySelectorAll('[data-automation-id="selectedItem"]').forEach((n) => n.remove());
  document.querySelectorAll('[data-automation-id$="-display"][data-automation-id^="dateSection"]').forEach((n) => { n.textContent = ''; });
  document.querySelectorAll('[data-automation-id="file-upload-item-name"]').forEach((n) => { n.textContent = ''; });
  // ... and echo them elsewhere: file name in the delete button / live region, prompt
  // picks in the aria instruction, dates in spinbutton aria values, the account e-mail.
  document.querySelectorAll('[data-automation-id="delete-file"]').forEach((n) => n.removeAttribute('aria-label'));
  document.querySelectorAll('[data-automation-id="ariaLiveMessage"], [data-automation-id="promptAriaInstruction"], [id^="helpText-"]')
    .forEach((n) => { n.textContent = ''; });
  document.querySelectorAll('[data-automation-id="selectedItemList"]').forEach((n) => { if (!n.querySelector('[role=option]')) n.remove(); });
  document.querySelectorAll('input[role="spinbutton"]').forEach((n) => {
    n.removeAttribute('aria-valuenow');
    n.removeAttribute('aria-valuetext');
  });
  document.querySelectorAll('span#emailAddress, #accountSettingsButton').forEach((n) => { n.textContent = ''; });
  // A Workday popup frozen open in a _dropdown_ capture (portaled to <body>) marks the
  // owner's pick; the Workday harness takes the option list from it, then removes it.
  document.querySelectorAll('[data-behavior-click-outside-close] [role="listbox"]').forEach((ul) => {
    ul.removeAttribute('aria-activedescendant');
    ul.querySelectorAll('[aria-selected]').forEach((o) => o.removeAttribute('aria-selected'));
  });
}

/** goto + sanitize + inject: the standard way to open a real capture. */
async function openCapture(page, rel) {
  await page.goto(fixtureUrl(rel), { waitUntil: 'domcontentloaded' });
  await page.evaluate(sanitizeInPage);
}

module.exports = {
  ROOT,
  SCRIPTS,
  TEST_PROFILE,
  launch,
  injectScripts,
  fixturePath,
  fixtureUrl,
  hasFixture,
  sanitizeInPage,
  openCapture,
};
