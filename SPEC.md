# Job Application Autofill Extension: SPEC

Build a Firefox browser extension (Manifest V3) that autofills job application forms across ATS platforms. I use it for every application, so it must be reliable, local only, and never submit anything. Firefox is the only target browser.

## Hard requirements
- 100% local. No network permissions, no remote code, no analytics, no LLM calls. Data lives in browser.storage.local.
  (The `downloads` permission was allowed on 2026-10-02 for captures and exports, then removed with the capture
  hotkeys for the public release on 2026-10-03: Export saves through an ordinary download link.)
  (Host permissions for job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co and jobs.ashbyhq.com only,
  to fill those forms when a company page embeds them in an iframe; decided 2026-10-02. Any other embedded
  application frame is opened in its own tab instead, with no extra permission.)
- NEVER click Submit, Next, Save and Continue, or any navigation button. Fill only. I review and advance manually.
- Salary/compensation/pay expectations, emergency contact and references fields are never filled, never learned and never outlined, even when required (decided 2026-10-02).
- Never overwrite a field that already has a value unless I trigger "force refill".
- Triggered by hotkey (Alt+Z; Alt+Shift+F conflicted with Firefox's File menu on Linux) and the toolbar popup. No auto run on page load.
- Plain JS, no build step unless clearly justified. Keep it small and readable.
- Use the browser.* API (Firefox native), background scripts (not service_worker), and include browser_specific_settings.gecko.id in the manifest.

## Architecture
- core/matcher.js: normalize question/label text (lowercase, strip punctuation, asterisks, "please select", split camelCase from data-automation-id), then match against the answer bank. Exact normalized match first, then weighted keyword rules, then fuzzy match with a confidence score.
- core/filler.js: set values in a way React/Angular accept (native value setter + input/change/blur events). Handle text, textarea, native select, radio, checkbox, date inputs.
- adapters/: one file per ATS (workday, greenhouse, avature, phenom, lever, ashby, icims, smartrecruiters) plus generic. Detect ATS by hostname and DOM markers. Each adapter knows how to find question containers, read label text, and operate its custom widgets.
- Workday adapter is priority one. Its dropdowns are button + listbox popups, not native selects: click the button, wait for the popup (data-automation-id like selectWidget-SuggestionPopup / menuItem / promptOption, but verify against fixtures), click the option whose text matches, confirm the value stuck. Also handle Workday multiselect search inputs and radio groups. Use MutationObserver/polling with timeouts, not fixed sleeps.

## Answer bank + learn mode (the key feature)
- Profile: name, email, phone, address, links, school, degree, grad date, GPA, work authorization, etc.
- Q&A bank: normalized question text -> answer, plus aliases.
- Learn mode: when I manually answer any field on a supported page, capture normalized question + my answer and save it (show a small toast "Saved: <question>"). Next time that question appears anywhere, fill it.
- Sensitive questions (work authorization, sponsorship, relationships with employees, prior employment, criminal/background, EEO/disability/veteran) only fill on exact or very high confidence match. Never fuzzy guess these.
- Export/import the bank as JSON so I can sync between two laptops.
- Company name normalization (added 2026-10-02): the hiring company is detected on the page (Workday tenant,
  hostname, page title, job header, JSON-LD, og:site_name, logo alt text). Before matching and before learn mode
  saves, the company's name and obvious variants ("Vandelay Kramer Benes" / "Vandelay Kramer") become {company}, so one
  saved answer covers every company. An answer that names the company is filled back with the current company's
  name and outlined orange. Options offers to convert older entries that still name a company.
- A failing or empty ATS adapter never blocks filling: the generic adapter takes over (added 2026-10-02).
- Standard answers (added in Phase 3): a fixed set of canonical compliance/EEO questions answered once in
  the options page: work authorization, sponsorship, gender, Hispanic/Latino, race/ethnicity, veteran status,
  disability (CC-305), privacy/data transfer acknowledgment, consider for other positions, previously worked
  here, currently employed by a client, relatives / family / close personal relationship with an employee or
  applicant, referred by an employee (the last four default No and are always orange; relatives and referral
  added 2026-10-02), U.S. citizenship / "U.S. person" status for export-control questions (added 2026-10-02:
  stored as a status, blank by default, always orange; the Yes/No follows from which statuses the question names). Recognized across
  wording variants; a confident recognition counts as the exact match the sensitive rules need. The stored
  answer is matched to option text across variants; if no option clearly matches, the field stays yellow.
  A question left blank is never filled.

## Visual feedback after a fill
- Green outline: filled from a confident match.
- Orange: filled but low confidence, review it.
- Yellow: required field with no answer, needs me.
- Small summary panel: X filled, Y need review, Z unknown, with click to scroll to each.

## Options page
Edit profile, browse/search/edit/delete Q&A entries, toggle learn mode, export/import.

## Testing
- fixtures/ has real saved application pages from several ATS. Write Playwright tests (Firefox) that load each fixture, run the filler with a test bank, and assert results. Add new fixtures as I collect them.
- web-ext lint must pass. Use web-ext run for manual testing.

## Process
Work in phases and STOP after each so I can test on real applications:
1. Scaffold, storage, profile, generic text field filling, hotkey, feedback outlines.
2. ATS adapters (re-planned 2026-10-02 around the sites I actually apply to): first every ATS with real captures in fixtures/ (Phenom, Greenhouse, Avature), verified against them, including custom dropdowns; then the Workday adapter built from known conventions, every selector marked UNVERIFIED with label-text fallbacks, reconciled when real Workday captures exist.
3. Learn mode + Q&A bank + sensitive question rules. Seed data (resume + profile-seed.txt) is in seed/ (gitignored, never packaged).
   Also in Phase 3 (decided after Phase 2):
   - Fill the FIRST education entry from the profile (school, degree, major, grad date) wherever the ATS renders it by default (Greenhouse education block, Avature education dataset row 0, Workday Education 1 if present). Further repeating entries stay skipped.
   - Plain fields inside EEO / self-identification sections (name, today's date) may be filled. The EEO answers themselves (disability, veteran, gender, ethnicity, race) are never filled unless the Q&A bank has an exact match.
   - Outline required fields inside skipped sections yellow, so they are not missed.
   Also pulled into Phase 3 (2026-10-02): multiple profiles + toolbar popup picker (below), standard
   answers, built-in capture hotkeys (Ctrl+Shift+1 now, Ctrl+Shift+2 after 4 s; replaces the Violentmonkey
   grabber; removed 2026-10-03 for the public release, use Firefox's Save Page As), fill hotkey Alt+Z, export/import (needed for the seed).
4. Re-planned 2026-10-02 around real data (was: Lever, Ashby, iCIMS, SmartRecruiters adapters, plus embedded
   cross-origin ATS iframes). Only platforms with real captures get adapters: Eightfold built,
   Greenhouse re-verified, a company's own form (no ATS) handled by the generic adapter. Embedded cross-origin ATS iframes
   (CareerPuck -> Greenhouse) are detected and reported, not filled (top frame only, no host permissions).
   (Superseded 2026-10-03: Greenhouse / Lever / Ashby frames are filled in place, others open in their own tab.)
   Lever, Ashby, iCIMS, SmartRecruiters and Workday have no captures yet: gaps until the owner saves one.
   Workday reconciled 2026-10-02 against a real five-step application on one tenant (fixtures/workday/).
   Lever, Ashby, iCIMS, SmartRecruiters remain without captures.
5. Options page, export/import, summary panel polish.
Later (not scheduled into a phase yet, do not build early):
- (Built in Phase 3.) Multiple profiles with a picker in a toolbar popup. I apply with different addresses depending on the job, so address/contact can differ per profile. The Q&A bank is shared across all profiles.

Write a CLAUDE.md documenting architecture, how to add an adapter, and how to add a fixture. Commit after each phase.
