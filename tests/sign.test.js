/*
 * tools/sign.js guards (pure Node). Signing itself is never run by tests.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { keysFrom, forbiddenEntries } = require('../tools/sign.js');

test('keys come from the environment only (web-ext names, AMO aliases)', () => {
  assert.equal(keysFrom({}).missing.length, 2);
  assert.deepEqual(keysFrom({ WEB_EXT_API_KEY: 'user:1:2', WEB_EXT_API_SECRET: 's' }), { key: 'user:1:2', secret: 's', missing: [] });
  assert.deepEqual(keysFrom({ AMO_JWT_ISSUER: 'user:1:2', AMO_JWT_SECRET: 's' }).missing, []);
});

test('the package may hold only the extension files', () => {
  assert.deepEqual(forbiddenEntries(['manifest.json', 'background.js', 'LICENSE', 'core/', 'core/run.js', 'adapters/workday.js',
    'options/options.html', 'popup/popup.js', 'icons/icon-48.png']), []);
  assert.deepEqual(forbiddenEntries(['fixtures/workday/x.html', 'seed/seed.json', 'tests/a.test.js', 'tools/sign.js',
    'node_modules/x/index.js', 'CLAUDE.md', 'DECISIONS.md', 'package.json', 'capture.js']), [
    'fixtures/workday/x.html', 'seed/seed.json', 'tests/a.test.js', 'tools/sign.js', 'node_modules/x/index.js', 'CLAUDE.md',
    'DECISIONS.md', 'package.json', 'capture.js']);
});

test('without keys the script stops before doing anything', () => {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'sign.js')], { env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /missing environment variable/);
  assert.match(r.stderr, /WEB_EXT_API_KEY/);
});
