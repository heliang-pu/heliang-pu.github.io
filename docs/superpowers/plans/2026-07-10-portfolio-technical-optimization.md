# Portfolio Technical Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a tested technical optimization of the portfolio that fixes crawl metadata, mobile focus order, video prefetching, accessibility gaps, and oversized artifacts without changing unverified personal facts.

**Architecture:** Keep the existing framework-free static site. Add one dependency-free Node contract-test file, make focused edits to `index.html`, `404.html`, `robots.txt`, and `sitemap.xml`, and mechanically optimize the two school emblems and the existing PDF only after artifact QA passes.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js built-in `node:test`, macOS `sips`, Poppler, PyMuPDF, GitHub Pages.

## Global Constraints

- Keep GitHub Pages serving the repository root with no build step.
- Do not change the English name, education status, employer, email address, project claims, or resume text.
- Do not add a framework, analytics, third-party JavaScript, or a hosting migration.
- Preserve the current desktop visual identity and desktop section order.
- Write each behavior-changing contract test first and observe the expected failure before implementation.
- Keep video hosting unchanged; document the GitHub Release `application/octet-stream` limitation.
- Replace the PDF only if it remains two pages, keeps identical page geometry and extracted text, renders without defects, and is at most 3 MiB.
- Push the completed work directly to `origin/main`, as requested.

---

### Task 1: Static contract harness and crawl metadata

**Files:**
- Create: `tests/site-contract.test.mjs`
- Modify: `robots.txt:4`
- Modify: `sitemap.xml:3-8`

**Interfaces:**
- Consumes: the canonical URL in `index.html`
- Produces: shared parsing helpers and the crawl-host contract used by later tests

- [ ] **Step 1: Write the failing crawl contract**

Create `tests/site-contract.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';

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
  assert.equal(locations.length, 1);
  assert.equal(locations[0].origin, canonical.origin);
  assert.equal(locations[0].pathname, '/');
  assert.doesNotMatch(
    `${index}\n${robots}\n${sitemap}`,
    /aurorabot-ai\.github\.io/i,
  );
  assert.doesNotMatch(sitemap, /<lastmod\b/i);
});
```

- [ ] **Step 2: Run the crawl contract and verify RED**

Run:

```bash
node --test --test-name-pattern="canonical, robots, and sitemap" tests/site-contract.test.mjs
```

Expected: FAIL because `robots.txt` and `sitemap.xml` contain `aurorabot-ai.github.io`, and the sitemap contains `<lastmod>`.

- [ ] **Step 3: Correct the crawl files**

Replace `robots.txt` with:

```txt
User-agent: *
Allow: /

Sitemap: https://heliang-pu.github.io/sitemap.xml
```

Replace `sitemap.xml` with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://heliang-pu.github.io/</loc>
  </url>
</urlset>
```

- [ ] **Step 4: Run the crawl contract and verify GREEN**

Run the Step 2 command again.

Expected: PASS, 1 test passed and 0 failed.

- [ ] **Step 5: Commit the crawl fix**

```bash
git add tests/site-contract.test.mjs robots.txt sitemap.xml
git commit -m "fix: correct portfolio crawl metadata"
```

---

### Task 2: Responsive controls, mobile navigation, and focus order

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Modify: `index.html:849-851`
- Modify: `index.html:1132-1243`
- Modify: `index.html:1321-1393`
- Modify: `index.html:1461-1474`
- Modify: `index.html:2395-2404`
- Modify: `index.html:2542-2550`

**Interfaces:**
- Consumes: the existing section anchors and profile URLs
- Produces: `.site-controls`, `.mobile-id`, `.mobile-nav`, and responsive CSS contracts

- [ ] **Step 1: Append failing responsive contracts**

Append these tests to `tests/site-contract.test.mjs`:

```js
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
    '#overview', '#experience', '#projects', '#pipeline',
    '#demos', '#skills', '#platforms', '#awards',
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

  assert.match(mobileCss, /\.sidebar\s*\{[^}]*display:\s*none/);
  assert.match(mobileCss, /\.site-controls\s*\{[^}]*position:\s*static/);
  assert.match(mobileCss, /\.mobile-id\s*\{[^}]*display:\s*flex/);
  assert.match(mobileCss, /\.mobile-nav\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(mobileCss, /\.main\s*\{[^}]*order\s*:/);
  assert.doesNotMatch(mobileCss, /\.mobile-id\s*\{[^}]*order\s*:/);
});

