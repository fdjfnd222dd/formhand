# Permission justifications

Manifest permissions: `storage`, `activeTab`, `scripting`. Host permissions: exactly
`https://job-boards.greenhouse.io/*`, `https://boards.greenhouse.io/*`, `https://jobs.lever.co/*`,
`https://jobs.ashbyhq.com/*`. No optional permissions, no `content_scripts`, no `webRequest`, no `tabs`, no `downloads`,
no `<all_urls>`. `data_collection_permissions`: `required: ["none"]`. `tests/privacy-guard.test.js` fails if any of
these lists changes.

| Permission | What it is used for | Where in the code | Why nothing narrower works |
|---|---|---|---|
| `storage` | Persist the user's profiles, standard answers, Q&A bank and settings in `browser.storage.local`. | `core/storage.js` (also read by popup, options, and the injected fill scripts) | The data must survive browser restarts and be readable by the popup, options page and fill scripts. No sync storage is used, so nothing leaves the device. |
| `activeTab` | Grants temporary access to the current tab when the user presses Alt+Z or clicks Fill in the popup. | `background.js` `fillActiveTab()` | Avoids any broad host permission: the extension cannot see or touch a page the user has not explicitly acted on. |
| `scripting` | `scripting.executeScript` injects the fill scripts into that tab's top frame, and into an embedded application frame on one of the four hosts below. | `background.js` | There is deliberately no `content_scripts` entry, so injection on demand is the only way to run code in the page. |
| Host permissions for the four job-board hosts | Company career pages often show a Greenhouse, Lever or Ashby application form inside a cross-origin `<iframe>`. `activeTab` covers only the top frame's origin, so filling that frame on the same Alt+Z needs host access to its origin. Used only during a fill the user started; the frames are found by `core/embed.js` and injected by `background.js`. | `core/embed.js` `FILL_HOSTS` (must equal `host_permissions`, checked by `tests/embed.test.js`), `background.js` | Limited to the four exact hostnames that serve embeddable application forms, https only. If the user revokes them (about:addons), such frames are opened in their own tab instead (`tabs.create`, which needs no permission) and the popup offers "Allow embedded forms" (`permissions.request`). |

## Things the extension does not do
- No network requests of any kind (no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) in the source files.
- No remote or dynamically fetched code; no `eval` or `new Function`; default extension CSP unchanged.
- No obfuscation or minification; the packaged files are the repository files.
- No data is read from a page except when the user triggers a fill.
- Nothing runs on the four job-board hosts on its own: there are no content scripts, so the host permissions are only
  used by a fill the user started on the page that embeds the form.

## Export without `downloads`
*Export* builds the JSON file in the options page and saves it through an ordinary `<a download>` link
(`options/options.js`), so Firefox treats it like any other download. No `downloads` permission is requested.
