/*
 * background.js
 *
 * The only fill trigger. Two ways in, both explicit user actions:
 *   - Alt+Z: the `fill-page` command (commands.onCommand);
 *   - the toolbar popup's "Fill this page" button, which messages us
 *     ({ type: 'fill' }). The popup does not inject itself: it closes right
 *     away and a closing popup would cut the injection short.
 * Either one grants activeTab for that tab's top frame.
 *
 * One press:
 *   1. inject the scripts (dependency order) into the top frame; each ATS
 *      adapter goes in its own call, see isOptional;
 *   2. survey the page's iframes (core/embed.js): application forms embedded
 *      from another site;
 *   3. frames on the four hosts we hold host permissions for
 *      (job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co,
 *      jobs.ashbyhq.com; core/embed.js FILL_HOSTS) get the same scripts and
 *      are filled in place like a page of their own;
 *   4. the top frame's pass runs (core/run.js); one toast reports the page and
 *      its frames together (a tall frame's own corner is off screen);
 *   5. any other cross-origin application frame (or a known one we could not
 *      reach) is opened in a new tab next to this one, and we switch to it:
 *      no permission can reach it in place. A frame that is not a form (ads,
 *      video, chat, captchas) is never opened (core/embed.js classify).
 * Injecting twice is harmless: every file re-attaches to globalThis.AF, and
 * core/run.js ignores a second press while a pass is still running.
 */
'use strict';

// Dependency order. Keep tests/helpers/browser.js SCRIPTS in sync.
const FILES = [
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
  'core/run.js',
];
const RUNNER = 'core/run.js';

// ATS adapters are injected one call each: a broken adapter file (a syntax
// slip, a throw at load) must never keep the generic filler from running.
const isOptional = (f) => f.startsWith('adapters/') && f !== 'adapters/generic.js';

/* ---------------------------------------------------------------- */
/* Functions run inside the page (scripting.executeScript `func`).   */
/* Self-contained: they see only the page and globalThis.AF.         */
/* ---------------------------------------------------------------- */

// A pass already running on this page: injecting again would re-create the
// libraries under it (module state such as the stored standard answers).
function isRunning() {
  return !!(globalThis.AF && globalThis.AF.running);
}

function surveyFrames() {
  return globalThis.AF && globalThis.AF.embed ? globalThis.AF.embed.survey(document) : [];
}

function setEmbedPlan(plan) {
  if (globalThis.AF) globalThis.AF.embedPlan = plan;
}

// executeScript awaits a returned promise: this resolves when the pass ends.
function awaitRun() {
  return (globalThis.AF && globalThis.AF.lastRun) || null;
}

function showFrameResults(topSummary, frames) {
  const AF = globalThis.AF;
  if (!AF || !AF.feedback) return;
  const counts = { filled: 0, review: 0, unknown: 0 };
  const add = (s) => s && s.counts && Object.keys(counts).forEach((k) => { counts[k] += s.counts[k] || 0; });
  add(topSummary);
  frames.forEach((f) => add(f.summary));
  const done = frames.filter((f) => f.summary);
  const named = done.find((f) => f.summary.company) || {};
  const profile = (done[0] && done[0].summary.profileName) || (topSummary && topSummary.profileName) || '';
  const company = (named.summary && named.summary.company) || (topSummary && topSummary.company) || '';
  const hosts = Array.from(new Set(done.map((f) => f.host)));
  AF.feedback.toast(document, counts, profile, company, hosts.length ? `in the embedded ${hosts.join(', ')} form` : '', done.map((f) => f.url));
}

function notifyPage(text) {
  if (globalThis.AF && globalThis.AF.feedback) globalThis.AF.feedback.notify(document, text, 9000);
}

/* ---------------------------------------------------------------- */
/* Injection                                                         */
/* ---------------------------------------------------------------- */

/** Inject the scripts into one frame. Resolves false when the core batch failed. */
async function injectFiles(tabId, frameId, files) {
  const target = { tabId, frameIds: [frameId] };
  let batch = [];
  const flush = async () => {
    if (batch.length) await browser.scripting.executeScript({ target, files: batch });
    batch = [];
  };
  try {
    for (const file of files) {
      if (!isOptional(file)) {
        batch.push(file);
        continue;
      }
      await flush();
      try {
        await browser.scripting.executeScript({ target, files: [file] });
      } catch (err) {
        console.error('[autofill] adapter failed to load, skipped:', file, err);
      }
    }
    await flush();
    return true;
  } catch (err) {
    // Typical cause: a privileged page (about:, addons.mozilla.org, reader view),
    // or a frame we hold no permission for.
    console.error('[autofill] could not run on this page:', err);
    return false;
  }
}

