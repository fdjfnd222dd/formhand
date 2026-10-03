/*
 * Fallback behaviour: a broken or blind ATS adapter must never keep the page
 * from being filled.
 *
 *   - core/autofill.js (Firefox, Playwright): fake adapters registered on
 *     AF.adapters inside the page; run() falls back to the generic adapter when
 *     detect() / findFields() throw or an adapter finds nothing, unless the
 *     adapter says nothingToFill(doc). A throwing field.read() or cleanup()
 *     never rejects the pass.
 *   - background.js (pure Node, no Firefox): the injection loop is run in a vm
 *     with a stubbed `browser`; one broken adapter file must not stop the
 *     core files or the other adapters from being injected.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { launch, injectScripts, SCRIPTS, TEST_PROFILE, ROOT } = require('./helpers/browser');

/* ------------------------------------------------------------------ */
/* core/autofill.js with fake adapters                                  */
/* ------------------------------------------------------------------ */

const HTML = `
  <form id="f" onsubmit="return false">
    <label for="fn">First Name</label><input id="fn">
    <label for="ln">Last Name</label><input id="ln">
    <label for="em">Email Address</label><input id="em" type="email">
  </form>`;

let browser;
let page;

test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

// A fresh document and fresh scripts per case: AF.adapters is shared state.
async function fresh() {
  await page.goto('about:blank');
  await page.setContent(HTML);
  await injectScripts(page);
}

/**
 * Runs `setup` in the page (it registers fake adapters on AF.adapters; it
 * receives AF), then one pass with `opts`. Resolves a serializable summary.
 */
async function pass(setup, opts) {
  await fresh();
  return page.evaluate(async ({ setupSrc, profile, opts }) => {
    // eslint-disable-next-line no-new-func
    new Function('AF', 'document', setupSrc)(AF, document);
    let rejected = null;
    let r = null;
    try {
      r = await AF.autofill.run({ profile, quiet: true, company: null, ...(opts || {}) });
    } catch (err) {
      rejected = String(err && err.message || err);
    }
    const values = Object.fromEntries(['fn', 'ln', 'em'].map((id) => [id, document.getElementById(id).value]));
    return {
      rejected,
      adapter: r && r.adapter,
      fallback: r && r.fallback,
      values,
      results: r ? r.results.map((x) => ({ id: x.el.id, status: x.status, state: x.state })) : null,
      counts: r && r.counts,
    };
  }, { setupSrc: setup.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''), profile: TEST_PROFILE, opts });
}

const FILLED = { fn: TEST_PROFILE.firstName, ln: TEST_PROFILE.lastName, em: TEST_PROFILE.email };

