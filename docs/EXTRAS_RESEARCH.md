# Extras research: what mature extensions have that a young project may lack

Researched 2026-10-02. Every claim carries the URL that was fetched. "UNVERIFIED" means it comes from
general knowledge or a source that did not load, not from a fetched page. The fetch tool returns summaries,
so details such as exact badge markup in other projects' READMEs could not be read and are marked as such.

State of this repo at research time (from `git ls-files` and `ls`): no README, LICENSE, PRIVACY file,
`.github/`, `docs/`, CHANGELOG, or `_locales`. Present: `store/assets`, `icons/` (16 to 128 px + SVG logo),
`DECISIONS.md`, `SPEC.md`, `CLAUDE.md`, and `manifest.json` 0.3.0 with `data_collection_permissions` already set.

## 1. What the reference projects show (README level)

- uBlock Origin README: short pitch, install links per store (AMO first, "works best on Firefox"), GPLv3 stated,
  wiki for docs, Reddit for support, Crowdin for translations.
  https://raw.githubusercontent.com/gorhill/uBlock/master/README.md
- Refined GitHub: install links per browser, a feature list organised by category, a stated "high bar for adding features" philosophy.
  https://raw.githubusercontent.com/refined-github/refined-github/main/readme.md
- Dark Reader: license (MIT), supported browsers, build commands (`npm install`, `npm run build` giving .zip and .xpi), help via GitHub discussions.
  https://raw.githubusercontent.com/darkreader/darkreader/main/README.md
- Privacy Badger: license (GPL v3+), adopts the EFF Public Projects Code of Conduct, contact channels, how to contribute.
  https://raw.githubusercontent.com/EFForg/privacybadger/master/README.md
- Bitwarden clients: points to a CONTRIBUTING doc and a SECURITY.md, "security audits and feedback are welcome".
  https://raw.githubusercontent.com/bitwarden/clients/main/README.md
- Sidebery: AMO install link, nightly builds on GitHub releases, MIT, how-to sections for setup quirks.
  https://raw.githubusercontent.com/mbnuqw/sidebery/v5/README.md
- Tridactyl and Simple Translate READMEs: the raw URLs I tried returned 404, so nothing is verified for them.
  Whether any of these READMEs carry badge images or GIFs could not be seen through summaries: UNVERIFIED.

Takeaway: the common README skeleton is pitch, install links per store, feature list, privacy/permissions, build from source,
contributing, support, license. No project in the sample leads with a build-status badge wall.

## 2. Badges (AMO, license, CI)

