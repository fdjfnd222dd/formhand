# Decisions log

Choices made without the owner (overnight run, 2026-10-02/03). Each line: what was decided and why.
Newest parts at the bottom. Revisit anything here you disagree with; each one is small and isolated.

## Part 1: new captures

- **Sorting.** `fixtures/inbox/careers_<company>_com_*` is a company careers page wrapping a Greenhouse board in
  `iframe#grnhse_iframe` (`?for=<company>`), with no form of its own: moved to a new `fixtures/embedded/` directory
  (company pages that only embed an ATS). `job_boards_greenhouse_io_1790995427463` is a Greenhouse `/embed/job_app`
  page for a third company: moved to `fixtures/greenhouse/`. Both were saved with Firefox "Save Page" (no
  `af-capture-url`); the canonical / og:url links were enough for detection. `tools/strip-fixture.js` knows `embedded/`.
- **No new adapter.** Both captures are Greenhouse; no new ATS arrived. The Greenhouse adapter needed no change.
- **Bug fixed: a fieldset legend leaked as context to everything after it.** `generic.readContext` took the nearest
  preceding heading, and `legend` counts as a heading, so on Greenhouse every question after the Phone group had
  context "Phone". Worse, every field after an "Emergency contact" or "References" fieldset was silently ignored
  (`CONTEXT_VETO`). A legend now speaks only for its own fieldset. New committed fixture
  `fixtures/generic/sections.html` proves it (it fails on the old code: city, email, work authorization ignored).
- **Bug fixed: choice groups read the section from the wrong place.** A radio group's context was computed from its
  parent element, so a heading inside the same `<form>` was never seen ("Please check one of the boxes below" under
  an h3 "Voluntary Self-Identification of Disability" inside the form stayed unknown). Context is now searched from
  the group's own position, skipping only its own legend.
- **"Point of Data Transfer" (Greenhouse GDPR notice) = the privacy acknowledgment**, but narrowly: only when the
  whole label is a notice title (`point of data transfer`, `data privacy notice`, ...) AND the field is a dropdown or
  radio group, so the acknowledgment verb must come from the option text ("I acknowledge"). Never a checkbox (the
  title alone would tick it) or a text field. It stays opt-in (blank by default) and always orange. Options of
  this dropdown were never captured; a non-acknowledging option list stays yellow.
- **Company display casing.** That company came out in lower case (a lower-case logo alt won the tie). At equal length a
  spelling with capitals now wins, and "Northwind Careers | Northwind"-style site names collapse to "Northwind".

### Fields that still stay yellow on the new pages (and why)

- Third Greenhouse board, `Location (City)`: Greenhouse geo typeahead; option format never captured, the strict match on the city
  alone picks nothing (known limit since Phase 4).
- Third board, `Resume/CV`: uploads are never touched, by design.
- Third board, "Are you graduating in Spring 2028 or later?": a job-specific question; answer it once with learn mode on.
- Third board, "Point of Data Transfer": yellow until the owner sets the Privacy acknowledgment standard answer (opt-in).
- Every dropdown on that board: the real option texts are guesses in the test harness (no `_dropdown_` capture); if the live
  wording differs from "Yes"/"No" style, standard answers still classify it, but an odd list can stay yellow.
- The embedding careers page: nothing on the top page; the form lives in the Greenhouse frame (see Part 2).

## Part 2: embedded application forms

- **Frame ids without `webNavigation`.** The top-frame script calls `browser.runtime.getFrameId(iframe)` (content-script
  API, Firefox 96+) for each permitted frame; no new permission. A frame without an id is opened in a tab, never guessed.
- **Permission check before injecting.** `permissions.contains` per frame origin; a missing grant (Firefox can leave
  MV3 host permissions ungranted on an upgraded install) falls back to the new-tab route. The popup offers an
  "Allow embedded forms" button (`permissions.request` for exactly the four hosts) while they are missing.
- **One toast, in the top frame.** The embedding page's frame is `height="4257" scrolling="no"`: a toast inside the frame would sit
  ~4000 px below the screen. Frame passes are quiet; background.js collects every pass's counts (`AF.lastRun`, a
  promise `executeScript` awaits) and shows one combined toast on the page.
- **New-tab message lives on the original page**, shown when the top pass ends, plus a "Fill" badge and tooltip on the
  new tab: we have no access to the new tab before Alt+Z there, so nothing can be drawn inside it.
- **At most one tab per page and URL.** Pressing Alt+Z again on the same page switches to the tab opened earlier.
  Only the biggest form frame is opened, and only when nothing could be filled in place on that page.
- **What counts as a form frame:** positive evidence only (a known ATS host, `#grnhse_iframe`, or apply / application /
  job / career / candidate / recruiting words in the URL, id, name or title), visible, at least 250x150, cross-origin,
  http(s). Deny lists for ads, analytics, video, maps, chat, captcha, consent banners, social embeds; and an unknown
  frame that calls itself chat / video / player / map / calendar is not a form even with "recruiting" in its title.
