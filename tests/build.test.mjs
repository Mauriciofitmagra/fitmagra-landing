import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-build-'));
await build({ outDir });
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
  assert.match(es, /<meta property="og:url" content="https:\/\/fitmagra\.invalid\/">/);
  assert.match(en, /<meta property="og:url" content="https:\/\/fitmagra\.invalid\/en\/">/);
  assert.match(es, /<meta property="og:image" content="https:\/\/fitmagra\.invalid\/media\/coach-black-800\.jpg">/);
});
