# Formhand: Job Application Autofill (Firefox MV3)

`SPEC.md` is the source of truth. Work in phases and stop after each one.
**Current state: Phase 3 done** (2026-10-02): Q&A bank + learn mode (every site, via
the generic adapter too), sensitive-question rules, **standard answers** (canonical
compliance/EEO questions answered once in options), multiple profiles with a toolbar
popup picker, first education entry filled (Greenhouse, Avature, Workday "Education 1"),
yellow outlines on required fields in skipped sections, built-in page capture
(Ctrl+Shift+1 / Ctrl+Shift+2; removed 2026-10-03), fill hotkey Alt+Z, export/import JSON.
Not yet run live by Claude: Alt+Z / popup plumbing is only testable by hand
(tests inject page scripts directly). ATS selectors verified against real captures;
custom widget behavior (react-select, select2) only simulated by test harnesses.
**Phase 4 done** (2026-10-02, re-planned around real data): Eightfold adapter from real
captures; Greenhouse re-verified on a second company (an embed page); a company-built form (the company's own
form, no ATS) handled by the generic adapter after a radio-group fix; embedded cross-origin ATS iframes
(CareerPuck -> Greenhouse) detected and reported in the toast, not filled; references ignored like
salary/emergency contact; workAuth gained "citizen" / "visa" answers. Zero-fixture gaps: Lever,
Ashby, iCIMS, SmartRecruiters (no adapters built for them).
**Workday + {company} done** (2026-10-02, between Phase 4 and 5): Workday adapter reconciled against a real
five-step application (one tenant, `fixtures/workday/`); hiring-company detection and the `{company}`
placeholder for the Q&A bank / learn mode; standard answers `relatives` and `referred`; an adapter that
throws or finds nothing falls back to the generic adapter.
**Overnight 2026-10-02/03:** a third Greenhouse board + an embedding careers page captured; embedded Greenhouse / Lever / Ashby frames filled in place
(four host permissions), other application frames opened in a new tab; citizenship / "U.S. person" standard answer;
**Phase 5 done**: options page polish (Q&A search/filter/sort without losing edits, per-row Revert) and the clickable
summary panel; `npm run sign` prepared (never run by Claude). Choices made without the owner: `DECISIONS.md`.
**Publish prep merged 2026-10-03 (version 1.0.0, name Formhand):** the `publish-prep` branch (README, store listing,
privacy policy, Pages site `site/`, workflows `.github/`, icons, `PATCHES.md`, `PRIVACY_AUDIT.md`, `IDEAS.md`) merged into
master and all seven patches applied: add-on ID `formhand@fdjfnd222dd`, author `fdjfnd222dd` (never the owner's real name,
anywhere; repo commits use `fdjfnd222dd <fdjfnd222dd@users.noreply.github.com>`), repo `https://github.com/fdjfnd222dd/formhand`;
page capture (`capture.js`, Ctrl+Shift+1/2) and the `downloads` permission removed; dashed / dotted outlines and a darker
yellow; `tests/privacy-guard.test.js`. Public docs (README, `store/`, `site/`, CHANGELOG, SECURITY, CONTRIBUTING,
PRIVACY_POLICY) must stay true to the code: update them with any user-visible change. History still holds personal
identities: never push this repository; publish only a clean clone (`PRIVACY_AUDIT.md`, Cleanup B).
**Final pre-release round (2026-10-03):** a plain-text warning next to Export; "Delete all my data" in Options
(`storage.clearAll`, confirm step); real employer names replaced by invented ones (Acme, Example Corp, Contoso...)
in every tracked doc, test and code comment (capture-based tests name files as `<dir>/*_<timestamp>.html`; which
company each capture is: `fixtures/CAPTURES.local.md`, gitignored); `scripts/make-public-clone.sh` builds the squashed
public clone at `~/formhand-public` (owner runs it; Claude never does).

## Hard rules (from SPEC.md, repeated because they matter most)
- 100% local. Permissions stay `storage`, `activeTab`, `scripting` (`downloads` removed with page capture on
  2026-10-03, owner decision; Export uses an `<a download>` link). Host permissions ONLY for `job-boards.greenhouse.io`,
  `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com` (owner decision 2026-10-02: fill those forms when
  they are embedded in a company page; `core/embed.js` FILL_HOSTS must equal `host_permissions`,
  `tests/embed.test.js` checks). No other host permissions, no network, no remote code. `tests/privacy-guard.test.js`
  pins both lists exactly and scans every runtime file for network / eval / HTML-string APIs.
- Never press navigation: Next, Save and Continue, Submit, Back, Cancel, links, anything in a page footer or button bar.
  The only synthetic clicks are in `core/widgets.js#press()`, which allow-lists form widgets:
  a radio/checkbox, a combobox / `aria-haspopup=listbox` opener, a react-select control, a `role=option`, or a
  Workday prompt search box (`input[data-uxi-widget-type=selectinput]`).
  It refuses `type=submit|reset|image`, `a[href]`, footer/button-bar/`header` contents (Workday's header language
  picker is a listbox opener), Workday pill lists (`selectedItemList`) and every other element.
  Never add a second click path.