- shields.io has AMO services whose route patterns appear in its source:
  - `/amo/v/:addonId` version, https://raw.githubusercontent.com/badges/shields/master/services/amo/amo-version.service.js
  - `/amo/users/:addonId` average daily users, https://raw.githubusercontent.com/badges/shields/master/services/amo/amo-users.service.js
  - `/amo/rating/:addonId` and `/amo/stars/:addonId`, https://raw.githubusercontent.com/badges/shields/master/services/amo/amo-rating.service.js
  - The `addonId` is the AMO slug or ID; full URL form `https://img.shields.io/amo/v/<slug>` is UNVERIFIED (the services page 404'd and the category index at https://shields.io/badges did not list AMO).
  - A downloads route (`/amo/dw/`) was not confirmed: UNVERIFIED.
- Badges only work after the listing exists. Before publishing: license and CI badges only.
- CI badge: GitHub's workflow status badge (`.../actions/workflows/<file>/badge.svg`): UNVERIFIED (not fetched).
- Recommendation: 3 badges at most (CI, license, AMO version once live). A users/rating badge on a brand-new add-on shows tiny numbers.

## 3. Screenshots and demo GIFs

- AMO guidance: one key feature per screenshot, 1280x800 (1.6:1), annotate thoughtfully but explain annotations in the text, order them to tell a story.
  https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- GitHub practice: a GIF or short screenshot set near the top of the README. Specific projects' practice UNVERIFIED (see section 1).
- Privacy trap specific to this project: screenshots must use fake data (CLAUDE.md already forbids real captures leaving the repo).
  Use `fixtures/generic/` pages with the test profile.
- `store/assets` already exists; contents were not audited here.

## 4. GitHub Pages landing site

- Pages can publish from a branch root or a `/docs` folder with no build step, or from a GitHub Actions workflow.
  Removing `/docs` later breaks the site build.
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Practical value: a stable HTTPS URL for the AMO "homepage" and "privacy policy" fields. Note `docs/` is also where this research file lives; a Pages site would publish it unless excluded (UNVERIFIED how Jekyll treats it; plan a separate folder or `_config.yml` exclude).
- No example extension landing sites were fetched: popularity of the practice is UNVERIFIED.

## 5. GitHub Actions: lint, test, sign, release, provenance

- `web-ext lint` (supports `--output json`, `--warnings-as-errors`), `web-ext build` (auto-excludes `.git`, `node_modules`), `web-ext sign`.
  https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
  https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
- `web-ext sign` needs `--channel listed|unlisted` and AMO API credentials, read from `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`
  (store as GitHub repository secrets). `--approval-timeout` defaults to 15 min (0 disables waiting). `--amo-metadata <json>` carries
  categories, summary and license for a first listed submission. `--upload-source-code` exists.
  https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
- Listed signing is a human/automated review submission, not instant. Unlisted gives a signed XPI for self-hosting.
  https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
- Source code submission is NOT required for unminified, no-build-step extensions, which fits this project.
  https://extensionworkshop.com/documentation/publish/source-code-submission/
- Provenance: GitHub artifact attestations. Needs `id-token: write`, `contents: read`, `attestations: write`; step `actions/attest@v4`
  with `subject-path`; consumers verify with `gh attestation verify <file> -R <owner>/<repo>`.
  https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds
- Suggested shape (design only): `ci.yml` on push/PR runs `npm ci`, `npm run lint`, `npm test` (Playwright Firefox needs `npx playwright install firefox`; Linux dependencies in CI: UNVERIFIED).
  `release.yml` on tag `v*` runs lint, `web-ext build`, attest, uploads the zip to a GitHub Release; AMO sign as a separate manual-trigger job so a secret
  leak or review delay cannot block releases. Pin actions by SHA: UNVERIFIED recommendation.
- Dependabot: valid minimal config for `npm` and `github-actions` ecosystems with weekly schedule, `groups`, and `cooldown` options.
  https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
  Only dev dependency is Playwright, so noise is low.
- Note: fixtures are gitignored, so CI will skip all capture-based cases ("Captures skip when absent"); CI covers hand-written fixtures only. Say so in the README.

## 6. Community files

- GitHub's community profile checks README, CODE_OF_CONDUCT, LICENSE, CONTRIBUTING, issue templates in `.github/ISSUE_TEMPLATE`, and a security policy.
  https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories
- SECURITY.md lives at the repo root (or `.github/`: UNVERIFIED), giving reporting instructions.
  https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository
  Private vulnerability reporting is a GitHub setting, not covered by that page: UNVERIFIED.
- Issue forms (YAML) need `name`, `description`, `body`; input types markdown/input/textarea/dropdown/checkboxes/upload.
  https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
- Norms seen: Privacy Badger adopts a named external CoC (above); Bitwarden has SECURITY.md and a contributing guide (above). Contributor Covenant as default CoC: UNVERIFIED.
- Project-specific content worth putting in these files: the hard rules (no network, no new permissions, no second click path), "never attach real captures or personal data to issues"
  (an issue form with a warning markdown block and a "this report contains no personal data" checkbox), and a bug template asking for the ATS/site, adapter name from the console line, and a structure-only stripped capture.

## 7. Accessibility for popup and options pages

WCAG 2.2 AA items worth checking (list from https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=aa):
1.3.5 Identify Input Purpose (autocomplete attributes: relevant to a profile form), 1.4.3 text contrast 4.5:1, 1.4.10 Reflow (popup/options at narrow widths),
1.4.11 non-text contrast 3:1 (the green/orange/yellow outlines on pages too), 1.4.12 text spacing, 2.1.1 keyboard, 2.4.7 focus visible,
2.5.8 target size, 3.3.x input assistance (import errors, validation messages), 4.1.2 name/role/value (custom widgets, toggles, live toasts).
Extension-specific points not fetched, so UNVERIFIED: do not rely on colour alone for the filled/review/unknown outlines (add a text or shape cue; the toast
is partly this), `role="status"`/`aria-live` for the toast, `prefers-color-scheme` and `prefers-reduced-motion`, popup focus order, labels on every options control.
Verification tools (axe, Lighthouse) not researched.

## 8. i18n readiness

- Layout: `_locales/<code>/messages.json` (underscore codes such as `en_US`), `default_locale` required in the manifest once `_locales` exists,
  manifest strings as `__MSG_name__`, runtime `browser.i18n.getMessage(name, subs)`, locale fallback chain exact, language+script, language, default.
  Named placeholders with `example`, and a `description` per message for translators. RTL helpers `@@bidi_dir`, `@@bidi_start_edge`, etc.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
- Cost for this project: all popup/options/toast strings and manifest name/description/command descriptions would move into `messages.json`.
  Matching logic (label patterns in `matcher.js`, `standard.js`) is English-only by nature; translating the UI would not make the matcher work on non-English forms.
  AMO per-locale listing text is edited in the developer hub (UNVERIFIED, not fetched).
- Cheap first step: extract strings into `en` only, keeping behaviour identical.

## 9. Store SEO

- AMO listing guidance: unique descriptive name (also gives the slug), summary under 250 chars, natural keywords in summary and description,
  impactful first lines, limited HTML/Markdown formatting, up to two categories ("spamming a category could do more harm than good"), screenshots as above, plain-language privacy policy, homepage/support email/support page, platform selection, respectful review requests.
  https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- Documented ranking (addons-server): name matches boosted most (exact name up to 100.0), summary 3.0, description 2.0; popularity via `log2p` of average daily users;
  public non-experimental add-ons x4.0; "By Firefox" and Recommended x5.0. Tags are not mentioned in the fetched summary: UNVERIFIED.
  https://mozilla.github.io/addons-server/topics/development/search.html
- Implication: put the searchable words in the NAME ("Job Application Autofill" is already descriptive) and the first summary sentence ("autofill job applications, local-only, no account"). Early ranking will be driven by name since popularity is near zero.
- Naming rule: a name using "Firefox" must be "<Add-on name> for Firefox". https://extensionworkshop.com/documentation/publish/add-on-policies/ (summary level).

## 10. Privacy policy and permission explanation

- `browser_specific_settings.gecko.data_collection_permissions` with `required: ["none"]` is mandatory for new AMO extensions from 2025-11-03. Already present in this manifest.
  https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- Mozilla recommends, but does not mandate, a privacy policy; the doc does not address zero-data extensions explicitly.
  https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/
- Policy: request only necessary permissions; no leaking user information; the listing must make functionality discernible ("No Surprises").
  https://extensionworkshop.com/documentation/publish/add-on-policies/ (summary level)
- Permission guidance: minimise, prefer `activeTab`, explain each permission in the listing (Gesturefy cited as the example); `storage` raises no install warning.
  `downloads` and `scripting` are the ones needing a sentence each here.
  https://extensionworkshop.com/documentation/develop/request-the-right-permissions/
- Deliverables: a PRIVACY.md (stored locally in `storage.local`, nothing transmitted, exports go to Downloads, captures contain page content and stay on disk), a "Why each permission" table in README and in the AMO description, and the same text served at a stable URL (raw GitHub or Pages) for the AMO privacy field.

## 11. Release and versioning

- Keep a Changelog: CHANGELOG.md, an Unreleased section, newest first, ISO dates, groups Added/Changed/Deprecated/Removed/Fixed/Security, call out breaking changes.
  https://keepachangelog.com/en/1.1.0/
- Semver: start at 0.1.0 and bump minor per release while below 1.0.0, "anything may change". The manifest is already 0.3.0.
  https://semver.org/
- Tags `vX.Y.Z` matching `manifest.json` version, plus a CI check that tag and manifest agree: UNVERIFIED convention. Firefox version-string format limits were not confirmed (the Extension Workshop page fetched covered IDs only); the manifest ID is mandatory for MV3 submission.
  https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/
- Distribution: listed (AMO review) vs unlisted (signed XPI for self-hosting) per the sign docs above. AMO review notes can reference the license and "no build step".

## Summary table

| Item | Value for this project | Kind |
|---|---|---|
| LICENSE file (and `license` in package.json) | high (AMO metadata needs a license; repo has none) | non-code file |
| README (pitch, install, permissions table, build, test, limits, fixtures note) | high | non-code file |
| PRIVACY.md + hosted URL for AMO | high | non-code file |
| Permission explanation table (README + AMO text) | high | non-code file |
| AMO listing copy (name, <250-char summary, description, 2 categories, support links) | high | non-code file |
| Screenshots 1280x800 using fake data | high | non-code file (images) |
| CHANGELOG.md (Keep a Changelog, semver 0.x) | high | non-code file |
| CI workflow: lint + test on push/PR | high | non-code file (workflow YAML) |
| Release workflow: tag, `web-ext build`, attestation, GitHub Release | med | non-code file |
| AMO sign job with API secrets (manual trigger) | med (after first manual listing) | non-code file |
| SECURITY.md | med | non-code file |
| Issue forms + PR template with no-personal-data warning | med | non-code file |
| CONTRIBUTING.md (hard rules, how to add a wording/fixture) | med | non-code file |
| CODE_OF_CONDUCT.md | low | non-code file |
| dependabot.yml (npm + github-actions) | med | non-code file |
| Shields badges (license, CI now; AMO version later) | low | non-code file (README text) |
| Demo GIF in README | med | non-code file |
| GitHub Pages landing page | low | non-code file |
| `web-ext-config` build/sign scripts in package.json (`build`, `sign`) | med | code (package.json) |
| Accessibility pass on popup/options (labels, focus, contrast, non-colour cue, aria-live toast) | med-high | code |
| i18n extraction to `_locales/en` | low now (matcher is English-only) | code |
| Tag vs manifest version check in CI | low | non-code file (workflow step) |
