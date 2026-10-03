/*
 * options/options.js
 *
 * Profiles (pick / edit / activate / new / duplicate / rename / delete), the
 * profile form (built from FIELDS), standard answers, the Q&A bank,
 * learn-mode switch, the {company} conversion of old Q&A entries, and
 * export / import. The Q&A table filters / sorts by hiding and reordering its
 * existing rows, and tracks unsaved edits per row (see "Row model" below).
 *
 * Why the "dirty" bookkeeping: learn mode and the popup write to storage while
 * this page is open, and we re-render on browser.storage.onChanged. Re-rendering
 * a form the owner is typing in would wipe the edits, so each editable area
 * tracks whether it has unsaved changes and, when dirty, shows a notice
 * instead of reloading.
 *
 * All data reaches the DOM through textContent / .value, never innerHTML.
 */
'use strict';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const PHONE_TYPES = ['Mobile', 'Home', 'Work'];

// [section, [[key, label, inputType]]]
const FIELDS = [
  ['Name', [
    ['firstName', 'Legal first name', 'text'],
    ['middleName', 'Middle name', 'text'],
    ['lastName', 'Legal last name', 'text'],
    ['preferredName', 'Preferred first name', 'text'],
  ]],
  ['Contact', [
    ['email', 'Email', 'email'],
    ['phone', 'Phone', 'tel'],
    ['phoneType', 'Phone type', 'phone-type-select'],
  ]],
  ['Address', [
    ['addressLine1', 'Address line 1', 'text'],
    ['addressLine2', 'Address line 2', 'text'],
    ['city', 'City', 'text'],
    ['state', 'State (e.g. CA)', 'text'],
    ['postalCode', 'ZIP / postal code', 'text'],
    ['country', 'Country', 'text'],
  ]],
  ['Links', [
    ['linkedin', 'LinkedIn URL', 'url'],
    ['github', 'GitHub URL', 'url'],
    ['portfolio', 'Portfolio / website', 'url'],
  ]],
  ['Education', [
    ['school', 'School', 'text'],
    ['degree', 'Degree (e.g. Bachelor of Science)', 'text'],
    ['major', 'Major', 'text'],
    ['minor', 'Minor', 'text'],
    ['gradMonth', 'Graduation month', 'month-select'],
    ['gradYear', 'Graduation year', 'number'],
    ['gpa', 'GPA', 'text'],
  ]],
];

const $ = (id) => document.getElementById(id);
const form = $('profile-form');
const stdForm = $('standard-form');
const statusEl = $('status');
const profileSelect = $('profile-select');
const qaBody = $('qa-body');

// Last data read from storage, which profile is open in the form, unsaved-edit flags.
let data = null;
let editedId = null;
const dirty = { profile: false, standard: false, qa: false };
let statusTimer = null;

function say(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', !!isError);
  clearTimeout(statusTimer);
  if (text && !isError) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

async function guard(fn) {
  try { await fn(); } catch (err) { say(err.message, true); }
}

// ---------------------------------------------------------------- profile form

function buildForm() {
  for (const [section, fields] of FIELDS) {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = section;
    fs.appendChild(legend);
    for (const [key, text, type] of fields) {
      const label = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = text;
      let input;
      if (type === 'month-select') {
        input = document.createElement('select');
        input.add(new Option('—', ''));
        MONTHS.forEach((m, i) => input.add(new Option(m, String(i + 1))));
      } else if (type === 'phone-type-select') {
        // Matching also accepts "Cell" for Mobile, "Landline" for Home, etc.
        input = document.createElement('select');
        input.add(new Option('—', ''));
        PHONE_TYPES.forEach((t) => input.add(new Option(t, t)));
      } else {
        input = document.createElement('input');
        input.type = type;
      }
      input.name = key;
      label.append(span, input);
      fs.appendChild(label);
    }
    form.appendChild(fs);
  }
}

function fillForm() {
  const p = data.profiles.find((x) => x.id === editedId);
  for (const key of Object.keys(AF.storage.EMPTY_PROFILE)) {
    if (form.elements[key]) form.elements[key].value = p.data[key] || '';
  }
  dirty.profile = false;
  $('profile-notice').hidden = true;
}

function renderProfiles() {
  profileSelect.textContent = '';
  for (const p of data.profiles) {
    const o = new Option(p.name + (p.id === data.activeProfileId ? ' (active)' : ''), p.id);
    profileSelect.add(o);
  }
  profileSelect.value = editedId;
  const isActive = editedId === data.activeProfileId;
  const marker = $('active-marker');
  const active = data.profiles.find((p) => p.id === data.activeProfileId);
  marker.textContent = isActive ? 'Active: used for filling' : 'Filling uses: ' + active.name;
  marker.classList.toggle('off', !isActive);
  $('use-profile').disabled = isActive;
  $('profile-delete').disabled = data.profiles.length <= 1;
}

// ---------------------------------------------------------------- standard answers

function buildStandard() {
  for (const q of AF.standard.QUESTIONS) {
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = q.label;
    if (q.eeo) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = 'EEO';
      span.append(' ', t);
    }
    if (q.alwaysReview) {
      const t = document.createElement('span');
      t.className = 'tag review';
      t.textContent = '(always outlined orange)';
      span.append(' ', t);
    }
    const sel = document.createElement('select');
    sel.name = q.id;
    sel.add(new Option('— leave blank (never filled) —', ''));
    for (const a of q.answers) sel.add(new Option(a.text, a.id));
    label.append(span, sel);
    stdForm.appendChild(label);
  }
}

