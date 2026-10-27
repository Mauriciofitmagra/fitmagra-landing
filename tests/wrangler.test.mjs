import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stripJsonc = (text) => text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '');

test('wrangler.jsonc serves dist/ as static assets and holds no account ids or secrets', () => {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const config = JSON.parse(stripJsonc(raw));
  assert.equal(config.name, 'fitmagra');
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.match(config.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(config.env.staging.name, 'fitmagra-staging');
  assert.equal(config.account_id, undefined);
  assert.doesNotMatch(raw, /secret|token|api_key/i);
});
