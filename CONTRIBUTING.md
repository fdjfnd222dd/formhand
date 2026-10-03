# Contributing to Formhand

Thanks for helping. This project is deliberately small and strict, because it touches people's job applications.
Please read the hard rules first; a change that breaks one will not be merged however useful it is.

## Hard rules
1. **100% local.** No network requests, no remote code, no analytics, no LLM calls, no new third-party runtime code.
2. **Permissions stay** `storage`, `activeTab`, `scripting`, plus host permissions for exactly the four job-board hosts
   whose embedded forms are filled (`job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co`,
   `jobs.ashbyhq.com`; they must equal `FILL_HOSTS` in `core/embed.js`). No `content_scripts`. Adding or widening any
   permission is a breaking change that needs a maintainer discussion first; `tests/privacy-guard.test.js` enforces the lists.
3. **Fill only. Never navigate or submit.** The only synthetic clicks live in `core/widgets.js#press()`, which allow-lists
   form widgets. Do not add a second click path.
4. **Never tick consent / agreement / signature boxes or type a signature.**
5. **Salary/compensation, emergency contact and references are ignored completely** (`matcher.isIgnored`).
6. **Never overwrite a field that already has a value.** Never guess a sensitive answer; when unsure leave the field for the user.
7. **Plain JS, no build step.** Runtime files are IIFEs attaching to `globalThis.AF`. No bundler, no transpiler.
8. **No personal data in the repository**, ever (see "Fixtures" below).

## Setup
```bash
git clone https://github.com/fdjfnd222dd/formhand.git && cd formhand
npm install                       # Playwright (dev only)
npx playwright install firefox
npm test                          # all tests
node --test tests/matcher.test.js # one file
npm run lint                      # web-ext lint, must report 0 errors (install web-ext globally or use npx)
npm start                         # throwaway dev Firefox profile with the extension loaded
```
`npm test` runs files one at a time to spare RAM (8 GB machines are supported). Tests that need real saved application
pages skip themselves when those pages are absent (they are gitignored); a fresh clone runs everything else.

## Where things live
See "Architecture" in `CLAUDE.md` (the file map, the injection order, the answer pipeline) and the rules in `SPEC.md`.
Quick map: `core/matcher.js` (label -> profile key), `core/standard.js` (standard questions), `core/qa.js` (bank rules),
`core/autofill.js` (the pass), `adapters/*.js` (one per platform), `core/widgets.js` (custom dropdowns).

## Adding a label wording (the most common contribution)
1. Add a failing line to `tests/matcher.test.js` (label -> expected key), or `tests/standard.test.js` for a compliance wording.
2. Fix `RULES` / `EXACT` / vetoes in `core/matcher.js`, or `DETECT` in `core/standard.js`.
3. `npm test`.

## Adding a platform adapter
1. Create `adapters/<name>.js` exposing `{ name, detect(doc), findFields(doc, ctx?), step?, cleanup?, nothingToFill? }` and
   registering on `AF.adapters`.
   Every field needs `desc`, a `read()` and, for custom widgets, a `fill`. Read `adapters/generic.js` first for the shared helpers.
2. Add the file to `FILES` in `background.js` (before `core/autofill.js`) **and** to `SCRIPTS` in `tests/helpers/browser.js`; keep both
   in dependency order.
3. Detect by hostname **and** DOM markers; never by words in page content.
4. Get a scrubbed fixture (below), add a `CASES` entry in `tests/fixtures.test.js`, and a harness in `tests/harness/` if the platform
   has custom widgets. Be honest in the docs: "selectors verified" and "widget behaviour simulated" are different claims.
5. `npm test` and `npm run lint`.

## Fixtures and personal data (read this twice)
- **Never commit or attach a real saved application page.** They contain names, addresses and answers. `fixtures/*` is
  gitignored except `fixtures/generic/` (hand-written pages).
- Make a structure-only copy with the included tool and review it before sharing: `node tools/strip-fixture.js` writes
  `fixtures/stripped/<platform>/` with scripts, styles, svg and every value, selected/checked state and shown widget text removed.
  Even then, check by eye for company-specific or personal text.
- To capture a page for your own testing, use Firefox's *Save Page As* > "Web Page, complete" (it saves the live page;
  "HTML only" re-downloads an empty shell on single-page apps). Save once more with a dropdown open to record its options.
  Move the file into `fixtures/inbox/`. These files stay on your machine.
- Tests open captures through `tests/helpers/browser.js#openCapture`, which blanks every value and blocks the network.
- In issues and pull requests, describe a problem with the platform, the field label text and the `[autofill] ...` console line, not with screenshots of your application.

## Code style
Match the surrounding code: 2-space indent, single quotes, semicolons, small functions, comments that say *why*. No new
dependencies without discussion. UI strings are built with `textContent`, never `innerHTML`.

## Pull requests
- One focused change per PR, with tests. Fill in the PR template checklist.
- Update `CHANGELOG.md` under "Unreleased".
- Docs claims must be true: do not describe a feature or platform support the code does not have.
- By contributing you agree your contribution is licensed under the MIT license of this project.

## Releasing (maintainers)
See `RELEASING.md`.