function renderStandard() {
  for (const q of AF.standard.QUESTIONS) stdForm.elements[q.id].value = data.standardAnswers[q.id] || '';
  dirty.standard = false;
}

// ---------------------------------------------------------------- Q&A bank

const norm = (s) => AF.matcher.normalize(s);
const splitAliases = (s) => [...new Set(String(s).split(',').map(norm).filter(Boolean))];

/*
 * Row model. Every row <tr> carries its stored values in tr._base (what the
 * inputs showed when the row was built or last reverted); a row is "dirty" when
 * its inputs differ from that. Searching, filtering and sorting only hide /
 * show / reorder these existing rows, so unsaved edits are never lost. Rows
 * are rebuilt from storage by renderQA(), which keeps every dirty row as it is.
 */
const COMPANY_RE = /\{company\}/i;
const ROW_KEYS = ['question', 'aliases', 'answer', 'sensitive'];

function makeField(tag, value, label, cls) {
  const el = document.createElement(tag);
  if (tag === 'input') el.type = 'text'; else el.rows = 1;
  el.value = value || '';
  el.className = cls;
  el.setAttribute('aria-label', label);
  return el;
}

function sensitiveSelect(value, label) {
  const sel = document.createElement('select');
  for (const c of AF.qa.CATEGORIES) sel.add(new Option(c.label, c.id));
  sel.value = value || '';
  sel.setAttribute('aria-label', label);
  return sel;
}

const rowField = (tr, cls) => tr.querySelector('.' + cls);
const rowValues = (tr) => Object.fromEntries(ROW_KEYS.map((k) => [k, rowField(tr, k === 'question' ? 'q' : k).value]));

function setRowValues(tr, e) {
  rowField(tr, 'q').value = e.question || '';
  rowField(tr, 'aliases').value = (e.aliases || []).join(', ');
  rowField(tr, 'answer').value = e.answer || '';
  rowField(tr, 'sensitive').value = e.sensitive || '';
}

// Auto-grow a textarea to fit its text. Hidden rows have no layout: they are grown when shown.
function grow(ta) {
  if (ta.offsetParent === null) return false;
  ta.style.height = 'auto';
  const h = ta.scrollHeight + (ta.offsetHeight - ta.clientHeight);
  if (h > 0) ta.style.height = h + 'px';
  return true;
}

function growRow(tr) {
  const a = grow(rowField(tr, 'q'));
  grow(rowField(tr, 'answer'));
  return a;
}

// Re-evaluate one row's unsaved state: highlight, Revert button, {company} tag.
function syncRow(tr) {
  const cur = rowValues(tr);
  const isDirty = ROW_KEYS.some((k) => cur[k] !== tr._base[k]);
  tr.classList.toggle('row-dirty', isDirty);
  tr.querySelector('.row-revert').hidden = !isDirty;
  tr.querySelector('.unsaved').hidden = !isDirty;
  tr.querySelector('.company-tag').hidden = !COMPANY_RE.test(cur.question + '\n' + cur.answer);
}