test('pipeline uses tablet and narrow-mobile column counts', () => {
  const css = index.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const tabletCss = mediaBlocks(css, '@media (max-width: 980px)');
  const narrowCss = mediaBlocks(css, '@media (max-width: 760px)');

  assert.match(
    tabletCss,
    /\.pipeline-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    narrowCss,
    /\.pipeline-grid[\s\S]*?grid-template-columns:\s*1fr/,
  );
});
```

- [ ] **Step 2: Run the responsive contracts and verify RED**

```bash
node --test --test-name-pattern="mobile|980px|pipeline" tests/site-contract.test.mjs
```

Expected: four failures because the mobile controls wrapper and navigation do not exist, `.main` is reordered, the sidebar remains visible, and the tablet pipeline remains five columns.

- [ ] **Step 3: Move controls into flow and add mobile identity/navigation markup**

Replace the body opening through the current mobile identity with:

```html
<body>
  <a class="skip-link" href="#main" data-i18n="skip">跳到主内容</a>
  <div class="scroll-progress" aria-hidden="true"></div>

  <div class="shell">
    <div class="site-controls" role="group" aria-label="站点设置" data-i18n-aria="siteControlsAria">
      <button class="control-btn lang-toggle" type="button" aria-label="Switch language" title="Switch language" onclick="toggleLang()">EN</button>
      <button class="control-btn theme-toggle" type="button" aria-pressed="false" aria-label="切换深色 / 浅色模式" title="切换深色 / 浅色模式" onclick="toggleTheme()"><span aria-hidden="true">🌓</span></button>
    </div>

    <div class="mobile-id">
      <img src="assets/portrait.jpg" alt="" width="48" height="48" decoding="async">
      <div class="mobile-id-text">
        <h1 data-i18n="name">蒲贺良</h1>
        <span data-i18n="role">具身智能 / VLA 工程师</span>
      </div>
    </div>

    <details class="mobile-nav">
      <summary data-i18n="navTitle">目录</summary>
      <nav class="mobile-nav-body" aria-label="页面导航" data-i18n-aria="navAria">
        <div class="mobile-nav-links">
          <a href="#overview" data-i18n="navOverview">个人概览</a>
          <a href="#experience" data-i18n="navExp">工作与教育</a>
          <a href="#projects" data-i18n="navProjects">项目经历</a>
          <a href="#pipeline" data-i18n="navPipeline">推理闭环</a>
          <a href="#demos" data-i18n="navDemos">Demo 视频</a>
          <a href="#skills" data-i18n="navSkills">能力矩阵</a>
          <a href="#platforms" data-i18n="navPlatforms">真机平台</a>
          <a href="#awards" data-i18n="navAwards">竞赛与荣誉</a>
        </div>
        <div class="mobile-profile-links">
          <a href="mailto:puheliang122@gmail.com">Email</a>
          <a href="https://github.com/heliang-pu" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://huggingface.co/puheliang" target="_blank" rel="noreferrer">Hugging Face</a>
          <a href="https://space.bilibili.com/389273511" target="_blank" rel="noreferrer"><span data-i18n="bilibili">哔哩哔哩</span></a>
          <a href="https://www.linkedin.com/in/heliang-pu-a26538416/" target="_blank" rel="noreferrer">LinkedIn</a>
        </div>
      </nav>
    </details>
```

Keep the existing sidebar and main immediately after this markup. Move the back-to-top button after the closing `.shell` tag:

```html
  </div>
  <button class="control-btn to-top" type="button" aria-label="回到顶部" title="回到顶部" onclick="scrollToTop()"><span aria-hidden="true">↑</span></button>
