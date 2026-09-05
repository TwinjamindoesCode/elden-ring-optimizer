/**
 * Checks the link-preview function without deploying.
 *
 * Bundles api/build-meta.ts the same way Vercel does, then asserts the HTML it
 * returns: correct per-build tags, a working app shell, and a graceful fall back
 * to the generic card for links it cannot make sense of.
 *
 * Run with:  npm run verify:preview
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = join(mkdtempSync(join(tmpdir(), 'softcap-preview-')), 'fn.mjs');

execSync(
  'npx --yes esbuild api/build-meta.ts --bundle --platform=node --format=esm ' +
    `--outfile="${out}" --log-level=error`,
  { stdio: 'inherit' },
);

const { renderShell, previewFor } = await import(pathToFileURL(out).href);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const BLEED = 'w=Bloodfiend%27s+Arm&aff=11&up=25&lvl=125&vig=60&mnd=20&end=25&s=28-11-7-8-45&cls=hero&obj=bleed&arch=arc';
const HEAVY = 'w=Longsword&aff=1&up=25&lvl=150&vig=60&mnd=20&end=25&s=80-12-9-9-7&cls=vagabond';

console.log('\nPer-build tags\n');

const bleed = previewFor(BLEED);
console.log(`  ${bleed.title}`);
console.log(`  ${bleed.description}\n`);

check('title names the weapon as the game does', bleed.title.includes("Bloodfiend's Blood Arm"));
check('title carries the upgrade level', bleed.title.includes('+25'));
check('title carries the rune level', bleed.title.includes('RL125'));
check('description leads with the headline number', /^186 bleed buildup/.test(bleed.description));
check('description carries the stat spread', bleed.description.includes('ARC 45'));

const heavy = previewFor(HEAVY);
check('a second build gets different tags', heavy.title.includes('Heavy Longsword') && heavy.description.startsWith('545 attack power'), heavy.title);

console.log('\nGraceful fallback\n');
for (const [q, label] of [
  ['', 'empty query'],
  ['w=NotARealWeapon&aff=3&s=10-10-10-10-10', 'unknown weapon'],
  ['w=Longsword&aff=1&s=broken', 'malformed stats'],
  ['%%%not-a-query%%%', 'junk query string'],
]) {
  let p;
  try {
    p = previewFor(q);
  } catch (e) {
    check(`${label} does not throw`, false, String(e));
    continue;
  }
  check(`${label} falls back to the generic card`, p.title === 'Softcap');
}

console.log('\nThe shell still works as an app\n');

const html = renderShell(BLEED);
check('app root present', /<div id="root">/.test(html));
check('js bundle referenced', /assets\/index-[A-Za-z0-9_-]+\.js/.test(html));
check('stylesheet referenced', /assets\/index-[A-Za-z0-9_-]+\.css/.test(html));
check('og:image still set', /og:image"\s+content="https:\/\/softcapbuilds\.com\/og\.png"/.test(html));
check('twitter card is summary_large_image', /twitter:card"\s+content="summary_large_image"/.test(html));
check('exactly one <title>', (html.match(/<title>/g) || []).length === 1);
check('exactly one og:title', (html.match(/og:title/g) || []).length === 1);
check('exactly one og:description', (html.match(/og:description/g) || []).length === 1);
check('quotes in content are escaped', !/content="[^"]*"[^">]*"/.test(html));

const generic = renderShell('');
check('bare /b still returns a valid shell', /<div id="root">/.test(generic) && /<title>Softcap<\/title>/.test(generic));

console.log('');
if (failures) {
  console.log(`${failures} check(s) FAILED — link previews are not trustworthy.\n`);
  process.exit(1);
}
console.log('All preview checks passed.\n');
