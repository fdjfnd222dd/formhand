'use strict';
// Shrinks a saved application page (fixtures/<ats>/*.html) down to its form structure
// and blanks every personal value, so the result can be read, grepped and quoted
// without leaking the owner's name, address, school or answers.
//
//   node tools/strip-fixture.js [fixtures/<ats>/file.html ...]
//
// No arguments = every *.html in the capture folders, i.e. every folder of fixtures/ except generic/ (hand-written)
// and stripped/ (the output).
// Output goes to fixtures/stripped/<ats>/<same name> (fixtures/* is gitignored).
// Built-ins only, regex based: it is a reading aid, not an HTML parser.
//
// Removed: script/style/svg/noscript/iframe/picture/video blocks, comments, link/meta/img/source
// tags (canonical link and og:url meta stay), inline style="", tracking-looking data-* attributes.
// Kept: class lists, ids, aria-*, names, labels, option lists.
// Blanked: input/textarea values (hidden inputs too: they can carry names or tokens),
// `selected`, radio/checkbox `checked`, react-select / select2 shown values, Avature -labelValue echoes,
// Avature review-page answers, Greenhouse uploaded file name, Workday dropdown buttons /
// prompt pills / date echoes / file names.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'fixtures');
// Capture folders are named by ATS (phenom, greenhouse, ...), by kind (embedded, inbox) or by site: list them.
const DEFAULT_DIRS = fs.existsSync(FIXTURES)
  ? fs.readdirSync(FIXTURES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !['generic', 'stripped'].includes(e.name)).map((e) => e.name).sort()
  : [];

// Blocks removed together with their content.
const BLOCK_TAGS = ['script', 'style', 'svg', 'noscript', 'iframe', 'picture', 'video'];
// Tags removed outright (no content).
const DROP_TAGS = new Set(['link', 'meta', 'img', 'source', 'use', 'base']);
// data-* attributes we keep (stable hooks the adapters use) ...
const KEEP_DATA = /^data-(automation-id|ph-id|af-[\w-]*)$/;
// ... and ones that look like tracking/analytics, dropped.
const TRACK_DATA = /^data-(ph-at-[\w-]*|track[\w-]*|analytics[\w-]*|ga-?[\w-]*|gtm[\w-]*|ev[\w-]*|testid|test-id|qa[\w-]*|bi-?[\w-]*|ym-?[\w-]*|omni[\w-]*|adobe[\w-]*|ccp[\w-]*|vars|nsite[\w-]*|s-[\w-]*)$/;

