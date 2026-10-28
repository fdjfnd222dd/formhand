<p align="center"><img src="icons/icon-96.png" width="96" height="96" alt="Formhand logo"></p>

# Formhand

**Job application autofill for Firefox. 100% local. No account. Never presses Submit.**

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue)](https://github.com/fdjfnd222dd/formhand/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Data collected: none](https://img.shields.io/badge/data%20collected-none-brightgreen)](PRIVACY_POLICY.md)

Formhand fills the repetitive parts of online job applications (name, contact details, address, links,
education, and the compliance questions that repeat everywhere) from profiles and answers that you keep
**inside your own browser**. You press **Alt+Z**; it fills; you read, fix and click Next/Submit yourself.

> Not affiliated with, endorsed by, or sponsored by Mozilla or any applicant tracking system vendor.
> All product names are trademarks of their respective owners and are used only to say what works with what.

## Privacy first

- **Nothing leaves your computer.** The extension contains no network code: no analytics, no telemetry, no
  accounts, no servers, no remote code, no AI/LLM calls. The developer receives and retains zero personal information.
- Your profiles and saved answers live in Firefox's local extension storage (`browser.storage.local`) on your device.
- It declares **"no data collection"** to Firefox (`data_collection_permissions: required: ["none"]`).
- **No website access until you ask.** There is no content script. The extension touches a page only after you press
  Alt+Z or the popup's Fill button (Firefox's `activeTab` grants access to that one tab).
- **Four job-board sites, for embedded forms only.** Company career pages often show a Greenhouse, Lever or Ashby
  application inside a frame. To fill that frame on the same Alt+Z, the extension holds host permissions for exactly
  `job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co` and `jobs.ashbyhq.com`, and uses them only on that
  press. No other site, no `<all_urls>`. If you revoke them (about:addons > Formhand > Permissions), embedded forms open
  in their own tab instead.
