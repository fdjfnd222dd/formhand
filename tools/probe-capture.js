'use strict';
// Runs one fill pass (TEST_PROFILE, sample standard answers) on a capture and prints,
// per field: tag/type, id, required, label, context, matched key, status, outline state.
// Structure only: the page is sanitized first and only TEST_PROFILE values can be filled,
// so nothing personal is printed. A reading aid for new captures.
//
//   node tools/probe-capture.js fixtures/<dir>/<file>.html [adapterName]
const path = require('path');
const { launch, injectScripts, openCapture, TEST_PROFILE } = require('../tests/helpers/browser');

const STD = {
  workAuth: 'yes', sponsorship: 'no', gender: 'female', hispanic: 'no', race: 'two', veteran: 'not',
  disability: 'no', privacyAck: '', otherPositions: 'yes', previouslyEmployed: 'no', clientEmployed: 'no',
};

(async () => {
  const [file, forced] = process.argv.slice(2);
  const rel = path.relative(path.resolve(__dirname, '..', 'fixtures'), path.resolve(file));
  const { browser, page } = await launch();
  try {
    await openCapture(page, rel);
    await injectScripts(page);
    const out = await page.evaluate(async ([p, std, adapter]) => {
      const r = await AF.autofill.run({ profile: p, standardAnswers: std, quiet: true, adapter: adapter || undefined });
      const cut = (s, n) => (s || '').replace(/\s+/g, ' ').slice(0, n);
      return {
        adapter: r.adapter, step: r.step, counts: r.counts,
        rows: r.results.map((x) => [
          x.el.tagName.toLowerCase() + (x.el.type ? ':' + x.el.type : ''), cut(x.el.id || x.el.name, 40),
          x.desc.required ? 'REQ' : '', cut(x.desc.label, 90), cut(x.desc.context, 40),
          x.match ? x.match.key + '@' + Number(x.match.confidence).toFixed(2) : '-', x.status, x.state || '',
        ].join(' | ')),
      };
    }, [TEST_PROFILE, STD, forced]);
    console.log(`adapter=${out.adapter} step=${out.step} counts=${JSON.stringify(out.counts)}`);
    out.rows.forEach((r) => console.log(r));
  } finally {
    await browser.close();
  }
})();
