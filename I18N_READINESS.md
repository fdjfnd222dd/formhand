# Internationalisation (i18n) readiness

**Recommendation: do not localise yet. Do the cheap preparation now.** Reason: the matcher understands English form
labels only (`core/matcher.js` rules, `core/standard.js` patterns, `core/qa.js` normalisation), so a translated UI on a
non-English application page would still match nothing. A translated listing/UI without a matching engine would promise
something the extension cannot do. The extension is honest about this: the listing says nothing about languages.

## Inventory of user-facing strings (counted by reading the source; exact counts not measured)
| Place | Strings | Mechanism today |
|---|---|---|
| `manifest.json` name, description, action title, command description | 4 | literal text |
| `popup/popup.html`, `popup/popup.js` | a handful | literal text, built with `textContent` |
| `options/options.html`, `options/options.js` (FIELDS labels, standard-answer labels, messages) | the bulk (profile field labels, notices, buttons, table headings, messages) | literal text |
| On-page toast (`core/feedback.js`), embedded-frame notice (`core/autofill.js`), learn-mode toast (`core/learn.js`) | a few | literal text injected into the page |
| Standard answer labels and option texts (`core/standard.js` `QUESTIONS`) | 13 questions with their answer texts | data structure shared by options |

## What it would take (Mozilla's mechanism: `_locales`)
Layout and API per MDN (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization):
`_locales/en/messages.json`, `"default_locale": "en"` in the manifest, manifest strings as `__MSG_extName__`, runtime
`browser.i18n.getMessage("key", substitutions)`, and `data-i18n` attributes or a small helper for the HTML pages.
Note: injected page scripts (toast) can use `browser.i18n` only if the string is passed in, because the injected scripts here
are plain page-context files; the toast text would be sent from the background.

## Staged plan
1. **Now (no code):** keep every sentence in the UI in simple, complete, translatable form (no sentence assembled from
   fragments except via named placeholders such as the profile name). Done mostly; the toast concatenates `Formhand (profile) at Company: 12 filled ...`.
2. **Extract (code, low risk):** move all of these strings to `_locales/en/messages.json` with a `description` for each. Behaviour identical, one commit,
   covered by the existing options/popup tests.
3. **Only then** accept a community translation of the UI. Mark in the listing that matching is English-only until label rules for that language exist.
4. **Matching for another language** is a separate project: new label rules and standard-question patterns per language, and fixtures from real
   non-English application pages.

Related note: dates/numbers are not formatted anywhere; month names in the options form (`MONTHS` array) are the only locale-dependent data.
No right-to-left layout work has been done; the pages use `lang="en"` and simple block layout, so mirrored layout would mostly work with `dir` set.

See `IDEAS.md` for the ranking against other work.