- It never presses Next, Continue, Submit, Back, Cancel or links. See [How it stays safe](#how-it-stays-safe).
- Small and plain: about 6,800 lines of readable JavaScript (about 330 KB unpacked), no dependencies at runtime,
  no build step, so what you read in this repository is exactly what runs.

Full details: [PRIVACY_POLICY.md](PRIVACY_POLICY.md). Why each permission exists: [Permissions](#permissions).

## Features

- **Profiles** (several, e.g. different addresses) with a picker in the toolbar popup. Name, contact, address,
  links, and the first education entry.
- **Standard answers**: answer the repeating compliance questions once (work authorization, sponsorship, U.S.
  citizenship / "U.S. person" status for export-control questions, gender, Hispanic/Latino, race/ethnicity, veteran
  status, disability, privacy acknowledgment, other positions, previously employed, client employee, relatives, referred
  by an employee). They are recognised across wording variants and are
  only used when exactly one option clearly means your answer; otherwise the field is left for you. A question left blank
  is never filled.
- **Q&A bank and learn mode**: turn on learn mode, answer an unfamiliar question yourself, and the question and your
  answer are saved locally for next time. Sensitive questions only use exact (or near-exact) matches, and EEO questions
  only use your standard answer or an exact entry. Never a guess.
- **`{company}` placeholder**: questions and answers that name the hiring company are stored once with `{company}` and
  filled with the company detected on the page (orange outline so you check it).
- **Visual feedback**: green solid outline = filled confidently, orange dashed = filled but please review, yellow
  dotted = a required field that needs you.
- **Summary panel**: after a fill, a small panel (bottom right) shows the profile used, the hiring company and the
  counts. Click a count to scroll to the next field in that state; fields to review and fields that need you are listed
  by label. It only scrolls: it never clicks or focuses anything on the page.
- **Embedded application forms**: a Greenhouse, Lever or Ashby form inside a company's career page is filled in place
  on the same Alt+Z. Any other application form in a frame from another site is opened in its own tab next to the page
  (press Alt+Z there). Ads, videos, chat widgets, captchas and maps are never opened.
- **Export / import** your profiles, answers and settings as a JSON file, for backup or moving between machines. The
  file is plain text with your personal data in it (Preferences says so next to the button): keep it private.
- **Delete all my data**: one button in Preferences (with a confirm step) removes every profile, standard answer, Q&A
  entry and setting from the browser.
- **Works across sites**: dedicated handling for several platforms (below) plus a generic fallback for ordinary forms.

## How it stays safe

These are enforced in code and covered by tests:

- Never presses navigation or submit controls. The only programmatic clicks are on form widgets (radio, checkbox,
  dropdown openers and options) and are allow-listed in one place (`core/widgets.js`).
- Never ticks consent, agreement or signature checkboxes and never types a signature. (The one exception is an optional
  *Privacy / data transfer acknowledgment* standard answer that is blank by default and always outlined orange.)
- **Salary and pay expectations, emergency contacts and references are ignored completely**: never filled, never learned.
- Never overwrites a field that already has a value.
- Never guesses sensitive answers (work authorization, sponsorship, relationships, prior employment, criminal/background, EEO).
- A broken platform adapter can never block filling: the generic filler takes over.

## Supported sites

"Page structure" means the extension's selectors were checked against real saved application pages from that platform.
"Dropdown behaviour" means how custom dropdown widgets behave when filled; those were exercised in **simulated** test
harnesses written from library knowledge, not recorded from live sites, so treat them as experimental until you have
seen them work on your application. The saved pages themselves are not published (they contain personal data).

| Platform | Page structure | Custom dropdown behaviour | Notes |
|---|---|---|---|
| Phenom People career sites | Verified (4 saved pages) | n/a (native selects) | Best covered. |
| Greenhouse job boards (incl. `/embed/job_app`) | Verified (7 pages, 3 companies) | Experimental (react-select simulated) | "Location (City)" type-ahead, the phone country flag picker and multi-select questions are left for you. |
| Greenhouse forms embedded in a company career page | Frame detection verified on 2 saved company pages; the form inside is the Greenhouse markup above | as above | Filled in place. The frame injection itself was tested with a simulated browser API only. |
| Avature wizards | Verified (7 pages, steps 3, 4, 6) | Experimental (select2 simulated) | |
| Workday | Verified on one company's five-step application | Experimental (prompts and several lists never seen open) | Other Workday tenants may differ. |
| Eightfold | Verified (2 pages) | Experimental (only Yes/No lists seen open) | |
| Company-built forms (no ATS) | Handled by the generic filler | n/a | Verified on one such form. |
| Any other ordinary HTML form | Generic filler | n/a | Text fields, native selects, radios, checkboxes. |
| Lever, Ashby | **No dedicated adapter** | | The generic filler runs on their pages, and on their forms embedded in a company page (filled in place). No saved pages exist to test against. |
| iCIMS, SmartRecruiters | **No dedicated support yet** | | The generic filler may still help on their own pages. |
| Other application forms embedded from another site in a frame | **Not filled in place** | | Opened in their own tab next to the page; press Alt+Z there. |

## Install

1. **Install from the latest GitHub release (.xpi)**: download the `.xpi` from the [Releases](https://github.com/fdjfnd222dd/formhand/releases/latest) page and open it in Firefox.
2. **From source (developers)**: clone the repository, open `about:debugging#/runtime/this-firefox`,
   choose *Load Temporary Add-on...* and select `manifest.json`. Or `npm install && npm start`.

Requires Firefox 142 or newer (desktop).

## Usage

1. Open the extension's **Preferences** (about:addons, or the popup's *Profiles & answers...*) and fill in a profile and the
   standard answers you are comfortable with. Leave any you do not want answered blank.
2. Open a job application page. Press **Alt+Z** (or click the toolbar icon and *Fill this page*).
3. Read the page and the summary panel (click its counts to step through the fields). Fix orange and yellow fields.
   Press Next/Submit yourself. If the form was embedded from another site and opened in a new tab, press Alt+Z there.
4. Optional: turn on **Learn mode** (popup or Preferences). After a fill on a page, answers you type or pick yourself are saved
   to the Q&A bank ("Saved: ..." message). Edit or delete entries any time in Preferences.

Change the shortcut in about:addons > gear icon > *Manage Extension Shortcuts*. Alt+Z is a suggestion; Firefox
silently drops a suggested key that conflicts with another.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Keeps your profiles, standard answers, saved answers and settings on your device. |
| `activeTab` | Lets the extension read and fill the tab you are on, only after you press Alt+Z or Fill. |
| `scripting` | Injects the fill scripts into that one tab when you ask (and into an embedded form's frame, below). |
| Host access to `job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com` | Fills one of their application forms when a company page embeds it in a frame, on the same Alt+Z. Optional: revoke it and those forms open in their own tab instead. |

No other host permissions, no `<all_urls>`, no `tabs`, no `downloads`, no network access. *Export* saves its file through
an ordinary download link. See [store/permissions.md](store/permissions.md).

## FAQ

**Is my information sent anywhere?** No. There is no code that sends data. You can verify: search the extension's source files (not the tests) for
`fetch`, `XMLHttpRequest`, `WebSocket`: none are used.

**Where is my data stored, and is it encrypted?** In Firefox's per-profile extension storage on your disk, like other
extension settings. The extension does not encrypt it, so use disk encryption and a Firefox profile only you can open.
*Delete all my data* in Preferences (after a confirm step) or uninstalling the extension deletes it. Exported JSON files
are plain text: keep or delete them like any file with your address in it.

**Will the site see what Formhand fills in?** Yes, the same way it sees anything you type: the values appear in the
form fields. Formhand only fills when you press the key.

**Why was a field left empty or outlined?** Yellow = a required field with no answer or no clearly matching option.
That is deliberate: it would rather ask you than guess. Salary, emergency contacts and references are never touched.

**Why does it ask for access to Greenhouse, Lever and Ashby?** Many company career pages show the real application
form from one of those sites inside a frame. Firefox only lets an extension fill that frame with a host permission for
its site. Formhand uses it only when you press Alt+Z on such a page. Without it, the embedded form opens in its own tab
and you press Alt+Z there.

**Why did a new tab open?** The page you were on shows its application form inside a frame from another site that
Formhand cannot fill in place. It opened that form in its own tab (next to the page) so you can fill it there with
Alt+Z. Pressing Alt+Z on the first page again switches to that tab instead of opening another.

**Does it use AI?** No. Matching is rule based (normalised label text, keyword rules and fuzzy string similarity), all local.

**Does it work on Chrome?** No. Firefox only.

**It did not work on a site.** Open an [issue](https://github.com/fdjfnd222dd/formhand/issues) using the template, with the site's platform and the
`[autofill] ...` line from the page's Web Console (Ctrl+Shift+K), and *no personal data*.

## Development

```bash
npm install                     # Playwright only (dev dependency)
npx playwright install firefox  # test browser
npm test                        # node:test, one file at a time
npm run lint                    # web-ext lint (needs web-ext installed)
npm start                       # Firefox with a separate dev profile and the extension loaded
```

Tests that use real saved application pages skip themselves (or are not generated) when those gitignored files are
absent. For 1.0.0 the maintainer's copy, with the private pages, runs 810 tests, all passing; a fresh clone runs 405
(365 pass, 40 skipped, 0 fail): the hand-written fixtures, the pure-logic tests, the widget harnesses and the privacy guard (`tests/privacy-guard.test.js`: exact permission and host
lists, no network or dynamic-code APIs in any runtime file). Details and rules for adding platform
support: [CONTRIBUTING.md](CONTRIBUTING.md). Architecture notes: `SPEC.md`.

## Known limits

- Only the first education entry is filled; further entries and work history are outlined if required, not filled.
- Embedded forms: only Greenhouse, Lever and Ashby frames are filled in place (Lever and Ashby with the generic filler);
  other application frames open in their own tab. Frames from the same site as the page are not filled. No shadow-DOM traversal.
- Multi-select dropdowns (for example some demographic questions) are not filled.
- Learn mode begins only after the first fill on a page (there is deliberately no content script). Inside a tall embedded
  form its "Saved: ..." message can be off screen.
- The hotkey, popup, frame injection and new-tab plumbing is tested with a simulated browser API and by hand, not against a
  real Firefox extension runtime (tests inject the page scripts directly).

## Why I built it

Job application forms ask for the same name, address, links and compliance questions over and over. Most existing
autofillers send form data to a server or require an account. Formhand was built to keep everything local in the
browser and to never press Submit, so the person applying stays in control of every application.

## Built with

- Firefox WebExtension, Manifest V3 (`browser.storage.local`, `activeTab`, `scripting`, `commands`)
- Vanilla JavaScript: no framework, no runtime dependencies, no build step
- Tests with `node:test` and Playwright (Firefox); linting with `web-ext lint`

## License

[MIT](LICENSE) © 2026 fdjfnd222dd. The logo is original work under the same license.
