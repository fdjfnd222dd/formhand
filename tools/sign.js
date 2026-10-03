'use strict';
// Sign the extension as an UNLISTED add-on on addons.mozilla.org (AMO), so it can be installed
// permanently in normal Firefox (release Firefox refuses unsigned add-ons). Unlisted = signed by
// Mozilla but never published on the AMO site; the .xpi lands in web-ext-artifacts/.
//
//   WEB_EXT_API_KEY=user:123:456 WEB_EXT_API_SECRET=abc... npm run sign
//   npm run sign -- --dry-run      every check + a test build, no upload
//
// The keys are the AMO "JWT issuer" and "JWT secret" (https://addons.mozilla.org/developers/addon/api/key/).
// They are read from the environment only, never from a file in this repo. AMO_JWT_ISSUER /
// AMO_JWT_SECRET are accepted as aliases.
//
// Before uploading, this script refuses to go on when:
//   - the keys are missing;
//   - git has uncommitted changes (the signed package must be a commit you can find again);
//   - this version was already signed (AMO rejects a version number twice: bump manifest.json "version");
//   - `web-ext lint` reports errors;
//   - the built package contains anything personal or dev-only (fixtures/, seed/, tests/, tools/,
//     node_modules/, *.md): signing uploads the package to Mozilla.
// Built-ins only; uses the same `web-ext` as `npm run lint` (on PATH).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'web-ext-artifacts');
// Nothing outside these may be in the package.
const ALLOWED = /^(manifest\.json|background\.js|LICENSE|(core|adapters|options|popup|icons)\/.*)$/;

function keysFrom(env) {
  const key = env.WEB_EXT_API_KEY || env.AMO_JWT_ISSUER || '';
  const secret = env.WEB_EXT_API_SECRET || env.AMO_JWT_SECRET || '';
  const missing = [];
  if (!key) missing.push('WEB_EXT_API_KEY (AMO "JWT issuer", e.g. user:12345:678)');
  if (!secret) missing.push('WEB_EXT_API_SECRET (AMO "JWT secret")');
  return { key, secret, missing };
}

/** Paths in the package that must not be uploaded. */
function forbiddenEntries(entries) {
  return entries.filter((e) => e && !e.endsWith('/') && !ALLOWED.test(e));
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...(opts || {}) });
  if (r.error) throw r.error;
  return r;
}

function fail(msg) {
  console.error('sign: ' + msg);
  process.exit(1);
}

function main(argv, env) {
  const dry = argv.includes('--dry-run');
  const { key, secret, missing } = keysFrom(env);
  if (missing.length && !dry) fail('missing environment variable(s):\n  ' + missing.join('\n  ') + '\nSee CLAUDE.md "Permanent install".');

  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;

  const status = run('git', ['status', '--porcelain', '--untracked-files=no']);
  if (status.stdout.trim()) fail('uncommitted changes; commit first so the signed package matches a commit:\n' + status.stdout);

  if (fs.existsSync(ARTIFACTS) && fs.readdirSync(ARTIFACTS).some((f) => f.endsWith('.xpi') && f.includes('-' + version + '.'))) {
    fail(`version ${version} was already signed (web-ext-artifacts/). Bump "version" in manifest.json and package.json.`);
  }

  const lint = run('web-ext', ['lint', '--output=json'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let errors = 1;
  try {
    errors = JSON.parse(lint.stdout).summary.errors;
  } catch (e) {
    fail('could not read web-ext lint output');
  }
  if (errors) fail(`web-ext lint reports ${errors} error(s); run npm run lint`);

  // Build the exact package web-ext would upload and look inside it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sign-'));
  try {
    const build = run('web-ext', ['build', '--overwrite-dest', '--artifacts-dir', tmp], { stdio: ['ignore', 'pipe', 'inherit'] });
    if (build.status !== 0) fail('web-ext build failed');
    const zip = fs.readdirSync(tmp).find((f) => f.endsWith('.zip'));
    const list = run('unzip', ['-Z1', path.join(tmp, zip)]);
    if (list.status !== 0) fail('could not list the built package (is unzip installed?)');
    const bad = forbiddenEntries(list.stdout.split('\n').map((s) => s.trim()));
    if (bad.length) fail('the package would include files that must not be uploaded:\n  ' + bad.join('\n  ') + '\nAdd them to web-ext-config.mjs ignoreFiles.');
    console.log(`sign: package OK (${list.stdout.trim().split('\n').length} entries), version ${version}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (dry) {
    console.log('sign: --dry-run, nothing uploaded.' + (missing.length ? ' (Keys not set: ' + missing.length + ' missing.)' : ''));
    return;
  }

  console.log(`sign: uploading version ${version} to AMO as UNLISTED (this can take a few minutes)...`);
  const sign = run('web-ext', ['sign', '--channel=unlisted', '--artifacts-dir', ARTIFACTS], {
    stdio: 'inherit',
    env: { ...env, WEB_EXT_API_KEY: key, WEB_EXT_API_SECRET: secret },
  });
  if (sign.status !== 0) fail('web-ext sign failed (see above)');
  console.log('sign: done. The signed .xpi is in web-ext-artifacts/.');
}

if (require.main === module) main(process.argv.slice(2), process.env);

module.exports = { keysFrom, forbiddenEntries, ALLOWED };
