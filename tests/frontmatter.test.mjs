import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePost } from '../lib/frontmatter.mjs';

const post = (head, body = 'Hola.') => `---\n${head}\n---\n${body}\n`;
const valid = 'title: Cómo leer tu plan\ndescription: Qué significa cada número.\ndate: 2026-11-02\nlang: es\nslug: como-leer-tu-plan';

test('parses the fields and the body', () => {
  const p = parsePost(post(`${valid}\ntags: [nutrición, plan]\ncover: /media/blog/a.jpg\ncover_alt: Un plato`), 'es/como-leer-tu-plan.md');
  assert.equal(p.title, 'Cómo leer tu plan');
  assert.equal(p.date, '2026-11-02');
  assert.deepEqual(p.tags, ['nutrición', 'plan']);
  assert.equal(p.draft, false);
  assert.equal(p.body.trim(), 'Hola.');
});

test('draft defaults to false and parses true', () => {
  assert.equal(parsePost(post(`${valid}\ndraft: true`), 'es/x.md').draft, true);
});

test('names the file and field when something is wrong', () => {
  assert.throws(() => parsePost(post(valid.replace(/title: .*\n/, '')), 'es/a.md'), /es\/a\.md: title is required/);
  assert.throws(() => parsePost(post(valid), 'en/a.md'), /en\/a\.md: lang "es" does not match folder "en"/);
  assert.throws(() => parsePost(post(valid.replace('Cómo leer tu plan', 'x'.repeat(71))), 'es/a.md'), /title is longer than 70/);
  assert.throws(() => parsePost(post(valid.replace('2026-11-02', '2 de nov')), 'es/a.md'), /date must be YYYY-MM-DD/);
  assert.throws(() => parsePost(post(valid.replace('como-leer-tu-plan', 'Cómo Leer')), 'es/a.md'), /slug must be kebab-case/);
  assert.throws(() => parsePost(post(`${valid}\ncover: /media/blog/a.jpg`), 'es/a.md'), /cover_alt is required/);
  assert.throws(() => parsePost('sin front matter', 'es/a.md'), /missing front matter/);
});
