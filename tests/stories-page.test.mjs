import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, unverifiedConsent } from '../scripts/build.mjs';

const stories = JSON.parse(readFileSync(new URL('../content/stories.json', import.meta.url), 'utf8'));
const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-stories-'));
await build({ outDir, log: () => {} });
const page = (p) => readFileSync(join(outDir, p), 'utf8');

for (const [lang, path, twin] of [['es', 'historias/index.html', '/en/stories/'], ['en', 'en/stories/index.html', '/historias/']]) {
  test(`${lang} stories page shows every photo and quote without the removed video`, () => {
    const html = page(path);
    for (const p of stories.photos) assert.ok(html.includes(`/media/stories/${p.id}.jpg`), p.id);
    for (const q of stories.quotes) assert.ok(html.includes(q.name), q.name);
    assert.doesNotMatch(html, /testimonial-video|<video/i);
    assert.equal(existsSync(join(outDir, 'media/testimonial-video.mp4')), false);
  });

  test(`${lang} stories sections return to the matching home page`, () => {
    const home = lang === 'es' ? '/' : '/en/';
    for (const section of page(path).match(/<section\b[\s\S]*?<\/section>/g) ?? []) {
      assert.ok(section.includes(`class="back-home" href="${home}"`));
    }
    assert.ok(page(path).includes('/assets/scroll-motion.js'));
  });

  test(`${lang} stories page links its own canonical and its twin`, () => {
    const html = page(path);
    assert.match(html, new RegExp(`<link rel="canonical" href="/${path.replace('index.html', '')}"`));
    assert.ok(html.includes(`href="${twin}"`), twin);
  });
}

test('the home page links to the stories page in each language', () => {
  assert.ok(page('index.html').includes('href="/historias/"'));
  assert.ok(page('en/index.html').includes('href="/en/stories/"'));
});

test('unverifiedConsent lists every item whose consent is not written', () => {
  const list = unverifiedConsent(stories);
  assert.equal(list.length, 0);
  assert.deepEqual(unverifiedConsent({ photos: [{ id: 'a', consent: 'written' }], quotes: [{ id: 'q', consent: 'unverified' }] }), ['q']);
});
