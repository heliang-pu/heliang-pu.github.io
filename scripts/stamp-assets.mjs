// Stamp the stylesheet and script URLs in every page with a short hash of the file they point to.
//
// GitHub Pages lets browsers keep assets for ten minutes. Without a stamp, a visitor who reloads right
// after a deploy can get the new page with the old cached dictionary, and new lines then stay in
// English when the page is switched to Chinese. A changed file gets a new URL, so page and assets
// always match.
//
// Run after editing assets/site.css, assets/i18n.js or assets/site.js:
//   node scripts/stamp-assets.mjs
// The contract test fails when a stamp is out of date.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const ASSETS = ['assets/site.css', 'assets/i18n.js', 'assets/site.js'];
const PAGES = ['index.html', 'projects.html', 'competition.html'];

const stamps = new Map();
for (const asset of ASSETS) {
  const bytes = await readFile(new URL(asset, root));
  stamps.set(asset, createHash('sha256').update(bytes).digest('hex').slice(0, 8));
}

for (const page of PAGES) {
  const url = new URL(page, root);
  const before = await readFile(url, 'utf8');
  let html = before;
  for (const [asset, stamp] of stamps) {
    const pattern = new RegExp(`((?:href|src)=")${asset.replace(/\./g, '\\.')}(?:\\?v=[0-9a-f]+)?(")`, 'g');
    if (!pattern.test(html)) throw new Error(`${page} does not reference ${asset}`);
    html = html.replace(pattern, `$1${asset}?v=${stamp}$2`);
  }
  if (html !== before) await writeFile(url, html);
  console.log(`${page}: ${html === before ? 'up to date' : 'stamped'}`);
}
