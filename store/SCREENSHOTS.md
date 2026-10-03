# Screenshots: how to stage them (fake data only)

**Rule: no real data in any screenshot, GIF or social image. Ever.** Use a throwaway Firefox profile, the fake
profile `store/demo-profile.json`, and the hand-written pages in `fixtures/generic/`. Never use a saved real
application page (they are gitignored and contain personal data) and never a live job site while a real
account or real application is open.

`store/demo-profile.json` is checked in: it uses a made-up person ("Alex Sample"), `example.com` addresses,
`555-01xx` phone numbers and an invented school. It was verified to import cleanly through the extension's own
`core/storage.js` `importAll` (2 profiles, 2 saved answers, 6 standard answers).

## AMO screenshot specs (from `docs/AMO_REQUIREMENTS.md`)
- Recommended size 1280x800 (1.6:1 ratio); one key feature per screenshot; order them as a story.
- File formats: not confirmed by Mozilla's pages, use PNG.

## 0. One-time staging
1. Throwaway profile (not your everyday one): `firefox -no-remote -CreateProfile formhand-shots` then
   `firefox -no-remote -P formhand-shots`. Or use the project's dev profile via `npm start` (it is separate from
   your everyday profile and opens `fixtures/generic/basic.html`).
2. Load the extension: `npm start`, or `about:debugging#/runtime/this-firefox` > "Load Temporary Add-on" >
   pick `manifest.json`.
3. Open the extension's Preferences (about:addons > the extension > Preferences, or the popup's
   "Profiles & answers...").
4. Export / import > Import > choose `store/demo-profile.json`. Profiles "Demo - home address" and
   "Demo - campus address" appear; the home one is active.
5. Set the browser window to exactly 1280x800 of content: a window about 1280x900 with the toolbar hidden works, or use
   Responsive Design Mode (Ctrl+Shift+M) set to 1280x800 and "Take screenshot" from its menu. Zoom 100%, light theme
   for the first set, dark theme for an optional second set.
6. Check nothing personal is visible: bookmarks bar off, no other tabs, no extension icons from other add-ons, no
   username in the title bar or a file path. Look at every shot before saving.

## 1. The five shots (file names to use in `store/assets/screenshots/`, not committed until reviewed)
| # | File | What to show | Steps |
|---|---|---|---|
| 1 | `01-fill-result.png` | Form just filled: green solid outlines, orange dashed "review" fields, yellow dotted "needs you" fields and the summary panel (bottom right) with its counts and the list of fields to check | Open `fixtures/generic/basic.html` (`file://` path of the checkout). Press Alt+Z. The panel stays until you close it (×), so there is no rush. Optionally click the "to review" count first so one field shows the blue focus ring. |
| 2 | `02-popup.png` | Toolbar popup with the two demo profiles, the Fill button and the Learn mode toggle (if an "Allow embedded forms" box shows, the host permissions are not granted: click it first, so the shot shows the normal popup) | Click the toolbar icon. The popup is a separate panel: use the OS screenshot tool (Spectacle/Flameshot) and crop; place it on a 1280x800 canvas with a neutral background. |
| 3 | `03-standard-answers.png` | Options page "Standard answers" with the demo answers | Preferences tab, scroll to Standard answers. |
| 4 | `04-qa-bank.png` | Options page Q&A bank with the two demo entries, one containing `{company}` | Preferences tab, scroll to Q&A bank. |
| 5 | `05-sections.png` | Required fields in a skipped section outlined yellow, consent boxes untouched | Open `fixtures/generic/compliance.html`, press Alt+Z. This page shows the "never ticks consent boxes" promise. |

Caption text (AMO lets you add a caption per screenshot): see `store/listing.md`, section "Screenshot captions".

## 2. Demo GIF (README / GitHub Pages, optional on AMO)
Keep it under 10 s and under 2 MB, 800 px wide, three beats: (a) blank form, (b) press Alt+Z, (c) filled form with
outlines and the summary panel. Record with Peek or `wf-recorder`/OBS in the throwaway profile, then
`ffmpeg -i in.mp4 -vf "fps=12,scale=800:-1:flags=lanczos" demo.gif` (or gifski). Save as `docs/assets/demo.gif`.
Details and shot list: `docs/DEMO_PLAN.md`.

## 3. Before you publish any image
- [ ] Zoom into the image at 200%: no real names, emails, phone numbers, addresses, file paths.
- [ ] Window title and tab strip contain only `fixtures/generic/...` or `localhost`.
- [ ] `exiftool` shows no GPS/author metadata (`exiftool -all= file.png` strips it).
- [ ] The only profile visible is "Demo - ..."