// An opening tag, tolerant of '>' inside quoted attribute values.
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR_RE = /([^\s"'=<>\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

// Elements whose text content is a shown value and gets emptied.
// Each: [tag, test(attrs map)].
const VALUE_ELEMENTS = [
  ['div', a => hasClass(a, 'select__single-value') || hasClass(a, 'select__multi-value')],
  ['span', a => hasClass(a, 'select2-selection__rendered') || /-labelValue$/.test(a.id || '')],
  ['div', a => hasClass(a, 'file-upload__filename')], // uploaded file name (Greenhouse)
  ['div', a => hasClass(a, 'article__content__view__field__value')], // Avature review page answers
  ['li', a => hasClass(a, 'select2-selection__choice')],
  // Workday: dropdown buttons show the answer (also in aria-label / value), prompt pills,
  // date section echoes, uploaded file names.
  ['button', a => a['aria-haspopup'] === 'listbox' && !/utilityMenuButton/.test(a['data-automation-id'] || '')],
  ['div', a => a['data-automation-id'] === 'selectedItem'],
  ['div', a => /^dateSection\w+-display$/.test(a['data-automation-id'] || '')],
  ['div', a => a['data-automation-id'] === 'file-upload-item-name'],
  ['p', a => a['data-automation-id'] === 'file-upload-item-name'],
  ['span', a => a['data-automation-id'] === 'file-upload-item-name'],
  // Workday read-only echoes (the account e-mail, every answer on the Review step):
  // label[for=X] + span#X. LABEL_FOR is filled per file before the tag pass.
  ['span', a => !!a.id && LABEL_FOR.has(a.id)],
];
let LABEL_FOR = new Set();

function hasClass(a, c) { return (' ' + (a.class || '') + ' ').includes(' ' + c + ' '); }

function unq(v) { return v == null ? '' : v.replace(/^["']|["']$/g, ''); }

function attrMap(s) {
  const m = {};
  let r; ATTR_RE.lastIndex = 0;
  while ((r = ATTR_RE.exec(s))) m[r[1].toLowerCase()] = unq(r[2]);
  return m;
}

// Rewrite one tag's attribute string. Returns null to drop the whole tag.
function rewriteTag(name, attrStr, inValueElement) {
  const a = attrMap(attrStr);
  const tag = name.toLowerCase();
  if (tag === 'link') {
    if (!/\bcanonical\b/i.test(a.rel || '')) return null;
  } else if (tag === 'meta') {
    if (a.property !== 'og:url') return null;
  } else if (DROP_TAGS.has(tag)) return null;

  const type = (a.type || 'text').toLowerCase();
  const keepValue = tag === 'input' && ['submit', 'button', 'radio', 'checkbox', 'reset', 'image'].includes(type);
  const isValueEl = VALUE_ELEMENTS.some(([t, test]) => t === tag && test(a));

  const out = attrStr.replace(ATTR_RE, (whole, key, val) => {
    const k = key.toLowerCase();
    if (k === 'style') return '';
    if (k.startsWith('data-')) {
      // Avature echoes entered values in data-hiddenvalue / data-value.
      if (k === 'data-hiddenvalue' || k === 'data-value') return key + '=""';
      if (KEEP_DATA.test(k)) return whole;
      if (TRACK_DATA.test(k)) return '';
      return whole;
    }
    if (tag === 'option' && k === 'selected') return '';
    if (tag === 'input' && (type === 'radio' || type === 'checkbox') && (k === 'checked')) return '';
    if (k === 'aria-checked' || k === 'aria-valuenow' || k === 'aria-valuetext') return key + '=""';
    if (tag === 'input' && k === 'value' && !keepValue) return 'value=""';
    if ((k === 'title' || k === 'aria-label' || k === 'value') && isValueEl) return '';
    return whole;
  });
  return { text: '<' + name + out + '>', valueEl: isValueEl };
}

function strip(html) {
  // 1. Whole blocks and comments.
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const t of BLOCK_TAGS) html = html.replace(new RegExp('<' + t + '\\b[\\s\\S]*?<\\/' + t + '\\s*>', 'gi'), '');
  // Unterminated or self-closed leftovers of the same tags.
  html = html.replace(new RegExp('<(' + BLOCK_TAGS.join('|') + ')\\b[^>]*\\/?>', 'gi'), '');
  // 2. Textarea contents.
  html = html.replace(/(<textarea\b(?:"[^"]*"|'[^']*'|[^'">])*>)[\s\S]*?(<\/textarea>)/gi, '$1$2');

  LABEL_FOR = new Set(Array.from(html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gi), (m) => m[1]));
  // 3. Tag pass: rewrite attributes, drop tags, empty value elements (depth counted per tag name).
  let out = '', last = 0, skip = null; // skip = { tag, depth }
  let m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    const [full, slash, name, attrs] = m;
    const text = html.slice(last, m.index);
    last = m.index + full.length;
    const lname = name.toLowerCase();
    if (skip) {
      // Inside a value element: discard text and inner tags, track nesting of same tag.
      if (lname === skip.tag) {
        if (slash) { skip.depth--; if (skip.depth === 0) { out += full; skip = null; } }
        else if (!/\/\s*$/.test(attrs)) skip.depth++;
      }
      continue;
    }
    out += text;
    if (slash) { out += full; continue; }
    const r = rewriteTag(name, attrs);
    if (r === null) continue;
    out += r.text;
    if (r.valueEl && !/\/\s*$/.test(attrs)) skip = { tag: lname, depth: 1 };
  }
  if (!skip) out += html.slice(last);

  // 4. Whitespace: collapse runs, one tag boundary per line so the file is greppable.
  out = out.replace(/\s+/g, ' ').replace(/> </g, '>\n<').replace(/>\s*(?=<)/g, '>\n');
  return out.trim() + '\n';
}

function defaultFiles() {
  const files = [];
  for (const d of DEFAULT_DIRS) {
    const dir = path.join(FIXTURES, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.html')) files.push(path.join(dir, f));
  }
  return files;
}

function main() {
  const args = process.argv.slice(2).map(f => path.resolve(f));
  const files = args.length ? args : defaultFiles();
  for (const file of files) {
    const ats = path.basename(path.dirname(file));
    const dest = path.join(FIXTURES, 'stripped', ats, path.basename(file));
    const src = fs.readFileSync(file, 'utf8');
    const res = strip(src);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, res);
    console.log(`${ats}/${path.basename(file)}: ${(src.length / 1024).toFixed(0)} KB -> ${(res.length / 1024).toFixed(0)} KB`);
  }
  if (!files.length) console.log('no fixtures found');
}

if (require.main === module) main();
module.exports = { strip };
