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
  assert.ok(html.includes('<link rel="canonical" href="/blog/como-leer-tu-plan/">'));
  assert.ok(html.includes('<link rel="alternate" hreflang="en" href="/en/blog/how-to-read-your-plan/">'));
  assert.ok(html.includes(`<meta property="og:url" content="${site}/blog/como-leer-tu-plan/">`));
  assert.ok(html.includes('<meta property="og:type" content="article">'));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'BlogPosting');
  assert.equal(ld.headline, 'Cómo leer tu plan');
  assert.equal(ld.datePublished, '2026-11-02');
  assert.equal(ld.inLanguage, 'es');
});

test('both blogs have no RSS subscription or feed', () => {
  for (const path of ['blog', 'en/blog']) {
    assert.doesNotMatch(read(full, `${path}/index.html`), /rss/i);
    assert.equal(existsSync(join(full, path, 'rss.xml')), false);
    assert.equal(existsSync(join(empty, path, 'rss.xml')), false);
  }
});

test('with no posts the listing shows the empty state', () => {
  assert.ok(read(empty, 'blog/index.html').includes('Mauricio está escribiendo'));
  assert.ok(read(empty, 'en/blog/index.html').includes('Mauricio is writing'));
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

test('home features published articles and handles an empty blog in each language', () => {
  for (const [path, post, draft, emptyMessage] of [
    ['index.html', '/blog/como-leer-tu-plan/', 'Borrador', 'Mauricio está escribiendo'],
    ['en/index.html', '/en/blog/how-to-read-your-plan/', 'Borrador', 'Mauricio is writing'],
  ]) {
    const section = read(full, path).match(/<section class="home-blog"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section);
    assert.ok(section.includes(post));
    assert.ok(!section.includes(draft));
    assert.ok(read(empty, path).includes(emptyMessage));
  }
});

test('blog sections and posts link back to their language home', () => {
  for (const [path, home] of [['blog/index.html', '/'], ['en/blog/index.html', '/en/'], ['blog/como-leer-tu-plan/index.html', '/']]) {
    assert.ok(read(full, path).includes(`class="back-home" href="${home}"`));
  }
});
