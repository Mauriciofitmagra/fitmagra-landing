import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../scripts/build.mjs';

test('approved legal text is rendered and linked in both languages', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fitmagra-legal-'));
  const legalDir = join(root, 'legal');
  mkdirSync(legalDir);
  for (const name of ['terminos', 'privacidad', 'terms', 'privacy']) writeFileSync(join(legalDir, `${name}.md`), '## Details\n\nApproved text.');
  const outDir = join(root, 'dist');
  await build({ outDir, legalDir, siteUrl: 'https://fitmagra.test', log: () => {} });
  for (const path of ['terminos', 'privacidad', 'en/terms', 'en/privacy']) {
    const html = readFileSync(join(outDir, path, 'index.html'), 'utf8');
    assert.match(html, /<h2>Details<\/h2>/);
    assert.match(html, /Approved text\./);
  }
  assert.match(readFileSync(join(outDir, 'index.html'), 'utf8'), /href="\/privacidad\/"/);
  assert.match(readFileSync(join(outDir, 'en/index.html'), 'utf8'), /href="\/en\/privacy\/"/);
});
