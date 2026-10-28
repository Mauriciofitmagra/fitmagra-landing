import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCutover } from '../scripts/check-cutover.mjs';

const repo = new URL('..', import.meta.url).pathname;
const failing = (items) => items.filter((i) => !i.ok).map((i) => i.id);
const signed = { by: 'Roberto', date: '2026-11-20' };

function passingFixture() {
  const root = mkdtempSync(join(tmpdir(), 'fitmagra-cutover-'));
  const put = (p, body) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), body); };
  mkdirSync(join(root, 'dist/media'), { recursive: true });
  put('content/legal/terminos.md', 'Términos revisados por el abogado.');
  put('content/legal/privacidad.md', 'Política de tratamiento de datos revisada por el abogado.');
  put('content/legal/terms.md', 'Terms reviewed by counsel.');
  put('content/legal/privacy.md', 'Privacy policy reviewed by counsel.');
  for (const p of ['terminos', 'privacidad', 'en/terms', 'en/privacy']) put(`dist/${p}/index.html`, '<html>Approved legal text</html>');
  put('wrangler.jsonc', readFileSync(join(repo, 'wrangler.jsonc'), 'utf8').replace('REPLACE_WITH_PRODUCTION_D1_ID', 'a1b2c3').replace('REPLACE_WITH_STAGING_D1_ID', 'd4e5f6'));
  put('docs/runbooks/cutover-signoff.json', JSON.stringify({
    vercel: { ...signed, decision: 'cloudflare', liveSiteChecked: true },
    secretsSet: signed, tasteInspector: signed, stagingSmokeTest: signed, workersCpuMeasured: signed,
  }));
  put('dist/index.html', '<html><head><link rel="canonical" href="https://fitmagra.co/"></head><body><a href="/">x</a></body></html>');
  put('dist/en/index.html', '<html><head><link rel="canonical" href="https://fitmagra.co/en/"></head><body><a href="/en/">x</a></body></html>');
  return root;
}

test('the checklist fails closed on the repository as it is today', () => {
  const items = checkCutover({ root: repo, env: {} });
  const ids = failing(items);
  for (const id of ['vercel-decision', 'legal-pages', 'site-url', 'database-ids', 'signoff-secrets', 'signoff-taste', 'signoff-staging', 'signoff-workers-cpu']) {
    assert.ok(ids.includes(id), `${id} should fail today`);
  }
  assert.ok(items.find((i) => i.id === 'billing-provider').ok, 'production has no stub provider');
});

test('the checklist passes when every item is met', () => {
  const items = checkCutover({ root: passingFixture(), env: { SITE_URL: 'https://fitmagra.co' } });
  assert.deepEqual(failing(items), []);
});

test('each item fails on its own', () => {
  const cases = [
    ['site-url', (root, env) => { env.SITE_URL = 'https://fitmagra.invalid'; }],
    ['site-url', (root) => writeFileSync(join(root, 'dist/index.html'), '<link rel="canonical" href="https://fitmagra.invalid/">')],
    ['billing-provider', (root) => writeFileSync(join(root, 'wrangler.jsonc'), readFileSync(join(root, 'wrangler.jsonc'), 'utf8').replace('"vars": { "ENVIRONMENT": "production" }', '"vars": { "ENVIRONMENT": "production", "BILLING_PROVIDER": "stub" }'))],
    ['legal-pages', (root) => writeFileSync(join(root, 'content/legal/privacidad.md'), 'PENDIENTE: texto del abogado')],
    ['legal-pages', (root) => writeFileSync(join(root, 'dist/en/privacy/index.html'), '')],
    ['story-consent', (root) => writeFileSync(join(root, 'dist/media/t-01.jpg'), 'photo')],
    ['vercel-decision', (root) => { const p = join(root, 'docs/runbooks/cutover-signoff.json'); const s = JSON.parse(readFileSync(p, 'utf8')); s.vercel.decision = 'keep-vercel'; writeFileSync(p, JSON.stringify(s)); }],
    ['vercel-decision', (root) => { const p = join(root, 'docs/runbooks/cutover-signoff.json'); const s = JSON.parse(readFileSync(p, 'utf8')); s.vercel.liveSiteChecked = false; writeFileSync(p, JSON.stringify(s)); }],
    ['signoff-staging', (root) => { const p = join(root, 'docs/runbooks/cutover-signoff.json'); const s = JSON.parse(readFileSync(p, 'utf8')); s.stagingSmokeTest = { by: 'Claude', date: '2026-11-20' }; writeFileSync(p, JSON.stringify(s)); }],
    ['links', (root) => writeFileSync(join(root, 'dist/index.html'), '<img src="/media/missing.jpg">')],
    ['dist-built', (root) => cpSync(join(root, 'dist/index.html'), join(root, 'dist/old.html')) || writeFileSync(join(root, 'dist/index.html'), '') ],
  ];
  for (const [id, mutate] of cases) {
    const root = passingFixture();
    const env = { SITE_URL: 'https://fitmagra.co' };
    mutate(root, env);
    assert.ok(failing(checkCutover({ root, env })).includes(id), id);
  }
});