function buildRow(e) {
  const tr = document.createElement('tr');
  tr.dataset.id = e.id;
  const q = makeField('textarea', e.question, 'Question', 'q');
  const al = makeField('input', (e.aliases || []).join(', '), 'Aliases', 'aliases');
  const an = makeField('textarea', e.answer, 'Answer', 'answer');
  const se = sensitiveSelect(e.sensitive, 'Sensitive');
  se.className = 'sensitive';
  const tag = document.createElement('span');
  tag.className = 'tag company-tag';
  tag.textContent = '{company}';
  tag.title = 'This entry uses the hiring company\'s name';
  tag.hidden = true;

  const date = document.createElement('td');
  date.className = 'date';
  date.textContent = e.updatedAt ? new Date(e.updatedAt).toISOString().slice(0, 10) : '';

  const actions = document.createElement('td');
  actions.className = 'actions';
  const button = (cls, text) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = text;
    return b;
  };
  const revert = button('row-revert', 'Revert');
  revert.hidden = true;
  revert.title = 'Restore this row to what is stored';
  const unsaved = document.createElement('span');
  unsaved.className = 'unsaved';
  unsaved.textContent = 'Unsaved';
  unsaved.hidden = true;
  const box = document.createElement('div');
  box.className = 'action-box';
  box.append(button('row-save', 'Save'), revert, button('row-delete', 'Delete'), unsaved);
  actions.appendChild(box);

  const cells = [[q, tag], [al], [an], [se]];
  for (const els of cells) {
    const td = document.createElement('td');
    td.append(...els);
    tr.appendChild(td);
  }
  tr.append(date, actions);
  tr._base = rowValues(tr);
  tr._updated = e.updatedAt || 0;
  tr._fresh = true; // not yet auto-grown
  syncRow(tr); // sets the {company} tag
  return tr;
}

// Rebuild the rows from `data`. Rows with unsaved edits are kept as they are (their entry may be gone: then dropped).
function renderQA() {
  const kept = new Map();
  for (const tr of qaBody.querySelectorAll('tr.row-dirty')) kept.set(tr.dataset.id, tr);
  const rows = [];
  data.qaBank.entries.forEach((e, i) => {
    const tr = kept.get(e.id) || buildRow(e);
    tr._index = i;
    rows.push(tr);
  });
  qaBody.replaceChildren(...rows);
  dirty.qa = rows.some((tr) => tr.classList.contains('row-dirty'));
  applyQAView({ reorder: true });
}

const byRecent = (a, b) => (b._updated - a._updated) || (b._index - a._index);
const byQuestion = (a, b) =>
  a._base.question.localeCompare(b._base.question, undefined, { sensitivity: 'base' }) || byRecent(a, b);

/*
 * Apply search + sensitivity filter by hiding rows (the rows are never rebuilt),
 * update the count, and, when asked, reorder the existing row elements.
 * Search looks at what the row shows now, so an edited row matches its new text.
 */
function applyQAView(opts) {
  const needle = $('qa-search').value.trim().toLowerCase();
  const cat = $('qa-filter').value;
  let rows = [...qaBody.children];
  if (opts && opts.reorder) {
    rows.sort($('qa-sort').value === 'question' ? byQuestion : byRecent);
    for (const tr of rows) qaBody.appendChild(tr);
  }
  let shown = 0;
  for (const tr of rows) {
    const v = rowValues(tr);
    const show = (cat === 'all' || (cat === 'none' ? v.sensitive === '' : v.sensitive === cat)) &&
      (!needle || [v.question, v.aliases, v.answer].join('\n').toLowerCase().includes(needle));
    const wasHidden = tr.hidden;
    tr.hidden = !show;
    if (show) {
      shown++;
      if ((wasHidden || tr._fresh) && growRow(tr)) tr._fresh = false;
    }
  }
  const total = rows.length;
  const filtering = !!needle || cat !== 'all';
  $('qa-count').textContent = filtering && shown !== total
    ? shown + ' of ' + total + ' shown'
    : total + (total === 1 ? ' entry' : ' entries');
  const empty = $('qa-empty');
  empty.hidden = shown > 0;
  empty.textContent = total === 0 ? 'No saved answers yet.' : 'No entries match the search or filter.';
}

function buildQAControls() {
  const filter = $('qa-filter');
  filter.add(new Option('All', 'all'));
  for (const c of AF.qa.CATEGORIES) filter.add(new Option(c.label, c.id === '' ? 'none' : c.id));
  filter.value = 'all';
  const sel = $('qa-add').querySelector('.add-sensitive');
  for (const c of AF.qa.CATEGORIES) sel.add(new Option(c.label, c.id));
}

