# Demo GIF and short video plan

Audience: someone deciding in 10 seconds whether to install. Show the promise (fast, local, in control), not the settings.

## Storyboard (about 9 seconds, 800 px wide, under 2 MB)
| t | On screen | Caption (burned in or alt text) |
|---|---|---|
| 0-1.5 s | `fixtures/generic/basic.html`: an empty application form | "A job application form" |
| 1.5-2.5 s | Keyboard overlay shows **Alt+Z** | "Press Alt+Z" |
| 2.5-5.5 s | Fields fill one by one, outlines appear: green, orange, yellow; summary panel "N filled · N to review · N need you" | "Filled locally. Nothing is sent anywhere." |
| 5.5-7.5 s | Cursor hovers an orange field and a yellow required field | "You review the orange and yellow ones" |
| 7.5-9 s | Cursor moves to the page's own Submit button, unclicked | "You press Submit. Formhand never does." |

## Rules
- Fake data only: `store/demo-profile.json` (see `store/SCREENSHOTS.md`). New Firefox profile, no bookmarks, no other tabs.
- Page: a hand-written fixture (`fixtures/generic/*.html`), never a real application and never a real site.
- No audio. Respect `prefers-reduced-motion` on the website: show the first/last frame as still images with the GIF behind a play control.

## Making it (no sudo)
1. Record: Peek, OBS or `wf-recorder -g "$(slurp)" -f demo.mp4` at 1280x720.
2. Trim and convert: `ffmpeg -i demo.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" docs/assets/demo.gif`
3. Check size (under 2 MB); if larger, lower fps to 10 or width to 720.
4. Add to README directly under the title line (`![Formhand filling a form](docs/assets/demo.gif)`) with alt text describing the three steps.
5. Also export `demo.webm` for the Pages site (smaller than GIF).

## Optional second clip (15 s): "Learn mode"
Turn on Learn mode in the popup, answer a custom question by hand, show the "Saved: ..." toast, reload a fresh form and press Alt+Z:
the answer fills (orange when it contains `{company}`).

## Accessibility of the demo
Provide a text description next to the GIF (the storyboard captions above) so it is not the only way to get the information.
