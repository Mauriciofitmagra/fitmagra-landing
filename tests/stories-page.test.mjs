import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, unverifiedConsent } from '../scripts/build.mjs';

const stories = JSON.parse(readFileSync(new URL('../content/stories.json', import.meta.url), 'utf8'));
const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-stories-'));
await build({ outDir, siteUrl: 'https://fitmagra.test', log: () => {} });
const page = (p) => readFileSync(join(outDir, p), 'utf8');

for (const [lang, path, twin] of [['es', 'historias/index.html', '/en/stories/'], ['en', 'en/stories/index.html', '/historias/']]) {
  test(`${lang} stories page shows every photo, quote and the video`, () => {
    const html = page(path);
    for (const p of stories.photos) assert.ok(html.includes(`/media/stories/${p.id}.jpg`), p.id);
    for (const q of stories.quotes) assert.ok(html.includes(q.name), q.name);
    assert.match(html, /<video[^>]*preload="none"[^>]*src="\/media\/testimonial-video\.mp4"/);
  });

  test(`${lang} stories page links its own canonical and its twin`, () => {
    const html = page(path);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://fitmagra.test/${path.replace('index.html', '')}"`));
    assert.ok(html.includes(`href="https://fitmagra.test${twin}"`), twin);
  });
}

test('the home page links to the stories page in each language', () => {
  assert.ok(page('index.html').includes('href="/historias/"'));
  assert.ok(page('en/index.html').includes('href="/en/stories/"'));
});

test('unverifiedConsent lists every item whose consent is not written', () => {
  const list = unverifiedConsent(stories);
  assert.equal(list.length, stories.photos.length + stories.quotes.length + 1);
  assert.deepEqual(unverifiedConsent({ photos: [{ id: 'a', consent: 'written' }], quotes: [], video: { id: 'v', consent: 'unverified' } }), ['v']);
});