function onRowEdit(ev) {
  const tr = ev.target.closest('tr');
  if (!tr) return;
  if (ev.target.tagName === 'TEXTAREA') grow(ev.target);
  syncRow(tr);
  dirty.qa = !!qaBody.querySelector('tr.row-dirty');
}
qaBody.addEventListener('input', onRowEdit);
qaBody.addEventListener('change', onRowEdit);

qaBody.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  const tr = ev.target.closest('tr');
  if (!btn || !tr) return;
  const id = tr.dataset.id;
  if (btn.classList.contains('row-delete')) {
    if (!confirm('Delete this Q&A entry?')) return;
    guard(async () => {
      await AF.storage.updateQA((entries) => entries.filter((e) => e.id !== id));
      await refresh({ force: ['qa'] });
      say('Entry deleted.');
    });
  } else if (btn.classList.contains('row-revert')) {
    const stored = data.qaBank.entries.find((e) => e.id === id);
    if (!stored) return say('This entry no longer exists.', true);
    setRowValues(tr, stored);
    tr._base = rowValues(tr);
    syncRow(tr);
    growRow(tr);
    dirty.qa = !!qaBody.querySelector('tr.row-dirty');
    say('Row restored.');
  } else if (btn.classList.contains('row-save')) {
    const question = norm(rowField(tr, 'q').value);
    if (!question) return say('A question is required.', true);
    const patch = {
      question,
      aliases: splitAliases(rowField(tr, 'aliases').value),
      answer: rowField(tr, 'answer').value,
      sensitive: rowField(tr, 'sensitive').value,
      updatedAt: Date.now(),
    };
    guard(async () => {
      await AF.storage.updateQA((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      // Saved: this row is clean, so the redraw rebuilds it from storage (other rows' edits are kept).
      tr.classList.remove('row-dirty');
      await refresh({ force: ['qa'] });
      say('Entry saved.');
    });
  }
});

$('qa-search').addEventListener('input', () => applyQAView());
$('qa-filter').addEventListener('change', () => applyQAView());
$('qa-sort').addEventListener('change', () => applyQAView({ reorder: true }));

// Column widths change with the window: refit the visible textareas.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { for (const tr of qaBody.children) if (!tr.hidden) growRow(tr); }, 150);
});

function addEntry() {
  const row = $('qa-add');
  const question = norm(row.querySelector('.add-question').value);
  if (!question) return say('A question is required.', true);
  const now = Date.now();
  const entry = {
    id: AF.storage.newId('qa'),
    question,
    aliases: splitAliases(row.querySelector('.add-aliases').value),
    answer: row.querySelector('.add-answer').value,
    sensitive: row.querySelector('.add-sensitive').value,
    createdAt: now,
    updatedAt: now,
  };
  guard(async () => {
    await AF.storage.updateQA((entries) => {
      // Same question already stored: replace it rather than keep a duplicate.
      const i = entries.findIndex((e) => e.question === question);
      if (i >= 0) { entries[i] = { ...entries[i], ...entry, id: entries[i].id, createdAt: entries[i].createdAt }; return entries; }
      return entries.concat(entry);
    });
    for (const i of row.querySelectorAll('input')) i.value = '';
    row.querySelector('.add-sensitive').value = '';
    await refresh({ force: ['qa'] });
    say('Entry added.');
  });
}

$('qa-add-btn').addEventListener('click', addEntry);
// Enter in any text box of the add row adds the entry, like the button.
$('qa-add').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing || !ev.target.matches('input')) return;
  ev.preventDefault();
  addEntry();
});

// ---------------------------------------------------------------- {company} migration

// Names typed by the owner win; otherwise the companies fill passes have seen.
function companyNames() {
  const typed = $('company-names').value.split(',').map((t) => t.trim()).filter(Boolean);
  return typed.length ? typed : (data.settings.companies || []);
}

