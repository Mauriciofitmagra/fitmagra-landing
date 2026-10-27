import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const stories = JSON.parse(readFileSync(new URL('../content/stories.json', import.meta.url), 'utf8'));
const media = (f) => new URL(`../site/media/${f}`, import.meta.url);
const all = [...stories.photos, ...stories.quotes, stories.video];

test('every story item has a unique id and a known consent status', () => {
  const ids = all.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of all) assert.ok(['unverified', 'written'].includes(s.consent), `${s.id}: consent`);
});

test('every photo exists and has a label and alt text in both languages', () => {
  for (const p of stories.photos) {
    assert.ok(existsSync(media(p.file)), `${p.id}: ${p.file} missing`);
    for (const lang of ['es', 'en']) {
      assert.ok(p.label[lang], `${p.id}: label.${lang}`);
      assert.ok(p.alt[lang], `${p.id}: alt.${lang}`);
    }
  }
});

test('every quote has a name, a role in both languages, the original text and a translation', () => {
  for (const q of stories.quotes) {
    assert.ok(q.name && q.text && q.translation, q.id);
    assert.ok(q.role.es && q.role.en, `${q.id}: role`);
  }
  assert.ok(existsSync(media(stories.video.file)), 'video file');
});
