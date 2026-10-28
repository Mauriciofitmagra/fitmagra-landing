import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-stories-'));
await build({ outDir, siteUrl: 'https://fitmagra.test', log: () => {} });
const page = (p) => readFileSync(join(outDir, p), 'utf8');

for (const [lang, path, twin] of [['es', 'historias/index.html', '/en/stories/'], ['en', 'en/stories/index.html', '/historias/']]) {
  test(`${lang} stories page reserves space without client content`, () => {
    const html = page(path);
    assert.match(html, lang === 'es' ? /Próximamente/ : /Coming soon/);
    assert.doesNotMatch(html, /<video|\/media\/stories\//);
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

test('client photos and testimonial video are not present in the build', () => {
  assert.ok(!readFileSync(join(outDir, 'index.html'), 'utf8').includes('/media/t-'));
  assert.ok(!existsSync(join(outDir, 'media', 't-01.jpg')));
  assert.ok(!existsSync(join(outDir, 'media', 'stories')));
  assert.ok(!existsSync(join(outDir, 'media', 't-mes-640.jpg')));
  assert.ok(!existsSync(join(outDir, 'media', 'testimonial-video.mp4')));
});