function renderCompanies() {
  const names = companyNames();
  const list = $('company-matches');
  list.textContent = '';
  if (!$('company-names').value.trim() && (data.settings.companies || []).length) {
    $('company-names').placeholder = data.settings.companies.join(', ');
  }
  const convs = AF.qa.companyConversions(data.qaBank.entries, names);
  const doable = convs.filter((c) => !c.conflict);
  const summary = $('company-summary');
  summary.hidden = !convs.length;
  summary.textContent = convs.length
    ? convs.length + (convs.length === 1 ? ' saved question names' : ' saved questions name') + ' a company. Convert ' +
      (convs.length === 1 ? 'it' : 'them') + ' to the {company} form so ' + (convs.length === 1 ? 'it covers' : 'they cover') +
      ' every company?'
    : '';
  $('company-convert-all').hidden = doable.length < 2;
  for (const c of convs) {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    const from = document.createElement('span');
    from.textContent = c.from.question;
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    const to = document.createElement('strong');
    to.textContent = c.to.question;
    li.append(from, arrow, to);
    if (c.to.answer !== c.from.answer) {
      const ans = document.createElement('div');
      ans.className = 'note';
      ans.textContent = 'Answer: ' + c.to.answer;
      li.appendChild(ans);
    }
    const note = document.createElement('div');
    if (c.conflict) {
      note.className = 'conflict';
      note.textContent = 'Another entry already asks this with a different answer: edit or delete one of them first.';
    } else if (c.mergeInto) {
      note.className = 'merge';
      note.textContent = 'Same question and answer as another entry: the two become one.';
    }
    if (note.textContent) li.appendChild(note);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'company-convert';
    btn.textContent = 'Convert';
    btn.disabled = !!c.conflict;
    li.append(' ', btn);
    list.appendChild(li);
  }
}

async function convertCompanies(ids) {
  const names = companyNames();
  await AF.storage.updateQA((entries) => AF.qa.applyCompanyConversions(entries, names, ids));
  await refresh({ force: ['qa'] });
  say(ids.length === 1 ? 'Entry converted.' : ids.length + ' entries converted.');
}

$('company-scan').addEventListener('click', () => renderCompanies());
$('company-matches').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button.company-convert');
  if (!btn) return;
  if (dirty.qa) return say('Save or discard your row edits first.', true);
  guard(() => convertCompanies([btn.closest('li').dataset.id]));
});
$('company-convert-all').addEventListener('click', () => {
  if (dirty.qa) return say('Save or discard your row edits first.', true);
  const ids = AF.qa.companyConversions(data.qaBank.entries, companyNames()).filter((c) => !c.conflict).map((c) => c.id);
  guard(() => convertCompanies(ids));
});

// ---------------------------------------------------------------- loading / live updates

/**
 * Re-read storage and redraw. Areas with unsaved edits are left alone (and the
 * profile form shows a notice) unless named in opts.force (after our own save).
 */
async function refresh(opts) {
  const force = (opts && opts.force) || [];
  const fresh = await AF.storage.load();
  const prev = data;
  data = fresh;
  if (!data.profiles.some((p) => p.id === editedId)) {
    editedId = data.activeProfileId;
    dirty.profile = false;
  }
  renderProfiles();

  const old = prev && prev.profiles.find((p) => p.id === editedId);
  const cur = data.profiles.find((p) => p.id === editedId);
  if (!dirty.profile || force.includes('profile')) fillForm();
  else if (old && JSON.stringify(old.data) !== JSON.stringify(cur.data)) {
    $('profile-notice').hidden = false;
    $('profile-notice').textContent =
      'This profile changed elsewhere. Save to overwrite it with your edits, or switch profile and back to reload it.';
  }
  if (!dirty.standard || force.includes('standard')) renderStandard();
  if (!dirty.qa || force.includes('qa')) renderQA();
  renderCompanies();
  $('learn-mode').checked = !!data.settings.learnMode;
}

// ---------------------------------------------------------------- events

form.addEventListener('input', () => { dirty.profile = true; });
form.addEventListener('change', () => { dirty.profile = true; });
stdForm.addEventListener('change', () => { dirty.standard = true; });

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const d = {};
  for (const key of Object.keys(AF.storage.EMPTY_PROFILE)) d[key] = form.elements[key].value;
  guard(async () => {
    await AF.storage.saveProfile(d, editedId);
    await refresh({ force: ['profile'] });
    say('Saved.');
  });
});

stdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const obj = {};
  for (const q of AF.standard.QUESTIONS) obj[q.id] = stdForm.elements[q.id].value;
  guard(async () => {
    await AF.storage.saveStandardAnswers(obj);
    await refresh({ force: ['standard'] });
    say('Standard answers saved.');
  });
});

profileSelect.addEventListener('change', () => {
  if (dirty.profile && !confirm('Discard unsaved changes to this profile?')) {
    profileSelect.value = editedId;
    return;
  }
  editedId = profileSelect.value;
  fillForm();
  renderProfiles();
});

$('use-profile').addEventListener('click', () => guard(async () => {
  await AF.storage.setActiveProfile(editedId);
  await refresh();
  say('Now filling with this profile.');
}));

function currentName() {
  return data.profiles.find((p) => p.id === editedId).name;
}