```

Add these values to the Chinese and English dictionaries:

```js
siteControlsAria: '站点设置',
```

```js
siteControlsAria: 'Site settings',
```

- [ ] **Step 4: Replace the control and responsive CSS**

Use these base rules:

```css
.site-controls {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 110;
  display: flex;
  gap: 8px;
}

.mobile-id,
.mobile-nav {
  display: none;
}

.control-btn {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s, opacity 0.2s, visibility 0.2s;
}

.lang-toggle {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.to-top {
  position: fixed;
  z-index: 110;
  right: 18px;
  bottom: 22px;
  opacity: 0;
  visibility: hidden;
}
```

Replace the existing 980-pixel block with:

```css
@media (max-width: 980px) {
  .shell {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .site-controls {
    position: static;
    align-self: stretch;
    justify-content: flex-end;
  }

  .sidebar {
    display: none;
  }

  .mobile-id {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow);
  }

  .mobile-id img {
    width: 48px;
    height: 48px;
    flex: 0 0 48px;
    border-radius: 8px;
    object-fit: cover;
    object-position: center 18%;
  }

  .mobile-id-text { min-width: 0; }
  .mobile-id-text h1 {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  .mobile-id-text span {
    display: block;
    margin-top: 3px;
    color: var(--green);
    font-size: 0.85rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .mobile-nav {
    display: block;
    overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow);
  }
  .mobile-nav > summary {
    min-height: 44px;
    padding: 10px 16px;
    cursor: pointer;
    color: var(--ink);
    font-weight: 750;
    list-style-position: inside;
  }
  .mobile-nav > summary::marker { color: var(--green); }
  .mobile-nav[open] > summary { border-bottom: 1px solid var(--line); }
  .mobile-nav-body {
    display: grid;
    gap: 12px;
    padding: 10px 16px 14px;
  }
  .mobile-nav-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
  }
  .mobile-nav-links a {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 40px;
    color: var(--muted);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .mobile-profile-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .mobile-profile-links a {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    color: var(--green);
    font-size: 0.86rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .pipeline-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

In the 480-pixel block use:

```css
@media (max-width: 480px) {
  .contact,
  .mobile-nav-links,
  .mobile-profile-links {
    grid-template-columns: 1fr !important;
  }
  .mobile-profile-links {
    display: grid;
    gap: 2px;
  }
}
```

Update print hiding to `.skip-link, .scroll-progress, .site-controls, .to-top`.

- [ ] **Step 5: Verify contracts and rendered responsive behavior**

Run:

```bash
node --test --test-name-pattern="mobile|980px|pipeline" tests/site-contract.test.mjs
```

Expected: four responsive tests pass.

Then serve locally and verify 1440x900, 768x900, 390x844, and 320x568. At 320 pixels, the controls must end above the identity card, horizontal overflow must be absent, and keyboard order must be skip link -> language -> theme -> menu summary -> visible menu links -> main links.

- [ ] **Step 6: Commit responsive behavior**

```bash
git add index.html tests/site-contract.test.mjs
git commit -m "fix: repair mobile navigation and focus order"
```

---

### Task 3: Explicit video loading and localized playback controls

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Modify: `index.html:816-847`
- Modify: `index.html:1820-2079`
- Modify: `index.html:2395-2414`
- Modify: `index.html:2542-2560`
- Modify: `index.html:2563-2707`

**Interfaces:**
- Consumes: each video's `data-src`, localized `aria-label`, and fallback URL
- Produces: `activateVideo`, `refreshPlayButtonLabel`, and `refreshPlayButtonLabels`

- [ ] **Step 1: Append failing video contracts**

Append:

```js
test('all nine videos are network-idle until explicit activation', () => {
  assert.equal(demoCards.length, 9);

  for (const [position, card] of demoCards.entries()) {
    const video = card.match(/<video\b[^>]*>/i)?.[0];
    const source = card.match(/<source\b[^>]*>/i)?.[0];
    const fallback = card.match(
      /<a\b[^>]*class="video-fallback"[^>]*>/i,
    )?.[0];

    assert.equal(attr(video, 'preload'), 'none');
    const deferredUrl = attr(source, 'data-src');
    assert.match(deferredUrl, /site-media\/demo\d+\.mp4$/);
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

test('play buttons inherit nine unique labels and refresh after language changes', () => {
  const videos = tags('video');
  const keys = videos.map((video) => attr(video, 'data-i18n-aria'));
  const initialLabels = videos.map((video) => attr(video, 'aria-label'));
  assert.equal(videos.length, 9);
  assert.equal(new Set(keys).size, 9);
  assert.equal(new Set(initialLabels).size, 9);

  const zh = languageBlock('zh');
  const en = languageBlock('en');
  const zhLabels = keys.map((key) => languageValue(zh, key));
  const enLabels = keys.map((key) => languageValue(en, key));
  assert.ok(zhLabels.every(Boolean));
  assert.ok(enLabels.every(Boolean));
  assert.equal(new Set(zhLabels).size, 9);
  assert.equal(new Set(enLabels).size, 9);
  assert.ok(languageValue(zh, 'videoFallback'));
  assert.ok(languageValue(en, 'videoFallback'));

  const refresh = bracedBlock(index, 'function refreshPlayButtonLabel(media)');
  assert.match(refresh, /video\.getAttribute\(['"]aria-label['"]\)/);
  assert.match(refresh, /badge\.setAttribute\(['"]aria-label['"],\s*label\)/);
  assert.match(bracedBlock(index, 'function applyLang(lang)'), /refreshPlayButtonLabels\(\)/);
});
```

- [ ] **Step 2: Run the video contracts and verify RED**

```bash
node --test --test-name-pattern="videos|play buttons" tests/site-contract.test.mjs
```

Expected: failures for missing `preload="none"`, missing fallback links, eager `vidObs`, and the hard-coded `播放` badge label.

- [ ] **Step 3: Update all nine video cards**

For every card, add `preload="none"` to `<video>`, retain only `data-src` on `<source>`, and add this sibling after `.demo-media`:

```html
<a class="video-fallback" href="https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo1.mp4" target="_blank" rel="noreferrer" data-i18n="videoFallback">视频无法播放？在 GitHub Releases 中打开</a>
```

The block above is the exact `demo-01` markup. Apply the following complete URL mapping to the remaining cards, keeping each fallback `href` byte-for-byte equal to its adjacent source `data-src`:

```text
demo-01 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo1.mp4
demo-02 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo2.mp4
demo-03 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo4.mp4
demo-04 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo5.mp4
demo-05 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo7.mp4
demo-06 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo8.mp4
demo-07 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo9.mp4
demo-08 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo10.mp4
demo-09 -> https://github.com/heliang-pu/heliang-pu.github.io/releases/download/site-media/demo11.mp4
```

Add:

```css
.video-fallback {
  display: block;
  padding: 7px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--green);
  font-size: 0.78rem;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.demo-media.has-video-error + .video-fallback {
  color: var(--red);
  font-weight: 700;
}
```

Add dictionary values:

```js
videoFallback: '视频无法播放？在 GitHub Releases 中打开',
```

```js
videoFallback: 'Video unavailable? Open it on GitHub Releases',
```

- [ ] **Step 4: Replace eager video loading and badge logic**

Delete the `vidObs` block. Define before the initialization IIFE:

```js
function refreshPlayButtonLabel(media) {
  var video = media.querySelector('video');
  var badge = media.querySelector('.play-badge');
  if (!video || !badge) return;
  var label = video.getAttribute('aria-label');
  badge.setAttribute('aria-label', label);
  badge.setAttribute('title', label);
}

function refreshPlayButtonLabels() {
  document.querySelectorAll('.demo-media').forEach(refreshPlayButtonLabel);
}

function activateVideo(media, video) {
  var source = video.querySelector('source[data-src]');
  if (source && !source.getAttribute('src')) {
    source.setAttribute('src', source.dataset.src);
    video.load();
  }
  var playback = video.play();
  if (playback && typeof playback.catch === 'function') {
    playback.catch(function () {
      media.classList.add('has-video-error');
    });
  }
}
```

After the `[data-i18n-aria]` loop in `applyLang()`, call `refreshPlayButtonLabels();`.

Replace badge creation with:

```js
document.querySelectorAll('.demo-media').forEach(function (media) {
  var video = media.querySelector('video');
  if (!video) return;

  var badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'play-badge';
  badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  badge.addEventListener('click', function () {
    activateVideo(media, video);
  });
  media.appendChild(badge);
  refreshPlayButtonLabel(media);

  video.addEventListener('play', function () {
    media.classList.remove('has-video-error');
    media.classList.add('is-playing');
  });
  video.addEventListener('pause', function () { media.classList.remove('is-playing'); });
  video.addEventListener('ended', function () { media.classList.remove('is-playing'); });
  video.addEventListener('error', function () { media.classList.add('has-video-error'); });
});
```

- [ ] **Step 5: Verify GREEN and browser network behavior**

Run the Step 2 command; expect both tests to pass.

In the browser, load the homepage and navigate near `#demos`: all nine `currentSrc` values must remain empty. Activate one unique play badge: only its source becomes non-empty, and its label changes between Chinese and English with the language toggle.

- [ ] **Step 6: Commit on-demand video behavior**

```bash
git add index.html tests/site-contract.test.mjs
git commit -m "perf: load demo videos on demand"
```

---

### Task 4: Stable motion, contrast, favicon, footer, 404, and asset references

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Modify: `index.html:23`
- Modify: `index.html:916-917`
- Modify: `index.html:1113-1130`
- Modify: `index.html:1245-1308`
- Modify: `index.html:2244`
- Modify: `index.html:2396`
- Modify: `index.html:2543`
- Modify: `index.html:2676-2707`
- Modify: `404.html:9-18`

**Interfaces:**
- Consumes: existing icon and final metric text
- Produces: stable first paint, complete reduced-motion behavior, and valid static-asset references

- [ ] **Step 1: Append failing stability and metadata contracts**

Append:

```js
test('hero, sections, and metrics never begin with false content', () => {
  assert.doesNotMatch(index, /\.hero\s*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(index, /\.main\s*>\s*\.section[^{}]*\{\s*animation:\s*fadeUp/);
  assert.doesNotMatch(index, /\.reveal\s*\{\s*opacity:\s*0/);
  assert.doesNotMatch(index, /\bnumObs\b|\brevObs\b/);
  assert.doesNotMatch(index, /requestAnimationFrame\(step\)/);
  assert.match(index, /<strong>70%<\/strong>/);
  assert.match(index, /<strong>500\+<\/strong>/);
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
  assert.equal((index.match(/Last updated: 2026\.07/g) ?? []).length, 3);
  assert.doesNotMatch(index, /Last updated: 2026\.06/);

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
```

- [ ] **Step 2: Run these contracts and verify RED**

```bash
node --test --test-name-pattern="hero|reduced motion|favicon|404" tests/site-contract.test.mjs
```

Expected: four failures for whole-container/reveal/count-up hiding, missing reduced-motion scrolling override, low-contrast dark skip link, data-URL favicon, June footer, and 404 overflow.

- [ ] **Step 3: Implement motion and contrast fixes**

Delete `.reveal`, `.reveal.revealed`, the `.hero` and `.main > .section:nth-child(...)` fade-up rules, and the `numObs`/`revObs` JavaScript block. Keep `.sidebar` fade-up and decorative trajectory/hover effects.

Use:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .traj { stroke-dashoffset: 0; }
  .traj-effector { display: none; }
}

html.theme-dark .skip-link:focus {
  color: #0f172a;
}
```

- [ ] **Step 4: Implement favicon, footer, and 404 fixes**

Use:

```html
<link rel="icon" href="/assets/icon-192.png" type="image/png" sizes="192x192">
```

Change the visible footer and both language dictionaries to `Last updated: 2026.07`.

In `404.html` use:

```css
body {
  box-sizing: border-box;
  margin: 0;
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  color: #17211f;
  background: #f6f5ef;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run the Step 2 command, then the full suite:

```bash
node --test tests/site-contract.test.mjs
```

Expected: 11 tests passed, 0 failed.

```bash
git add index.html 404.html tests/site-contract.test.mjs
git commit -m "fix: stabilize portfolio motion and accessibility"
```

---

### Task 5: Downsample school emblems with binary contracts

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Modify: `assets/east-china-normal-university-emblem.png`
- Modify: `assets/suzhou-institute-of-technology-emblem.png`

**Interfaces:**
- Consumes: the existing 512-by-512 RGB PNGs
- Produces: same-path 128-by-128 PNGs under 80 KiB

- [ ] **Step 1: Append failing PNG contracts**

Append:

```js
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
```

- [ ] **Step 2: Run the emblem contracts and verify RED**

```bash
node --test --test-name-pattern="optimized school emblem" tests/site-contract.test.mjs
```

Expected: two failures reporting 512-pixel dimensions and sizes above 300 KiB.

- [ ] **Step 3: Generate candidates outside the final paths**

```bash
mkdir -p tmp/artifacts/emblems/original tmp/artifacts/emblems/candidate
cp assets/east-china-normal-university-emblem.png tmp/artifacts/emblems/original/
cp assets/suzhou-institute-of-technology-emblem.png tmp/artifacts/emblems/original/
sips -z 128 128 tmp/artifacts/emblems/original/east-china-normal-university-emblem.png --out tmp/artifacts/emblems/candidate/east-china-normal-university-emblem.png
sips -z 128 128 tmp/artifacts/emblems/original/suzhou-institute-of-technology-emblem.png --out tmp/artifacts/emblems/candidate/suzhou-institute-of-technology-emblem.png
mkdir -p tmp/artifacts/emblems/render/original tmp/artifacts/emblems/render/candidate
for name in east-china-normal-university-emblem.png suzhou-institute-of-technology-emblem.png; do
  sips -z 46 46 "tmp/artifacts/emblems/original/$name" --out "tmp/artifacts/emblems/render/original/$name"
  sips -z 46 46 "tmp/artifacts/emblems/candidate/$name" --out "tmp/artifacts/emblems/render/candidate/$name"
done
```

Verify each candidate is 128 by 128, under 80 KiB, and remains RGB with no alpha. Render both originals and candidates at 46 by 46 with `sips`, then use `view_image` to compare circular edges, fine lettering, white backgrounds, sharpness, and color.

- [ ] **Step 4: Replace only after visual acceptance**

```bash
cp tmp/artifacts/emblems/candidate/east-china-normal-university-emblem.png assets/east-china-normal-university-emblem.png.new
mv assets/east-china-normal-university-emblem.png.new assets/east-china-normal-university-emblem.png
cp tmp/artifacts/emblems/candidate/suzhou-institute-of-technology-emblem.png assets/suzhou-institute-of-technology-emblem.png.new
mv assets/suzhou-institute-of-technology-emblem.png.new assets/suzhou-institute-of-technology-emblem.png
```

- [ ] **Step 5: Verify GREEN, clean intermediates, and commit**

Run the Step 2 command; expect two tests passed. Remove `tmp/artifacts/emblems`, then:

```bash
git add tests/site-contract.test.mjs assets/east-china-normal-university-emblem.png assets/suzhou-institute-of-technology-emblem.png
git commit -m "perf: optimize school emblem assets"
```

---

### Task 6: Recompress and visually verify the existing PDF resume

**Files:**
- Modify: `tests/site-contract.test.mjs`
- Modify only after acceptance: `heliang-pu-resume.pdf`
- Temporary: `tmp/pdfs/portfolio-optimization-*`

**Interfaces:**
- Consumes: the current two-page PDF
- Produces: the same root filename, at most 3 MiB, with unchanged geometry and text

- [ ] **Step 1: Append the failing PDF size contract**

Append:

```js
test('resume PDF is at most 3 MiB', async () => {
  const size = (await stat(new URL('heliang-pu-resume.pdf', root))).size;
  assert.ok(
    size <= 3 * 1024 * 1024,
    `resume is ${size} bytes; expected at most 3 MiB`,
  );
});
```

- [ ] **Step 2: Run the PDF contract and verify RED**

```bash
node --test --test-name-pattern="resume PDF" tests/site-contract.test.mjs
```

Expected: FAIL because the current PDF is 6,814,416 bytes.

- [ ] **Step 3: Capture the required PDF baseline**

Use the PDF skill workflow with one stable temporary directory:

```bash
QA="tmp/pdfs/portfolio-optimization"
rm -rf "$QA"
mkdir -p "$QA/backup" "$QA/pdf" "$QA/info" "$QA/text" "$QA/render/original" "$QA/render/candidate" "$QA/render/compare"
cp -p heliang-pu-resume.pdf "$QA/backup/heliang-pu-resume.pdf"
pdfinfo -f 1 -l 2 -box "$QA/backup/heliang-pu-resume.pdf" |
  awk '/^Pages:|^Page[[:space:]]+[12][[:space:]]+(size|rot|MediaBox|CropBox|BleedBox|TrimBox|ArtBox):/' \
  > "$QA/info/original-geometry.txt"
pdftotext -layout "$QA/backup/heliang-pu-resume.pdf" "$QA/text/original.txt"
pdftoppm -png -r 180 "$QA/backup/heliang-pu-resume.pdf" "$QA/render/original/page"
test "$(find "$QA/render/original" -name 'page-*.png' | wc -l | tr -d ' ')" = 2
```

Expected baseline: 2 pages; both pages 594.96 by 841.92 points; extracted text is non-empty; exactly two rendered PNGs.

- [ ] **Step 4: Generate the first acceptable candidate from the original**

Run this block from the repository root. It always reopens the original and tries 180/85, 160/82, then 144/80, stopping at the first candidate at or below 3 MiB:

```bash
QA="tmp/pdfs/portfolio-optimization"
CAND=$(python3 - "$QA/backup/heliang-pu-resume.pdf" "$QA/pdf" <<'PY'
import os
import sys
import fitz

source, output_dir = sys.argv[1:]
limit = 3 * 1024 * 1024

for dpi, quality in ((180, 85), (160, 82), (144, 80)):
    target = os.path.join(output_dir, f'heliang-pu-resume-{dpi}-q{quality}.pdf')
    document = fitz.open(source)
    document.rewrite_images(
        dpi_threshold=220,
        dpi_target=dpi,
        quality=quality,
        lossy=True,
        lossless=True,
        bitonal=False,
        color=True,
        gray=True,
    )
    document.save(
        target,
        garbage=4,
        clean=True,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        use_objstms=1,
        compression_effort=100,
    )
    document.close()
    if os.path.getsize(target) <= limit:
        print(target)
        raise SystemExit(0)

raise SystemExit('no candidate met the 3 MiB limit without going below 144 DPI / quality 80')
PY
)
test -n "$CAND"
printf '%s\n' "$CAND"
printf '%s\n' "$CAND" > "$QA/selected.txt"
```

Do not try settings below 144 DPI or quality 80.

- [ ] **Step 5: Verify structure, text, and rendering before replacement**

Run `pdfinfo -box`, `pdftotext -layout`, and `pdftoppm -png -r 180` against `CAND`. Compare against baseline:

```bash
QA="tmp/pdfs/portfolio-optimization"
CAND=$(sed -n '1p' "$QA/selected.txt")
test "$(pdfinfo "$CAND" | awk '/^Pages:/ {print $2}')" = 2
test "$(stat -f %z "$CAND")" -le $((3 * 1024 * 1024))
pdftotext -layout "$CAND" "$QA/text/candidate.txt"
cmp "$QA/text/original.txt" "$QA/text/candidate.txt"
pdfinfo -f 1 -l 2 -box "$CAND" |
  awk '/^Pages:|^Page[[:space:]]+[12][[:space:]]+(size|rot|MediaBox|CropBox|BleedBox|TrimBox|ArtBox):/' \
  > "$QA/info/candidate-geometry.txt"
diff -u "$QA/info/original-geometry.txt" "$QA/info/candidate-geometry.txt"
pdftoppm -png -r 180 "$CAND" "$QA/render/candidate/page"
test "$(find "$QA/render/candidate" -name 'page-*.png' | wc -l | tr -d ' ')" = 2
```

Use `view_image` to inspect both original and candidate pages at 100 percent. Reject the candidate for clipped or missing text, missing images, black blocks, mask errors, visible color shift, destructive JPEG artifacts, layout changes, a text diff, or any page-box difference. If all candidates fail, keep the original PDF and remove the PDF size test before committing this task.

- [ ] **Step 6: Replace atomically, verify GREEN, and commit**

After acceptance:

```bash
QA="tmp/pdfs/portfolio-optimization"
CAND=$(sed -n '1p' "$QA/selected.txt")
cp "$CAND" heliang-pu-resume.pdf.new
mv heliang-pu-resume.pdf.new heliang-pu-resume.pdf
node --test --test-name-pattern="resume PDF" tests/site-contract.test.mjs
```

Expected: the PDF test passes. Remove `tmp/pdfs/portfolio-optimization`, then:

```bash
git add tests/site-contract.test.mjs heliang-pu-resume.pdf
git commit -m "perf: compress downloadable resume"
```

---

### Task 7: Integrated verification, review, push, and live deployment check

**Files:**
- Verify: all changed files
- No new production files unless verification exposes a defect

**Interfaces:**
- Consumes: Tasks 1-6
- Produces: a tested `main` branch and a verified GitHub Pages deployment

- [ ] **Step 1: Run complete automated verification**

```bash
node --test tests/site-contract.test.mjs
git diff --check
git status --short --branch
```

Expected: 14 tests passed, 0 failed; no whitespace errors; only expected committed history and no uncommitted files.

- [ ] **Step 2: Verify static resources and external media**

Check every local `src`, `href`, and `poster` contract through the Node suite. Check all nine GitHub Release video URLs with `curl -sSIL`; expect final HTTP 200 for all nine. Record that their response content type remains `application/octet-stream`.

- [ ] **Step 3: Run browser QA through the Browser plugin**

Serve the repository locally and test 1440x900, 768x900, 390x844, and 320x568. Required evidence:

- title and meaningful first screen;
- no horizontal overflow or framework overlay;
- no relevant console error or warning;
- desktop sidebar preserved;
- mobile sidebar hidden and native menu usable;
- controls do not overlap identity text at 320 pixels;
- visible keyboard focus order matches mobile layout;
- language and theme state update correctly;
- all video sources remain empty near the Demo section;
- one selected video source appears only after its unique play action;
- 404 has no extra vertical scroll.

Capture final desktop and mobile screenshots outside the repository.

- [ ] **Step 4: Request code review and address only actionable findings**

Use the requesting-code-review skill against the complete diff. Resolve confirmed regressions, rerun the full Node suite and affected browser checks, and create a focused fix commit if needed.

- [ ] **Step 5: Push `main`**

```bash
git fetch --prune origin
git rev-list --left-right --count HEAD...origin/main
git push origin main
```

Expected before push: local `main` is ahead only by the intentional commits and not behind. Expected push result: `main -> main`.

- [ ] **Step 6: Verify the live deployment**

Poll `https://heliang-pu.github.io/` at intervals shorter than 60 seconds until the live HTML SHA-256 equals the pushed `index.html` SHA-256 or the deployment reports a concrete failure. Then verify the live `robots.txt`, `sitemap.xml`, mobile page, and one on-demand video interaction.

- [ ] **Step 7: Final handoff**

Report the pushed commit, branch, automated-test count, browser viewports, PDF before/after size, emblem before/after sizes, live deployment result, and factual-content items deliberately left unchanged.
