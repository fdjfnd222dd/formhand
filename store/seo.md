# Store SEO notes (AMO search and GitHub)

Evidence: `docs/EXTRAS_RESEARCH.md` section 9 (addons-server search documentation, as read during research) and the
listing guidance on Extension Workshop. Rules of thumb, not guarantees.

## What AMO search appears to weigh
Name matches count most (documented boosts: name up to 100 for an exact match, summary 3, description 2), then popularity
(log of average daily users), public non-experimental add-ons are boosted, "Recommended" much more. A brand-new add-on has
almost no popularity, so **early ranking comes from the name and the first sentence of the summary.**

## Choices made
| Element | Choice | Why |
|---|---|---|
| Name | `Formhand - Job Application Autofill` | brand + the three words people search; no ATS or browser brand |
| Summary | starts "Fills job application forms from profiles..." | the searched phrase sits at the start; states the privacy promise within 250 characters |
| Description | headings in capitals + short lists; privacy first, then features, limits, permissions | AMO shows limited formatting; reviewers and users both look for permissions |
| Categories | Other (+ optional Privacy & Security) | no better-fitting category exists in the current list; Mozilla warns against category spamming |
| Tags | autofill, form filler, job application, jobs, careers, resume, privacy, productivity, hotkey | natural phrases; pick the ones that exist in the tag list |
| Screenshots | 5, each with a caption, story order | `store/SCREENSHOTS.md` |
| Icon | simple shape readable at 16 px | `BRAND.md` |
| Privacy policy | linked, plain-language, "no data" | trust signal; also answers the permission questions up front |

## Words to use naturally (do not stuff)
job application, autofill, form filler, applicant tracking system (ATS), resume, profile, Q&A, Firefox, privacy, local, offline.
Vendor names (Greenhouse, Workday, ...) may appear once in a factual compatibility sentence; never in the name or tags.

## Words to avoid
"AI" (it does not use any), "auto-apply" / "apply to jobs for you" (it never submits), "best", "#1", anything implying endorsement.

## GitHub
- Repository description (about 120 chars): "Local-only Firefox extension that autofills job applications. No account, no network, never presses Submit."
- Topics: `firefox-addon`, `webextension`, `autofill`, `job-application`, `privacy`, `manifest-v3`, `form-filler`, `ats`.
- Social preview: `store/assets/github-social-preview-1280x640.png` (Settings > General > Social preview).
- Releases carry the zip; README top shows privacy, not a badge wall.
- Add the AMO version / users badges only after the listing is live (`https://img.shields.io/amo/v/<slug>`; route names are in
  the shields.io source, the exact URL form was not verified).
