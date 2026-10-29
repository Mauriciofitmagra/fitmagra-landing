import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLinks } from '../scripts/check-links.mjs';
import { pageWeight } from '../scripts/check-budgets.mjs';

const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'fitmagra-check-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
};

test('brand.css has no shadow or monospace and at most two font families', () => {
  const css = readFileSync(new URL('../site/assets/brand.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /monospace/);
  const generic = new Set(['serif', 'sans-serif', 'system-ui', 'inherit']);
  const families = new Set([...css.matchAll(/(?:font-family|--font)\s*:\s*([^;}]+)/g)]
    .flatMap(([, v]) => v.split(',').map((f) => f.trim().replace(/["']/g, '')))
    .filter((f) => f && !f.startsWith('var(') && !generic.has(f)));
  assert.ok(families.size <= 2, [...families].join(', '));
});

test('checkLinks reports a missing file and a missing fragment', () => {
  const dir = fixture({
    'index.html': '<a href="/en/#nada">x</a><img src="media/nope.jpg"><a href="https://example.com/x.jpg">y</a>',
    'en/index.html': '<h1 id="algo">x</h1>',
  });
  assert.deepEqual(checkLinks(dir), [
    { page: 'index.html', ref: '/en/#nada' },
    { page: 'index.html', ref: 'media/nope.jpg' },
  ]);
});

test('checkLinks reports nothing when every reference resolves', () => {
  const dir = fixture({
    'index.html': '<a href="#top" id="top">x</a><a href="/en/">en</a><img src="/media/a.jpg"><a href="mailto:a@b.co">m</a>',
    'en/index.html': '<link rel="stylesheet" href="../assets/a.css">',
    'media/a.jpg': 'x',
    'assets/a.css': 'x',
  });
  assert.deepEqual(checkLinks(dir), []);
});

test('pageWeight counts a referenced image once, follows module imports and skips preload="none" media', () => {
  const dir = fixture({
    'index.html': '<link rel="stylesheet" href="/a.css"><img src="/i.jpg"><img src="/i.jpg"><script type="module" src="/m.js"></script>'
      + '<audio controls preload="none" src="/big.mp3"></audio><a href="/other.jpg">x</a>',
    'a.css': 'c'.repeat(100),
    'i.jpg': 'i'.repeat(1000),
    'm.js': "import { x } from './dep.mjs';",
    'dep.mjs': 'd'.repeat(50),
    'big.mp3': 'b'.repeat(5000),
    'other.jpg': 'o'.repeat(5000),
  });
  const w = pageWeight(dir, 'index.html');
  const html = readFileSync(join(dir, 'index.html')).length;
  const js = "import { x } from './dep.mjs';".length + 50;
  assert.equal(w.js, js);
  assert.equal(w.code, html + 100 + js);
  assert.equal(w.total, html + 100 + 1000 + js);
});
