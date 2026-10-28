import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSize } from '../lib/image-size.mjs';

const media = (f) => new URL(`../site/media/${f}`, import.meta.url).pathname;

test('reads PNG and JPEG dimensions from the header', () => {
  assert.deepEqual(imageSize(media('logo-oficial.png')), [1623, 439]);
  assert.deepEqual(imageSize(media('coach-black.jpg')), [853, 1280]);
  assert.deepEqual(imageSize(media('coach-green-640.jpg')), [640, 639]);
});

test('rejects a file that is neither', () => {
  assert.throws(() => imageSize(media('fitmagra-vibes.mp3')), /not a PNG or JPEG/);
});
