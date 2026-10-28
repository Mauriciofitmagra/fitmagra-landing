import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const fixtures = new URL('./fixtures/blog/', import.meta.url).pathname;
const site = 'https://fitmagra.test';
const full = mkdtempSync(join(tmpdir(), 'fitmagra-blog-'));
await build({ outDir: full, blogDir: fixtures, siteUrl: site, log: () => {} });
const empty = mkdtempSync(join(tmpdir(), 'fitmagra-blog-empty-'));
await build({ outDir: empty, siteUrl: site, log: () => {} });
const read = (dir, p) => readFileSync(join(dir, p), 'utf8');

test('listing shows published posts and skips drafts', () => {
  const html = read(full, 'blog/index.html');
  assert.ok(html.includes('href="/blog/como-leer-tu-plan/"'));
  assert.ok(html.includes('Cómo leer tu plan'));
  assert.ok(!html.includes('Borrador'));
  assert.ok(!existsSync(join(full, 'blog/borrador/index.html')));
});

test('post page has title, rendered body, canonical, hreflang to its translation, Open Graph and BlogPosting JSON-LD', () => {
  const html = read(full, 'blog/como-leer-tu-plan/index.html');
  assert.match(html, /<h1[^>]*>Cómo leer tu plan<\/h1>/);
  assert.ok(html.includes('<strong>cuatro ecuaciones</strong>'));
  assert.ok(html.includes(`<link rel="canonical" href="${site}/blog/como-leer-tu-plan/">`));
  assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="${site}/en/blog/how-to-read-your-plan/">`));
  assert.ok(html.includes(`<meta property="og:url" content="${site}/blog/como-leer-tu-plan/">`));
  assert.ok(html.includes('<meta property="og:type" content="article">'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'BlogPosting');
  assert.equal(ld.headline, 'Cómo leer tu plan');
  assert.equal(ld.datePublished, '2026-11-02');
  assert.equal(ld.inLanguage, 'es');
});

test('RSS per language is well formed with absolute links', () => {
  const rss = read(full, 'blog/rss.xml');
  assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/);
  assert.equal((rss.match(/<item>/g) || []).length, 1);
  assert.ok(rss.includes(`<link>${site}/blog/como-leer-tu-plan/</link>`));
  assert.ok(rss.includes('<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>'));
  assert.equal((read(full, 'en/blog/rss.xml').match(/<item>/g) || []).length, 1);
});

test('with no posts the listing shows the empty state and RSS has zero items', () => {
  assert.ok(read(empty, 'blog/index.html').includes('Mauricio está escribiendo'));
  assert.ok(read(empty, 'en/blog/index.html').includes('Mauricio is writing'));
  const rss = read(empty, 'blog/rss.xml');
  assert.ok(rss.includes('<channel>') && rss.includes('</channel>'));
  assert.equal((rss.match(/<item>/g) || []).length, 0);
});

test('sitemap lists every public page and every post with absolute URLs', () => {
  const xml = read(full, 'sitemap.xml');
  for (const path of ['/', '/en/', '/historias/', '/en/stories/', '/blog/', '/en/blog/', '/blog/como-leer-tu-plan/', '/en/blog/how-to-read-your-plan/']) {
    assert.ok(xml.includes(`<loc>${site}${path}</loc>`), path);
  }
  assert.ok(!xml.includes('borrador'));
  assert.ok(read(full, 'robots.txt').includes(`Sitemap: ${site}/sitemap.xml`));
});

test('an invalid post fails the build with its file and field', async () => {
  const bad = mkdtempSync(join(tmpdir(), 'fitmagra-bad-'));
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(bad, 'es'));
  writeFileSync(join(bad, 'es/x.md'), '---\ndescription: d\ndate: 2026-01-01\nlang: es\nslug: x\n---\nhola');
  await assert.rejects(build({ outDir: mkdtempSync(join(tmpdir(), 'o-')), blogDir: bad, log: () => {} }), /es\/x\.md: title is required/);
});
