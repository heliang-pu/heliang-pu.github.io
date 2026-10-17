import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path, encoding = 'utf8') =>
  readFile(new URL(path, root), encoding);

const [index, robots, sitemap, notFound] = await Promise.all([
  read('index.html'),
  read('robots.txt'),
  read('sitemap.xml'),
  read('404.html'),
]);

function attr(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'),
  )?.[2];
}

function tags(name, source = index) {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))]
    .map((match) => match[0]);
}

function bracedBlock(source, marker) {
  const markerAt = source.indexOf(marker);
  assert.notEqual(markerAt, -1, `missing marker: ${marker}`);
  const open = source.indexOf('{', markerAt);
  assert.notEqual(open, -1, `missing opening brace after: ${marker}`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`unclosed block after: ${marker}`);
}

function mediaBlocks(source, header) {
  const blocks = [];
  let cursor = 0;

  while ((cursor = source.indexOf(header, cursor)) !== -1) {
    const open = source.indexOf('{', cursor);
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') depth -= 1;
      if (depth === 0) {
        blocks.push(source.slice(open + 1, i));
        cursor = i + 1;
        break;
      }
    }
  }
  return blocks.join('\n');
}

function languageBlock(lang) {
  return bracedBlock(index, `${lang}: {`);
}

function languageValue(block, key) {
  return block.match(
    new RegExp(`\\b${key}:\\s*(["'])(.*?)\\1`),
  )?.[2];
}

const demoCards = [
  ...index.matchAll(
    /<article class="demo-card"[^>]*>[\s\S]*?<\/article>/g,
  ),
].map((match) => match[0]);

const dictionary = vm.runInNewContext(
  `(${index.match(/var i18n = (\{[\s\S]*?\n    \});/)[1]})`,
);

// Link annotations can sit inside Flate-compressed object streams.
function pdfLinkTargets(bytes) {
  const raw = bytes.toString('latin1');
  const texts = [raw];
  for (let at = raw.indexOf('stream'); at !== -1; at = raw.indexOf('stream', at + 1)) {
    if (raw.startsWith('endstream', at - 3)) continue;
    let start = at + 'stream'.length;
    if (raw[start] === '\r') start += 1;
    if (raw[start] === '\n') start += 1;
    try {
      texts.push(inflateSync(bytes.subarray(start, raw.indexOf('endstream', start))).toString('latin1'));
    } catch {
      // Not a Flate stream (images, fonts).
    }
  }
  const unescape = (value) =>
    value.replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  return [...texts.join('\n').matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)]
    .map((match) => unescape(match[1]));
}

test('canonical, robots, and sitemap use one production host', () => {
  const canonicalTag = tags('link').find(
    (tag) => attr(tag, 'rel') === 'canonical',
  );
  const canonical = new URL(attr(canonicalTag, 'href'));
  const robotsSitemap = new URL(
    robots.match(/^Sitemap:\s*(\S+)$/mi)?.[1],
  );
  const locations = [
    ...sitemap.matchAll(/<loc>(.*?)<\/loc>/g),
  ].map((match) => new URL(match[1]));

  assert.equal(canonical.hostname, 'heliang-pu.github.io');
  assert.equal(robotsSitemap.origin, canonical.origin);
  assert.equal(robotsSitemap.pathname, '/sitemap.xml');
  assert.equal(locations.length, 2);
  assert.equal(locations[0].origin, canonical.origin);
  assert.equal(locations[0].pathname, '/');
  assert.equal(locations[1].origin, canonical.origin);
  assert.equal(locations[1].pathname, '/demos/embodied-harness.html');
  assert.doesNotMatch(
    `${index}\n${robots}\n${sitemap}`,
    /aurorabot-ai\.github\.io/i,
  );
  assert.doesNotMatch(sitemap, /<lastmod\b/i);
});

