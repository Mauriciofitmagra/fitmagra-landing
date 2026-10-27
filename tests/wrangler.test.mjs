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
  assert.equal(config.main, 'worker/index.ts');
  assert.deepEqual(config.assets.run_worker_first, ['/entrar/*', '/salir/*', '/app/*', '/admin/*', '/api/*']);
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.d1_databases[0].migrations_dir, 'migrations');
  assert.equal(config.env.staging.d1_databases[0].database_name, 'fitmagra-staging');
  assert.deepEqual(config.r2_buckets, [{ binding: 'FILES', bucket_name: 'fitmagra-files' }]);
  assert.deepEqual(config.env.staging.r2_buckets, [{ binding: 'FILES', bucket_name: 'fitmagra-files-staging' }]);
  assert.equal(config.vars.ENVIRONMENT, 'production');
  assert.equal(config.env.staging.vars.ENVIRONMENT, 'staging');
  assert.equal(config.env.staging.vars.BILLING_PROVIDER, 'stub');
  assert.equal(config.vars.BILLING_PROVIDER, undefined, 'no billing provider in production until Roberto picks one');
  assert.doesNotMatch(raw, /secret|token|api_key/i);
});
