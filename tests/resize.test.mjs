import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../site/assets/resize.js', import.meta.url), 'utf8');

function harness({ bitmap, blob }) {
  let handler, submissions = 0;
  const original = { name: 'original.jpg', type: 'image/jpeg' };
  const input = { files: [original] };
  const message = { textContent: '' };
  const form = {
    dataset: {},
    querySelector: selector => selector === 'input[type="file"]' ? input : message,
    addEventListener: (_event, callback) => { handler = callback; },
    requestSubmit: () => { submissions++; },
  };
  const document = {
    querySelectorAll: () => [form],
    createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(blob) }),
  };
  class DataTransfer { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } }
  class File { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } }
  runInNewContext(code, { document, createImageBitmap: bitmap, DataTransfer, File, Promise, Math });
  const submit = async () => { let prevented = false; await handler({ preventDefault: () => { prevented = true; } }); return prevented; };
  return { input, original, message, submit, get submissions() { return submissions; } };
}

test('a null canvas result uploads the original file, not an invalid replacement', async () => {
  const h = harness({ bitmap: async () => ({ width: 100, height: 100 }), blob: null });
  assert.equal(await h.submit(), true);
  assert.equal(h.input.files[0], h.original);
  assert.equal(h.submissions, 1);
});

test('changing the selected photo while processing never submits the earlier selection', async () => {
  let resume;
  const h = harness({ bitmap: () => new Promise(resolve => { resume = resolve; }), blob: { size: 3 } });
  const pending = h.submit();
  const replacement = { name: 'replacement.jpg', type: 'image/jpeg' };
  h.input.files = [replacement];
  resume({ width: 100, height: 100 });
  await pending;
  assert.equal(h.input.files[0], replacement);
  assert.equal(h.submissions, 0);
  assert.match(h.message.textContent, /selección cambió/i);
});

test('a successful conversion submits one resized JPEG', async () => {
  const h = harness({ bitmap: async () => ({ width: 3000, height: 2000 }), blob: { size: 3 } });
  await h.submit();
  assert.equal(h.submissions, 1);
  assert.notEqual(h.input.files[0], h.original);
  assert.equal(h.input.files[0].type, 'image/jpeg');
});

test('repeated submit while conversion is in progress cannot start a second upload', async () => {
  let resume, calls = 0;
  const h = harness({ bitmap: () => { calls++; return new Promise(resolve => { resume = resolve; }); }, blob: { size: 3 } });
  const first = h.submit();
  assert.equal(await h.submit(), true);
  assert.equal(calls, 1);
  resume({ width: 100, height: 100 });
  await first;
  assert.equal(h.submissions, 1);
});

test('unsupported images are left unchanged for server validation', async () => {
  let calls = 0;
  const h = harness({ bitmap: async () => { calls++; return { width: 1, height: 1 }; }, blob: { size: 3 } });
  const png = { name: 'image.png', type: 'image/png' };
  h.input.files = [png];
  assert.equal(await h.submit(), false);
  assert.equal(h.input.files[0], png);
  assert.equal(calls, 0);
});

test('a second submission is stopped even if the selected file type changes', async () => {
  let resume;
  const h = harness({ bitmap: () => new Promise(resolve => { resume = resolve; }), blob: { size: 3 } });
  const first = h.submit();
  h.input.files = [{ name: 'other.txt', type: 'text/plain' }];
  assert.equal(await h.submit(), true);
  resume({ width: 100, height: 100 });
  await first;
  assert.equal(h.submissions, 0);
});