- **The top page is still filled first** (it may hold its own fields), and the tab opens only after that pass ends,
  so switching tabs never throttles a running pass.
- **A frame that fails** (injection refused, or its pass never reports) is opened in its own tab with a notice.
- **Same-origin iframes are not filled** (out of scope of the request; the top-frame pass does not descend into them).
- **Lever and Ashby frames** are filled by the generic adapter: no captures exist, so no adapters were built.
- **Version 0.4.0** (manifest + package.json): new permissions mean Firefox asks the owner to accept them on update.

## Part 3: citizenship / export control standard answer

- **Stored as a status, not a Yes/No.** One Yes/No cannot be right for both "Are you a U.S. citizen?" and "Are you a
  U.S. citizen, lawful permanent resident, refugee, or asylee?": a green-card holder answers No to the first and Yes to
  the second. The owner picks U.S. citizen / lawful permanent resident / refugee or asylee / none; each question's
  Yes/No follows from the statuses its label names ("U.S. person", ITAR, EAR = all three, per 22 CFR 120.62).
- **Same rules as the other sensitive standard answers:** blank by default (never filled until set), recognized only
  by explicit patterns (no fuzzy), always outlined orange, never learned (learn mode skips standard questions).
- **Refused on purpose (stay yellow):** country / dual citizenship, nationality, embargoed-country questions, proof /
  documents, a spouse's or relative's citizenship, "non-U.S. person" / foreign-national wordings (inverted meaning),
  citizenship combined with holding or obtaining a clearance (two answers in one), a status question offering only
  Yes/No, and any "Yes" option that names a different status than the stored one.
- **Checkboxes are never ticked** for this question (an attestation of status stays the owner's click).
- **Order:** checked after work authorization and sponsorship, so "citizen or otherwise authorized to work" keeps
  answering as work authorization and "citizen or will you require sponsorship" as sponsorship (unchanged behavior).
- **Kept from last round:** the Workday tenant's "work for, or with {company}" and "temporary work for {company}" still map to
  previouslyEmployed (asserted in the Workday fixture cases).
- **No storage schema bump:** standard answers are a free-form `{ id: answer }` object; the new id defaults to blank.

## Part 4: Phase 5 polish

- **Options page** (done by a Sonnet subagent, reviewed and integrated by me): search, the new sensitivity filter and
  sort hide / reorder existing rows instead of rebuilding them, so unsaved row edits are never lost (the old page
  refused to search while a row was edited). Rows show "Unsaved" + Revert; Question / Answer are auto-growing
  textareas (Workday questions run to ~1,500 characters); a `{company}` tag marks templated entries; Enter adds an
  entry; sticky section nav with the status line inside it; light / dark theme via CSS variables.
- Default Q&A order is now **recently updated first** (was storage order); sort and filter are not remembered
  between visits.
- Saving / deleting / adding one row now **keeps the unsaved edits of other rows** (before, any save redrew the
  whole table and silently dropped them). A kept edited row can be stale if the same entry changed elsewhere
  (an import); Revert or Save resolves it.
- **Summary panel replaces the counts toast.** It stays until closed or the next pass (the old toast vanished after
  5 s). Clicking a count steps through that state's fields; the review / need-you fields are listed by label (8 max,
  the rest via the counts). It only scrolls: no focus (would open react-select / Workday popups), no click (would be a
  second click path). Short messages (learn mode "Saved:", "Opened the application in its own tab") stay toasts.
- **Embedded frames:** the top page's panel shows the combined counts; a count with nothing marked on the top page
  scrolls to the frame (the panel cannot reach inside a cross-origin frame).
- **Captures leave our UI out:** `capture.js` removes the panel, toast, style and `data-af-state` from the saved copy.

## Part 5: permanent install prep

