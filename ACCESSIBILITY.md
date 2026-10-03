# Accessibility review

Method: read `popup/`, `options/`, and `core/feedback.js` against WCAG 2.2 AA items listed in
`docs/EXTRAS_RESEARCH.md` section 7, and computed contrast ratios with the standard WCAG formula. No assistive
technology was run, and no automated checker (axe/Lighthouse) was run, so treat this as a desk review, not a certificate.
**Status in 1.0.0 (2026-10-03):** A1, A2 and A3 are fixed in `core/feedback.js` (see "Fixed" below); the others are open
and listed in `IDEAS.md`.

## Fixed in 1.0.0
| # | Change | Measured |
|---|---|---|
| A1 | Page outline yellow `#fbc02d` -> `#a67c00` (dark amber). The summary panel keeps `#fbc02d` for its count bars, which sit on `#212121`/`#333`. | `#a67c00` on white **3.82:1** (WCAG 1.4.11 needs 3:1); on `#f5f5f5` about 3.5:1. Panel bar `#fbc02d` on `#333` 7.6:1. Orange `#ef6c00` on white stays 3.08:1. |
| A2 | Line style per state: filled = solid, review = dashed, needs you = dotted. Site swatches match. | n/a |
| A3 | The toast (`notify`) is `role="status"` + `aria-live="polite"`; the summary panel (a `role="region"` named "Formhand summary") gives its title `role="status"`. The panel stays until closed, so the counts can be read at leisure, and its buttons are keyboard reachable. | Not tried with a screen reader. |

## What already works
| Item | Evidence |
|---|---|
| Page language declared | `<html lang="en">` in popup and options |
| Every control has a name | popup: radios and the learn toggle are inside `<label>`; options: labels wrap inputs, table inputs have `aria-label` |
| Status messages announced | options `#status` has `role="status"` |
| Keyboard operable | only native `<button>`, `<input>`, `<select>`, `<label>`; no click-only `div`s; native focus ring is not removed |
| No HTML injection | UI built with `textContent` / `.value` (so screen readers never meet half-built markup) |
| Text contrast in the extension pages | body note `#555` on white 7.5:1, link 6.4:1, success 5.1:1, error 5.6:1, badges 7.0-7.6:1 |
| Reflow | options page uses a fluid `max-width` and `flex-wrap`; popup is a fixed 280 px panel (fine for a popup) |

## Findings of the desk review (2026-10-02, before the 1.0.0 fixes; ranked)
| # | WCAG | Finding | Impact | Fix |
|---|---|---|---|---|
| A1 | 1.4.11 Non-text contrast | The **yellow "needs you" outline** (`#fbc02d`) on a white page is **1.7:1**; the orange review outline (`#ef6c00`) is **3.1:1** (borderline). On white forms the most important state (a required field you must answer) is the hardest to see. | high for low-vision users | PATCH 5: darker yellow (e.g. `#8a6d00`, 4.9:1) or a two-tone outline (outline + `box-shadow` in a contrasting colour) |
| A2 | 1.4.1 Use of colour | Green / orange / yellow are the **only** difference between the three states. People with colour-vision deficiency cannot tell orange from green reliably. | medium-high | PATCH 5: different outline *styles* (solid / dashed / dotted) as a non-colour cue; the toast already gives counts in words |
| A3 | 4.1.3 Status messages | The on-page **toast** has no `role="status"` / `aria-live`, so a screen-reader user is never told "12 filled, 3 to review, 1 needs you". It also disappears after 5 s (`pointer-events: none`, so it cannot be dismissed or read at leisure). | high for screen-reader users | PATCH 5: `role="status"` + `aria-live="polite"`. IDEAS: keep the summary reachable (the planned summary panel, "Phase 5") |
| A4 | 1.4.3 Contrast (minimum) | `.tag.review` in options (`#e65100` on `#fff3e0`) is **3.5:1** at 0.8em; AA needs 4.5:1. | low | darken the text, e.g. `#bf360c` |
| A5 | 1.4.12 / 1.4.4 | `.hint` in the popup is 0.8 em with 70% opacity (about 11 px). Contrast is fine (about 8:1) but it is small. | low | raise to 0.9em |
| A6 | 2.5.8 Target size (minimum) | Popup radios and the "Learn mode" checkbox use default browser sizes (about 13 px); the `.link` button is text-sized. The label wraps the control, so the hit area is the whole row (passes via the label), but row spacing is only 2 px. | low | add padding to `.profile` rows |
| A7 | 1.3.5 Identify input purpose | The profile form is built from a field list without `autocomplete` tokens (`given-name`, `family-name`, `email`, `tel`, `street-address`...) and the form has `autocomplete="off"`. | low (the data is the user's own profile) | optional: tokens would let browser/AT identify the purpose; `off` is intentional so Firefox does not fill the user's profile page with other saved data |
| A8 | Dark mode | No `prefers-color-scheme` handling; popup/options have no explicit background, so in Firefox dark themes the default `canvas` colours apply, but the hard-coded greys (`#555`, `#bbb`, `#e8f5e9`...) were chosen for light backgrounds. | medium | add `color-scheme: light dark` and token variables |
| A9 | 2.4.7 / 2.4.11 Focus | The summary panel (340 px wide, up to half the viewport high) covers the bottom-right corner of the host page until closed, and can hide a focused control there. | low | it has a close button (×); optional: a minimise state |

## How to verify after the patches (manual, 15 minutes)
1. Firefox: Tab through the popup and every options section; every control reachable, order = visual order, focus ring visible.
2. Orca/NVDA: press Alt+Z on `fixtures/generic/basic.html`; the counts must be announced (A3).
3. Set Windows/GNOME high-contrast or Firefox dark theme; open options and popup (A8).
4. Colour-blind simulation (Firefox DevTools > Accessibility > Simulate): the three outline states must be distinguishable by style (A2).
5. Zoom to 200% and 400%: options page must not scroll horizontally except inside the Q&A table (1.4.10).
6. Optional automated pass: Lighthouse accessibility audit on the options page opened as a tab; `axe` browser extension.
