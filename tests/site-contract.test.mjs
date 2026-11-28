import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

// Dictionary text as it is written in the HTML (the pages are static English).
const htmlText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlAttr = (value) => htmlText(value).replace(/"/g, '&quot;');

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

test('static title and share cards match the English copy that crawlers read', () => {
  const meta = (key, value) =>
    attr(tags('meta').find((tag) => attr(tag, key) === value), 'content');

  assert.equal(index.match(/<title>(.*?)<\/title>/)?.[1], htmlAttr(dictionary.en.docTitle));
  assert.equal(meta('name', 'description'), htmlAttr(dictionary.en.metaDesc));
  assert.equal(meta('property', 'og:title'), htmlAttr(dictionary.en.docTitle));
  assert.equal(meta('property', 'og:description'), htmlAttr(dictionary.en.metaDesc));
  assert.equal(meta('name', 'twitter:title'), htmlAttr(dictionary.en.docTitle));
  assert.equal(meta('name', 'twitter:description'), htmlAttr(dictionary.en.metaDesc));
});

for (const [file, page, titleKey, descKey] of [
  ['competition.html', competitionPage, 'compDocTitle', 'compMetaDesc'],
  ['projects.html', projectsPage, 'projDocTitle', 'projMetaDesc'],
]) {
  test(`${file} title and share cards match its English copy`, () => {
    const meta = (key, value) =>
      attr(tags('meta', page).find((tag) => attr(tag, key) === value), 'content');
    const canonical = tags('link', page).find((tag) => attr(tag, 'rel') === 'canonical');

    assert.equal(attr(canonical, 'href'), `https://heliang-pu.github.io/${file}`);
    assert.match(page, new RegExp(`<body data-i18n-title="${titleKey}" data-i18n-desc="${descKey}">`));
    assert.equal(page.match(/<title>(.*?)<\/title>/)?.[1], htmlText(dictionary.en[titleKey]));
    assert.equal(meta('property', 'og:title'), htmlAttr(dictionary.en[titleKey]));
    assert.equal(meta('name', 'twitter:title'), htmlAttr(dictionary.en[titleKey]));
    assert.equal(meta('name', 'description'), htmlAttr(dictionary.en[descKey]));
    assert.equal(meta('property', 'og:description'), htmlAttr(dictionary.en[descKey]));
    assert.equal(meta('name', 'twitter:description'), htmlAttr(dictionary.en[descKey]));
  });
}

test('styles and scripts live in assets, load in order, and carry a hash of their content', async () => {
  // A page must never pair with a cached older stylesheet or dictionary (GitHub Pages caches for ten
  // minutes), so each URL ends in ?v=<hash of the file>. scripts/stamp-assets.mjs writes the stamps.
  const stamped = async (path) =>
    `${path}?v=${createHash('sha256').update(await read(path, null)).digest('hex').slice(0, 8)}`;
  const [styleUrl, i18nUrl, scriptUrl] = await Promise.all(
    ['assets/site.css', 'assets/i18n.js', 'assets/site.js'].map(stamped),
  );
  const hint = 'stale asset stamp: run node scripts/stamp-assets.mjs';

  for (const page of pages) {
    assert.doesNotMatch(page, /<style\b/);
    assert.doesNotMatch(page, /\sonclick=/);
    const styles = tags('link', page).filter((tag) => attr(tag, 'rel') === 'stylesheet').map((tag) => attr(tag, 'href'));
    assert.deepEqual(styles, [styleUrl], hint);

    const scripts = tags('script', page).map((tag) => attr(tag, 'src')).filter(Boolean);
    assert.deepEqual(scripts, [i18nUrl, scriptUrl], hint);

    // Two-column graph-paper card pages: language + theme controls, scroll progress bar, back-to-top button.
    assert.match(page, /<button class="control-btn lang-toggle" type="button"/);
    assert.match(page, /<button class="control-btn theme-toggle" type="button"/);
    assert.match(page, /<div class="scroll-progress" aria-hidden="true"><\/div>/);
    assert.match(page, /<button class="control-btn to-top" type="button"/);
    assert.match(page, /document\.documentElement\.classList\.add\('theme-dark'\)/);
  }
  assert.match(script, /langBtn\.addEventListener\('click', toggleLang\)/);
  assert.match(script, /themeBtn\.addEventListener\('click', toggleTheme\)/);
  assert.match(script, /toTop\.addEventListener\('click', scrollToTop\)/);
  assert.match(css, /html\.theme-dark\s*\{/);
});

test('the homepage uses the two-column graph-paper layout with sidebar, video-first hero and controls', () => {
  const sidebar = index.match(/<aside class="sidebar">[\s\S]*?<\/aside>/)?.[0] ?? '';
  const hero = index.match(/<section class="hero">[\s\S]*?<\/section>/)?.[0] ?? '';
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(sidebar, /<h1><span data-i18n="name">Heliang Pu<\/span><span class="name-sub" data-i18n="nameSub">蒲贺良<\/span><\/h1>/);
  assert.match(sidebar, /<img class="portrait" src="assets\/portrait\.jpg"/);
  assert.match(sidebar, new RegExp(`data-i18n="pitch">${escape(htmlText(dictionary.en.pitch))}<`));
  assert.match(sidebar, /class="copy-btn"[^>]*data-copy="puheliang122@gmail\.com"/);
  for (const href of [
    'mailto:puheliang122@gmail.com',
    'https://github.com/heliang-pu',
    'https://huggingface.co/puheliang',
    'https://www.linkedin.com/in/heliang-pu-a26538416/',
  ]) {
    assert.match(sidebar, new RegExp(`href="${escape(href)}"`), href);
  }
  assert.match(hero, new RegExp(`data-i18n="heroIntro">${escape(htmlText(dictionary.en.heroIntro))}<`));
  assert.match(hero, /id="hero-video"[\s\S]*?assets\/projects\/chainplanner-goal-only\.mp4/);
  assert.match(hero, /id="hero-watch"/);
  assert.match(hero, /href="https:\/\/github\.com\/heliang-pu\/wam-long-horizon-planner"/);
  assert.match(hero, /href="heliang-pu-cv-en\.pdf"/);
  assert.match(hero, /href="heliang-pu-resume\.pdf"/);
  assert.equal((hero.match(/<div class="metric">/g) ?? []).length, 0);

  assert.match(index, /<div class="mobile-id">/);
  assert.match(index, /<details class="mobile-nav">/);
  assert.match(css, /grid-template-columns:\s*330px minmax\(0, 1fr\)/);
  const tablet = mediaBlocks(css, '@media (max-width: 980px)');
  assert.match(tablet, /\.sidebar\s*\{\s*display:\s*none;/);
});

const competition = index.match(
  /<div class="project-group" id="competition">[\s\S]*?<div class="task-grid-foot">[\s\S]*?<\/div>\s*<\/div>/,
)?.[0] ?? '';

const panels = [
  ...competitionPage.matchAll(/<section class="section task-panel" id="([^"]+)"[\s\S]*?<\/section>/g),
].map((match) => ({ id: match[1], html: match[0] }));
const competitionIds = new Set([...competitionPage.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

test('the homepage leads with demos, projects and publications, details on other pages', () => {
  const sections = [
    ...index.matchAll(/<(?:header|section) class="(hero|section)"(?: id="([^"]+)")?>/g),
  ].map((match) => match[2] ?? match[1]);
  assert.deepEqual(sections, ['hero', 'projects', 'publications', 'experience', 'skills', 'awards']);

  // The long write-ups live on projects.html; the homepage keeps one row per project.
  assert.doesNotMatch(index, /class="(?:project-card|capability-grid|platform-grid|more-item)\b/);
  const projectSections = [...projectsPage.matchAll(/<section class="section" id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(projectSections, ['projects', 'more-projects', 'skills', 'platforms']);
  const projectIds = new Set([...projectsPage.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const detailLinks = [...new Set([...index.matchAll(/href="projects\.html#([^"]+)"/g)].map((match) => match[1]))];
  assert.deepEqual(detailLinks, ['chainplanner', 'robosyn', 'recap', 'dual-arm', 'tablet-tap']);
  for (const id of detailLinks) assert.ok(projectIds.has(id), `projects.html#${id}`);
  for (const page of [competitionPage, projectsPage]) assert.match(page, /<a class="back-link" href="\.\/#/);

  // The homepage only links to the clips, and the old demo wall (Release videos, demos/ pages) stays gone.
  // Homepage videos: hero ChainPlanner 3-step, ChainPlanner 5-step, tissue-sorting, and tablet-tap.
  const homeVideos = [...index.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)].map((match) => match[0]);
  assert.equal(homeVideos.length, 4);
  assert.equal(tags('source').length, 4);
  const rowsWithVideo = [...index.matchAll(/<article class="pick[^"]*"[^>]*>[\s\S]*?<\/article>/g)]
    .map((match) => match[0])
    .filter((row) => row.includes('<video'))
    .map((row) => row.match(/data-i18n="(p\d+t)"/)?.[1]);
  assert.deepEqual(rowsWithVideo, ['p5t', 'p1t', 'p6t']);
  // The clips have no sound, so hovering a row may start them; the controls stay for touch screens.
  for (const video of homeVideos) assert.match(tags('video', video)[0], /\smuted\b/);
  assert.match(script, /\[data-hover-play\]/);
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
    'tablet-tap-demo',
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
        assert.equal(attr(tag, 'aria-label'), htmlAttr(dictionary.en[ariaKey]));
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
  assert.equal(shots.length, 5);
  for (const shot of shots) {
    assert.match(attr(shot, 'src'), /^assets\/(?:projects|competition)\/[a-z0-9-]+\.webp$/);
    assert.equal(attr(shot, 'loading'), 'lazy');
    assert.ok(Number(attr(shot, 'width')) > 0 && Number(attr(shot, 'height')) > 0);
    assert.ok(attr(shot, 'alt'));
    assert.equal(attr(shot, 'alt'), htmlAttr(dictionary.en[attr(shot, 'data-i18n-alt')]));
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

test('pages never start hidden or animated in', () => {
  assert.doesNotMatch(css, /animation:\s*fadeUp|\.reveal\s*\{\s*opacity:\s*0/);
  assert.doesNotMatch(script, /\bnumObs\b|\brevObs\b|requestAnimationFrame\(step\)/);
  assert.match(index, /<strong>30% → 70%<\/strong><span data-i18n="p1r1">/);
});

test('the homepage leads with ChainPlanner, RoboSynChallenge and RECAP with defensible results', () => {
  const rows = [...index.matchAll(/<article class="pick[^"]*"[^>]*>[\s\S]*?<\/article>/g)].map((match) => match[0]);
  assert.match(rows[0], /<article class="pick" id="chainplanner"/);
  assert.match(rows[0], /<strong data-i18n="p5r3k">22 of 26<\/strong>/);
  assert.match(rows[1], /data-i18n="compBadge">RoboSynChallenge 2026 · 1st Place, Simulation Track · Team Lead/);
  assert.match(rows[1], /href="competition\.html"/);
  assert.match(rows[1], /href="competition\.html#methods"/);
  assert.match(rows[1], /href="https:\/\/huggingface\.co\/puheliang\/RoboSynChallenge-fmc3-no1-real"/);
  const recap = rows.find((row) => row.includes('id="recap"')) ?? '';
  assert.match(recap, /<strong>≈2×<\/strong>/);

  const firstProject = projectsPage.match(/<article class="project-card"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? '';
  assert.match(firstProject, /id="chainplanner"/);
  assert.match(projectsPage, /id="robosyn"[\s\S]*?https:\/\/huggingface\.co\/puheliang\/RoboSynChallenge-fmc3-no1-real/);
});

test('reduced motion and the skip link are handled', () => {
  const reduced = bracedBlock(css, '@media (prefers-reduced-motion: reduce)');
  assert.match(reduced, /html\s*\{[\s\S]*?scroll-behavior:\s*auto\s*!important/);
  assert.match(css, /\.skip-link:focus\s*\{[^}]*top:\s*16px/);
  // Hover autoplay stays off when the visitor asks for less motion.
  assert.match(script, /prefers-reduced-motion: reduce/);
});

test('favicon, footer date, and local assets are consistent', async () => {
  const favicon = tags('link').find((tag) => attr(tag, 'rel') === 'icon');
  assert.equal(attr(favicon, 'href'), '/assets/icon-192.png');
  assert.doesNotMatch(attr(favicon, 'href'), /^data:/);
  assert.equal((`${index}\n${i18nSource}`.match(/Last updated: 2026\.11/g) ?? []).length, 2);
  assert.equal(dictionary.zh.footerUpdated, '最后更新：2026.11');
  for (const page of [competitionPage, projectsPage]) {
    assert.equal((page.match(/Last updated: 2026\.11/g) ?? []).length, 1);
  }
  assert.doesNotMatch(`${pages.join('\n')}\n${i18nSource}`, /Last updated: 2026\.(?:08|10)/);

  const pageRefs = [
    ...pages.join('\n').matchAll(/\b(?:src|href|poster)="(\/?assets\/[^"#?]+|heliang-pu-(?:resume|cv-en)\.pdf)(?:\?v=[0-9a-f]+)?"/g),
  ].map((match) => match[1].replace(/^\//, ''));
  const cssRefs = [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => `assets/${match[1]}`);
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

test('both Chinese and English resume PDFs are at most 3 MiB', async () => {
  for (const file of ['heliang-pu-resume.pdf', 'heliang-pu-cv-en.pdf']) {
    const size = (await stat(new URL(file, root))).size;
    assert.ok(
      size <= 3 * 1024 * 1024,
      `${file} is ${size} bytes; expected at most 3 MiB`,
    );
  }
});

test('every page anchor linked from both resume PDFs exists', async () => {
  const pageByPath = new Map([
    ['/', index],
    ['/index.html', index],
    ['/projects.html', projectsPage],
    ['/competition.html', competitionPage],
  ]);
  for (const file of ['heliang-pu-resume.pdf', 'heliang-pu-cv-en.pdf']) {
    const siteLinks = pdfLinkTargets(await read(file, null))
      .map((uri) => new URL(uri))
      .filter((url) => url.hostname === 'heliang-pu.github.io');

    assert.ok(siteLinks.length > 0, `${file} has no links to the site`);
    for (const url of siteLinks) {
      const targetPage = pageByPath.get(url.pathname);
      assert.ok(targetPage, `${file} links to unknown path ${url.pathname}`);
      if (url.hash) {
        const id = url.hash.slice(1);
        assert.match(targetPage, new RegExp(`\\sid="${id}"`), `${file} links to ${url.pathname}#${id}`);
      }
    }
  }
});

test('work and education rows show the employer and both schools', () => {
  const experience = index.match(/<section class="section" id="experience">[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(experience, /<h2 data-i18n="secExp">Experience<\/h2>/);
  assert.match(experience, /FMC³ Robotics/);
  assert.match(experience, /<h3 data-i18n="exp2title">East China Normal University<\/h3>/);
  assert.match(experience, /<h3 data-i18n="exp3title">Jiangsu Univ\. of Sci\. &amp; Tech\. Suzhou Institute of Technology<\/h3>/);
  assert.equal((experience.match(/<li data-i18n="exp1d\d">/g) ?? []).length, 6);
});

test('items the owner removed stay off the site', () => {
  // 2026-11-16: the hero's "independently reproduced π0.6 RECAP" clause, the Fourier GR2
  // humanoid project and the BEHAVIOR-1K popcorn item were taken down on request.
  for (const [name, source] of [['index.html', index], ['projects.html', projectsPage], ['i18n.js', i18nSource]]) {
    assert.doesNotMatch(source, /独立复现 π0\.6 RECAP|Reproduced π0\.6 RECAP on a real robot/i, name);
    assert.doesNotMatch(source, /id="gr2"|projects\.html#gr2|货物搬运与技能调度|Cargo Handling/, name);
    assert.doesNotMatch(source, /BEHAVIOR-1K|爆米花|Popcorn/, name);
    // 2026-11-18: the job title is algorithm (robot learning) engineer, not full-stack engineer.
    assert.doesNotMatch(source, /全栈工程师|full-stack engineer/i, name);
    // 2026-11-18: no Bilibili link on the site.
    assert.doesNotMatch(source, /bilibili|哔哩哔哩/i, name);
    // 2026-11-18: the ECNU note no longer says "admitted on the first attempt".
    assert.doesNotMatch(source, /一次考取|first attempt/i, name);
    // 2026-11-28: the CSUR VLA RL survey was removed from the site on request.
    assert.doesNotMatch(source, /ACM Computing Surveys|vla-rl-survey-taxonomy|Reinforcement Learning Post-Training for Vision-Language-Action Models/i, name);
  }
});

test('pages open in English and remember a switch to Chinese', () => {
  for (const page of pages) {
    assert.match(page, /<html lang="en">/);
    assert.match(page, /<button class="control-btn lang-toggle" type="button"[^>]*>中<\/button>/);
    // Every translatable text is already the English one, so nothing flashes in Chinese first.
    for (const [, key, text] of page.matchAll(/\sdata-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      assert.equal(text, htmlText(dictionary.en[key]), key);
    }
  }
  assert.match(script, /localStorage\.getItem\('lang'\) === 'zh'\) applyLang\('zh'\)/);
  assert.doesNotMatch(script, /=== 'en'\) applyLang\('en'\)/);
});

test('publications list the competition report with methods & weights, first author in bold', () => {
  const section = index.match(/<section class="section" id="publications">[\s\S]*?<\/section>/)?.[0] ?? '';
  const pubs = [...section.matchAll(/<article class="pub">[\s\S]*?<\/article>/g)].map((match) => match[0]);
  assert.equal(pubs.length, 1);
  assert.match(pubs[0], /<h3>Look at the Demonstrator First: Lessons from Ten Bimanual Tasks in RoboSynChallenge 2026<\/h3>/);
  assert.match(pubs[0], /href="competition\.html#methods"/);
  assert.match(pubs[0], /href="https:\/\/huggingface\.co\/puheliang\/RoboSynChallenge-fmc3-no1-real"/);
  for (const pub of pubs) assert.match(pub, /<p class="authors"><strong>Heliang Pu<\/strong>, /);

  // Papers in double-blind review stay off the site until they are accepted (the CVPR 2027 submission).
  for (const source of [...pages, i18nSource]) assert.doesNotMatch(source, /CVPR|openreview/i);
});
