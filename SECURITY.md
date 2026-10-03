# Security Policy

## Reporting a vulnerability
Please **do not open a public issue** for a security problem. Use GitHub's private vulnerability reporting
("Security" tab > "Report a vulnerability") at https://github.com/fdjfnd222dd/formhand/security/advisories/new. If that is unavailable, open a public
issue that says only "security contact requested" and no details, and a private channel will be arranged.

Include: Firefox version, extension version, steps to reproduce, and the impact. **Do not include real personal data**
(names, addresses, saved pages). Use made-up values.

This is a volunteer-run project: expect an acknowledgement within about 7 days. There is no bug bounty.

## Supported versions
Only the latest released version receives fixes.

## In scope
- Anything that could make the extension send data off the device (it must not).
- Anything that lets a web page read the stored profile, answers or settings, or trigger a fill without the user's action.
- Anything that makes the extension fill or open a frame the user did not act on, or open a non-application page in a new
  tab (the embedded-form survey in `core/embed.js`).
- Clicking or submitting something the extension promises never to press (Submit, Next, links, consent boxes).
- Injection issues in the options/popup pages (they build the DOM with `textContent`, never `innerHTML`).
- The import path: a malicious JSON file should not be able to do more than add or replace local data.

## Out of scope
- Data you export and then share yourself; local access to your computer or Firefox profile (the extension's local
  storage is not encrypted by design: use disk encryption).
- Bugs in the job sites themselves.

## Design guarantees you can check
Permissions are limited to `storage`, `activeTab` and `scripting`, plus host permissions for exactly four job-board hosts
(`job-boards.greenhouse.io`, `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`), used only to fill their forms
when a page embeds them and you press Alt+Z. No `content_scripts`; no remote code; no network calls.
`tests/privacy-guard.test.js` fails if any of this changes. Any change that adds a permission or a host is a breaking
change and needs its own review (see CONTRIBUTING.md, "Hard rules").