async function inPage(tabId, frameId, func, args) {
  const res = await browser.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func, args: args || [] });
  return res && res[0] ? res[0].result : undefined;
}

async function mayFill(url) {
  try {
    const u = new URL(url);
    return await browser.permissions.contains({ origins: [`${u.protocol}//${u.hostname}/*`] });
  } catch (err) {
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Opening a frame in its own tab                                    */
/* ---------------------------------------------------------------- */

// "<tab id> <url>" -> the tab we opened for it, so pressing Alt+Z again on the
// same page switches to that tab instead of opening another one.
const opened = new Map();

async function openInTab(tab, url) {
  if (!/^https?:\/\//i.test(url)) return;
  const key = `${tab.id} ${url}`;
  const prev = opened.get(key);
  if (prev != null) {
    try {
      await browser.tabs.get(prev);
      await browser.tabs.update(prev, { active: true });
      return;
    } catch (err) {
      opened.delete(key); // closed since
    }
  }
  const created = await browser.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id, active: true });
  opened.set(key, created.id);
  // We cannot show anything inside the new tab (no access to it until Alt+Z),
  // so its toolbar button says what to do; the badge goes away on navigation.
  try {
    await browser.action.setBadgeText({ tabId: created.id, text: 'Fill' });
    await browser.action.setTitle({ tabId: created.id, title: 'Application opened from the previous tab: press Alt+Z to fill it' });
  } catch (err) {
    /* cosmetic */
  }
}

/* ---------------------------------------------------------------- */
/* One press                                                         */
/* ---------------------------------------------------------------- */

async function fillActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const tabId = tab.id;
  try {
    await browser.action.setBadgeText({ tabId, text: '' });
  } catch (err) {
    /* cosmetic */
  }

  // A second press while the first pass still works: ignored (core/run.js
  // ignores it too, but the libraries must not be re-injected under that pass).
  try {
    if (await inPage(tabId, 0, isRunning)) {
      console.info('[autofill] already running on this page');
      return;
    }
  } catch (err) {
    /* no access yet or a privileged page: the injection below reports it */
  }

  // 1. Libraries into the top frame (the runner comes after the survey).
  if (!(await injectFiles(tabId, 0, FILES.filter((f) => f !== RUNNER)))) return;

  // 2. Embedded application frames.
  let frames = [];
  try {
    frames = (await inPage(tabId, 0, surveyFrames)) || [];
  } catch (err) {
    console.error('[autofill] frame survey failed:', err);
  }

  // 3. Fill in place what we may reach.
  const filling = [];
  for (const f of frames) {
    if (f.kind !== 'fill' || f.frameId == null || !(await mayFill(f.url))) continue;
    // Still busy from the last press: let that pass finish, report its result.
    const busy = await inPage(tabId, f.frameId, isRunning).catch(() => false);
    if (busy || (await injectFiles(tabId, f.frameId, FILES))) filling.push(f);
  }
  // Anything else that holds a form: the biggest one opens in its own tab,
  // but only when nothing could be filled in place.
  const toOpen = filling.length ? null : frames.find((f) => f.kind === 'open' || f.kind === 'fill');

  // 4. The top frame's own pass.
  try {
    await inPage(tabId, 0, setEmbedPlan, [{ filling: filling.map((f) => f.host), opening: toOpen ? toOpen.url : null }]);
    await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [RUNNER] });
  } catch (err) {
    console.error('[autofill] could not start the pass:', err);
    return;
  }

  if (filling.length) {
    const top = await inPage(tabId, 0, awaitRun).catch(() => null);
    const results = [];
    for (const f of filling) {
      const summary = await inPage(tabId, f.frameId, awaitRun).catch(() => null);
      results.push({ host: f.host, url: f.url, summary: summary || null });
    }
    await inPage(tabId, 0, showFrameResults, [top, results]).catch(() => {});
    // A frame whose pass never reported (it navigated, or failed): its own tab.
    const lost = results.find((r) => !r.summary);
    if (lost) {
      await inPage(tabId, 0, notifyPage, ['Formhand could not fill the embedded form here: opened it in its own tab. Press Alt+Z.']).catch(() => {});
      await openInTab(tab, lost.url);
    }
  }

  // 5. A form we cannot reach: its own tab, after this page's pass is done
  //    (the pass's toast already says what happened).
  if (toOpen) {
    await inPage(tabId, 0, awaitRun).catch(() => null);
    try {
      await openInTab(tab, toOpen.url);
    } catch (err) {
      console.error('[autofill] could not open the embedded form in a tab:', err);
    }
  }
}

browser.commands.onCommand.addListener((command) => {
  if (command === 'fill-page') fillActiveTab();
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'fill') return fillActiveTab();
  return undefined;
});