test('an adapter whose detect() throws is skipped: generic fills the page', async () => {
  const r = await pass(function () {
    AF.adapters.boom = { name: 'boom', detect() { throw new Error('detect exploded'); }, findFields() { throw new Error('never reached'); } };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback, null, 'a throwing detect is a "no", not a fallback');
  assert.deepEqual(r.values, FILLED);
});

test('detect true but findFields throws: generic fallback, fields filled', async () => {
  const r = await pass(function () {
    AF.adapters.fakeats = { name: 'fakeats', detect() { return true; }, findFields() { throw new Error('selectors rotted'); } };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback.from, 'fakeats');
  assert.match(r.fallback.why, /findFields failed/);
  assert.deepEqual(r.values, FILLED);
});

test('detect true, findFields returns [] and no nothingToFill: generic fallback', async () => {
  const r = await pass(function () {
    AF.adapters.fakeats = { name: 'fakeats', detect() { return true; }, findFields() { return []; } };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback.from, 'fakeats');
  assert.match(r.fallback.why, /no fields/);
  assert.deepEqual(r.values, FILLED);
});

test('detect true, findFields [] and nothingToFill() true: no fallback, nothing filled', async () => {
  const r = await pass(function () {
    AF.adapters.fakeats = { name: 'fakeats', detect() { return true; }, findFields() { return []; }, nothingToFill() { return true; } };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'fakeats');
  assert.equal(r.fallback, null);
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.values, { fn: '', ln: '', em: '' });
});

test('nothingToFill() returning false (or throwing) still falls back', async () => {
  for (const body of ['return false;', 'throw new Error("nope");']) {
    const r = await pass(new Function(`
      AF.adapters.fakeats = { name: 'fakeats', detect() { return true; }, findFields() { return []; }, nothingToFill() { ${body} } };
    `));
    assert.equal(r.rejected, null, body);
    assert.equal(r.adapter, 'generic', body);
    assert.equal(r.fallback.from, 'fakeats', body);
    assert.deepEqual(r.values, FILLED, body);
  }
});

test('findFields fine on the first scan, throws on a later rescan: pass completes via generic', async () => {
  const r = await pass(function () {
    const generic = AF.adapters.generic;
    let calls = 0;
    window.__scans = () => calls;
    AF.adapters.flaky = {
      name: 'flaky',
      detect() { return true; },
      findFields(doc) {
        calls++;
        if (calls > 1) throw new Error('re-render broke the selectors');
        // The first field "reveals" others, which forces a rescan after it is filled.
        return generic.findFields(doc).map((f, i) => (i === 0 ? { ...f, revealing: true } : f));
      },
    };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback.from, 'flaky');
  assert.match(r.fallback.why, /findFields failed/);
  assert.deepEqual(r.values, FILLED);
  // Each field handled once: the first scan's queue was replaced by the generic rescan.
  assert.deepEqual(r.results.map((x) => x.id).sort(), ['em', 'fn', 'ln']);
  assert.equal(await page.evaluate(() => window.__scans()), 2);
});

test('outlineOnly field whose read() throws does not reject the pass', async () => {
  const r = await pass(function () {
    const generic = AF.adapters.generic;
    AF.adapters.readbroken = {
      name: 'readbroken',
      detect() { return true; },
      findFields(doc) {
        const fields = generic.findFields(doc);
        const extra = document.createElement('input');
        extra.id = 'upload';
        extra.setAttribute('aria-label', 'Upload your documents');
        document.getElementById('f').appendChild(extra);
        const desc = { label: 'Upload your documents', hints: [], context: '', autocomplete: '', inputType: 'text', required: true };
        fields.push({ el: extra, desc, outlineOnly: true, read() { throw new Error('read exploded'); } });
        return fields;
      },
    };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'readbroken');
  assert.deepEqual(r.values, FILLED);
  const up = r.results.find((x) => x.id === 'upload');
  assert.equal(up.status, 'skipped');
  // read() failed, so the field counts as empty: required + empty = yellow.
  assert.equal(up.state, 'unknown');
});

test('adapter cleanup() throwing (sync or async) does not reject the pass', async () => {
  for (const body of ['throw new Error("cleanup exploded");', 'return Promise.reject(new Error("async cleanup exploded"));']) {
    const r = await pass(new Function(`
      const generic = AF.adapters.generic;
      AF.adapters.messy = {
        name: 'messy', detect() { return true; },
        findFields(doc) { return generic.findFields(doc); },
        cleanup() { ${body} },
      };
    `));
    assert.equal(r.rejected, null, body);
    assert.equal(r.adapter, 'messy', body);
    assert.equal(r.fallback, null, body);
    assert.deepEqual(r.values, FILLED, body);
    assert.equal(r.counts.filled, 3, body);
  }
});

test('a forced adapter by name still wins: generic, and a fake one', async () => {
  // A detecting fake would normally take the page; forcing generic overrides it.
  let r = await pass(function () {
    AF.adapters.fakeats = { name: 'fakeats', detect() { return true; }, findFields() { throw new Error('should not be asked'); } };
  }, { adapter: 'generic' });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback, null);
  assert.deepEqual(r.values, FILLED);

  // Forcing an adapter that does not detect the page works too (file:// pages in tests).
  r = await pass(function () {
    const generic = AF.adapters.generic;
    AF.adapters.quiet = { name: 'quiet', detect() { return false; }, findFields(doc) { return generic.findFields(doc); } };
  }, { adapter: 'quiet' });
  assert.equal(r.adapter, 'quiet');
  assert.deepEqual(r.values, FILLED);
});

test('a forced adapter whose findFields throws still falls back (not rejected)', async () => {
  const r = await pass(function () {
    AF.adapters.fakeats = { name: 'fakeats', detect() { return false; }, findFields() { throw new Error('nope'); } };
  }, { adapter: 'fakeats' });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'generic');
  assert.equal(r.fallback.from, 'fakeats');
  assert.deepEqual(r.values, FILLED);
});

test('step() throwing does not stop the pass', async () => {
  const r = await pass(function () {
    const generic = AF.adapters.generic;
    AF.adapters.stepless = {
      name: 'stepless', detect() { return true; },
      step() { throw new Error('step exploded'); },
      findFields(doc) { return generic.findFields(doc); },
    };
  });
  assert.equal(r.rejected, null);
  assert.equal(r.adapter, 'stepless');
  assert.deepEqual(r.values, FILLED);
});

/* ------------------------------------------------------------------ */
/* background.js injection loop (pure Node, stubbed browser)            */
/* ------------------------------------------------------------------ */

const BACKGROUND = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');

/**
 * Evaluate background.js against a fake `browser`. `failOn(files)` decides
 * which executeScript call throws. Resolves helpers to trigger a fill.
 */
function loadBackground({ failOn, tabs, frames, granted, summaries, running } = {}) {
  const calls = [];
  const errors = [];
  const pageCalls = []; // executeScript({ func }) calls: { name, frameId, args }
  const created = [];
  const updated = [];
  const badges = [];
  const live = new Set();
  let nextTab = 100;
  const listeners = { command: null, message: null };
  // Results of the functions background.js runs inside the page.
  const PAGE = {
    isRunning: () => !!running,
    surveyFrames: () => frames || [],
    setEmbedPlan: () => undefined,
    awaitRun: (frameId) => (summaries && frameId in summaries ? summaries[frameId] : { counts: { filled: 1, review: 0, unknown: 0 }, profileName: 'P', company: null }),
    showFrameResults: () => undefined,
    notifyPage: () => undefined,
  };
  const stub = {
    tabs: {
      async query() { return tabs === undefined ? [{ id: 7, index: 2 }] : tabs; },
      async create(o) { const t = { id: nextTab++, ...o }; created.push(o); live.add(t.id); return t; },
      async get(id) { if (!live.has(id)) throw new Error('no tab ' + id); return { id }; },
      async update(id, o) { updated.push([id, o]); return { id }; },
    },
    scripting: {
      async executeScript(arg) {
        if (arg.func) {
          const frameId = arg.target.frameIds ? arg.target.frameIds[0] : 0;
          pageCalls.push({ name: arg.func.name, frameId, args: arg.args });
          return [{ frameId, result: PAGE[arg.func.name](frameId) }];
        }
        calls.push(arg);
        if (failOn && failOn(arg.files, arg.target)) throw new Error('injection failed: ' + arg.files.join(','));
        return [];
      },
    },
    permissions: { async contains({ origins }) { return granted ? origins.every((o) => granted.includes(o)) : false; } },
    action: {
      async setBadgeText(o) { badges.push(o); },
      async setTitle() {},
    },
    commands: { onCommand: { addListener(fn) { listeners.command = fn; } } },
    runtime: { onMessage: { addListener(fn) { listeners.message = fn; } } },
  };
  const ctx = vm.createContext({
    browser: stub,
    URL,
    console: { error: (...a) => errors.push(a.map(String).join(' ')), warn() {}, log() {}, info() {} },
  });
  vm.runInContext(BACKGROUND, ctx, { filename: 'background.js' });
  return {
    calls,
    errors,
    pageCalls,
    created,
    updated,
    badges,
    listeners,
    FILES: vm.runInContext('FILES', ctx),
    fill: () => listeners.message({ type: 'fill' }),
  };
}

const flat = (calls) => calls.flatMap((c) => c.files);
const inFrame = (calls, frameId) => calls.filter((c) => c.target.frameIds[0] === frameId);

test('background: FILES is the helpers SCRIPTS list plus core/run.js (kept in sync)', () => {
  const bg = loadBackground();
  assert.deepEqual(Array.from(bg.FILES), [...SCRIPTS, 'core/run.js']);
  for (const f of bg.FILES) assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
});

test('background: every file injected in order, each ATS adapter in its own call', async () => {
  const bg = loadBackground();
  await bg.fill();
  assert.deepEqual(flat(bg.calls), Array.from(bg.FILES));
  for (const c of bg.calls) assert.equal(c.target.tabId, 7);
  const adapterCalls = bg.calls.filter((c) => c.files.some((f) => f.startsWith('adapters/') && f !== 'adapters/generic.js'));
  assert.ok(adapterCalls.length >= 5);
  for (const c of adapterCalls) assert.equal(c.files.length, 1, 'ATS adapter shares a call: ' + c.files.join(','));
  // generic.js rides with the core batch before it (it is not optional).
  assert.ok(bg.calls[0].files.includes('adapters/generic.js'));
  assert.deepEqual(bg.errors, []);
});

test('background: the fill-page command and the popup message both inject', async () => {
  const bg = loadBackground();
  bg.listeners.command('some-other-command');
  await new Promise((r) => setImmediate(r));
  assert.equal(bg.calls.length, 0, 'other commands do nothing');
  bg.listeners.command('fill-page');
  for (let i = 0; i < 50 && flat(bg.calls).length < bg.FILES.length; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(flat(bg.calls), Array.from(bg.FILES));
  assert.equal(bg.listeners.message({ type: 'something-else' }), undefined);
});

test('background: one ATS adapter failing to load does not stop the rest', async () => {
  for (const bad of ['adapters/greenhouse.js', 'adapters/avature.js', 'adapters/workday.js', 'adapters/eightfold.js']) {
    const bg = loadBackground({ failOn: (files) => files.includes(bad) });
    await bg.fill();
    // Every file was still attempted, in order; the failing one is the only error.
    assert.deepEqual(flat(bg.calls), Array.from(bg.FILES), bad);
    assert.equal(bg.errors.length, 1, bad);
    assert.match(bg.errors[0], new RegExp(bad.replace('.', '\\.')));
    // core/autofill.js, learn.js and run.js still went in after it.
    const tail = flat(bg.calls).slice(-3);
    assert.deepEqual(tail, ['core/autofill.js', 'core/learn.js', 'core/run.js'], bad);
  }
});

test('background: all ATS adapters failing still injects core, generic and the runner', async () => {
  const bg = loadBackground({ failOn: (files) => files.some((f) => f.startsWith('adapters/') && f !== 'adapters/generic.js') });
  await bg.fill();
  assert.deepEqual(flat(bg.calls), Array.from(bg.FILES));
  assert.equal(bg.errors.length, bg.FILES.filter((f) => f.startsWith('adapters/') && f !== 'adapters/generic.js').length);
});

test('background: a failing core batch (privileged page) is reported once and stops', async () => {
  const bg = loadBackground({ failOn: () => true });
  await bg.fill();
  assert.equal(bg.calls.length, 1, 'gave up after the first batch');
  assert.equal(bg.errors.length, 1);
  assert.match(bg.errors[0], /could not run on this page/);
});

test('background: no active tab injects nothing', async () => {
  const bg = loadBackground({ tabs: [] });
  await bg.fill();
  assert.deepEqual(bg.calls, []);
});

/* ------------------------------------------------------------------ */
/* Embedded application frames (core/embed.js survey -> background.js) */
/* ------------------------------------------------------------------ */

// Objects built inside the vm have another realm's prototypes.
const plain = (x) => JSON.parse(JSON.stringify(x));
const GH = { url: 'https://job-boards.greenhouse.io/embed/job_app?for=northwind&token=1', host: 'job-boards.greenhouse.io', kind: 'fill', frameId: 5 };
const GH_ORIGIN = 'https://job-boards.greenhouse.io/*';
const OTHER = { url: 'https://apply.acme-hr.example/jobs/42/apply', host: 'apply.acme-hr.example', kind: 'open', frameId: null };

test('background: no embedded form -> top frame only, runner after the survey, no tab', async () => {
  const bg = loadBackground();
  await bg.fill();
  assert.deepEqual(flat(bg.calls), Array.from(bg.FILES));
  assert.ok(bg.calls.every((c) => c.target.frameIds[0] === 0));
  const names = bg.pageCalls.map((c) => c.name);
  assert.deepEqual(names, ['isRunning', 'surveyFrames', 'setEmbedPlan']);
  assert.deepEqual(plain(bg.pageCalls[2].args), [{ filling: [], opening: null }]);
  assert.deepEqual(bg.created, []);
});

test('background: a Greenhouse frame with the permission is filled in place, one toast in the top frame', async () => {
  const bg = loadBackground({ frames: [GH], granted: [GH_ORIGIN] });
  await bg.fill();
  // The frame got every file including the runner, in order.
  assert.deepEqual(flat(inFrame(bg.calls, 5)), Array.from(bg.FILES));
  // The top frame: libraries, then (after the survey) the runner.
  assert.deepEqual(flat(inFrame(bg.calls, 0)), Array.from(bg.FILES));
  const plan = plain(bg.pageCalls.find((c) => c.name === 'setEmbedPlan').args[0]);
  assert.deepEqual(plan, { filling: ['job-boards.greenhouse.io'], opening: null });
  const show = bg.pageCalls.find((c) => c.name === 'showFrameResults');
  assert.equal(show.frameId, 0);
  assert.equal(show.args[1][0].host, 'job-boards.greenhouse.io');
  assert.ok(show.args[1][0].summary);
  assert.deepEqual(bg.created, [], 'no tab opened');
  assert.deepEqual(bg.errors, []);
});

test('background: a Greenhouse frame WITHOUT the permission opens in its own tab next to this one', async () => {
  const bg = loadBackground({ frames: [GH], granted: [] });
  await bg.fill();
  assert.deepEqual(inFrame(bg.calls, 5), [], 'nothing injected into the frame');
  assert.equal(bg.created.length, 1);
  assert.deepEqual(plain(bg.created[0]), { url: GH.url, index: 3, openerTabId: 7, active: true });
  assert.deepEqual(plain(bg.pageCalls.find((c) => c.name === 'setEmbedPlan').args[0]), { filling: [], opening: GH.url });
  assert.ok(bg.badges.some((b) => b.tabId === 100 && b.text));
});

test('background: an unknown cross-origin form frame opens in a tab; a second press switches to it', async () => {
  const bg = loadBackground({ frames: [OTHER], granted: [GH_ORIGIN] });
  await bg.fill();
  assert.equal(bg.created.length, 1);
  assert.equal(bg.created[0].url, OTHER.url);
  await bg.fill();
  assert.equal(bg.created.length, 1, 'no second tab');
  assert.deepEqual(plain(bg.updated), [[100, { active: true }]]);
});

test('background: frame injection failing (no access after all) falls back to its own tab', async () => {
  const bg = loadBackground({ frames: [GH], granted: [GH_ORIGIN], failOn: (files, target) => target.frameIds[0] === 5 });
  await bg.fill();
  assert.equal(bg.created.length, 1);
  assert.equal(bg.created[0].url, GH.url);
});

test('background: a frame pass that never reports is opened in its own tab, with a notice', async () => {
  const bg = loadBackground({ frames: [GH], granted: [GH_ORIGIN], summaries: { 5: null } });
  await bg.fill();
  assert.equal(bg.created.length, 1);
  assert.ok(bg.pageCalls.some((c) => c.name === 'notifyPage' && c.frameId === 0));
});

test('background: a frame without a frame id (getFrameId missing) is opened, never guessed', async () => {
  const bg = loadBackground({ frames: [{ ...GH, frameId: null }], granted: [GH_ORIGIN] });
  await bg.fill();
  assert.deepEqual(inFrame(bg.calls, 5), []);
  assert.equal(bg.created.length, 1);
});

test('background: a non-http frame URL is never opened', async () => {
  const bg = loadBackground({ frames: [{ ...OTHER, url: 'javascript:alert(1)' }] });
  await bg.fill();
  assert.deepEqual(bg.created, []);
});

test('background: a press while a pass is still running injects nothing', async () => {
  const bg = loadBackground({ running: true, frames: [GH], granted: [GH_ORIGIN] });
  await bg.fill();
  assert.deepEqual(bg.calls, []);
  assert.deepEqual(bg.pageCalls.map((c) => c.name), ['isRunning']);
  assert.deepEqual(bg.created, []);
});