test('static title and share cards match the zh copy that crawlers read', () => {
  const meta = (key, value) =>
    attr(tags('meta').find((tag) => attr(tag, key) === value), 'content');

  assert.equal(index.match(/<title>(.*?)<\/title>/)?.[1], dictionary.zh.docTitle);
  assert.equal(meta('name', 'description'), dictionary.zh.metaDesc);
  assert.equal(meta('property', 'og:title'), dictionary.zh.docTitle);
  assert.equal(meta('property', 'og:description'), dictionary.zh.metaDesc);
  assert.equal(meta('name', 'twitter:title'), dictionary.zh.docTitle);
  assert.equal(meta('name', 'twitter:description'), dictionary.zh.metaDesc);
});

test('mobile header and navigation follow visible focus order', () => {
  const controlsIndex = index.indexOf('<div class="site-controls"');
  const identityIndex = index.indexOf('<div class="mobile-id"');
  const navigationIndex = index.indexOf('<details class="mobile-nav"');
  const mainIndex = index.indexOf('<main class="main" id="main">');

  assert.ok(
    controlsIndex < identityIndex &&
    identityIndex < navigationIndex &&
    navigationIndex < mainIndex,
  );

  const controls = index.match(
    /<div\s+class="site-controls"[\s\S]*?<\/div>/,
  )?.[0] ?? '';
  assert.match(controls, /class="control-btn lang-toggle"/);
  assert.match(controls, /class="control-btn theme-toggle"/);

  const mobileIdentityTag = index.match(
    /<div\s+class="mobile-id"[^>]*>/,
  )?.[0] ?? '';
  assert.doesNotMatch(mobileIdentityTag, /aria-hidden/);
  assert.match(
    index,
    /<div class="mobile-id">[\s\S]*?<h1 data-i18n="name">/,
  );
});

test('mobile navigation is native and contains section and profile links', () => {
  const details = index.match(
    /<details class="mobile-nav">([\s\S]*?)<\/details>/,
  )?.[0] ?? '';

  assert.match(details, /<summary data-i18n="navTitle">/);
  assert.match(details, /<nav[\s\S]*data-i18n-aria="navAria"/);

  for (const href of [
    '#experience', '#projects', '#skills', '#platforms', '#awards',
    '#demos', '#locomotion',
    'mailto:puheliang122@gmail.com',
    'https://github.com/heliang-pu',
    'https://huggingface.co/puheliang',
    'https://space.bilibili.com/389273511',
    'https://www.linkedin.com/in/heliang-pu-a26538416/',
  ]) {
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(details, new RegExp(`href="${escaped}"`));
  }
});

