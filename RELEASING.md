# Releasing (maintainer checklist)

Everything here is manual and local-first. Nothing is pushed or uploaded by any script in this repository except the
optional, manually-triggered workflow `.github/workflows/sign-amo.yml`.

## Before the first release only
1. The pre-release changes are in (2026-10-03: name Formhand, add-on ID `formhand@fdjfnd222dd`, version 1.0.0, packaging,
   example names, accessibility, capture removal, privacy guard, export warning, Delete all my data). Run the tests.
2. Publish only a fresh single-commit clone made with the neutral identity, never the development repository
   (**required**: its old commits carry personal identities). The maintainer's private working copy has the script that builds
   it, with its verification checks (not part of the public repository).
3. Placeholders still open: `grep -rn "{AMO_URL}\|{SUPPORT_EMAIL}" .` (README install line and the listing's support
   email; `{GITHUB_URL}` / `{PAGES_URL}` are filled with `https://github.com/fdjfnd222dd/formhand` and
   `https://fdjfnd222dd.github.io/formhand/`). After approval, point the site's "Download" button at the AMO page.
3a. The add-on ID changed from the internal builds, so Firefox treats Formhand as a new add-on with empty storage: in the
   old add-on's Preferences, **Export** first, then **Import** the file into Formhand.
4. Stage and capture screenshots with the fake profile (`store/SCREENSHOTS.md`). Check every image.
5. Create the AMO account and (optionally) API keys. **The add-on ID in `manifest.json` is permanent after the first upload.**

## Each release
1. `npm ci && npx playwright install firefox && npm test` (all green).
2. `web-ext lint --warnings-as-errors` (0 errors, 0 warnings).
3. Update `CHANGELOG.md` (move "Unreleased" to the new version and date) and bump `version` in `manifest.json` and `package.json`.
   Every AMO upload needs a version higher than the last (the AMO page does not state this; web-ext/AMO reject duplicates).
4. `scripts/build-xpi.sh` and read the printed file list: only runtime files, no docs, no `seed/`, no `fixtures/`.
5. Smoke test the built zip: `about:debugging` > Load Temporary Add-on > the zip; open `fixtures/generic/basic.html`; press Alt+Z.
6. Commit, tag `vX.Y.Z` (tag must equal the manifest version; the Release workflow checks), push the tag.
7. AMO: upload the zip in the Developer Hub (first time: fill in `store/listing.md`; reviewer notes from `store/reviewer-notes.md`), or run the
   manual "Sign on AMO" workflow for updates. Source-code upload is not needed (no build step).
8. After approval: add the AMO URL to the README, enable the AMO version badge, and attach the signed XPI to the GitHub Release.

## Never
- Never commit API keys, `.env`, a signed XPI, or anything from `seed/` and `fixtures/`.
- Never add a permission or network call in a minor release without re-reading `store/permissions.md`, `PRIVACY_POLICY.md` and
  the manifest data-collection declaration. A change there needs a new consent declaration and a changelog warning.
