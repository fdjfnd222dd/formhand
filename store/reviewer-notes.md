# Notes for AMO reviewers (paste into "Notes to Reviewer")

```
Formhand is a Manifest V3 Firefox extension written in plain JavaScript. There is NO build step, bundler, minifier, transpiler or template engine: the uploaded package contains the same unmodified files as the public repository. No source-code upload is therefore needed. Dev-only dependency: Playwright (tests), listed in package.json and not packaged.

NO ACCOUNT / NO LOGIN IS NEEDED. The extension has no network code (search the files for fetch / XMLHttpRequest / WebSocket / sendBeacon: none). It declares data_collection_permissions required ["none"].

HOW IT RUNS (important): there is deliberately no content_scripts entry. Nothing runs on a page until the user presses Alt+Z (command "fill-page") or the popup's "Fill this page" button. background.js then calls scripting.executeScript on the active tab's top frame using the activeTab permission.

EMBEDDED FORMS (the reason for the four host permissions): company career pages often embed the real application form from Greenhouse, Lever or Ashby in a cross-origin iframe. On the same Alt+Z, core/embed.js lists the page's visible iframes (it reads only the iframe elements: src, id, name, title, size). A frame on one of the four hosts in host_permissions (job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com; core/embed.js FILL_HOSTS) gets the same scripts through scripting.executeScript with its frameId (browser.runtime.getFrameId) after browser.permissions.contains confirms access, and is filled like a page. Any other cross-origin frame that looks like an application form (a known applicant-tracking host, or apply/job/career words) is opened with tabs.create next to the current tab; ads, analytics, video, maps, chat, captchas and hidden or tiny frames are never opened. The host permissions are never used outside a fill the user started. If they are not granted, the popup shows an "Allow embedded forms" button (permissions.request) and such frames open in their own tab instead.

HOW TO TEST (about 3 minutes, no real data needed):
1. Install, then open the toolbar popup > "Profiles & answers..." (Preferences).
2. Under "Export / import" choose Import and select store/demo-profile.json from the public repository (a fake person; the same file is described in store/SCREENSHOTS.md). Alternatively type any values into the Profile form and Save.
3. Open any public page with a simple form, e.g. a local HTML file with inputs labelled "First name", "Last name", "Email", "Phone". The repository contains fixtures/generic/basic.html.
4. Press Alt+Z (or toolbar icon > Fill this page). Fields get outlines (green solid = filled, orange dashed = review, yellow dotted = needs you) and a summary panel at the bottom right shows the counts; clicking a count only scrolls to the next such field. Fields that already have a value are not overwritten.
5. Nothing is submitted and no button is ever pressed: only inputs, selects, radios and checkboxes are touched.
6. Optional, embedded forms: open a company careers page that embeds a Greenhouse application in an iframe (many use job-boards.greenhouse.io/embed/job_app) and press Alt+Z: the form inside the frame is filled and the panel says "in the embedded job-boards.greenhouse.io form".

PERMISSIONS: storage (profiles, answers, settings, local only); activeTab + scripting (inject the fill scripts into the one tab the user acts on); host permissions for the four job-board hosts above (embedded forms only). No downloads permission: Export saves through an <a download> link. Full table: store/permissions.md in the repository.

CLICK SAFETY: the only programmatic clicks are in core/widgets.js press(), which allow-lists form widgets and refuses submit/reset buttons, links, and footer/button-bar content.

THIRD-PARTY CODE: none at runtime.

Source and privacy policy: https://github.com/fdjfnd222dd/formhand
```

## If the reviewer asks about remote code or CSP
The manifest does not set `content_security_policy`; extension pages load only packaged scripts (`<script src>` relative paths).