- Never tick consent / agreement / signature boxes or radios, and never fill a typed signature. They have no
  profile key, the Q&A bank refuses them (`qa.isConsent`), learn mode never learns them. The ONE exception is the
  owner's own **Privacy / data transfer acknowledgment** standard answer (opt-in in options, blank by default,
  always outlined orange). Signature / e-signature authorization boxes are never covered by it, nor is a bundled
  box (terms, background / credit / drug checks, "true and accurate", authorizations, verification: excluded in
  `standard.js` privacyAck). `qa.isConsent` also covers authorizations / permissions ("I authorize", "I give
  permission"), "I hereby", "I declare", "I confirm", SMS / job-alert / talent-community opt-ins.
- **Salary / compensation / pay expectations, emergency contact / next of kin and references fields (by label,
  or anything in an emergency-contact or references section) are ignored completely**: never filled (not even from the Q&A
  bank), never outlined, never learned, even when required. Owner decision 2026-10-02 (`matcher.isIgnored`).
- Never overwrite a field that already has a value (`force` exists for a future "force refill").
- Runs only on **Alt+Z** (command `fill-page`) or the toolbar popup's Fill button. There is deliberately
  no `content_scripts` entry. Learn mode therefore starts on a page only after the first fill there.
  (Alt+Shift+F was dropped: it opens Firefox's File menu on Linux.)
- Plain JS, no build step.
- Machine constraints: 8 GB RAM, no sudo. Dev dependencies go in `package.json` only.
- Answer sources, in order: standard answers -> profile -> Q&A bank (see "Where an answer comes from").
  Sensitive questions (work authorization, sponsorship, relationships, prior employment, criminal/background,
  EEO) only from a standard answer, an exact bank entry, or (non-EEO) a near-identical one (>= 0.95).
  EEO answers: standard answer or exact bank entry only. Never guess an option.
- An adapter can never block filling: `pickAdapter` catches a throwing `detect`; if the chosen adapter's
  `findFields` throws, or returns nothing on the first scan, the generic adapter fills the page (result
  `fallback: { from, why }`, logged) unless the adapter's `nothingToFill(doc)` says the emptiness is real
  (its form is there: Avature step 6; Workday review step). background.js injects each ATS adapter in its
  own `executeScript` call, so a file that fails to load is skipped.

## Personal data (fixtures, seed)
- `fixtures/*` is gitignored except `fixtures/generic/` (hand-written). Real captures
  (`fixtures/phenom|greenhouse|avature|workday/`) contain the owner's real name, address,
  school, answers. Never commit them, never print their values in summaries or test
  output. Inspect captures with structure-only dumps (tags, attributes, label text,
  option lists), not values.
- `seed/` (resume, `seed.json` import file) is gitignored and in web-ext `ignoreFiles`. `seed/seed.json`
  is in the export format: import it from the options page (Claude cannot write the browser's storage).
- Tests open captures through `tests/helpers/browser.js#openCapture`, which blanks every
  value in the page first (`sanitizeInPage`), and block all network requests.
- `tools/strip-fixture.js` writes structure-only copies to `fixtures/stripped/<ats>/` (scripts, styles,
  svg removed; every value, selected/checked state and shown widget text blanked). Analyse those, not the originals.
- `fixtures/inbox/` is where the owner drops new captures (`<hostname>_<timestamp>.html`,
  `_dropdown_` = saved with a dropdown open). Sort by ATS, detected from content: a
  company domain can be Phenom (careers.example.com) or Avature (careers.example.org).

## Architecture
```
manifest.json         MV3, background.scripts (not service_worker), gecko id, popup, commands:
                      fill-page = Alt+Z (the only command)
background.js         fill-page command / popup {type:'fill'} message -> scripting.executeScript(FILES) into the top
                      frame, survey iframes, inject + run in permitted ATS frames, one combined toast, open other
                      application frames in a new tab (see "Embedded application forms")
popup/                profile picker (sets the active profile), Fill button, learn-mode toggle
core/matcher.js       normalize() + matchField(desc) -> { key, confidence }; isVetoed(); valueFor(), valueVariants(),
                      matchOption() (strict option choice for every dropdown; delegates "std:*" keys to standard.js)
core/standard.js      standard answers: QUESTIONS, detect(desc), classify(qid, optionText), matchOption, fillValue
core/qa.js            Q&A bank: lookup(desc, entries, raw) (exact / fuzzy / sensitive rules), learn(), isConsent(),
                      companyConversions() / applyCompanyConversions() (options: old entries -> {company})
core/embed.js         survey(doc): visible cross-origin iframes -> 'fill' (FILL_HOSTS) | 'open' (other ATS / form words)
                      | ignored (ads, video, chat, captcha, maps, analytics, tiny, hidden, same-origin, non-http)
core/company.js       hiring company: detect(doc), make(name), normalizeText (-> "{company}"), applyToDesc,
                      templateAnswer / renderAnswer (answers that name the company)
core/filler.js        React-safe fill() for text inputs, textareas, native selects; fillChoice() for radio groups/checkboxes
core/widgets.js       press() (the only click, guarded), key(), typeText(), waitFor() (MutationObserver + poll + timeout),
                      settle(), fillPopup() (custom dropdown routine, serialized)
core/feedback.js      data-af-state outlines (filled=green, review=orange, unknown=yellow); summary panel (#af-summary:
                      counts step through fields, review/unknown listed by label, scroll only); notify() short messages
core/storage.js       browser.storage.local schema v3: profiles[], activeProfileId, qaBank, standardAnswers,
                      settings { learnMode, companies[] } (rememberCompany: companies seen by passes)
core/autofill.js      async pass: adapter.findFields -> decide (standard / profile / bank) -> fill one at a time -> feedback
core/learn.js         learn mode: baseline after a pass, diff on trusted user events, save to the bank
core/run.js           injected last; loads storage, runs one pass, attaches learn mode; ignores a second press while running
adapters/generic.js   fallback + shared helpers (readLabel, readContext, describe, describeChoice, outlineOnly, fileField, ...)
adapters/phenom.js    Phenom People career sites (selectors verified; native selects)
adapters/greenhouse.js  Greenhouse job boards, react-select dropdowns (selectors verified, behavior simulated)
adapters/avature.js   Avature wizards, select2 ajax dropdowns (selectors verified, behavior simulated)
adapters/workday.js   Workday apply flow (verified on one tenant; popup of prompts still unseen)
adapters/eightfold.js Eightfold PCS (one employer's career site): custom comboboxes (selectors verified, behavior simulated)
tools/probe-capture.js  one fill pass on a capture, prints structure-only rows (label, key, status, outline)
options/              profiles, standard answers, Q&A bank (search / sensitivity filter / sort hide and reorder rows, so
                      unsaved edits survive; per-row Unsaved + Revert), learn mode, {company} conversion, export/import
tools/strip-fixture.js  structure-only copies of captures for analysis
fixtures/generic/     hand-written pages (committed): basic.html, compliance.html, sections.html
fixtures/<ats>/       real captures (gitignored); fixtures/embedded/ = company pages that only wrap an ATS iframe
tests/                node:test + Playwright (Firefox); tests/harness/ = widget harnesses + synthetic pages
scripts/build-xpi.sh  release package from an allow-list of runtime files (+ LICENSE), prints the file list
web-ext-config.mjs    ignoreFiles: tests, fixtures, tools, seed, *.md, docs, store, site, scripts, .github, logo SVGs
README.md, CHANGELOG.md, PRIVACY_POLICY.md, SECURITY.md, CONTRIBUTING.md   public docs (must match the code)
store/                AMO listing copy, permission justifications, reviewer notes, screenshot staging, fake demo profile
site/                 GitHub Pages landing page (.github/workflows/pages.yml); .github/ = CI, release, AMO-sign workflows
PATCHES.md, PRIVACY_AUDIT.md, FINAL_REPORT.md, DECISIONS_PUBLISH.md, OVERNIGHT-REPORT.md, scripts/make-public-clone.sh
                      internal (private working copy only): the public clone drops them (make-public-clone.sh INTERNAL)
IDEAS.md              ranked ideas (public)
```

Re-injection (every Alt+Z) must stay harmless: files only (re)define functions on `AF`, except
`core/learn.js`, which first detaches the previous copy's listeners.
Every runtime file (except background.js / popup / options) is an IIFE that attaches to `globalThis.AF` (and also sets
`module.exports` so Node tests can `require` the pure ones). Injection order in
`background.js` FILES is the dependency order; keep `tests/helpers/browser.js`
SCRIPTS in sync with it.

### Where an answer comes from (core/autofill.js `decide`)
`decide` builds `cdesc = company.applyToDesc(desc, company)`: label and context with the hiring company replaced
by `{company}`. The profile matcher always reads the label AS WRITTEN (a company called LinkedIn must not hide
"LinkedIn profile"); standard questions try the label as written, then `cdesc`; the bank searches `cdesc`
(exact on either form, so entries learned before `{company}` still match).
0. **Ignored fields** (`matcher.isIgnored`): salary/pay, emergency contact, references -> skipped, no outline.
1. **Standard question** (`standard.detect`): label patterns per canonical question, plus the section
   heading for choice fields with a generic label ("Please check one of the boxes below" under
   "Voluntary Self-Identification of Disability"). Detected = the owner's stored answer, or **nothing**
   when they left it blank (never falls through to profile or bank). Options are read with
   `standard.classify` (each answer has a recognizer; an option counts only when exactly one answer
   recognizes it); two options meaning the answer, or none, = `nomatch` -> yellow, even if optional.
   `alwaysReview` questions (privacy ack, previously employed, client) are orange when filled.
   "Ethnicity" offering only Hispanic / Non-Hispanic falls back to the Hispanic answer.
2. **Profile** (`matcher.matchField`, below), unless an exact bank entry beats a < 0.75 profile guess.
3. **Q&A bank** (`qa.lookup`): exact question/alias 1.0; fuzzy (content-word Dice >= 0.75) x 0.85;
   sensitive page question or stored entry >= 0.95; EEO exact only; vetoed labels exact only;
   consent/signature never; vetoed sections (emergency contact, references) never. Vetoes read the label as
   written (`{company}` itself would trip the "company" veto). An answer containing `{company}` is filled with
   the detected company's name and outlined orange; no company detected = not filled.

### The hiring company and {company} (core/company.js)
- `detect(doc)` -> `{ name, variants, source }` or null. Sources vote (weights): JSON-LD
  `hiringOrganization.name` 5 (Workday, Eightfold), `og:site_name` 4 (Avature, company-built sites), title "... at <Company>" 4
  (Greenhouse, last " at "), logo alt "<Company> Logo" 3, `og:title` "Careers at X" 3, title "<X> Careers" 3,
  title tail "| X" 2, header/nav/footer "Working at X" / "© 2026 X" 2. A candidate agreeing with the URL (registrable
  domain `careers.contoso.com`, Workday tenant `acme.wd5...`, ATS board slug `globexindustries`, `?domain=` /
  `?for=`) gets +3; a lone weak source (< 4, no URL agreement) is not trusted; the URL alone is the last resort.
  The URL is the page's, or (saved pages) `af-capture-url` / og:url / canonical. Never scans the whole body
  (uploaded resume file names carry the company and the owner's name).
- `make(name)`: display name without "The" / corporate suffixes ("The Acme Group, Inc." -> "Acme"); variants
  = the full name (always), suffix-stripped, word prefixes of >= 2 words ("Vandelay Kramer"), acronym of >= 3 words
  ("vkb"), never a single ordinary word ("first", "general", "american": `COMMON`).
- `normalizeText(text, co)`: normalized text with "(the) <variant>( inc| group| llc...)*('s)" -> `{company}`.
  `matcher.normalize` keeps `{company}` intact, so stored questions survive re-normalization (options editor, import).
- Learn mode saves `normalizeText(label)` and `templateAnswer(answer)` (raw text, case kept: "I admire
  {company}'s mission"); the toast shows the `{company}` form. Passes record the company in
  `settings.companies` (`storage.rememberCompany`); the options page ("Company names in saved questions") lists
  entries that still name a known (or typed) company and converts them: same question + same answer merge,
  different answers = conflict, left alone.
- The toast says "Autofill (<profile>) at <Company>": check it before trusting `{company}` answers.

### Standard answers (core/standard.js)
workAuth (yes / citizen / visa / no: citizen and visa pick between "Yes, as a US citizen" and "Yes, via a visa";
a plain yes stays yellow on such a list), sponsorship, citizenship (see below), gender, hispanic, race, veteran, disability (CC-305), privacyAck, otherPositions,
previouslyEmployed, clientEmployed, relatives (relatives / family / close personal relationship with an employee or applicant), referred (referred
by an employee: also the Workday tenant's "did either of the following refer or recommend you"). Stored as
`{ questionId: answerId }` (shared by all profiles). previouslyEmployed /
clientEmployed / relatives / referred default to "no" and are always orange. previouslyEmployed also has
`{company}` patterns ("work for, or with {company}", "temporary work for {company}"): standard.detect runs on the
companized label too. Patterns were built from the Greenhouse, Avature, Phenom and Workday captures (see
`tests/standard.test.js`, `tests/company.test.js` for every wording covered). Deliberately NOT matched:
"interviewed for a position at {company}", Government-Official questions, AI / machine-learning consent to be
"considered for future openings" (Workday tenant: a data-use consent, owner answers),
"considered for positions in other LOCATIONS" (Avature 10522), "authorized to work WITHOUT sponsorship"
(two answers in one), e-signature authorization. Add a wording: a line in DETECT (or a recognizer),
a case in `tests/standard.test.js`.

**citizenship** (added 2026-10-02 for defense / government contractor forms): the owner stores a STATUS (citizen /
lpr / asylee = refugee or asylee / none), blank by default, always orange. `detect` returns `scope`: the statuses the
label asks about (`citizenshipScope`): "U.S. person" / ITAR / EAR / export control = all three; otherwise the ones
named ("Are you a U.S. citizen?" = citizen only, so a permanent resident answers No; "citizen or permanent resident" =
citizen + lpr); "citizenship status" or nothing named = `'status'` (pick from a status list only). `fillValue` hands
`"<status>@<scope>"` to `matchOption` -> `matchCitizenship`: an option naming the stored status ("Lawful Permanent
Resident", "No, but I am a permanent resident"), else Yes/No by scope (a Yes that names another status is refused).
Text boxes: Yes/No for a yes/no question; checkboxes never ticked. Excluded: country / dual citizenship, nationality,
embargoed countries, proof / documents, relatives' or spouse's citizenship, "non-U.S. person" / foreign national,
citizenship mixed with holding a clearance; "citizen or otherwise authorized to work" stays workAuth, "citizen or
require sponsorship" stays sponsorship. The Workday tenant's question is covered (fixtures + `tests/standard.test.js`).

### Learn mode (core/learn.js)
Settings toggle (options or popup). After each pass with learn mode on, the page's fields are
snapshotted (key = normalized label + context, via each Field's `read()`); trusted change / focusout /
click / Enter events schedule a re-read (700 ms debounce); a changed, non-empty value is upserted into
the bank (question and answer in `{company}` form) and a toast says "Saved: <question>". Never learned: profile fields, standard questions,
consent/signature, vetoed sections, password/file, duplicated labels, identity data (`IDENTITY`: SSN, date of birth,
passport / licence / tax / national id numbers, bank / card details). Bank writes go through
`storage.updateQA` (read-modify-write) so the options page and pages never overwrite each other;
the options page re-renders on `storage.onChanged`.

### Section context (adapters/generic.js readContext)
`desc.context` = the enclosing fieldset's legend, else the enclosing `[role=group|region][aria-labelledby]`, else the
nearest preceding heading. A legend counts only for controls inside its own fieldset (the "Phone" or "Emergency
contact" legend is not the context of the questions after the group: `fixtures/generic/sections.html`), and only
a fieldset's OWN legend (direct child) counts: a legend-less wrapper fieldset (Avature) lends nothing. Choice
groups search from the group's own position, skipping their own legend (which is the question).

### Matching pipeline (core/matcher.js)
1. **Veto first.** `LABEL_VETO` (label + attribute hints) and `CONTEXT_VETO`
   (fieldset legend / nearest preceding heading) make a field match nothing:
   emergency contact, references, employer, supervisor, relatives, signature / e-sign / initials...
2. **Adapter key hint** (`desc.keyHint`), when an adapter knows the field from a stable id.
3. **Exact** normalized label in `EXACT` -> confidence 1.0.
4. **Keyword rules** in `RULES`: `patterns` (regex, weight), `exclude`, `penalty`.
   Highest weight wins; near-ties and long labels (> 8 words) drop to review
   confidence, > 16 words never match. A label that opens like a yes/no question
   (`QUESTION_START`: are/do/did/have/is/will/if/attended...) only matches rules
   marked `question: true` (just `hasPreferredName` so far). Answering instructions ("please select yes below;
   otherwise ...") do not count toward the length. Free-text prompts (`FREE_TEXT`: experience, projects, skills,
   reasons, describe, explain, tell us, why...) never match by keyword; a keyword match in a textarea is capped at
   review. High-school graduation year / date / GPA never take the college values.
5. Fallbacks when the label is empty or very short: `autocomplete`, then hints
   (`data-automation-id` camelCase-split, `name`, `id`, placeholder) x 0.85, then input `type`.

Profile keys added in Phase 2: `phoneType` (stored), `phoneCountryCode` (derived from
`country`), `hasPreferredName` (derived: "Yes" when `preferredName` differs from `firstName`).
Phase 3: `todayDate` (derived; "Today's date" 1.0, a bare "Date" 0.7 -> orange).

**Option matching (`matchOption`)**, used by native selects and all custom widgets:
normalized exact text/value 1.0; explicit alias 0.95 (`US_STATES`, `COUNTRY_ALIASES`,
`PHONE_TYPE_ALIASES`, yes/no); alias after stripping a trailing "(+1)" / "+1" 0.9;
degree family with a single candidate 0.65 (review). No prefix/substring guesses, and
two different options tying at the top means no pick.

Confidence >= `HIGH_CONFIDENCE` (0.75) is green, >= `MIN_CONFIDENCE` (0.5) is
orange, below that we do not fill. Final confidence is min(label match, option match).

### Field contract (adapter -> core)
```js
Field = { el, desc, fill?, markEl?, revealing? }
desc  = { label, hints: [], context, autocomplete, inputType, required, keyHint? }
fill  = async (value, { key, force }) -> { status, confidence }
read  = () -> what the field shows now ('' = empty): learn mode and outline-only emptiness
outlineOnly = true: never filled; yellow while required and empty (skipped sections, uploads)
        status: filled | skipped | nomatch | unverified | failed | unsupported
        'unverified' = tried twice and the value did not visibly stick -> orange
markEl    = element to outline (the visible widget, not a hidden input)
revealing = filling it may reveal fields (dropdowns, selects, radios, checkboxes)
```
Adapters expose `{ name, detect(doc), findFields(doc, ctx?), step?(doc), cleanup?(doc) }` and
register on `AF.adapters`. `pickAdapter` tries every non-generic adapter's `detect`
first (`run({ adapter: 'name' })` forces one; tests use it for file:// pages).
Every adapter field needs `read` (generic.describe/describeChoice provide it; custom widgets
pass their `current()`). To add an adapter: create the file, register it, add it to `background.js` FILES
(before `core/autofill.js`) and to `tests/helpers/browser.js` SCRIPTS, then add
captures + a CASES entry (and a harness if it has custom widgets).

**`ctx.seen` (performance, 2026-10-03):** the pass calls `findFields(doc, { seen })`, `seen` = WeakSet of Field.el
already handled. An adapter may omit those (skip them before visibility checks / descriptor building) but must return
exactly the same Fields for the rest; global computations (radio groups, first education entry, outlines, document
order) run over everything; `ctx` undefined = old behavior. `generic.findFields(scope, { seen })` honors it. The pass
keeps its own seen filter, so an adapter ignoring ctx is still correct.

**Profiling:** `AF_PROFILE=<file> node --test tests/fixtures.test.js` (repeat 3x) then
`node tools/profile-summary.js <files>`; `AF_DUMP=<file>` dumps every pass's results (structure only) to diff
before/after a refactor.

### The pass (core/autofill.js)
One field at a time, in document order. After a `revealing` field changes, wait for
the DOM to go quiet (`widgets.settle`) and rescan; fields already handled are in a
WeakSet, so the rescan only adds what appeared (Country -> State/Postal Code,
"I have a preferred name" -> Preferred First Name). Counts only include outlines
still in the DOM after re-renders. A second pass keeps the green / orange outline of a field the first pass filled
(it now comes back `skipped`), so orange "check this" fields survive pressing Alt+Z again. background.js does
nothing while a pass is running (`AF.running`), so a second press never re-injects libraries under it.

### Custom dropdowns (core/widgets.js#fillPopup)
Skip if it shows a value. Open (press the opener) -> wait for the popup -> if the widget
filters by typing, type `searchTerms()` in order (full state name, "United States",
the value, degree-family word, finally an empty query) and wait until loading ends ->
`chooseOption` (strict `matchOption`) -> press the option -> wait until `verify()` sees
it. Didn't stick or never opened: retry once, then `unverified` (orange). Nothing
acceptable listed: `nomatch`. Popup always closed afterwards (Escape, then a body
mousedown). Calls are chained, so two popups are never open at once.

## ATS selector maps (from the captures in fixtures/)

### First education entry and skipped sections (Phase 3)
- Greenhouse: the FIRST `.education--container .education--form` by DOM position (ids end in --0 or --1:
  not stable); keys from the id prefix (school/degree/discipline->major/end-month->gradMonth/end-year->gradYear).
  Later entries: outline-only. Resume `.file-upload[aria-required=true] input[type=file]`: outline-only.
- Avature: the education dataset is found by the preceding Separator legend ("Education History"; its own
  label is empty); its first non-sample row is filled (Degree name, Type of Degree, University, End date
  month/year -> grad). Other rows / datasets (work history) and a required FileSchemaField: outline-only.
  The required education select2s on the questions step ("Attended university? Yes") are plain fields.
- Workday: the "Education 1" panel (h5) is filled; Work Experience panels are outline-only (see Workday below).

### Phenom (one employer's career site, 4 captures: contact step, EEO step)
- Detect: `<html data-ph-id>` or phenompeople script, plus `form.rjsf` (react-jsonschema-form). Custom domain, so DOM only.
- Fields: plain `label[for] + input/select`, ids like `cntryFields.firstName`, `phoneWidget.countryPhoneCode`, `deviceType`, `eeoUSA.gender`.
- Dropdowns are native `<select>`: the `_dropdown_` captures are identical to the plain ones (the OS draws the popup).
- Region values are `USA-CA`; dial codes `USA_1` = "United States of America (+1)"; device type Mobile / Other.
- Legends are schema ids (`cntryFields`, `phoneWidget`, `eeo USA`): dropped from context.
- The job itself lives in Workday (links to <company>.wd12.myworkdayjobs.com) but the form is Phenom's.

### Greenhouse (job-boards.greenhouse.io, 7 captures: first board x4 with School open once; second board /embed/job_app x2 with work authorization open; third board /embed/job_app x1, no dropdown open)
- Detect: hostname `*.greenhouse.io`, or (saved page) canonical/og:url on greenhouse.io; plus `form#application-form`.
- Plain inputs: `.input-wrapper > label[for] + input` (`first_name`, `last_name`, `preferred_name`, `email`, `phone`, `question_<n>`).
- react-select v5: `.select__container > label#<id>-label`, `.select__control > .select__value-container > (.select__placeholder | .select__single-value) + input#<id>.select__input[role=combobox]`; hidden `input.*-requiredInput` beside it.
  Open menu: `.select__menu > .select__menu-list[role=listbox]#react-select-<id>-listbox > .select__option[role=option]#react-select-<id>-option-<n>`, only while open, inside the container.
  Opens on mousedown on the control; typing filters; option chosen on click; `.select__menu-notice--loading|--no-options`.
- "Country*" is in the Phone fieldset = dial-code picker; once chosen it shows flag + "+1" only.
  Its option text was never captured open: the "Name+1" format in the test harness is a guess.
- `.education--container` (school--N, degree--N, discipline--N, end-month--N, end-year--N) is skipped (repeating section). The N index changes between renders.
- Custom questions and EEO (gender, hispanic_ethnicity, veteran_status) have no profile key.
- Second board (Phase 4): same markup on the `/embed/job_app` page; `#candidate-location` "Location (City)" is a
  geo typeahead react-select (no arrow, empty placeholder, "Locate me" button beside it; options never captured,
  stays yellow); `#demographic-section` questions 41..45 are multi react-selects (skipped); education holds only
  `school--1`. Work authorization options: "Yes, ... as a US Citizen or US Permanent Resident/Green Card Holder",
  "Yes, ... via a non-immigrant visa (...)", "No, ...".

### Avature (one employer's career site, 7 captures: steps 3, 4, 6 of 6; two with select2 open)
- Detect: `form.tpt_wizard` containing `.fieldSpec[id^=fieldSpecContainer]`. Step = `form--step<N>`.
- `div#fieldSpecContainer<id>.fieldSpec.<Kind>` with `.isRequired`; label `#<id>-label` (legend for radios and month/year dates).
  Strip `.labelRequiredIcon` and `#<id>-labelValue.screenReaderVisibility` (it echoes the current value).
- Skip by class, not computed style (saved pages render without Avature CSS): `.WizardFieldHidden`, `.JobVariableField`,
  `.ButtonBarField`, `.FileSchemaField`, `.datasetField`, `.fieldSpec--in-dataset` (repeating education / work history rows),
  `.formContainer`, `[hidden]` sample rows.
- select2 4.0.x (no `--selectable` class): native `<select>` often holds only the placeholder (ajax). `.select2-selection[role=combobox][aria-controls=select2-<id>-results]`, opens on mousedown; dropdown appended to body: `.select2-container--open .select2-search__field` + `ul#select2-<id>-results > li.select2-results__option[role=option]`; `li.loading-results` while searching, `.select2-results__message` for no results. **Selects on mouseup.**
- Month/year dates: `fieldset > legend#<id>-label` + `select#<id>_year`, `#<id>_month` (`----`/`--` placeholders, months valued 1..12). Full dates: `input[type=date]`.
- Radios: `div#<id>[role=radiogroup][aria-labelledby=<id>-label]`. Button bar: `button[type=submit]` "< Back" / "Continue", `button[type=reset]` "Cancel".
- State options are upper case. University/degree/specialization select2s on step 4 appear after "Attended university? Yes".
- Not observed: real ajax behavior (minimum input length, server-side matching), State depending on Country server-side.

### Eightfold PCS (one employer's career site, 2 captures: one-page application, one with a Yes/No open)
- Detect: hostname `*.eightfold.ai` with the form, or (a tenant on its own domain, saved page)
  `form[aria-describedby="hook-form-required-fields-note"]` containing
  `[role=region][aria-labelledby^="section-header-"] section[data-form-section-id]`. No "eightfold" class in the DOM.
- One page, every section rendered (the stepper only scrolls). Class names carry build hashes: never select on
  them, only ids/ARIA/`[class*="select-module_..."]` prefixes.
- Plain inputs: `label[for]` + input, ids `Contact_Information_*`. Email is readonly (from the account): skipped.
- Dropdowns: `div#<WRAPPER>[class*=select-module_select-wrapper]` (stable id, e.g. `Contact_Information_q_state`)
  > `input#input-<n>[role=combobox][aria-controls=list-<k>][aria-labelledby=<WRAPPER>_label]` (input-n renumbered per
  render). The input's own value is the shown answer AND the filter box. Popup INLINE in the wrapper:
  `ul#list-<k>[role=listbox] > li > button[type=button][role=option][title]`. Only Yes/No was captured open;
  country / state / dial code / EEO lists are guesses in the harness (`tests/harness/eightfold.js`).
  Adapter: `current()` ignores the input while the popup is open; `close()` removes any typed query.
- Location (`select-wrapper-multiple`, pills) and the Resume picker (`Resume_*`): outline-only.
- Radios: `div#<G>[role=radiogroup]` with a BROKEN `aria-labelledby=<G>_legend`; question = `label[for=<G>]`.
- Acknowledgments: single checkboxes labelled "Yes"; the question is the group's legend (generic reads it,
  so consent rules apply; the Data Privacy Notice box is the privacyAck standard answer).
- Navigation: footer Cancel / Submit application, stepper buttons, Clear/Remove/Upload/Preview buttons.

### Company-built form (3 captures): the company's own Next.js form, no ATS markers
- Generic adapter. `form#job-application-form`, `fieldset[data-cid] > label[for] + input`. Required = a red
  `*` span in the label only. Radio groups: ONE `<fieldset id="<name>">` per option (duplicate ids) with the
  question in `<label for="<name>">` before them; `generic.groupContainer` climbs to the ancestor holding every
  option. EEO block appears after "Voluntary Self-Identification: Yes" (owner's choice, never answered by us).

- Third Greenhouse board (2026-10-02): same markup; "Point of Data Transfer*" is a react-select with the GDPR notice text below it
  (privacyAck standard answer via `standard.NOTICE_TITLE`, dropdown/radio only); "{company} may choose to consider you
  for other positions" = otherPositions. Option lists never captured open (harness guesses).

### CareerPuck (app.careerpuck.com, 2 identical captures; the careers page in fixtures/embedded/ is the same pattern)
- A job page wrapping a Greenhouse board in cross-origin `iframe#grnhse_iframe`. Nothing in the top document.
  The frame (`job-boards.greenhouse.io/embed/job_app?for=<company>`) is filled in place (see below).

### Workday (one tenant, <company>.wd5.myworkdayjobs.com, 8 captures: all 5 steps, Degree and a Yes/No dropdown open)
Verified 2026-10-02 on ONE tenant. Other tenants may differ (older `legalNameSection_firstName`-style ids, a
Self Identify / disability step): capture one before trusting details there. Marks in `AID`: "seen" vs UNVERIFIED.
- Detect by hostname ONLY: `*.myworkdayjobs.com`, `*.myworkday.com`, `*.myworkdaysite.com` (Phenom pages link to
  Workday). A saved page (file://) is judged by the URL it was saved from (`af-capture-url`, og:url, canonical),
  never by links in its content. Synthetic harness pages have no URL: their tests force `adapter: 'workday'`.
- Steps: My Information, My Experience, Application Questions, Voluntary Disclosures, Review. Body =
  `div[data-automation-id=applyFlow{MyInfo,MyExp,PrimaryQuestions,VoluntaryDisclosures,Review}Page]`; the step
  `h3`, progress bar (`li[progressBarActiveStep]` > "current step 1 of 5" + "My Information", no space) and footer
  (`pageFooterNextButton` "Save and Continue" / "Submit", Back; buttons WITHOUT a type attribute) sit OUTSIDE it.
  No `<form>`. Header: `utilityButtonBar` with a language picker that is an `aria-haspopup=listbox` button.
- Questions: `div[formField-<name>]` (`legalName--firstName`, `countryRegion`, `phoneType`, `school`, ...;
  32-hex ids on Application Questions, empty suffix on the resume upload). Controls have NO automation id:
  `id="<group>--<field>"`, `label[for]`; required = `abbr[aria-hidden]` "*" in the label, `aria-required`, or
  `aria-label` ending "Required". Application questions: `fieldset > legend > div#rich-label<n>` rich text
  (up to ~1,500 chars, several `<b>` runs) + `abbr[title=required]`.
- Sections: `div[role=group][aria-labelledby=<Name>-section]` + `h4` ("Legal Name", "Address", "Phone",
  "Self Identification Questions", "Terms and Conditions"; some point at missing ids). `desc.context` = this
  section (`sectionOf`), NEVER the question's own legend: the relatives question's legend lists "guardian" /
  "spouse", which as context vetoed it like an emergency contact.
- Dropdowns: `button[aria-haspopup=listbox][type=button]` "Select One", `aria-label="<Label> <shown> Required"`,
  `value` = option id; `aria-expanded` / `aria-controls` only while open. Followed by a value-holding
  `input[type=text]` (no id/name) that is NOT a field (`isWidgetInternal`). Popup portaled to a second `<body>`
  child: `div[data-behavior-click-outside-close] > div[visibility=opened] > ul[role=listbox] > li[role=option]`
  (first row disabled "Select One", chosen row `aria-selected`). Degree options read "B.S. - Bachelor of
  Science" (`matcher.stripDecoration` drops the "B.S. - ").
- Prompts (How Did You Hear, Country Phone Code, School, Field of Study, Skills):
  `div[multiSelectContainer] > div[multiselectInputContainer] input[data-uxi-widget-type=selectinput]` (no type,
  no role, placeholder "Search"; `press()` allows it). Picks = pills `ul[role=listbox][selectedItemList] >
  li[menuItem] > div[role=option][selectedItem] > p[promptOption]`; that list is never the popup. The RESULTS
  popup was never captured open: its markup, leaf/category rows and loading state are UNVERIFIED.
- Radios: `fieldset > legend > label#radio-label<n>` + `div[name][aria-labelledby]` (no radiogroup role); the
  only one is "Do you currently work, or have you ever worked for or with <Company>..." (previouslyEmployed).
- CheckboxGroups: `fieldset[data-automation-id$=-CheckboxGroup] > div[role=grid] > row > cell > input
  (no name) + label[for]`; one field per group, question = the formField's outer legend (FINRA exams,
  certifications, Ethnicity "select all that apply" -> race standard answer).
- Dates: `dateInputWrapper[role=group]` > `dateSectionMonth-input` / `dateSectionYear-input`
  (`role=spinbutton`, no type, Workday keeps the month unpadded); question = the fieldset legend. Work history
  From/To are month+year; Education From / "To (Actual or Expected)" are YEAR ONLY (`lastYearAttended` ->
  gradYear). No day sections or masked MM/YYYY inputs seen (code kept, UNVERIFIED).
- Repeaters: group "Work Experience" (h4) > panels "Work Experience <n>" (h5, bare Delete button) skipped, their
  required fields and dates outlined; "Education" > "Education 1" filled (`EDU_KEYS` by formField name:
  school, degree, fieldOfStudy -> major, gradeAverage -> gpa, lastYearAttended -> gradYear). Education starts
  EMPTY (only "Add"): nothing to fill until the owner adds one. `add-button`, Delete: never pressed.
- Never touched: `phone-sms-opt-in` (an unlabelled SMS consent checkbox), the Terms checkbox (consent, yellow),
  the AI / machine-learning "consider you for future openings" consent (yellow), County (no key).
- Review step: zero fields and `nothingToFill` (no generic fallback). Its capture echoes every answer as text:
  never print it, not even the stripped copy.
- Company: JSON-LD "The <Company> Group, Inc." + tenant `<company>` -> "<Company>"; logo alt is " careers home".

## Embedded application forms (background.js + core/embed.js)
Company career pages often wrap the real application in a cross-origin iframe (CareerPuck, many company sites: Greenhouse's
`iframe#grnhse_iframe`). On Alt+Z / Fill:
1. The scripts go into the top frame (without `core/run.js`), then `AF.embed.survey(document)` lists visible
   application frames with `frameId` from `browser.runtime.getFrameId(iframe)`.
2. `kind: 'fill'` (host in FILL_HOSTS) + a frame id + `permissions.contains` -> the same FILES (with run.js) are
   injected into that frame; it is filled like a page (the Greenhouse adapter detects by hostname). Inside a frame
   `run.js` is quiet (`window.top !== window`): its corner can be thousands of pixels down.
3. `AF.embedPlan = { filling: [hosts], opening: url|null }` is set in the top frame, then `run.js` runs there.
   `autofill.run` is silent while frames are being filled; `background.js` then collects every pass's summary
   (`AF.lastRun`, awaited through `executeScript`) and shows ONE toast in the top frame
   ("... (in the embedded job-boards.greenhouse.io form)").
4. Nothing filled in place but a form frame exists (another ATS, or a known host without permission / frame id /
   successful injection, or a frame pass that never reported): after the top pass, its URL opens in a new tab next to
   this one (`tabs.create({ index: tab.index + 1, openerTabId })`, http(s) only) and the tab is activated. The top
   page's toast says "Opened the application in its own tab. Press Alt+Z." (we cannot draw in the new tab: no access
   until Alt+Z there); the new tab's toolbar badge says "Fill". Pressing Alt+Z again on the first page switches to
   the tab already opened instead of opening another.
5. Never opened: ads, analytics, video players, maps, chat widgets, captchas, social embeds, hidden or tiny frames
   (`embed.classify` deny lists + the need for positive evidence: a known ATS host or apply / job / career words).
If Firefox has not granted the four host permissions (an upgraded install, or revoked in about:addons -> the add-on ->
Permissions), the popup shows "Allow embedded forms" (`permissions.request`), and until then such frames open in a tab.

## Summary panel (core/feedback.js)
After a pass (or, with embedded frames, after background.js collected every pass) `feedback.summary` draws
`#af-summary` bottom right: the title ("Formhand (<profile>) at <Company>: X filled · Y to review · Z need you"), three
count buttons (each click scrolls to the next field in that state, "(2/5)"), and up to 8 review / need-you fields by
label (`mark(el, state, label)` keeps labels in a WeakMap). Rules: buttons only (no form controls, so a later pass never
sees it); `scrollIntoView` + a brief `data-af-flash` ring, never `focus()` or `click()` on the page; elements read
live at click time; a new pass (`feedback.clear`) removes it; × closes it; `notify()` messages sit above it.
Outlines: filled = solid green, review = dashed orange, unknown = dotted `#a67c00` (3.8:1 on white; the panel's own
bars keep `#fbc02d` on dark). The toast and the panel title are `role=status`. With embedded frames, a count with nothing on the top page
scrolls to the frame. `tests/summary.test.js`.

## Storage schema
`core/storage.js`, `SCHEMA_VERSION = 3`. Bump it and add `MIGRATIONS[oldVersion]` when
the shape changes; never delete old migration steps. v2 added `profile.phoneType`; v3 moved
`profile` into `profiles: [{ id, name, data }]` + `activeProfileId` (old key removed on first load).
`load()` still returns `profile` (= active profile's data) and `profileName`.
`qaBank.entries`: `{ id, question, aliases, answer, sensitive, createdAt, updatedAt }` (question/aliases
normalized; sensitive = a `qa.CATEGORIES` id or ''). `standardAnswers`: `{ questionId: answerId }`.
Every writer re-reads before writing (`updateQA`, `saveProfile`, ...). Export/import:
`exportAll()` / `importAll(obj, normalize)` (`format: 'job-autofill-export'`; import merges by profile
name and normalized question, never deletes). `clearAll()` (Options > Delete all my data, after `confirm()`) empties
`storage.local`; the next `load()` returns DEFAULTS; the page drops its unsaved edits first.

## Page capture
The built-in capture (`capture.js`, Ctrl+Shift+1 / Ctrl+Shift+2, `downloads` permission) was removed on 2026-10-03 for the
public release (it is in git history before that date). Capture with Firefox's Save Page As -> "Web Page, complete" (it
saves the live DOM; "HTML only" re-downloads the empty SPA shell). Such files have no `<meta name="af-capture-url">`, so
company / Workday detection on them falls back to og:url / canonical: on a page with neither, force the adapter in the
test case and expect no company. Keep the `af-capture-url` readers: the existing captures carry that meta. Name new
files `<host with . -> _>_<anything>.html` (`_dropdown_` when saved with a dropdown open) and put them in `fixtures/inbox/`.

## Commands
```bash
node tools/strip-fixture.js   # structure-only copies of every capture -> fixtures/stripped/
npm test          # all tests (node:test, Playwright Firefox, one file at a time to spare RAM)
npm run lint      # web-ext lint, must be 0 errors (config: web-ext-config.mjs)
npm start         # web-ext run with a persistent dev profile, opens the basic fixture
npm run build     # web-ext build -> web-ext-artifacts/*.zip (unsigned)
npm run sign      # owner only: signs as an unlisted AMO add-on (see "Permanent install"); -- --dry-run checks only
```
Single file: `node --test tests/matcher.test.js`.

Playwright's own Firefox build lives in `~/.cache/ms-playwright` (installed with
`npx playwright install firefox`). It works on this Arch box despite Arch being unsupported.

### Permanent install (signing, owner only; Claude never runs `npm run sign`)
Release Firefox only keeps signed add-ons. `npm run sign` signs this extension as an **unlisted** add-on on
addons.mozilla.org (signed by Mozilla, never published or searchable) and downloads the `.xpi`.
1. Once: sign in at https://addons.mozilla.org, open https://addons.mozilla.org/developers/addon/api/key/ and
   generate credentials. Keep the "JWT issuer" (looks like `user:12345:678`) and the "JWT secret" out of this repo.
2. Every release: bump `"version"` in `manifest.json` (and `package.json`) — AMO accepts each version number once —
   run `npm test` and commit. `tools/sign.js` refuses uncommitted changes and an already-signed version.
3. Check without uploading: `npm run sign -- --dry-run` (lint, then builds the package and verifies it holds only
   `manifest.json`, `background.js`, `LICENSE`, `core/`, `adapters/`, `options/`, `popup/`, `icons/`).
   For the public listed release use `scripts/build-xpi.sh` + the AMO Developer Hub (`RELEASING.md`), and do not sign
   1.0.0 unlisted first: AMO accepts each version number once per add-on ID.
4. Sign, keys in the environment for this one command only (a leading space keeps it out of bash history if
   `HISTCONTROL=ignorespace`):
   ```bash
    WEB_EXT_API_KEY='user:12345:678' WEB_EXT_API_SECRET='<secret>' npm run sign
   ```
   (`AMO_JWT_ISSUER` / `AMO_JWT_SECRET` work too.) It uploads, waits for Mozilla's automatic review (usually a few
   minutes), and saves `web-ext-artifacts/formhand_-_job_application_autofill-<version>.xpi` (gitignored).
5. Install: Firefox -> about:addons -> gear -> "Install Add-on From File…" -> pick the `.xpi`. Accept the permissions
   prompt (storage, and the four Greenhouse / Lever / Ashby sites for embedded forms). Updates: repeat 2-5;
   installing a higher version replaces the old one and keeps its data (same gecko id `formhand@fdjfnd222dd`).
   The ID changed on 2026-10-03 (was the internal one): Firefox sees Formhand as a NEW add-on with empty storage, so
   Export in the old add-on first and Import into Formhand (the export format is unchanged).
6. Set the shortcut again if needed: about:addons -> gear -> Manage Extension Shortcuts (Alt+Z).
The everyday profile's data is separate from the `npm start` dev profile: import `seed/seed.json` or an export there.

### Loading the extension (manual testing)
`npm start` runs:
```
web-ext run --firefox-profile ~/.autofill-dev-profile --profile-create-if-missing \
  --keep-profile-changes --start-url file://$PWD/fixtures/generic/basic.html
```
The dev profile is separate from the everyday Firefox profile and persists, so
the saved autofill profile survives restarts. web-ext reloads the extension on
file save. Profiles, standard answers and the bank: about:addons -> Formhand - Job Application Autofill ->
Preferences (or the popup's "Profiles & answers…"). Hotkeys: about:addons -> gear -> Manage
Extension Shortcuts (Firefox silently drops a suggested key that conflicts).
The console line `[autofill] <adapter> <step> profile "<name>" {counts}` says which adapter and profile ran;
the summary panel shows the profile name too. The new add-on ID means the dev profile's old data is not visible
to Formhand: import `seed/seed.json` again there.

## Tests
- `tests/matcher.test.js`: pure Node, label -> key and option cases. Add a line for every real label that ever mis-matches.
- `tests/filler.test.js`: Firefox; event order, React-style controlled inputs, selects, no-overwrite.
- `tests/widgets.test.js`: Firefox; click guard (incl. the real Avature button bar), nomatch, retry-then-fill, serialization, radios, checkboxes.
- `tests/fixtures.test.js`: Firefox; each fixture/capture with `TEST_PROFILE`, asserts `[value, outline]` per field id, adapter detected, no navigation/submit/reset, counts agree, no popup left open, idempotent second run. Captures skip when absent.
- `tests/workday.test.js`: Firefox; Workday adapter on synthetic pages (`tests/harness/workday-*.html`, real markup).
- `tests/company.test.js`: company detection (Firefox) and {company} normalization / templating / conversions.
- `tests/fallback.test.js`: Firefox; a throwing or empty adapter falls back to generic; background injection, frame
  routing (fill in place / no permission / unknown host / failed frame -> new tab, one tab per page) with a stubbed `browser`.
- `tests/embed.test.js`: `embed.classify` cases, `survey` on `fixtures/generic/embedded.html` (unknown ATS domain among
  video / ad / chat / captcha / map frames), CareerPuck and embedded-page captures, a pass inside a frame, manifest sync.
- `tests/options.test.js`: options page (profiles, standard answers, Q&A editor, import/export + its warning, Delete all my
  data, live updates)
  with a stubbed `browser.storage`; v1/v2 -> v3 migrations. `tests/popup.test.js`: popup picker + Fill message.
- `tests/qa.test.js`, `tests/standard.test.js`: pure Node; bank lookup/sensitive rules; standard question
  wordings and option variants.
- `tests/learn.test.js`: Firefox; learn mode with trusted input (`tests/harness/learn.html`).
- `tests/privacy-guard.test.js`: pure Node; exact permissions and host permissions, no content scripts / optional
  permissions / CSP / update_url, only the fill-page command, data collection none, and no network / eval / innerHTML /
  `browser.downloads` in any runtime file (comments stripped first).
- `tests/summary.test.js`: Firefox; summary panel counts, step-through, labelled list, scroll only, replaced, kept outlines.
- `tests/sign.test.js`: pure Node; `tools/sign.js` key handling and package allow-list (never signs).

Harnesses (`tests/harness/`) bring saved pages' widgets back to life. Their DOM matches the
captures; their event behavior is written from library knowledge (react-select v5, select2 4.0),
so they test our assumptions, not the live sites. They are strict about events: `react-select.js` (opens on mousedown, picks on click),
`select2.js` (opens on mousedown with which=1, picks on mouseup, ajax "Searching…"),
`workday.js` (data-attribute driven: flaky picks, never-opening popups, dependent reveals, prompts).
The generic fixture's React-style input imitates React's value tracker and reverts plain `el.value = x`.

## Adding a fixture
1. Owner saves the page into `fixtures/inbox/` (Firefox "Web Page, complete": it serializes the live DOM;
   "HTML only" re-downloads the empty SPA shell for Workday/Greenhouse). For dropdowns, save once with it open.
2. Sort into `fixtures/<ats>/` by content. Do not edit or print personal values.
3. Add a `CASES` entry in `tests/fixtures.test.js` (`capture: true`, `adapterName`, `harness` if needed,
   key `<dir>/*_<timestamp>.html` when the file name carries a company: `tests/helpers/browser.js#fixturePath` resolves it;
   never write an employer's name in a tracked file, add it to `fixtures/CAPTURES.local.md` instead;
   `expect: { id: [value, state] }`). Values are TEST_PROFILE values (the page is sanitized first);
   for native selects the option `value`, for widgets the shown text.
4. `npm test`. If a label mis-matches, fix `RULES`/`EXACT`/vetoes and add a case to `tests/matcher.test.js`.

## Known limits (after the 2026-10-03 overnight run; see also DECISIONS.md "Not done")
- Only the first education entry is filled; further entries and work history stay skipped (outlined if required).
- Embedded forms: only Greenhouse / Lever / Ashby frames are filled in place (Lever and Ashby with the generic
  adapter: no captures, no adapters). Any other application frame opens in its own tab. Learn mode works inside a
  filled frame but its "Saved:" toast may be off screen (tall frames). Same-origin iframes are not filled.
  Never run live by Claude: frame ids (`runtime.getFrameId`), the in-frame injection and the tab opening are tested
  with a stubbed `browser` only. No shadow DOM traversal.
- Greenhouse "Location (City)" geo typeahead: option format never captured; stays yellow.
- Eightfold option lists other than Yes/No never captured open; dropdown behavior only simulated.
- Greenhouse phone country (intl-tel-input flag picker) is left at its default.
- Multi-select react-selects are not filled (Greenhouse demographic questions 41..45); checkbox lists only as a single choice.
- Learn mode needs one fill on the page first (no content scripts); custom widgets are learned through
  their `read()` (react-select single value, select2 rendered text, Workday button text / pills).
- Greenhouse race / disability and Avature race option lists were never captured open: the
  recognizers for them come from the standard EEO-1 / CC-305 wording.
- Workday: one tenant only; the prompt RESULTS popup (School, Field of Study, How Did You Hear, Skills) and the
  Country / State / Phone Device Type / Gender / Veteran option lists were never captured open, so those
  widgets are only simulated (`tests/harness/workday.js`). Workday's reaction to programmatic date-section
  values is unobserved.
- Workday application questions are long rich-text legends; learn mode stores them whole as bank questions.
- {company}: detection needs a URL or a page signal; saved pages without `af-capture-url` (old Phenom captures)
  detect nothing. A company whose name is an ordinary word ("Summit") can turn that word into {company} in
  questions. Answers are templated by plain variant matching: read the orange outline.
