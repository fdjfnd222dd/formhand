# AMO (addons.mozilla.org) requirements for publishing a Firefox MV3 extension

Date researched: 2026-10-02
Method: every statement below was read on a Mozilla page fetched during this research session; the URL is beside it.
Anything not confirmed on a fetched page is marked **NOT CONFIRMED**. Note: pages were read through a summarizing fetch tool,
so quotes are as returned by it; re-read the source page before relying on an exact wording.

## 1. Data collection declaration (`data_collection_permissions`)
Sources: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ ,
https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings

- Location: `browser_specific_settings.gecko.data_collection_permissions` with `required` and optional `optional` arrays.
- `required`: users must accept it to use the extension. It must contain `"none"` or one or more categories (MDN page).
- "None" value: `"required": ["none"]` for extensions that collect no data (Extension Workshop page).
- Required categories (MDN): authenticationInfo, bookmarksInfo, browsingActivity, financialAndPaymentInfo, healthInfo,
  locationInfo, personalCommunications, personallyIdentifyingInfo, searchTerms, websiteActivity, websiteContent.
- `optional` may use the same categories plus `technicalAndInteraction` (MDN page). Optional ones are requested after install via `permissions.request()`.
- Minimum Firefox: desktop 140+, Android 142+ (Extension Workshop page).
- Shown to users: in the install prompt and in about:addons under "Permissions and data" (Extension Workshop page).
  Whether the AMO listing page itself shows it: NOT CONFIRMED.
- Mandatory: "From November 3, 2025, all new extensions must adopt the Firefox built-in data collection consent system." Older add-ons' new
  versions do not need it yet "but will have to at a later date" (Extension Workshop page).
