/**
 * Rasterises scripts/og-image.svg to public/og.png.
 *
 * Run it with:  npm run og
 *
 * Why a PNG and not the SVG directly: Discord, Reddit and X do not reliably
 * render SVG for og:image — the preview usually comes out blank. The PNG is
 * committed, so this only needs re-running if the card design changes.
 *
 * @resvg/resvg-js is a devDependency. It never ships to visitors.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const SOURCE = 'scripts/og-image.svg';
const OUT = 'public/og.png';

const svg = readFileSync(SOURCE, 'utf8');

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  // Use the system fonts the card names, matching the site's own stack.
  font: { loadSystemFonts: true },
  background: '#14110c',
});

const png = resvg.render().asPng();

mkdirSync('public', { recursive: true });
writeFileSync(OUT, png);

console.log(`${OUT}  ${(png.length / 1024).toFixed(0)} KB  1200x630`);
