# Privacy Policy: Formhand

*Effective 2026-10-03. Applies to the Formhand Firefox extension.*

## The short version
Formhand collects **no** personal information. The developer receives nothing: no analytics, no telemetry, no crash
reports, no accounts, no server. Everything you enter stays on your device in your Firefox profile.

## What the developer collects
Nothing. The extension contains no network code. It declares "no data collection"
to Firefox (`data_collection_permissions` = `required: ["none"]`). There is no third-party code, advertising, tracking
or remote code of any kind, and no LLM or AI service is called.

## What is stored on your device, and why
Stored with Firefox's `browser.storage.local`, only on your computer:
| Data | Purpose | You control it |
|---|---|---|
| Profiles you type in (name, contact details, address, links, education) | to fill forms | edit or delete in Preferences |
| Standard answers (e.g. work authorization, optional EEO answers) | to fill repeating compliance questions; blank = never filled | edit or clear in Preferences |
| Q&A bank (questions and your answers) | to fill questions you answered before | edit or delete in Preferences |
| Settings (learn mode on/off, company names you typed or the extension saw) | features | Preferences |

The extension does not encrypt this data. Anyone who can open your Firefox profile or your disk can read it; protect
it with disk encryption and your operating-system account. **Preferences > Delete all my data** (after a confirm step)
removes all of it at once: every profile, the standard answers, the Q&A bank and the settings. **Uninstalling the
extension removes this data too.**

## What the extension reads from web pages
Only when you press Alt+Z or the Fill button, the extension reads the form labels, field values and page headings of
that one tab to decide what to fill, and the page's company name (to fill `{company}`). It also looks at the page's
frames (their address, id, name, title and size, not their content) to find an application form embedded from another site. This
information is used in memory during the fill and is not sent or kept, except that, in **learn mode** (off by default),
questions and answers *you* type on the page are saved to your local Q&A bank.

### Embedded application forms
The extension holds host permissions for exactly four job-board sites: `job-boards.greenhouse.io`,
`boards.greenhouse.io`, `jobs.lever.co` and `jobs.ashbyhq.com`. When the page you pressed Alt+Z on embeds an
application form from one of them, the same fill runs inside that form, exactly as on a normal page. These permissions
are used only on that press: there are no content scripts and nothing runs on those sites in the background. You can
revoke them in about:addons > Formhand > Permissions; the popup's "Allow embedded forms" button asks for them again.

When the embedded form comes from any other site, the extension opens the form's address in a new tab next to the page,
so you can fill it there with Alt+Z. Your browser loads that address as if you had clicked a link to it; nothing else is
sent. Frames that are not application forms (ads, videos, chat, captchas, maps) are never opened.

## Files the extension can write
- **Export** (Preferences > Export): a JSON file of your profiles, answers and settings, saved by Firefox like any
  download (to your Downloads folder, or where Firefox asks you). It is plain text and contains whatever you entered
  (Preferences shows this warning next to the Export button). Handle it as a personal document. Delete all my data does
  not touch files you exported.
That is the only file. Nothing is uploaded automatically; whether you share a file is your decision.

## Sites you apply to
When Formhand fills a field, the website receives that value the same way it would if you had typed it. Their privacy
practices apply to what you submit. Formhand never submits anything for you.

## Children
Formhand is not directed at children and collects no information from anyone.

## Changes
If this ever changes (for example if network features were added), the change will be announced in the changelog, the
extension would have to re-declare data collection to Firefox, and this policy would be updated first.

## Contact
Questions: open an issue at https://github.com/fdjfnd222dd/formhand/issues (please do not include personal information).
Security reports: see [SECURITY.md](SECURITY.md).
