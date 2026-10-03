# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-03

First public release. Everything below was built during development (the project ran as internal
0.x phases; the entries are condensed from the git history).

### Added
- **Fill engine**: React/Angular-safe filling of text inputs, textareas, native selects, radio groups and checkboxes;
  never overwrites a field that already has a value; one field at a time, rescanning when a choice reveals more fields.
- **Triggers**: Alt+Z (`fill-page`) and a toolbar popup with a Fill button. No content scripts; the page is touched only
  after you ask (`activeTab`).
- **Profiles**: several profiles with a toolbar popup picker (name, contact, address, links, first education entry).
- **Standard answers**: the repeating compliance questions answered once in Preferences and recognised across wording
  variants (work authorization, sponsorship, U.S. citizenship / "U.S. person" status for export-control questions,
  gender, Hispanic/Latino, race/ethnicity, veteran, disability, privacy acknowledgment, other positions, previously
  employed, client employee, relatives, referred by an employee).
- **Q&A bank and learn mode**: answers you give by hand are saved locally and reused; exact, fuzzy and sensitive-question
  rules (sensitive and EEO questions never use loose matches).
- **`{company}` placeholder**: hiring-company detection from page signals, so one saved answer covers every company; a
  Preferences tool converts older entries.
- **Visual feedback**: green (solid) / orange (dashed) / yellow (dotted) outlines; required fields in skipped sections are
  outlined yellow.
- **Summary panel** after each fill: profile, hiring company and counts; click a count to step through the fields in that
  state; fields to review and fields that need you listed by label. Scrolls only, never clicks or focuses the page.
- **Embedded application forms**: Greenhouse, Lever and Ashby forms inside a company's career page are filled in place
  (host permissions for exactly those four job-board hosts); any other application form in a cross-origin frame is
  opened in its own tab next to the page. Ads, video, chat, captcha and map frames are never opened. The popup offers
  "Allow embedded forms" when the host permissions are not granted.
- **Platform support**: dedicated handling for Phenom People, Greenhouse (incl. embedded job application pages), Avature,
  Workday and Eightfold career/application pages, plus a generic fallback that also covers company-built forms. A failing
  adapter falls back to the generic filler.
- **Export / import** of profiles, answers and settings as JSON (merge, never deletes). Export saves through an ordinary
  download link; a warning next to the button says the file holds your personal data in plain text.
- **Delete all my data** (Preferences): after a confirm step, removes every profile, the standard answers, the Q&A bank
  and all settings from the browser's storage.
- Test suite (node:test + Playwright Firefox) with hand-written fixtures, widget harnesses that simulate react-select,
  select2, Eightfold and Workday-style widgets, a privacy guard (exact permission and host lists, no network or
  dynamic-code APIs in any runtime file), and tests built from real saved application pages (not published).
- Project documents for release: README, privacy policy, MIT license, contributing guide, security policy.

### Removed (compared with the internal builds)
- The developer page-capture hotkeys (Ctrl+Shift+1 / Ctrl+Shift+2) and the `downloads` permission.

### Safety rules (enforced in code and tests)
- Never presses Next, Continue, Submit, Back, Cancel or links; only allow-listed form-widget clicks.
- Never ticks consent/agreement/signature boxes or types a signature.
- Salary/pay expectations, emergency contacts and references are ignored completely.
- 100% local: no network access, no remote code, no analytics. `data_collection_permissions` declares "none".

### Known limits
See "Known limits" in the README: first education entry only, only Greenhouse / Lever / Ashby frames filled in place,
simulated custom dropdown behaviour on several platforms, no dedicated adapters for Lever, Ashby, iCIMS or SmartRecruiters.

[Unreleased]: https://github.com/fdjfnd222dd/formhand/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/fdjfnd222dd/formhand/releases/tag/v1.0.0
