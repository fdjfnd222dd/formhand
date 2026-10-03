// Picked up automatically by web-ext (lint / run / build / sign) from this directory.
// Everything that is not a runtime file stays out of the package: docs, notes, store and site assets, tests, real
// captures and the seed. `*.md` covers every document at the top level (README, CHANGELOG, CLAUDE.md, the release
// notes...), so a new note cannot slip into the XPI. LICENSE is packaged on purpose (scripts/build-xpi.sh does the same).
// tools/sign.js re-checks the built package against its allow-list before uploading anything.
export default {
  ignoreFiles: [
    'tests',
    'fixtures',
    'tools', // dev scripts (fixture stripper, profiler, signing)
    'seed', // resume + profile seed: personal, never packaged
    'node_modules',
    'package.json',
    'package-lock.json',
    '*.md',
    'docs',
    'store',
    'site',
    'scripts',
    '.github',
    '.editorconfig',
    '.gitattributes',
    'icons/logo.svg', // logo sources; the manifest uses the PNGs
    'icons/logo-small.svg',
    'web-ext-config.mjs',
  ],
};
