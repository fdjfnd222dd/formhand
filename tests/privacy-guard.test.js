'use strict';
/*
 * tests/privacy-guard.test.js
 *
 * Makes the privacy promises in README / PRIVACY_POLICY / the store listing executable. If this test fails, either the
 * code broke a promise or a document must be updated on purpose (and the AMO data-collection declaration re-read).
 *   - the permission list is exactly the allow-list;
 *   - host permissions are exactly the four job-board hosts whose forms are filled when a company page embeds them
 *     (nothing broader, no <all_urls>); no content scripts, optional permissions or custom CSP;
 *   - data_collection_permissions says "none";
 *   - no runtime file can talk to the network, evaluate strings as code, or write HTML from strings.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Edit these lists only together with store/permissions.md, PRIVACY_POLICY.md and README "Permissions".
const ALLOWED_PERMISSIONS = ['storage', 'activeTab', 'scripting'];
const ALLOWED_HOSTS = ['job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com'];

const sorted = (a) => [...a].sort();

test('manifest: permissions are exactly the documented allow-list', () => {
  assert.deepEqual(sorted(manifest.permissions || []), sorted(ALLOWED_PERMISSIONS));
});

test('manifest: host permissions are exactly the four job-board hosts, https only', () => {
  assert.deepEqual(sorted(manifest.host_permissions || []), sorted(ALLOWED_HOSTS.map((h) => `https://${h}/*`)));
});

test('manifest: no content scripts, no optional permissions, no custom CSP, nothing exposed to pages', () => {
  for (const key of ['optional_host_permissions', 'optional_permissions', 'content_scripts', 'content_security_policy',
    'externally_connectable', 'web_accessible_resources', 'declarative_net_request', 'update_url']) {
    assert.equal(manifest[key], undefined, `${key} must not be present`);
  }
  const gecko = manifest.browser_specific_settings.gecko;
  assert.equal(gecko.update_url, undefined, 'updates come from AMO only');
});

test('manifest: the only commands are the fill hotkey', () => {
  assert.deepEqual(Object.keys(manifest.commands || {}), ['fill-page']);
});

test('manifest: declares no data collection', () => {
  const dcp = manifest.browser_specific_settings.gecko.data_collection_permissions;
  assert.deepEqual(dcp.required, ['none']);
  assert.ok(!dcp.optional || dcp.optional.length === 0);
});

function runtimeFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|html)$/.test(e.name)) out.push(rel);
    }
  };
  ['core', 'adapters', 'popup', 'options'].forEach(walk);
  for (const s of manifest.background.scripts) out.push(s);
  return out.filter((f) => fs.existsSync(path.join(root, f)));
}

test('every background script is checked', () => {
  assert.deepEqual(manifest.background.scripts, ['background.js']);
});

// Drop comments so words in prose ("fetch the label") never trigger the scan.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bimportScripts\s*\(/, 'importScripts'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\b/, 'new Function'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
  [/\.outerHTML\s*=/, 'outerHTML assignment'],
  [/\binsertAdjacentHTML\b/, 'insertAdjacentHTML'],
  [/document\.write\s*\(/, 'document.write'],
  [/<script[^>]+src=["']?https?:/i, 'remote <script src>'],
  [/<link[^>]+href=["']?https?:/i, 'remote <link href>'],
  [/\bbrowser\.(webRequest|cookies|history|bookmarks|identity|proxy|downloads)\b/, 'privacy-sensitive API'],
];

for (const file of runtimeFiles()) {
  test(`no network / dynamic-code / HTML-string APIs in ${file}`, () => {
    const src = stripComments(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const [re, name] of FORBIDDEN) assert.ok(!re.test(src), `${file} uses ${name}`);
  });
}