- `strict_min_version` "*" is not valid (MDN page). Whether a `strict_min_version` must accompany the key: NOT CONFIRMED.
- Policy context: Add-on Policies section 6 requires a clear way to control data transmission, via the add-on's own consent or Firefox's built-in one
  (https://extensionworkshop.com/documentation/publish/add-on-policies/ , policy last updated April 30, 2026 per that page).

## 2. Review process and policies
### Policies
- Add-on Policies (headings: No Surprises, Content, Submission Guidelines, Development Practices, User Scripts, Data Collection and Transmission
  Disclosure and Control, Monetization, Security/Compliance/Blocking): https://extensionworkshop.com/documentation/publish/add-on-policies/
  - "Add-ons must function only as described. During review, the add-on undergoes basic functional testing in addition to code review." Provide test info/credentials if needed.
  - "Add-ons must only request those permissions that are necessary for them to function."
  - "Add-ons must be self-contained and not load remote code for execution." Must not relax page security headers such as CSP. Must use encryption when transporting data remotely.
  - No obfuscated code; minification to reduce size is allowed. Only release versions of third-party libraries, unmodified.
  - Data transmission limited to what is necessary; the user needs a clear way to control it (section 6).
- Firefox Add-on Distribution Agreement (effective December 1, 2021): grants Mozilla a non-exclusive license to review your add-ons; you must hold the needed
  rights; the add-on "will not imply in any way that it is produced, sponsored or endorsed by Mozilla."
  https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/
- Remote code / CSP: standard extension CSP must be left unmodified, modifying it to allow remote scripts causes rejection; do not inject remote scripts.
  https://extensionworkshop.com/documentation/develop/build-a-secure-extension/

### Source code submission
Source: https://extensionworkshop.com/documentation/publish/source-code-submission/
- Required when the extension uses minifiers, bundlers (Webpack, Browserify), template engines, or custom preprocessing tools.
- With those, include a README (OS/environment, tool versions, full build commands), a build script for complex builds, lockfiles; tools must be open source and run locally.
- Reviewer default environment: Ubuntu 24.04.4 LTS, Node 24.14.0, npm 11.9.0, 10 GB RAM, 6 vCPU, 35 GB disk.
- Max source archive 200 MB; upload in version editor "Source code" field; matching source must be attached to every version. Unclear/unbuildable source "may be rejected".
- "No build step" (plain JS shipped as written): the page lists the triggers above and does not list plain hand-written JS, so no upload is implied. An explicit
  sentence saying "no source needed if you have no build step" was NOT CONFIRMED. The submission page says source is required "if minified/obfuscated"
  (https://extensionworkshop.com/documentation/publish/submitting-an-add-on/). Dev-only dependencies in package.json: third-party-library page says package.json
  counts as documentation of dependencies (https://extensionworkshop.com/documentation/publish/third-party-library-usage/).
- Third-party libraries: give links in "Notes for Reviewers"; must be identical to the official release (checksum-verified), not CDN copies (same page).

### Distribution, signing, review
Sources: https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/ , https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- Listed ("On this site") vs self-distributed/unlisted ("On your own"). Unlisted add-ons still undergo mandatory review.
- All extensions must be signed through AMO for release and beta Firefox. Developer Edition, Nightly, ESR can run unsigned with `xpinstall.signatures.required` off.
- Review: automated validation first; "It can take up to 24 hours for your submission to be signed and published, or longer if your submission is selected for manual review."
  Manual review can happen at any time afterwards. Listed submission publishes immediately after "Submit Version" and may be reviewed later.
- Specific manual-review turnaround numbers: NOT CONFIRMED.
- Recommended program: curated, staff security review, badge; nominate by emailing amo-featured at mozilla dot org; normal listings get standard review.
  https://extensionworkshop.com/documentation/publish/recommended-extensions/
- Upload: .zip/.xpi/.crx, max 200 MB (submitting page). Zip must have manifest.json at the root (https://extensionworkshop.com/documentation/publish/package-your-extension/).

### Permissions guidance
Source: https://extensionworkshop.com/documentation/develop/request-the-right-permissions/
- Request only what is used; prefer `activeTab` over `tabs` + `<all_urls>` ("activeTab" shows no install permission message); avoid `<all_urls>`; use optional permissions.
- "Include information on your AMO listing explaining which permissions are requested and their purposes."
- Specific rules for `downloads`, `scripting`, or no-host-permission extensions, and any formal justification form: NOT CONFIRMED.

### Privacy policy
- "Privacy policy: required if any user data transmits from device"; entered on the "Describe Add-on" page of the submission form (submitting page above).
  Whether a policy is required for a fully local extension declaring `none`: NOT CONFIRMED.

## 3. Listing assets and fields
Sources: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/ , https://extensionworkshop.com/documentation/publish/submitting-an-add-on/ ,
https://mozilla.github.io/addons-server/topics/api/addons.html
- Listing icon: 32x32 and 64x64, PNG or JPEG (SVG/vector recommended). API exposes icons at 32, 64, 128 px.
- Manifest `icons` sizes required by AMO: NOT CONFIRMED.
- Screenshots: 1280x800 recommended (max display size), or 1.6:1 ratio; no practical limit on count. Accepted file formats: NOT CONFIRMED. Separate promo/preview images: NOT CONFIRMED.
- Summary: limited to 250 characters. Name: must be unique and descriptive; length limit NOT CONFIRMED (API docs do not state one). Description: no limit stated; Markdown/HTML allowed.
- Categories: up to 2 each for Firefox desktop and Android. Current extension categories (API list, https://mozilla.github.io/addons-server/topics/api/categories.html):
  Alerts & Updates, Appearance, Bookmarks, Download Management, Feeds News & Blogging, Games & Entertainment, Language Support, Photos Music & Videos,
  Privacy & Security, Search Tools, Shopping, Social & Communication, Tabs, Web Development, Other. (The API docs say they apply to desktop and Android.)
- Tags: set via Basic Information; full list is an API endpoint (https://mozilla.github.io/addons-server/topics/api/tags.html); the list itself and any count limit: NOT CONFIRMED.
- Support: email and/or website; license selection required; experimental flag; payment/requirements flag; reviewer notes; release notes per version (translatable field in API).
- A check box named "This add-on needs to collect data": NOT CONFIRMED (not found on any fetched page).

## 4. Naming and trademark
- "If the add-on uses 'Firefox' in its name, the naming standard ... is '<Add-on name> for Firefox'." (Add-on Policies). Forks must clearly distinguish themselves.
- Mozilla marks must not appear in product names; "NewGadget Extension for Firefox" is acceptable, "Firefox NewGadget Extension" is not; descriptive "works with Firefox" use is allowed
  in words, not logos. https://www.mozilla.org/en-US/foundation/trademarks/policy/ . Permission requests: trademark-permissions at mozilla.com.
- Third-party brand names in add-on names (e.g. naming an ATS or employer): NOT CONFIRMED. Only the Distribution Agreement's "must not imply Mozilla endorsement" was found.

## 5. gecko.id and version
- MV3: an ID is mandatory in manifest.json before AMO submission; AMO checks uniqueness; once assigned it is permanent.
  https://extensionworkshop.com/documentation/develop/extensions-and-the-add-on-id/
- Formats (MDN browser_specific_settings page): email-like (recommended, max 80 chars, `^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$`, e.g. `extensionname@example.org`) or GUID `{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}`.
- Version (MDN version page, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/version): 1 to 4 dot-separated numbers, up to nine digits each,
  no leading zeros; regex `^(0|[1-9][0-9]{0,8})([.](0|[1-9][0-9]{0,8})){0,3}$`. Each AMO upload needs a higher version than the last: NOT CONFIRMED on a fetched page.

## 6. Tooling and API
Source: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
- `web-ext lint` (options --self-hosted, --warnings-as-errors/-w, --output json|text); `web-ext build` (--overwrite-dest/-o; excludes .git etc.).
- `web-ext sign --channel=listed|unlisted` (channel is required; env WEB_EXT_CHANNEL). Credentials: `--api-key`/`--api-secret` or env `WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET`.
  Other: `--amo-base-url` (default https://addons.mozilla.org/api/v5/), `--approval-timeout` (default 900000 ms, 0 = do not wait), `--upload-source-code <archive>`, `--amo-metadata <json>`.
- Listed: the first version needs metadata; required fields per the web-ext page: `categories`, `summary`, `version.license` (API docs add add-on `name`). Exact JSON schema example: NOT CONFIRMED beyond that.
- Signing methods listed: AMO Developer Hub upload, web-ext sign (v8+ supports both distribution types), Add-on Create API v5, Signing API v4 (signing overview page).
- API v5: `POST /api/v5/addons/addon/` (create), `POST /api/v5/addons/addon/<id|slug|guid>/versions/` (new version), upload by UUID then referenced as `"upload"`.
  https://mozilla.github.io/addons-server/topics/api/addons.html
- API keys: https://addons.mozilla.org/en-US/developers/addon/api/key/ ; JWT with iss/jti/iat/exp, expiry within 5 minutes, header `Authorization: JWT <token>`; never commit the secret
  (https://mozilla.github.io/addons-server/topics/api/auth.html).

## Checklist for this extension (Job Application Autofill)
1. manifest: set `browser_specific_settings.gecko.id` (email-like, <= 80 chars) once, never change it; version in the 1-4 number format.
2. manifest: add `data_collection_permissions` with `"required": ["none"]` only if the extension truly transmits nothing (CLAUDE.md says 100% local); set `strict_min_version` to at least 140 (desktop) and 142 for Android if supported. Verify exact placement against the MDN page.
3. Run `npm run lint` (web-ext lint, 0 errors) and `web-ext build`; confirm zip has manifest.json at root and excludes fixtures/, seed/, tests/, tools/ (fixtures and seed hold personal data; already in ignoreFiles, re-verify the zip contents).
4. Source code upload: plain JS with no minifier/bundler/template/preprocessor means none of the listed triggers apply; still mention "no build step" and list dev dependencies in Notes for Reviewers. Decide with the owner whether to upload the source anyway.
5. Permissions (as of 1.0.0: `storage`, `activeTab`, `scripting`, and host permissions for four job-board hosts used for embedded forms; `downloads` was dropped): write a per-permission justification in the listing description and reviewer notes. Reviewer-specific rules for `downloads`/`scripting`: NOT CONFIRMED.
6. Remote code: none, default CSP untouched; no CDN libraries.
7. Name: unique; no "Firefox"/Mozilla marks (or use "<name> for Firefox"); avoid implying employer/ATS endorsement (rule NOT CONFIRMED, so keep generic).
8. Listing: icon 32x32 and 64x64 (and manifest icons), screenshots 1280x800 (no personal data: use fixtures/generic only), summary <= 250 chars, up to 2 categories, support email/site, license, release notes.
9. Privacy policy: not clearly required for a local-only add-on (NOT CONFIRMED); the listing should still state that nothing leaves the device.
10. Reviewer notes: explain Alt+Z / popup trigger, no content_scripts, test steps (the add-on needs no login).
11. Submit via AMO Developer Hub (owner's Mozilla account) or `web-ext sign --channel=listed` with `WEB_EXT_API_KEY`/`WEB_EXT_API_SECRET` env vars and `--amo-metadata`; never store keys in the repo.
12. Expect automated signing within about 24 h, possible later manual review.

Date researched: 2026-10-02
