import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-build-'));
const previousSiteUrl = process.env.SITE_URL;
delete process.env.SITE_URL;
try { await build({ outDir }); } finally { if (previousSiteUrl !== undefined) process.env.SITE_URL = previousSiteUrl; }
const es = readFileSync(join(outDir, 'index.html'), 'utf8');
const en = readFileSync(join(outDir, 'en/index.html'), 'utf8');

test('writes both home pages, robots.txt and 404.html', () => {
  for (const f of ['index.html', 'en/index.html', 'robots.txt', '404.html', 'assets/brand.css', 'media/logo-oficial.png']) {
    assert.ok(existsSync(join(outDir, f)), f);
  }
});

for (const [lang, html, headline] of [['es', es, 'Tu plan,'], ['en', en, 'Your plan,']]) {
  test(`${lang} page has lang, title, description, canonical and hreflang pairs`, () => {
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+"/);
    assert.match(html, /<link rel="canonical" href="[^"]+"/);
    assert.match(html, /<link rel="alternate" hreflang="es" href="[^"]+"/);
    assert.match(html, /<link rel="alternate" hreflang="en" href="[^"]+"/);
  });

  test(`${lang} page carries its headline and none of the banned claims`, () => {
    assert.ok(html.includes(headline));
    assert.ok(!html.includes('—'), 'em dash');
    assert.ok(!html.includes('MagraMind AI 24/7'));
    assert.ok(!/4[.,]8\s*★|1\.016\.013\.376/.test(html), 'rating or ID number');
  });
}

test('both languages expose the member login and mobile navigation', () => {
  for (const html of [es, en]) assert.match(html, /<a href="\/entrar\/">/);
  const css = readFileSync(join(outDir, 'assets/brand.css'), 'utf8');
  assert.doesNotMatch(css, /\.nav nav\s*\{[^}]*display:\s*none/);
});

test('public pages include share metadata with absolute URLs', () => {
  assert.match(es, /<meta property="og:type" content="website">/);
  assert.match(es, /<meta property="og:url" content="https:\/\/fitmagra\.robertzu43\.workers\.dev\/">/);
  assert.match(en, /<meta property="og:url" content="https:\/\/fitmagra\.robertzu43\.workers\.dev\/en\/">/);
  assert.match(es, /<meta property="og:image" content="https:\/\/fitmagra\.robertzu43\.workers\.dev\/media\/coach-black-800\.jpg">/);
});


test('default build uses the chosen Worker hostname for search and sharing', () => {
  const host = 'https://fitmagra.robertzu43.workers.dev';
  assert.ok(es.includes(`<link rel="canonical" href="${host}/">`));
  assert.ok(en.includes(`<link rel="canonical" href="${host}/en/">`));
  assert.ok(readFileSync(join(outDir, 'robots.txt'), 'utf8').includes(`Sitemap: ${host}/sitemap.xml`));
  assert.ok(readFileSync(join(outDir, 'sitemap.xml'), 'utf8').includes(`<loc>${host}/</loc>`));
});

test('missing pages have language-specific, non-indexed recovery pages', () => {
  const spanish = readFileSync(join(outDir, '404.html'), 'utf8');
  const english = readFileSync(join(outDir, 'en/404.html'), 'utf8');
  assert.match(spanish, /<html lang="es">/);
  assert.match(spanish, /Esta página no existe\./);
  assert.match(spanish, /<a href="\/">Volver al inicio<\/a>/);
  assert.match(english, /<html lang="en">/);
  assert.match(english, /This page does not exist\./);
  assert.match(english, /<a href="\/en\/">Back to the home page<\/a>/);
  for (const html of [spanish, english]) assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(readFileSync(join(outDir, 'sitemap.xml'), 'utf8'), /404\.html/);
});

test('public navigation landmarks and audio player have descriptive names in both languages', () => {
  for (const [html, main, footer] of [[es, 'Navegación principal', 'Navegación del pie de página'], [en, 'Main navigation', 'Footer navigation']]) {
    assert.ok(html.includes(`<nav aria-label="${main}">`));
    assert.ok(html.includes(`<nav aria-label="${footer}">`));
    assert.match(html, /<audio[^>]+aria-label="[^"]+"/);
  }
});
