# Ideas (code changes, ranked by value)

**Status 2026-10-03:** items 1, 2, 3, 4 (Delete all my data), 5 (Export warning), 6 (outline styles, yellow contrast,
toast/panel `role=status`), 7 (packaging config; `web-ext` is still not a pinned devDependency), 8 (summary panel) and 11
(neutral company names in docs and tests) are **done**. The rest are open.

Ranking = value to the project's goals (privacy, trust, small size, reviewer friendliness) divided by effort.

| Rank | Idea | Why it matters | Effort | Where |
|---|---|---|---|---|
| 1 | ~~**Rename + new add-on ID + version 1.0.0**~~ done | Nothing can be listed under the old internal name/ID; the ID is permanent once uploaded. | tiny | `manifest.json` |
| 2 | ~~**Privacy guard test**~~ done (permissions allow-list; no network/eval/innerHTML/remote script in any runtime file; data collection = none) | Turns every privacy claim in the README and listing into a failing test if anyone breaks it. | small | `tests/privacy-guard.test.js` |
| 3 | ~~**Drop the developer page-capture feature and the `downloads` permission from the public build**~~ done | The capture hotkeys write a copy of the page, including typed values, to disk. Removing them leaves 3 API permissions (`storage`, `activeTab`, `scripting`) plus the four embedded-form hosts, a smaller review surface and a simpler privacy story. Export falls back to a normal file download. Keep capture in a developer-only manifest if still needed. | small | `manifest.json`, `options/` |
| 4 | ~~**"Delete all my data" button** (Preferences) with a confirm step~~ done | Makes "you control your data" concrete: one click wipes profiles, answers and settings. | small | `options/` |
| 5 | ~~**Warning next to Export** ("this file contains your personal information in plain text")~~ done | The export is the one place data leaves the browser's storage. | tiny | `options/options.html` |
| 6 | ~~**Accessibility fixes**~~ done (A1-A3) (colour-independent outline styles, yellow outline contrast, toast `role=status`) | Exact findings in `ACCESSIBILITY.md`. The yellow "needs you" outline is 1.7:1 on white. | small | `core/feedback.js` |
| 7 | **Packaging config** (ignore list done; pinned `web-ext` open) (ignore list or the allow-list script) and `web-ext` as a pinned devDependency with `build` / `lint` npm scripts | Contributors and CI need no global install; no internal file can slip into the XPI. | small | `web-ext-config.mjs`; package.json |
| 8 | ~~**Clickable summary panel**~~ shipped (the planned "Phase 5") listing fields that need attention, as an accessible list | Helps everyone, and fixes the transient-toast problem for screen-reader users. | medium | `core/feedback.js`, `core/autofill.js` |
| 9 | **Copy diagnostics button** (adapter name, step, counts, never values) | Makes bug reports useful without anyone pasting personal data; matches the issue template. | small | `popup/`, `core/run.js` |
| 10 | **Live-verify the simulated widgets** (needs the owner to save pages with dropdowns open) and promote rows in the README table from "Experimental" to "Verified" | The honest limits in the docs shrink. Zero risk to users. | owner time | docs + fixtures |
| 11 | ~~**Neutralise employer names** in tests and docs (use "Example Corp" in company tests; keep real markup in private fixtures)~~ done | Removes the job-search history from the public tree. | medium | tests, docs |
| 12 | **Dark mode for popup and options** (`color-scheme: light dark` and colour variables) | Matches Firefox dark themes. | small | `popup/popup.css`, `options/options.css` |
| 13 | **Adapters for Lever, Ashby, iCIMS, SmartRecruiters** | The largest remaining coverage gap; blocked until real structure-only captures exist. | per platform | `adapters/` |
| 14 | **Force-refill action** in the popup (the `force` option already exists) | Rarely wanted; adds a destructive path. Keep off unless asked. | small | `popup/` |
| 15 | **i18n extraction to `_locales/en`** | Only useful once the matcher understands another language. See `I18N_READINESS.md`. | medium | everywhere |

## Considered and not recommended
- **Encrypting the local store with a passphrase.** A passphrase prompt on every browser start would make the tool heavier and the key still lives in the same machine; disk encryption protects better. Say so in the docs (done) instead.
- **Any "cloud sync", account, or AI feature.** Contradicts the central promise.
- **Auto-submit or "apply for me".** Contradicts the central rule and the reviewer's expectations.
- **Browser-action badge counters or notifications.** More permissions and UI for little value.