test('980px layout hides the desktop sidebar without CSS reordering', () => {
  const css = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const mobileCss = mediaBlocks(css, '@media (max-width: 980px)');
  const controlsBaseIndex = css.indexOf('.site-controls {');
  const hiddenMobileIndex = css.indexOf('.mobile-id,\n    .mobile-nav {');
  const firstMobileMediaIndex = css.indexOf('@media (max-width: 980px)');

  assert.match(mobileCss, /\.sidebar\s*\{[^}]*display:\s*none/);
  assert.match(mobileCss, /\.site-controls\s*\{[^}]*position:\s*static/);
  assert.match(mobileCss, /\.mobile-id\s*\{[^}]*display:\s*flex/);
  assert.match(mobileCss, /\.mobile-nav\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(mobileCss, /\.main\s*\{[^}]*\border\s*:/);
  assert.doesNotMatch(mobileCss, /\.mobile-id\s*\{[^}]*\border\s*:/);
  assert.ok(
    controlsBaseIndex !== -1 &&
    hiddenMobileIndex !== -1 &&
    controlsBaseIndex < firstMobileMediaIndex &&
    hiddenMobileIndex < firstMobileMediaIndex,
  );
});

test('work and projects lead the page; demos follow as evidence', () => {
  const sections = [
    ...index.matchAll(/<section class="(hero|section)"(?: id="([^"]+)")?>/g),
  ].map((match) => match[2] ?? match[1]);
  assert.deepEqual(sections, [
    'hero', 'experience', 'projects', 'featured-demos',
    'skills', 'platforms', 'awards', 'demos', 'locomotion',
  ]);

  const featured = index.match(/<section class="section" id="featured-demos">[\s\S]*?<\/section>/)?.[0] ?? '';
  const kinds = [...featured.matchAll(/class="demo-kind[^"]*" data-i18n="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(kinds.length, 3);
  assert.ok(kinds.every((kind) => kind === 'kindReal' || kind === 'kindSimReal'), kinds.join());
});

test('all ten videos are network-idle until explicit activation', () => {
  assert.equal(demoCards.length, 10);

  for (const [position, card] of demoCards.entries()) {
    const video = card.match(/<video\b[^>]*>/i)?.[0];
    const source = card.match(/<source\b[^>]*>/i)?.[0];
    const fallback = card.match(
      /<a\b[^>]*class="video-fallback"[^>]*>/i,
    )?.[0];

    assert.equal(attr(video, 'preload'), 'none');
    const deferredUrl = attr(source, 'data-src');
    assert.match(deferredUrl, /site-media\/(?:demo|loco)\d+(?:-[a-z0-9-]+)?\.mp4$/);
    assert.equal(attr(source, 'src'), undefined);
    assert.equal(attr(fallback, 'href'), deferredUrl);
    assert.equal(attr(fallback, 'target'), '_blank');
    assert.match(attr(fallback, 'rel'), /\bnoreferrer\b/);
    assert.equal(attr(fallback, 'data-i18n'), 'videoFallback');
    assert.ok(video, `demo ${position + 1}: missing video`);
  }

  assert.doesNotMatch(index, /\bvidObs\b/);
  const activation = bracedBlock(index, 'function activateVideo(media, video)');
  assert.match(activation, /source\.setAttribute\(['"]src['"],\s*source\.dataset\.src\)/);
  assert.match(activation, /video\.load\(\)/);
  assert.match(activation, /video\.play\(\)/);
  assert.match(activation, /has-video-error/);
});

test('play buttons inherit ten unique labels and refresh after language changes', () => {
  const videos = tags('video');
  const keys = videos.map((video) => attr(video, 'data-i18n-aria'));
  const initialLabels = videos.map((video) => attr(video, 'aria-label'));
  assert.equal(videos.length, 10);
  assert.equal(new Set(keys).size, 10);
  assert.equal(new Set(initialLabels).size, 10);

  const zh = languageBlock('zh');
  const en = languageBlock('en');
  const zhLabels = keys.map((key) => languageValue(zh, key));
  const enLabels = keys.map((key) => languageValue(en, key));
  assert.ok(zhLabels.every(Boolean));
  assert.ok(enLabels.every(Boolean));
  assert.equal(new Set(zhLabels).size, 10);
  assert.equal(new Set(enLabels).size, 10);
  assert.ok(languageValue(zh, 'videoFallback'));
  assert.ok(languageValue(en, 'videoFallback'));

  const refresh = bracedBlock(index, 'function refreshPlayButtonLabel(media)');
  assert.match(refresh, /video\.getAttribute\(['"]aria-label['"]\)/);
  assert.match(refresh, /badge\.setAttribute\(['"]aria-label['"],\s*label\)/);
  assert.match(bracedBlock(index, 'function applyLang(lang)'), /refreshPlayButtonLabels\(\)/);
});

test('every translated element has zh and en copy', () => {
  const keys = new Set(
    [...index.matchAll(/data-i18n(?:-aria|-alt)?="([^"]+)"/g)].map((match) => match[1]),
  );
  for (const key of keys) {
    for (const lang of ['zh', 'en']) {
      assert.ok(dictionary[lang][key], `${lang}: ${key}`);
    }
  }
});

test('hero, sections, and metrics never begin with false content', () => {
  assert.doesNotMatch(index, /\.hero\s*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(index, /\.main\s*>\s*\.section[^{}]*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(index, /\.reveal\s*\{\s*opacity:\s*0/);
  assert.doesNotMatch(index, /\bnumObs\b|\brevObs\b/);
  assert.doesNotMatch(index, /requestAnimationFrame\(step\)/);
  assert.match(index, /<strong>30%→70%<\/strong>/);
  assert.match(index, /<strong>500\+<\/strong>/);
});

test('hero metrics and projects lead with the resume headline results', () => {
  const metrics = [
    ...index.matchAll(/<div class="metric">\s*<strong[^>]*>(.*?)<\/strong>/g),
  ].map((match) => match[1]);
  assert.deepEqual(metrics.slice(0, 2), ['≈2×', '30%→70%']);

  const firstProject = index.match(/<article class="project-card">[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.match(firstProject, /data-i18n="p4t">π0\.6 RECAP/);
  assert.match(firstProject, /<strong>≈2×<\/strong>/);
});

test('reduced motion and dark skip-link styles are complete', () => {
  const reduced = bracedBlock(index, '@media (prefers-reduced-motion: reduce)');
  assert.match(reduced, /html\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important/);
  assert.match(index, /html\.theme-dark\s+\.skip-link:focus\s*\{[^}]*color:\s*#0f172a/);
});

test('favicon, footer date, and local assets are consistent', async () => {
  const favicon = tags('link').find((tag) => attr(tag, 'rel') === 'icon');
  assert.equal(attr(favicon, 'href'), '/assets/icon-192.png');
  assert.doesNotMatch(attr(favicon, 'href'), /^data:/);
  assert.equal((index.match(/Last updated: 2026\.10/g) ?? []).length, 3);
  assert.doesNotMatch(index, /Last updated: 2026\.08/);

  const localRefs = [
    ...index.matchAll(/\b(?:src|href|poster)="(\/?assets\/[^"#?]+|heliang-pu-resume\.pdf)"/g),
  ].map((match) => match[1].replace(/^\//, ''));
  await Promise.all([...new Set(localRefs)].map((path) => access(new URL(path, root))));
});

test('404 uses border-box and the small viewport height', () => {
  const body = bracedBlock(notFound, 'body {');
  assert.match(body, /box-sizing:\s*border-box/);
  assert.match(body, /min-height:\s*100svh/);
  assert.match(notFound, /<main>/);
  assert.match(notFound, /<a href="\/">返回首页<\/a>/);
});

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function pngDimensions(path) {
  const bytes = await read(path, null);
  assert.ok(bytes.length >= 24);
  assert.deepEqual(bytes.subarray(0, 8), pngSignature);
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    size: (await stat(new URL(path, root))).size,
  };
}

for (const path of [
  'assets/east-china-normal-university-emblem.png',
  'assets/suzhou-institute-of-technology-emblem.png',
]) {
  test(`${path} is an optimized school emblem`, async () => {
    const actual = await pngDimensions(path);
    assert.equal(actual.width, 128);
    assert.equal(actual.height, 128);
    assert.ok(actual.size < 80 * 1024);
  });
}

test('resume PDF is at most 3 MiB', async () => {
  const size = (await stat(new URL('heliang-pu-resume.pdf', root))).size;
  assert.ok(
    size <= 3 * 1024 * 1024,
    `resume is ${size} bytes; expected at most 3 MiB`,
  );
});

test('every page anchor linked from the resume PDF exists', async () => {
  const siteLinks = pdfLinkTargets(await read('heliang-pu-resume.pdf', null))
    .map((uri) => new URL(uri))
    .filter((url) => url.hostname === 'heliang-pu.github.io');

  assert.ok(siteLinks.length > 0, 'resume PDF has no links to the site');
  for (const id of new Set(siteLinks.filter((url) => url.hash).map((url) => url.hash.slice(1)))) {
    assert.match(index, new RegExp(`\\sid="${id}"`), `resume links to #${id}`);
  }
});

test('work and education timeline is visible and linked from navigation', () => {
  assert.match(index, /href="#experience"[^>]*data-i18n="navExp"/);
  assert.match(index, /<section class="section" id="experience">[\s\S]*?工作与教育/);
  assert.match(index, /<h3 data-i18n="exp2title">华东师范大学<\/h3>/);
  assert.match(index, /<h3 data-i18n="exp3title">江苏科技大学苏州理工学院<\/h3>/);
});