- `npm run sign` runs `tools/sign.js`, a guarded wrapper around `web-ext sign --channel=unlisted`. Keys come only from
  `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` (web-ext's own names; `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` accepted).
  Before uploading it refuses: missing keys, uncommitted changes, an already-signed version, lint errors, and any
  package entry outside the extension files (signing uploads the package to Mozilla, so fixtures / seed / tests /
  tools / docs must never be in it). `--dry-run` does every check and a test build without uploading.
- `DECISIONS.md` added to `web-ext-config.mjs` ignoreFiles (it would otherwise have been packaged).
- `npm run build` added for an unsigned zip. Signing was NOT run (as instructed). Steps: CLAUDE.md "Permanent install".
- web-ext is the global install used by `npm run lint` (10.7.0), not a devDependency: kept consistent.

## Part 6: my own improvements (each its own commit)

Found by profiling every capture for yellow fields, plus a read-only bug-hunt by a Sonnet reviewer (12 findings, each
verified before fixing; all 12 addressed, some narrowed).

- **Nested-legend context leak (Avature).** `readContext` used the first `<legend>` anywhere in the nearest fieldset;
  the Avature site wraps a whole step in one legend-less fieldset, so every field had "Are you currently legally authorized..."
  as its section. Now only a fieldset's own legend counts. Fixture case added (fails on the old code).
- **Instruction tails don't make labels "too long".** The Avature site's preferred-name radio ("..., please select yes below;
  otherwise, please select no.") went from yellow to answered (orange).
- **Export-control notice as a dropdown label** (a Greenhouse board): citizenship with scope "status" (named status only).
- **Safety: privacyAck never ticks a bundled agreement** (terms, background check, "true and accurate", authorize...).
- **Safety: consent rules** now cover authorizations, permissions, "I hereby", "I declare", "I confirm", opt-ins;
  "certification" alone (a credential question) is no longer treated as consent.
- **Safety: Avature single checkbox keeps its own text** ("I certify") next to the field label, so consent rules see it.
- **Safety: more salary wordings ignored** (CTC, stipend, rate of pay, "expect to be paid", annual income...).
- **High-school graduation year / date / GPA** no longer receive the college values.
- **Work authorization / sponsorship for another country** (Canada, UK, India, EU...) are not the stored U.S. answer.
- **otherPositions / previouslyEmployed tightened:** not "applied / interviewing for other roles", not "employed by the
  government / a competitor / a staffing agency" (the Workday tenant's "through a Staffing Agency" wording still matches).
- **Second Alt+Z keeps the first pass's green / orange outlines** (orange fields used to vanish, panel said 0 to review).
- **Q&A fuzzy match:** short questions with a swapped subject (Python vs Java) never match; an added word still does.
- **Phone too long for maxlength** is filled as digits (a leading US 1 dropped); ZIP+4 in a 5-box as the ZIP.
- **Free-text prompts** mentioning profile words ("Email marketing experience", "Please state your reasons") no longer
  get profile values; a keyword match inside a textarea is always orange.
- **"Not sure" options** no longer make "No" ambiguous.
- **No re-injection during a running pass** (background asks the page first); stale embed plan cleared.
- **Learn mode never saves identity data** (SSN, date of birth, passport / licence / tax / id numbers, bank / card).
- **"State of residence"** is the profile state.
- Process note: each commit ran its targeted tests; the full suite (777 tests) and lint ran on the final state of
  this part rather than before every one of the 19 small commits (each full run takes ~4.5 minutes).

### Not done: remaining ideas, judged low value or needing the owner

- "How did you hear about us?" is yellow on almost every site; a standard answer ("LinkedIn" / "Company website")
  would clear it, but the right answer differs per application: owner's call (today: learn mode / bank).
- Workday `isInRepeater` treats a question whose own legend starts with "Languages" / "Certifications" as a repeater
  (plausible, not seen in the Workday capture).
- workAuth option "I am a U.S. citizen and do not require sponsorship" reads as "No" (negation word); no capture has it.
- Eightfold "U.S. Armed Forces Status" and "employed by a {company} subsidiary" have no standard answer (unclear lists).
- Same-origin iframes are not descended into; learn-mode toasts inside a filled frame can be off screen.
- Day / month of birth (Avature) has no profile key on purpose (identity data).
- Multi-select react-selects (Greenhouse demographics) remain unfilled; Greenhouse geo "Location (City)" stays yellow.
- Speed: deliberately left for the separate performance pass the owner asked for.

## Performance pass (owner request, 2026-10-03, after the overnight report)

Measured with `AF_PROFILE` on all 31 fixture cases, three runs each, medians (sums per ATS). "Without dead popups"
leaves out react-selects that a saved page cannot open (no harness config): they wait out every timeout and are a
test artifact.

| ATS | Before | After | Change | Where it came from |
|---|---|---|---|---|
| Greenhouse (without dead popups) | 17,617 ms | 9,345 ms | −47% | filled dropdowns 8,620 → 441 ms: no 4 s wait when a typed search finds nothing |
| Workday | 7,760 ms | 7,021 ms | −10% | findFields 1,920 → 524 ms (memoized repeater / section walks, seen) |
| Avature | 3,754 ms | 3,671 ms | −2% | findFields 248 → 167 ms |
| Eightfold | 4,403 ms | 4,338 ms | −1.5% | findFields 725 → 646 ms (first-call layout dominates) |
| Generic | 4,024 ms | 3,962 ms | −1.5% | findFields 171 → 105 ms |
| Phenom | 1,545 ms | 1,542 ms | 0% | nothing left but settle |

- Equivalence: `AF_DUMP` of every fixture case (fields, order, descriptors, matched key, status, outline) is identical
  before and after (31/31). Full suite 783/783, lint 0 errors.
- **Workers** (Sonnet, disjoint files): (1) `ctx.seen` in autofill / generic / Greenhouse / Avature / Phenom + the
  react-select harness notices; (2) Workday findFields; (3) Eightfold findFields. **Reviewer** (Sonnet) approved (2) and
  (3) as written and **rejected** one piece of (1): a `popup()` fallback to `.select__menu` that would have turned an
  orange "unverified" dropdown into a yellow "nomatch" on a notice-only menu. Removed; the rest approved.
- The Greenhouse gain partly comes from correcting the test harness: real react-select v5 renders "No options" inside
  the listbox, the harness did not, so the adapter could not see it and waited 4 s. The live page was most likely
  already fast here; the harness now matches it.
- **Not done, on purpose:**
  - Injecting only the detected adapter: evaluating every adapter file costs ~2 ms of the ~9 ms for all scripts; the
    saving (a few executeScript round trips) is under 10% and cannot be measured without the live extension.
  - Shortening `POPUP_TIMEOUT` / `VERIFY_TIMEOUT` / `RESULTS_TIMEOUT` / close waits: they end as soon as their
    condition holds, so cutting them only speeds up failures and risks turning a slow real page's fill into "unverified".
  - "Fill all text fields at once": plain text fills are synchronous already (~1 ms each); there is nothing to batch.
  - Skipping the rescan when nothing mutated: a field revealed by CSS (`:checked ~`, `:has()`) appears without a DOM
    mutation; too small a gain for that risk.
- **The remaining cost is `settle`:** after every dropdown / radio / checkbox fill the pass waits until the page has
  been quiet for 150 ms, so it is ~150 ms × the number of revealing fields (70–90% of every remaining pass). Making it
  shorter is a bet that reveals start sooner on real sites, and the saved pages cannot tell us that. Measure on a live
  Workday page first (time from a Country pick to the State field appearing) before tuning it. Stopped here: every
  further gain above 10% needs that behavior change.

## Publish prep merge (owner request, 2026-10-03)

- **Merge.** `git pull ~/autofill-publish publish-prep --no-edit` (with `--no-rebase`: pull refused without a reconcile
  strategy). No conflicts: the branch only added docs, assets, icons, workflows and `.gitignore` lines (auto-merged).
- **Patch 6 done in full, not as written.** The patch kept `capture.js` in the repository; the owner asked to remove it,
  so `capture.js` and `tests/capture.test.js` are deleted (git history keeps them). Export's `browser.downloads` branch is
  removed too: without the permission it was dead code and a reviewer would ask about it. The `af-capture-url` readers
  stay (existing captures carry the meta).
- **Export file name** `formhand-export-<date>.json`; the `format` id inside stays `job-autofill-export` so every older
  export, `seed/seed.json` and `store/demo-profile.json` still import.
- **Yellow: `#a67c00`** (3.82:1 on white, still reads as amber), not the `#8a6d00` suggested in ACCESSIBILITY.md (4.9:1,
  olive brown). Page outlines only: the summary panel's bars stay `#fbc02d` because they sit on a dark background.
  Orange (3.08:1) was left alone: it passes and was not asked about.
- **Summary panel title** got `role=status` as well as the toast (patch 5 predates the panel).
- **Packaging (patch 3)**: `*.md` glob instead of a list, so a new note cannot ship; LICENSE stays in the package (as
  `scripts/build-xpi.sh` already did), so `tools/sign.js` now allows it.
- **Privacy guard (patch 7)**: exact lists instead of a subset check; also forbids `update_url`, any command other than
  `fill-page` and `browser.downloads`. Its runtime-file list comes from the manifest's background scripts.
- **Neutral example data**: beyond patch 4, the campus profile in `tests/options.test.js` is "Urbana, IL" (was
  a real-looking city) and the `SPEC.md` sentence about whose addresses the profiles hold now says "different addresses".
- **Placeholders**: `{GITHUB_URL}` -> `https://github.com/fdjfnd222dd/formhand`, `{PAGES_URL}` ->
  `https://fdjfnd222dd.github.io/formhand/`. `{AMO_URL}` (README) and `{SUPPORT_EMAIL}` (listing) stay: unknown until
  the listing exists / the owner picks a public address. The site's main button links to GitHub Releases until then
  (a literal `{AMO_URL}` link would be broken on the live site). The listing no longer points at a `privacy.html` that
  the site does not have.
- **Real name in history:** not rewritten (nobody asked, nothing is pushed). The privacy audit (internal notes) marks it HIGH and
  a fresh single-commit history as required before publishing.
- **`[autofill]` console tag** kept: the README and the bug-report form tell users to paste that line. The bug-report
  form now says Web Console (Ctrl+Shift+K): the injected scripts log in the page's console.
