import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path, encoding = 'utf8') =>
  readFile(new URL(path, root), encoding);

const [index, css, script, i18nSource, robots, sitemap, notFound, competitionPage, projectsPage] = await Promise.all([
  read('index.html'),
  read('assets/site.css'),
  read('assets/site.js'),
  read('assets/i18n.js'),
  read('robots.txt'),
  read('sitemap.xml'),
  read('404.html'),
  read('competition.html'),
  read('projects.html'),
]);
const pages = [index, competitionPage, projectsPage];

const dictionary = vm.runInNewContext(`${i18nSource}\ni18n;`);

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
  assert.deepEqual(locations.map((url) => url.pathname), ['/', '/competition.html', '/projects.html']);
  for (const url of locations) assert.equal(url.origin, canonical.origin);
  assert.doesNotMatch(
    `${pages.join('\n')}\n${robots}\n${sitemap}`,
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

for (const [file, page, titleKey, descKey] of [
  ['competition.html', competitionPage, 'compDocTitle', 'compMetaDesc'],
  ['projects.html', projectsPage, 'projDocTitle', 'projMetaDesc'],
]) {
  test(`${file} title and share cards match its zh copy`, () => {
    const meta = (key, value) =>
      attr(tags('meta', page).find((tag) => attr(tag, key) === value), 'content');
    const canonical = tags('link', page).find((tag) => attr(tag, 'rel') === 'canonical');

    assert.equal(attr(canonical, 'href'), `https://heliang-pu.github.io/${file}`);
    assert.match(page, new RegExp(`<body data-i18n-title="${titleKey}" data-i18n-desc="${descKey}">`));
    assert.equal(page.match(/<title>(.*?)<\/title>/)?.[1], dictionary.zh[titleKey]);
    assert.equal(meta('property', 'og:title'), dictionary.zh[titleKey]);
    assert.equal(meta('name', 'twitter:title'), dictionary.zh[titleKey]);
    assert.equal(meta('name', 'description'), dictionary.zh[descKey]);
    assert.equal(meta('property', 'og:description'), dictionary.zh[descKey]);
    assert.equal(meta('name', 'twitter:description'), dictionary.zh[descKey]);
  });
}

test('styles and scripts live in assets and load in order', () => {
  for (const page of pages) {
    assert.doesNotMatch(page, /<style\b/);
    assert.doesNotMatch(page, /\sonclick=/);
    assert.match(page, /<link rel="stylesheet" href="assets\/site\.css">/);

    const scripts = tags('script', page).map((tag) => attr(tag, 'src')).filter(Boolean);
    assert.deepEqual(scripts, ['assets/i18n.js', 'assets/site.js']);
  }

  for (const [selector, handler] of [
    ['langBtn', 'toggleLang'], ['themeBtn', 'toggleTheme'], ['toTop', 'scrollToTop'],
  ]) {
    assert.match(script, new RegExp(`${selector}\\.addEventListener\\('click', ${handler}\\)`));
  }
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
    '#experience', '#projects', '#competition', '#skills', '#awards', 'projects.html',
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
  const mobileCss = mediaBlocks(css, '@media (max-width: 980px)');
  const controlsBaseIndex = css.indexOf('.site-controls {');
  const hiddenMobileIndex = css.indexOf('.mobile-id,\n.mobile-nav {');
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

const competition = index.match(
  /<section class="section" id="competition">[\s\S]*?<\/section>/,
)?.[0] ?? '';

const panels = [
  ...competitionPage.matchAll(/<section class="section task-panel" id="([^"]+)"[\s\S]*?<\/section>/g),
].map((match) => ({ id: match[1], html: match[0] }));
const competitionIds = new Set([...competitionPage.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

test('the homepage reads like a resume: highlights and entries, details on other pages', () => {
  const sections = [
    ...index.matchAll(/<section class="(hero|section)"(?: id="([^"]+)")?>/g),
  ].map((match) => match[2] ?? match[1]);
  assert.deepEqual(sections, ['hero', 'experience', 'projects', 'competition', 'skills', 'awards']);

  // The long write-ups live on projects.html; the homepage keeps one or two lines per item.
  assert.doesNotMatch(index, /class="(?:project-card|capability-grid|platform-grid|more-item)\b/);
  const projectSections = [...projectsPage.matchAll(/<section class="section" id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(projectSections, ['projects', 'more-projects', 'skills', 'platforms']);
  const projectIds = new Set([...projectsPage.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const detailLinks = [...index.matchAll(/href="projects\.html#([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(detailLinks, ['recap', 'dual-arm', 'chainplanner']);
  for (const id of detailLinks) assert.ok(projectIds.has(id), `projects.html#${id}`);
  for (const page of [competitionPage, projectsPage]) assert.match(page, /<a class="back-link" href="\.\/#/);

  // The homepage only links to the clips, and the old demo wall (Release videos, demos/ pages) stays gone.
  // Homepage videos: the tissue-sorting clip (dual-arm) and the ChainPlanner demo; the rest live on other pages.
  const homeVideos = [...index.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)].map((match) => match[0]);
  assert.equal(homeVideos.length, 2);
  assert.equal(tags('source').length, 2);
  const picksWithVideo = [...index.matchAll(/<article class="pick">[\s\S]*?<\/article>/g)]
    .map((match) => match[0])
    .filter((pick) => pick.includes('<video'))
    .map((pick) => pick.match(/data-i18n="(p\d+t)"/)?.[1]);
  assert.deepEqual(picksWithVideo, ['p1t', 'p5t']);
  for (const source of [index, competitionPage, css, script]) {
    assert.doesNotMatch(source, /releases\/download|site-media|demos\/|demo-card|play-badge/);
  }

  const tiles = [...competition.matchAll(/<a class="task-tile" href="competition\.html#([^"]+)">/g)]
    .map((match) => match[1]);
  assert.equal(tiles.length, 10);
  assert.deepEqual(tiles, panels.map((panel) => panel.id));
  for (const img of tags('img', competition)) {
    assert.match(attr(img, 'src'), /^assets\/competition\/[a-z-]+-tile\.webp$/);
    assert.equal(attr(img, 'loading'), 'lazy');
  }
});

test('competition page explains the methods after the clips, and the homepage links to them', () => {
  const methods = competitionPage.match(/<section class="section" id="methods">[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.equal((methods.match(/<article class="method-card">/g) ?? []).length, 2);
  assert.ok(
    competitionPage.indexOf('<section class="section" id="methods">') >
      competitionPage.lastIndexOf('<section class="section task-panel"'),
  );
  assert.match(competition, /href="competition\.html#methods"/);
  assert.ok(competitionIds.has('methods'));
});

test('competition page shows ten tasks, each with a sim clip and a real clip', async () => {
  assert.equal(panels.length, 10);
  const tabs = competitionPage.match(/<nav class="task-tabs"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.deepEqual([...tabs.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]), panels.map((panel) => panel.id));
  for (const [, target] of competitionPage.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(competitionIds.has(target), `#${target} has no target`);
  }

  let total = 0;
  for (const panel of panels) {
    const videos = [...panel.html.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)].map((match) => match[0]);
    assert.equal(videos.length, 2, panel.id);

    for (const [i, video] of videos.entries()) {
      const name = `${panel.id}-${['sim', 'real'][i]}`;
      const tag = tags('video', video)[0];
      assert.equal(attr(tag, 'preload'), 'none');
      assert.match(tag, /\scontrols\b/);
      assert.match(tag, /\splaysinline\b/);
      assert.ok(Number(attr(tag, 'width')) > 0 && Number(attr(tag, 'height')) > 0);
      assert.equal(attr(tag, 'aria-labelledby'), `${panel.id}-title ${name}`);
      assert.ok(competitionIds.has(`${panel.id}-title`) && competitionIds.has(name), name);
      assert.equal(attr(tag, 'poster'), `assets/competition/${name}.webp`);
      await access(new URL(attr(tag, 'poster'), root));

      const sources = tags('source', video);
      assert.equal(sources.length, 1);
      const src = attr(sources[0], 'src');
      assert.equal(src, `assets/competition/${name}.mp4`);
      assert.equal(attr(sources[0], 'type'), 'video/mp4');

      // moov before mdat, so playback starts before the whole file arrives
      const bytes = await read(src, null);
      const head = bytes.subarray(0, 64 * 1024).toString('latin1');
      const moov = head.indexOf('moov');
      const mdat = head.indexOf('mdat');
      assert.ok(moov !== -1 && (mdat === -1 || moov < mdat), `${src} is not faststart`);
      assert.ok(bytes.length <= 4 * 1024 * 1024, `${src} is ${bytes.length} bytes`);
      total += bytes.length;
    }
  }
  assert.ok(total <= 40 * 1024 * 1024, `competition clips total ${total} bytes`);
});

test('project videos are same-origin, load on demand, and stay small', async () => {
  // Homepage picks and projects.html: the tissue-sorting clip and the ChainPlanner real-robot demos.
  const clips = [
    'tissue-sorting',
    'chainplanner-goal-only',
    'chainplanner-five-steps',
    'chainplanner-bell-three-times',
    'chainplanner-pen-tube-bell',
  ];
  const seen = new Set();
  for (const page of [index, projectsPage]) {
    for (const [video] of page.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)) {
      const tag = tags('video', video)[0];
      const src = attr(tags('source', video)[0], 'src');
      const name = src.match(/^assets\/projects\/([a-z0-9-]+)\.mp4$/)?.[1];
      assert.ok(clips.includes(name), src);
      seen.add(name);
      assert.equal(attr(tag, 'poster'), `assets/projects/${name}.webp`);
      assert.equal(attr(tag, 'preload'), 'none');
      assert.match(tag, /\scontrols\b/);
      assert.match(tag, /\splaysinline\b/);
      const ariaKey = attr(tag, 'data-i18n-aria');
      if (ariaKey) {
        assert.equal(attr(tag, 'aria-label'), dictionary.zh[ariaKey]);
      } else {
        for (const id of attr(tag, 'aria-labelledby').split(' ')) {
          assert.match(page, new RegExp(`\\sid="${id}"`), `${src} label #${id}`);
        }
      }
      await access(new URL(attr(tag, 'poster'), root));
      const bytes = await read(src, null);
      const head = bytes.subarray(0, 64 * 1024).toString('latin1');
      const moov = head.indexOf('moov');
      const mdat = head.indexOf('mdat');
      assert.ok(moov !== -1 && (mdat === -1 || moov < mdat), `${src} is not faststart`);
      assert.ok(bytes.length <= 4 * 1024 * 1024, `${src} is ${bytes.length} bytes`);
    }
  }
  assert.deepEqual([...seen].sort(), [...clips].sort());
});

test('ChainPlanner shows its method figure in the page language and links the code', () => {
  const card = projectsPage.match(/<article class="project-card" id="chainplanner">[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.match(card, /<img class="lang-zh" src="assets\/projects\/chainplanner-method-zh\.webp"/);
  assert.match(card, /<img class="lang-en" src="assets\/projects\/chainplanner-method-en\.webp"/);
  assert.match(card, /href="https:\/\/github\.com\/heliang-pu\/wam-long-horizon-planner"/);
  assert.equal(card.match(/<video\b/g)?.length, 4);
  assert.match(css, /html\[lang="en"\] \.lang-zh,\s*html:not\(\[lang="en"\]\) \.lang-en\s*\{\s*display:\s*none;/);
  // applyLang sets <html lang>, which is what switches the figure.
  assert.match(script, /document\.documentElement\.lang = lang === 'zh' \? 'zh-CN' : 'en';/);
});

test('old resume PDFs still land on the homepage', () => {
  // Older PDFs sent to recruiters link to these anchors; never drop them from index.html.
  for (const id of ['demos', 'demo-01', 'demo-02', 'demo-03', 'demo-04', 'demo-05', 'demo-06',
    'demo-07', 'demo-08', 'demo-09', 'demo-10', 'demo-12']) {
    assert.match(index, new RegExp(`\\sid="${id}"`), id);
  }
});

test('project screenshots are static, lazy, and described', () => {
  const shots = [
    ...tags('img', projectsPage).filter((tag) => attr(tag, 'class') === 'project-shot'),
    ...tags('img').filter((tag) => attr(tag, 'class') === 'pick-shot'),
  ];
  assert.equal(shots.length, 3);
  for (const shot of shots) {
    assert.match(attr(shot, 'src'), /^assets\/projects\/[a-z0-9-]+\.webp$/);
    assert.equal(attr(shot, 'loading'), 'lazy');
    assert.ok(Number(attr(shot, 'width')) > 0 && Number(attr(shot, 'height')) > 0);
    assert.ok(attr(shot, 'alt'));
    assert.equal(attr(shot, 'alt'), dictionary.zh[attr(shot, 'data-i18n-alt')]);
  }
});

test('zh and en dictionaries match and every key is used', () => {
  assert.deepEqual(Object.keys(dictionary.zh).sort(), Object.keys(dictionary.en).sort());

  const keys = new Set(
    [...pages.join('\n').matchAll(/data-i18n(?:-aria|-alt|-title|-desc)?="([^"]+)"/g)]
      .map((match) => match[1]),
  );
  for (const key of keys) {
    for (const lang of ['zh', 'en']) {
      assert.ok(dictionary[lang][key], `${lang}: ${key}`);
    }
  }

  const scriptKeys = new Set([...script.matchAll(/\bt\.(\w+)/g)].map((match) => match[1]));
  const unused = Object.keys(dictionary.zh).filter((key) => !keys.has(key) && !scriptKeys.has(key));
  assert.deepEqual(unused, []);
});

test('hero, sections, and metrics never begin with false content', () => {
  assert.doesNotMatch(css, /\.hero\s*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(css, /\.main\s*>\s*\.section[^{}]*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(css, /\.reveal\s*\{\s*opacity:\s*0/);
  assert.doesNotMatch(script, /\bnumObs\b|\brevObs\b/);
  assert.doesNotMatch(script, /requestAnimationFrame\(step\)/);
  assert.match(index, /<strong>30%→70%<\/strong>/);
});

test('hero metrics and projects lead with the resume headline results', () => {
  const metrics = [
    ...index.matchAll(/<div class="metric">\s*<strong[^>]*>(.*?)<\/strong>/g),
  ].map((match) => match[1]);
  assert.deepEqual(metrics.slice(0, 2), ['≈2×', '30%→70%']);

  const firstPick = index.match(/<article class="pick">[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.match(firstPick, /data-i18n="p4t">π0\.6 RECAP/);
  assert.match(firstPick, /<strong>≈2×<\/strong>/);
  const firstProject = projectsPage.match(/<article class="project-card"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.match(firstProject, /data-i18n="p4t">π0\.6 RECAP/);
  assert.match(firstProject, /<strong>≈2×<\/strong>/);
});

test('reduced motion and dark skip-link styles are complete', () => {
  const reduced = bracedBlock(css, '@media (prefers-reduced-motion: reduce)');
  assert.match(reduced, /html\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important/);
  assert.match(css, /html\.theme-dark\s+\.skip-link:focus\s*\{[^}]*color:\s*#0f172a/);
});

test('favicon, footer date, and local assets are consistent', async () => {
  const favicon = tags('link').find((tag) => attr(tag, 'rel') === 'icon');
  assert.equal(attr(favicon, 'href'), '/assets/icon-192.png');
  assert.doesNotMatch(attr(favicon, 'href'), /^data:/);
  assert.equal((`${index}\n${i18nSource}`.match(/Last updated: 2026\.11/g) ?? []).length, 3);
  for (const page of [competitionPage, projectsPage]) {
    assert.equal((page.match(/Last updated: 2026\.11/g) ?? []).length, 1);
  }
  assert.doesNotMatch(`${pages.join('\n')}\n${i18nSource}`, /Last updated: 2026\.(?:08|10)/);

  const pageRefs = [
    ...pages.join('\n').matchAll(/\b(?:src|href|poster)="(\/?assets\/[^"#?]+|heliang-pu-resume\.pdf)"/g),
  ].map((match) => match[1].replace(/^\//, ''));
  const cssRefs = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => `assets/${match[1]}`);
  assert.ok(cssRefs.length >= 2, 'expected the font-face URLs in site.css');
  await Promise.all([...new Set([...pageRefs, ...cssRefs])].map((path) => access(new URL(path, root))));
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

test('items the owner removed stay off the site', () => {
  // 2026-11-16: the hero's "independently reproduced π0.6 RECAP" clause, the Fourier GR2
  // humanoid project and the BEHAVIOR-1K popcorn item were taken down on request.
  for (const [name, source] of [['index.html', index], ['projects.html', projectsPage], ['i18n.js', i18nSource]]) {
    assert.doesNotMatch(source, /独立复现 π0\.6 RECAP|Reproduced π0\.6 RECAP on a real robot/i, name);
    assert.doesNotMatch(source, /id="gr2"|projects\.html#gr2|货物搬运与技能调度|Cargo Handling/, name);
    assert.doesNotMatch(source, /BEHAVIOR-1K|爆米花|Popcorn/, name);
  }
});
