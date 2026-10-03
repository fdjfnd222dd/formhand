/*
 * Embedded application forms: core/embed.js classify() (pure) and survey() on
 * real pages (Firefox, offline: frames never load, only the <iframe>
 * elements are judged), plus a pass running inside a frame document.
 * background.js routing (fill in place / open in a tab) is tested in
 * tests/fallback.test.js with a stubbed browser.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const embed = require('../core/embed.js');
const { launch, injectScripts, fixtureUrl, hasFixture, openCapture, TEST_PROFILE } = require('./helpers/browser');

const frame = (src, extra) => ({ src, base: 'https://careers.acme.com/job/1', topOrigin: 'https://careers.acme.com', id: '', name: '', title: '', width: 800, height: 1200, visible: true, ...(extra || {}) });

test('classify: the four permitted hosts are filled in place', () => {
  for (const u of ['https://job-boards.greenhouse.io/embed/job_app?for=northwind', 'https://boards.greenhouse.io/embed/job_app?for=x&token=1',
    'https://jobs.lever.co/acme/123/apply', 'https://jobs.ashbyhq.com/acme/abc/application']) {
    assert.equal(embed.classify(frame(u)), 'fill', u);
  }
});

test('classify: other ATS hosts and form-looking unknown frames are opened in a tab', () => {
  assert.equal(embed.classify(frame('https://acme.wd5.myworkdayjobs.com/en-US/External/job/x/apply')), 'open');
  assert.equal(embed.classify(frame('https://careers-acme.icims.com/jobs/1/job')), 'open');
  assert.equal(embed.classify(frame('https://jobs.smartrecruiters.com/Acme/123')), 'open');
  assert.equal(embed.classify(frame('https://apply.acme-hr.example/jobs/42/apply')), 'open');
  assert.equal(embed.classify(frame('https://forms.example.net/f/9', { title: 'Job application' })), 'open');
  // grnhse_iframe on a custom domain: still the Greenhouse embed, but not a permitted host.
  assert.equal(embed.classify(frame('https://boards.acme.com/embed', { id: 'grnhse_iframe' })), 'open');
});

test('classify: ads, video, chat, captchas, maps, analytics, tiny / hidden / same-origin / non-http frames: never', () => {
  for (const u of ['https://www.youtube.com/embed/x?list=careers', 'https://player.vimeo.com/video/1?title=jobs',
    'https://googleads.g.doubleclick.net/pagead/ads?apply=1', 'https://www.recaptcha.net/recaptcha/api2/anchor',
    'https://widget.intercom.io/widget/careers', 'https://www.googletagmanager.com/ns.html?id=1', 'https://js.driftt.com/apply',
    'https://www.google.com/maps/embed?pb=jobs', 'https://www.facebook.com/plugins/page.php?href=careers']) {
    assert.equal(embed.classify(frame(u)), null, u);
  }
  assert.equal(embed.classify(frame('https://apply.acme-hr.example/jobs/42/apply', { visible: false })), null, 'hidden');
  assert.equal(embed.classify(frame('https://apply.acme-hr.example/jobs/42/apply', { width: 1, height: 1 })), null, 'tiny');
  assert.equal(embed.classify(frame('https://careers.acme.com/apply/form')), null, 'same origin');
  assert.equal(embed.classify(frame('javascript:void(0)', { title: 'apply' })), null);
  assert.equal(embed.classify(frame('about:blank', { title: 'application' })), null);
  assert.equal(embed.classify(frame('https://widgets.example-weather.test/forecast')), null, 'no form evidence');
  // Unknown hosts that say what else they are.
  assert.equal(embed.classify(frame('https://w.unknownchat.example/c', { title: 'Chat with our recruiting team' })), null);
  assert.equal(embed.classify(frame('https://media.example.net/player/careers')), null);
});

test('manifest: host permissions are exactly FILL_HOSTS; nothing else was added', () => {
  const m = require('../manifest.json');
  assert.deepEqual(m.host_permissions, embed.FILL_HOSTS.map((h) => `https://${h}/*`));
  assert.deepEqual(m.permissions, ['storage', 'activeTab', 'scripting']);
  assert.equal(m.content_scripts, undefined, 'never runs on page load');
  assert.equal(m.optional_permissions, undefined);
});

let browser;
let page;
test.before(async () => {
  ({ browser, page } = await launch());
});
test.after(async () => {
  if (browser) await browser.close();
});

const survey = () => page.evaluate(() => AF.embed.survey(document).map(({ url, host, kind, frameId }) => ({ url, host, kind, frameId })));

test('survey: the handwritten careers page -> only the unknown-domain application, opened (never the video/ad/chat/...)', async () => {
  await page.goto(fixtureUrl('generic/embedded.html'));
  await injectScripts(page);
  assert.deepEqual(await survey(), [
    { url: 'https://apply.acme-hr.example/jobs/42/apply?source=careers', host: 'apply.acme-hr.example', kind: 'open', frameId: null },
  ]);
  // The top page's own pass is not disturbed by the frames (the job-alert box is not a profile field it fills).
  const out = await page.evaluate((p) => AF.autofill.run({ profile: p, quiet: true }).then((r) => ({ embedded: r.embedded, n: r.results.length })), TEST_PROFILE);
  assert.deepEqual(out.embedded, ['apply.acme-hr.example']);
});

test('survey: the toast names the new tab when background.js opens one', async () => {
  await page.goto(fixtureUrl('generic/embedded.html'));
  await injectScripts(page);
  const text = await page.evaluate((p) => AF.autofill.run({ profile: p, embedPlan: { filling: [], opening: 'https://apply.acme-hr.example/jobs/42/apply' } })
    .then(() => document.getElementById('af-feedback-toast').textContent), TEST_PROFILE);
  assert.match(text, /^Opened the application in its own tab\. Press Alt\+Z\./);
});

test('survey: while frames are filled in place the top pass stays silent (background.js reports all)', async () => {
  await page.goto(fixtureUrl('generic/embedded.html'));
  await injectScripts(page);
  const toast = await page.evaluate((p) => AF.autofill.run({ profile: p, embedPlan: { filling: ['job-boards.greenhouse.io'], opening: null } })
    .then(() => !!document.getElementById('af-feedback-toast')), TEST_PROFILE);
  assert.equal(toast, false);
  // The combined toast background.js shows.
  const text = await page.evaluate(() => {
    AF.feedback.toast(document, { filled: 9, review: 2, unknown: 1 }, 'Home address', 'Northwind', 'in the embedded job-boards.greenhouse.io form');
    return document.querySelector('#af-summary .af-title').textContent;
  });
  assert.equal(text, 'Formhand (Home address) at Northwind: 9 filled · 2 to review · 1 need you (in the embedded job-boards.greenhouse.io form)');
});

for (const [file, host] of [
  ['careerpuck/app_careerpuck_com_1790982298714.html', 'job-boards.greenhouse.io'],
  ['embedded/*_1790994874513.html', 'job-boards.greenhouse.io'],
]) {
  test(`survey: ${file} -> the Greenhouse frame is filled in place (GTM frame ignored)`, { skip: hasFixture(file) ? false : 'capture not on this machine' }, async () => {
    await openCapture(page, file);
    await injectScripts(page);
    const s = await survey();
    assert.equal(s.length, 1);
    assert.equal(s[0].host, host);
    assert.equal(s[0].kind, 'fill');
    assert.match(s[0].url, /^https:\/\/job-boards\.greenhouse\.io\/embed\/job_app\?for=/);
  });
}

test('a pass inside a frame document fills it like a page of its own', async () => {
  await page.setContent(`<!doctype html><html><body><h1>Careers</h1>
    <iframe id="app" width="800" height="900" src="${fixtureUrl('generic/basic.html')}"></iframe></body></html>`);
  const child = await (await page.waitForSelector('#app')).contentFrame();
  await child.waitForLoadState('domcontentloaded');
  await injectScripts(child);
  const out = await child.evaluate((p) => AF.autofill.run({ profile: p, quiet: true }).then((r) => ({
    adapter: r.adapter, filled: r.counts.filled, first: document.getElementById('legal-first').value,
  })), TEST_PROFILE);
  assert.equal(out.adapter, 'generic');
  assert.ok(out.filled > 3, 'filled ' + out.filled);
  assert.equal(out.first, TEST_PROFILE.firstName);
});
