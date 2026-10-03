/*
 * Toolbar popup tests: popup.html from disk, in-memory browser.storage.local
 * with two profiles, stubbed runtime.sendMessage / openOptionsPage / window.close.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launch, ROOT } = require('./helpers/browser');

const URL = 'file://' + path.join(ROOT, 'popup/popup.html');

const STUB = `
  window.__store = {
    schemaVersion: 3,
    profiles: [
      { id: 'default', name: 'Home address', data: {} },
      { id: 'p-va', name: 'Campus address', data: {} },
    ],
    activeProfileId: 'default',
  };
  window.__sent = [];
  window.__closed = 0;
  window.__optionsOpened = 0;
  window.close = () => { window.__closed++; };
  window.browser = {
    storage: { local: {
      async get(keys) { const o = {}; for (const k of [].concat(keys)) if (k in __store) o[k] = __store[k]; return o; },
      async set(obj) { Object.assign(__store, obj); },
      async remove(keys) { for (const k of [].concat(keys)) delete __store[k]; },
    } },
    runtime: {
      async sendMessage(m) { window.__sent.push(m); },
      async openOptionsPage() { window.__optionsOpened++; },
    },
  };`;

async function open() {
  const { browser, page } = await launch();
  await page.addInitScript(STUB);
  await page.goto(URL);
  await page.waitForSelector('input[name=profile]');
  return { browser, page };
}

test('popup lists profiles and switching changes the active profile', async () => {
  const { browser, page } = await open();
  try {
    const names = await page.$$eval('.profile span', (s) => s.map((x) => x.textContent));
    assert.deepEqual(names, ['Home address', 'Campus address']);
    assert.equal(await page.isChecked('input[value=default]'), true);
    assert.match(await page.textContent('#active-line'), /Home address/);

    await page.check('input[value=p-va]');
    await page.waitForFunction(() => window.__store.activeProfileId === 'p-va');
    await page.waitForFunction(() => document.getElementById('active-line').textContent.includes('Campus address'));
  } finally {
    await browser.close();
  }
});

test('Fill sends { type: "fill" } and closes the popup', async () => {
  const { browser, page } = await open();
  try {
    assert.match(await page.textContent('#fill-btn'), /Alt\+Z/);
    await page.click('#fill-btn');
    await page.waitForFunction(() => window.__closed === 1);
    assert.deepEqual(await page.evaluate(() => window.__sent), [{ type: 'fill' }]);
  } finally {
    await browser.close();
  }
});

test('learn mode checkbox is saved; options button opens options and closes', async () => {
  const { browser, page } = await open();
  try {
    await page.check('#learn-mode');
    await page.waitForFunction(() => window.__store.settings && window.__store.settings.learnMode === true);
    await page.click('#options-btn');
    await page.waitForFunction(() => window.__closed === 1);
    assert.equal(await page.evaluate(() => window.__optionsOpened), 1);
  } finally {
    await browser.close();
  }
});

test('embedded-form permission: button shown while the four hosts are not granted, asks for exactly them', async () => {
  const { browser, page } = await launch();
  try {
    await page.addInitScript(STUB + `
      window.__granted = [];
      window.__requested = [];
      window.browser.permissions = {
        async contains({ origins }) { return origins.every((o) => window.__granted.includes(o)); },
        async request({ origins }) { window.__requested.push(origins); window.__granted.push(...origins); return true; },
      };`);
    await page.goto(URL);
    await page.waitForSelector('#embed-perm:not([hidden])');
    await page.click('#embed-allow');
    await page.waitForSelector('#embed-perm[hidden]', { state: 'attached' });
    assert.deepEqual(await page.evaluate(() => window.__requested), [[
      'https://job-boards.greenhouse.io/*', 'https://boards.greenhouse.io/*', 'https://jobs.lever.co/*', 'https://jobs.ashbyhq.com/*',
    ]]);
  } finally {
    await browser.close();
  }
});

test('embedded-form permission: no button when already granted', async () => {
  const { browser, page } = await launch();
  try {
    await page.addInitScript(STUB + `
      window.browser.permissions = { async contains() { return true; }, async request() { return true; } };`);
    await page.goto(URL);
    await page.waitForSelector('input[name=profile]');
    await page.waitForTimeout(100);
    assert.equal(await page.isHidden('#embed-perm'), true);
  } finally {
    await browser.close();
  }
});
