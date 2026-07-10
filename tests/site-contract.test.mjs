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