// New / Duplicate switch the editor to the created profile.
async function addAndEdit(name, fromId) {
  if (dirty.profile && !confirm('Discard unsaved changes to this profile?')) return;
  const p = await AF.storage.addProfile(name, fromId);
  editedId = p.id;
  dirty.profile = false;
  await refresh({ force: ['profile'] });
  say('Profile "' + p.name + '" created.');
}

$('profile-new').addEventListener('click', () => {
  const name = prompt('Name for the new (empty) profile:', '');
  if (name && name.trim()) guard(() => addAndEdit(name, null));
});

$('profile-duplicate').addEventListener('click', () => {
  const name = prompt('Name for the copy:', currentName() + ' copy');
  if (name && name.trim()) guard(() => addAndEdit(name, editedId));
});

$('profile-rename').addEventListener('click', () => {
  const name = prompt('New name:', currentName());
  if (name && name.trim()) guard(async () => {
    await AF.storage.renameProfile(editedId, name);
    await refresh();
    say('Renamed.');
  });
});

$('profile-delete').addEventListener('click', () => {
  if (data.profiles.length <= 1) return say('The last profile cannot be deleted.', true);
  if (!confirm('Delete profile "' + currentName() + '"? This cannot be undone.')) return;
  guard(async () => {
    await AF.storage.deleteProfile(editedId);
    dirty.profile = false;
    await refresh({ force: ['profile'] });
    say('Profile deleted.');
  });
});

$('learn-mode').addEventListener('change', (e) => guard(async () => {
  await AF.storage.saveSettings({ learnMode: e.target.checked });
  say(e.target.checked ? 'Learn mode on.' : 'Learn mode off.');
}));

// ---------------------------------------------------------------- export / import

$('export-btn').addEventListener('click', () => guard(async () => {
  const json = JSON.stringify(await AF.storage.exportAll(), null, 2);
  const filename = 'formhand-export-' + new Date().toISOString().slice(0, 10) + '.json';
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  // A plain <a download>: no `downloads` permission needed (Firefox saves it like any download).
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.id = 'export-link';
  document.body.appendChild(a);
  a.click();
  a.remove();
  say('Export started: ' + filename);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}));

$('import-file').addEventListener('change', (e) => guard(async () => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (err) { throw new Error('Not valid JSON: ' + err.message); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Not an export file.');
  const np = (obj.profiles || []).length;
  const nq = ((obj.qaBank && obj.qaBank.entries) || []).length;
  const ns = Object.keys(obj.standardAnswers || {}).length;
  const ok = confirm('Import ' + np + ' profile(s), ' + nq + ' Q&A entr' + (nq === 1 ? 'y' : 'ies') + ' and ' +
    ns + ' standard answer(s)?\nThis merges into what you have; nothing is deleted.');
  if (!ok) return say('Import cancelled.');
  const r = await AF.storage.importAll(obj, AF.matcher.normalize);
  await refresh({ force: ['profile', 'standard', 'qa'] });
  say('Imported. Profiles: ' + r.profilesAdded + ' added, ' + r.profilesUpdated + ' updated. Q&A: ' +
    r.qaAdded + ' added, ' + r.qaUpdated + ' updated.');
}));

// ---------------------------------------------------------------- delete all data

$('delete-all').addEventListener('click', () => {
  const ok = confirm('Delete ALL Formhand data in this browser?\n\nEvery profile, your standard answers, the whole ' +
    'Q&A bank and all settings will be removed. This cannot be undone.\nUse Export first if you may want them back.');
  if (!ok) return say('Nothing was deleted.');
  guard(async () => {
    await AF.storage.clearAll();
    // Unsaved edits on this page are personal data too: drop them, then redraw from the (now empty) store.
    dirty.profile = dirty.standard = dirty.qa = false;
    $('company-names').value = '';
    for (const el of $('qa-add').querySelectorAll('input')) el.value = '';
    await refresh({ force: ['profile', 'standard', 'qa'] });
    say('All Formhand data was deleted from this browser.');
  });
});

// Changes made elsewhere (learn mode in a page, the popup, another tab).
if (window.browser && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener(() => { refresh().catch((err) => say(err.message, true)); });
}

async function init() {
  buildForm();
  buildStandard();
  buildQAControls();
  data = await AF.storage.load();
  editedId = data.activeProfileId;
  await refresh({ force: ['profile', 'standard', 'qa'] });
}

init().catch((err) => say('Load failed: ' + err.message, true));
