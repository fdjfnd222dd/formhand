/*
 * core/run.js
 *
 * Last file injected by background.js on Alt+Z / the popup's Fill button.
 * Loads the active profile, the Q&A bank and the standard answers from
 * storage and runs exactly one fill pass. Nothing here runs on page load: the
 * extension has no content_scripts entry at all.
 *
 * Pressing the hotkey again while a pass is still working (dropdowns take a
 * moment each) is ignored rather than starting a second, overlapping pass.
 * With learn mode on, learning starts on this page once the pass is done
 * (core/learn.js).
 *
 * AF.lastRun is the pass's promise, resolving a small summary
 * ({ counts, adapter, step, company, profileName, fields }) that background.js
 * collects with a second executeScript call: it shows one toast for a page
 * and the application frames filled inside it. Inside such a frame
 * (window.top !== window) the pass shows no toast of its own: a frame can be
 * thousands of pixels tall, so its corner is usually off screen.
 * AF.embedPlan (set by background.js in the top frame before this file) says
 * what happens to embedded forms; core/autofill.js words the toast from it.
 */
(function (root) {
  'use strict';

  const AF = root.AF;
  if (AF.running) {
    root.console.info('[autofill] already running on this page');
    AF.embedPlan = null; // meant for this (ignored) press
    return;
  }
  AF.running = true;

  let inFrame = false;
  try {
    inFrame = root.top !== root;
  } catch (e) {
    inFrame = true;
  }
  const embedPlan = AF.embedPlan || null;
  AF.embedPlan = null;

  let settings = {};
  AF.lastRun = AF.storage
    .load()
    .then((data) => {
      settings = data.settings;
      return AF.autofill.run({
        doc: root.document,
        profile: data.profile,
        profileName: data.profileName,
        qaEntries: data.qaBank.entries,
        standardAnswers: data.standardAnswers,
        quiet: inFrame,
        embedPlan,
      }).then((out) => ({ out, data }));
    })
    .then(({ out, data }) => {
      root.console.info('[autofill]', out.adapter, out.step || '', `profile "${data.profileName}"`,
        `company "${out.company ? out.company.name : '?'}"`, out.counts, out.fallback ? `(fallback from ${out.fallback.from}: ${out.fallback.why})` : '');
      AF.running = false;
      if (settings.learnMode) AF.learn.attach(root.document, out.adapterObj, out.company);
      else AF.learn.detach();
      const summary = {
        counts: out.counts,
        adapter: out.adapter,
        step: out.step || null,
        company: out.company ? out.company.name : null,
        profileName: data.profileName,
        fields: out.results.length,
      };
      // Remember the companies seen, so the options page can offer to turn
      // old Q&A entries that name one into the {company} form.
      return (out.company ? AF.storage.rememberCompany(out.company.name) : Promise.resolve()).then(() => summary, () => summary);
    })
    .catch((err) => {
      root.console.error('[autofill] failed:', err);
      return null;
    })
    .finally(() => {
      AF.running = false;
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
