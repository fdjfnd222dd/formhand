# Brand

## Chosen name: **Formhand**

*"A helping hand with forms."* Formhand fills the boring parts of a job application and leaves the
decisions (and the Submit button) to you.

### Five candidates considered

All five contain no ATS/vendor brand (Workday, Greenhouse, Lever, Ashby, Avature, Phenom, Eightfold,
iCIMS, SmartRecruiters, Taleo...), no browser brand ("Fox", "Firefox", "Mozilla"), and no "LinkedIn/Indeed"-style
job-board brand. Checked on 2026-10-02 against the AMO search API (exact-name hits) and a web search.

| Name | Idea | AMO exact-name hit | Web search | Verdict |
|---|---|---|---|---|
| **Formhand** | a hand that helps with forms | none | no product found | **chosen** |
| Steadyfill | calm, reliable filling | none | no product found (an unrelated "Steady" employment app exists) | runner-up; "Steady" is close to a known app |
| Tendfill | tend a form for you | none | no product found | reads awkwardly |
| Appfold | application + fold | none (one fuzzy hit, unrelated) | not checked deeply | too close to "app folder" results |
| Rungfill | one rung at a time | none | no product found | meaning unclear |

Rejected early: *Quillfill* (an add-on of that name already exists on AMO), *HireHand* (an existing
company), anything with "Fox".

### Caveats (this is not legal advice)
A name search is not a trademark clearance. Before the first listing, the maintainer should run a
free USPTO TESS/ EUIPO / WIPO search for "Formhand" in class 9 (software) and class 42.

### Tagline and voice
- Tagline: **Job application autofill for Firefox.** (Descriptive use of "Firefox" in a tagline, not in the add-on
  name. Do not add "for Firefox" to the AMO *name* field.)
- Promise lines (all true of the code): *100% local. No account. Never presses Submit.*
- Plain, calm, privacy first. No "AI", no "supercharge".
- Say "applicant tracking systems (ATS)" in general; name a vendor only in factual compatibility tables, with
  the disclaimer that all product names are trademarks of their owners and no affiliation is implied.

## Logo
An original mark made for this project: a rounded indigo tile holding three form fields (two filled in white,
one still dashed = "still yours to answer") and a green tick badge.

| File | Use |
|---|---|
| `icons/logo.svg` | master artwork (128 viewBox) |
| `icons/logo-small.svg` | hand-simplified variant for 16/32 px (fewer shapes, no dashes) |
| `icons/icon-16.png`, `icon-32.png` | rendered from `logo-small.svg` |
| `icons/icon-48.png`, `icon-96.png`, `icon-128.png` | rendered from `logo.svg` |
| `store/assets/listing-icon-128.png`, `listing-icon-512.png` | AMO listing icon |
| `store/assets/github-social-preview.svg` / `-1280x640.png` | GitHub social preview |

Colours: indigo `#3B4FD8` (tile), white `#FFFFFF`, green `#22B573` (the same "filled" green idea as the
extension's outlines). Text in the social preview uses Liberation Sans (SIL OFL), falling back to DejaVu Sans.

Regenerate PNGs (needs `rsvg-convert` from librsvg; no root needed to run it):
```bash
for s in 16 32; do rsvg-convert -w $s -h $s icons/logo-small.svg -o icons/icon-$s.png; done
for s in 48 96 128; do rsvg-convert -w $s -h $s icons/logo.svg -o icons/icon-$s.png; done
rsvg-convert -w 128 -h 128 icons/logo.svg -o store/assets/listing-icon-128.png
rsvg-convert -w 512 -h 512 icons/logo.svg -o store/assets/listing-icon-512.png
rsvg-convert -w 1280 -h 640 store/assets/github-social-preview.svg -o store/assets/github-social-preview-1280x640.png
```
The logo is original work released under the same MIT license as the code.

## Identifiers
Set on 2026-10-03: name **Formhand**, add-on ID `formhand@fdjfnd222dd`, version 1.0.0 (`manifest.json`).
The add-on ID is **permanent** once the first version is uploaded to AMO.
