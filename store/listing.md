# AMO listing copy: Formhand

Field limits come from `docs/AMO_REQUIREMENTS.md` (summary 250 characters, up to 2 categories; the name length limit is
NOT CONFIRMED by Mozilla's pages, so the name is kept short). Paste each block into the matching field in the Developer Hub.

## Name
```
Formhand - Job Application Autofill
```
(35 characters. AMO search weights the name most, so the descriptive words stay in it. No "Firefox" in the name.)

## Summary (198 characters, limit 250)
```
Fills job application forms from profiles and answers stored only in your browser. Press Alt+Z, review, then submit yourself. No account, no tracking, no network access. Never clicks Submit or Next.
```

## Description
AMO accepts limited HTML/Markdown; this is plain text with simple lists.
```
Formhand fills the repetitive parts of online job applications (name, contact details, address, links, education and the compliance questions that repeat on every form) from profiles and answers that you keep in your own browser. Press Alt+Z or use the toolbar button, read the page, fix what needs fixing, and press Next or Submit yourself.

PRIVACY FIRST
- Nothing leaves your computer. There is no network code, no analytics, no telemetry, no account and no server. The developer receives and keeps no personal information.
- Declares "no data collection" to Firefox.
- No website access until you ask: no content scripts. It touches only the tab you are on, only after you press Alt+Z or Fill.
- Host access to exactly four job-board sites (Greenhouse, Lever, Ashby), used only to fill their application forms when a company's career page embeds one and you press Alt+Z. No other site.
- Small and readable: plain JavaScript, no dependencies at runtime, no build step. Open source (MIT).

WHAT IT DOES
- Several profiles with a quick picker in the toolbar popup.
- Standard answers: answer the repeating compliance questions (work authorization, sponsorship, U.S. citizenship / "U.S. person" status, veteran, disability, EEO and others) once. They are used only when exactly one option clearly matches. Leave any blank and it is never filled.
- Q&A bank with optional learn mode: answer an unfamiliar question yourself and it is saved locally for next time. Sensitive questions never use loose matches.
- A {company} placeholder, so one saved answer works for every employer.
- Clear outlines after a fill: green = filled, orange dashed = please review, yellow dotted = needs you.
- A summary panel after each fill: click a count to jump to the next field to review or to answer.
- Application forms embedded in a company's career page: Greenhouse, Lever and Ashby forms are filled in place; any other embedded application form opens in its own tab, ready for Alt+Z.
- Export and import your data as a JSON file (plain text: the options page warns you before you save it).
- Delete all my data: one button, with a confirm step, wipes every profile, answer and setting.

WHAT IT NEVER DOES
- Never presses Next, Continue, Submit, Back, Cancel or links.
- Never ticks consent, agreement or signature boxes.
- Never fills salary expectations, emergency contacts or references.
- Never overwrites something you already typed.
- Never guesses a sensitive answer.

WORKS WITH
Dedicated handling for Phenom People, Greenhouse, Avature, Workday and Eightfold application pages, plus a generic filler for ordinary forms and company-built application pages. Custom dropdowns on these platforms were tested against simulations; please report anything that behaves differently on your application. No dedicated adapters yet for Lever, Ashby, iCIMS or SmartRecruiters (the generic filler runs on their forms).

PERMISSIONS, IN PLAIN WORDS
- storage: keeps your profiles and answers on your device.
- activeTab: lets it fill the tab you are on, only after you ask.
- scripting: runs the fill scripts in that tab.
- job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com: fill an application form from one of these sites when a company page embeds it, on the same Alt+Z. You can revoke this; such forms then open in their own tab.

Formhand is not affiliated with Mozilla or any application platform vendor. Product names belong to their owners. Firefox 142 or newer.

Source code, privacy policy and issue tracker: https://github.com/fdjfnd222dd/formhand
```

## Categories (max 2)
Primary: **Other**. Secondary (optional): **Privacy & Security**. Reason: AMO has no "Productivity" category in the
current list (`docs/AMO_REQUIREMENTS.md` section 3); the extension is a local-only form filler, so "Other" is honest and
"Privacy & Security" matches its main promise. Mozilla's guidance warns against spamming categories, so two at most.

## Tags (suggested; the allowed list is an AMO API endpoint, NOT CONFIRMED here, pick those that exist)
autofill, form filler, job application, jobs, careers, resume, privacy, productivity, hotkey

## Support and links
- Homepage: https://github.com/fdjfnd222dd/formhand  (or the GitHub Pages site: https://fdjfnd222dd.github.io/formhand/)
- Support site: https://github.com/fdjfnd222dd/formhand/issues
- Support email: {SUPPORT_EMAIL}  (use an address you are happy to publish; do not use a personal one)
- Privacy policy: https://github.com/fdjfnd222dd/formhand/blob/main/PRIVACY_POLICY.md (AMO also lets you paste the policy text itself)
- License: MIT (choose "Other" > paste link to LICENSE if the picker has no MIT entry, or select the MIT option if present)

## Release notes for 1.0.0
```
First public release. Fill job application forms from local profiles and answers; no network access, no data collection. Dedicated handling for Phenom, Greenhouse, Avature, Workday and Eightfold pages plus a generic filler; Greenhouse, Lever and Ashby forms embedded in company career pages are filled in place. See the changelog for details.
```

## Screenshot captions (see SCREENSHOTS.md)
1. "Press Alt+Z: green = filled, orange = please review, yellow = needs you. Click a count to jump to the next one."
2. "Pick a profile and fill from the toolbar. Learn mode saves answers you type, locally."
3. "Answer the repeating compliance questions once. Blank means never filled."
4. "Your saved questions and answers. {company} makes one answer fit every employer."
5. "Consent boxes and required questions are left for you."

## Experimental flag
Leave "This add-on is experimental" OFF only if you have tried it on a live application; otherwise tick it for the first
version and untick later. (Mozilla's search ranking boosts public non-experimental add-ons: `docs/EXTRAS_RESEARCH.md` section 9.)
