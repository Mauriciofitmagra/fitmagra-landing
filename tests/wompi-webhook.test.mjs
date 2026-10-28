import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setup, send } from './helpers.mjs';

const path = '/api/wompi/eventos/';
const config = { WOMPI_ENVIRONMENT: 'test', WOMPI_PRIVATE_KEY: 'prv_test_example', WOMPI_EVENTS_SECRET: 'test_events_example' };
const event = (status = 'APPROVED', timestamp = 100, amount = 50000, id = 'tx-1') => ({ event: 'transaction.updated', timestamp, data: { transaction: { id, status, amount_in_cents: amount, customer_email: 'untrusted@example.test', payment_link_id: 'VdTCSO' } }, signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum: createHash('sha256').update(`${id}${status}${amount}${timestamp}test_events_example`).digest('hex') } });
const response = (status = 'APPROVED', link = 'VdTCSO', amount = 50000, id = 'tx-1') => Response.json({ data: { id, reference: 'ref-1', status, amount_in_cents: amount, currency: 'COP', payment_link_id: link, customer_email: 'verified@example.test', finalized_at: '2026-10-28T00:00:00Z' } });
const post = (env, body) => send(env, path, { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://wompi.co', 'content-type': 'application/json' } });
const rows = async (env) => (await env.DB.prepare('SELECT * FROM wompi_link_payments').all()).results;

test('only verified link transactions are recorded and duplicate or older events cannot overwrite', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  let status = 'APPROVED';
  globalThis.fetch = async (url, init) => { assert.equal(url, 'https://sandbox.wompi.co/v1/transactions/tx-1'); assert.equal(init.headers.Authorization, 'Bearer prv_test_example'); return response(status); };
  try {
    assert.equal((await post(env, event())).status, 200);
    assert.equal((await post(env, event())).status, 200);
    let row = (await rows(env))[0];
    assert.equal(row.payer_email, 'verified@example.test');
    assert.equal(row.link_id, 'VdTCSO');
    assert.equal(row.amount_cents, 50000);
    status = 'VOIDED';
    assert.equal((await post(env, event('VOIDED', 200))).status, 200);
    assert.equal((await post(env, event('APPROVED', 100))).status, 200);
    assert.equal((await post(env, event('APPROVED', 200))).status, 503);
    row = (await rows(env))[0];
    assert.equal(row.status, 'VOIDED');
    assert.equal((await rows(env)).length, 1);
    const second = event('APPROVED', 100, 50000, 'tx-2'); second.data.transaction.payment_link_id = 'VPOS_h9q1ew';
    globalThis.fetch = async () => response('APPROVED', 'VPOS_h9q1ew', 50000, 'tx-2');
    assert.equal((await post(env, second)).status, 200);
    assert.equal((await rows(env)).find((item) => item.transaction_id === 'tx-2').link_id, 'VPOS_h9q1ew');
  } finally { globalThis.fetch = original; }
});

test('webhook fails closed on missing configuration, invalid signatures and mismatched provider data', async () => {
  const env = await setup();
  assert.equal((await post(env, event())).status, 503);
  Object.assign(env, config);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response('APPROVED', 'other'); };
  try {
    const bad = event(); bad.data.transaction.amount_in_cents++;
    assert.equal((await post(env, bad)).status, 400);
    assert.equal(calls, 0);
    assert.equal((await post(env, event())).status, 200);
    assert.equal((await rows(env)).length, 0);
    const tamperedLink = event(); tamperedLink.data.transaction.payment_link_id = 'VPOS_h9q1ew';
    globalThis.fetch = async () => response();
    assert.equal((await post(env, tamperedLink)).status, 200);
    assert.equal((await rows(env))[0].link_id, 'VdTCSO');
    await env.DB.prepare('DELETE FROM wompi_link_payments').run();
    const otherLink = event(); otherLink.data.transaction.payment_link_id = 'other';
    assert.equal((await post(env, otherLink)).status, 200);
    assert.equal((await rows(env))[0].link_id, 'VdTCSO');
    await env.DB.prepare('DELETE FROM wompi_link_payments').run();
    globalThis.fetch = async () => response('APPROVED', 'VdTCSO', 50001);
    assert.notEqual((await post(env, event())).status, 200);
    globalThis.fetch = async () => response('PENDING');
    assert.notEqual((await post(env, event())).status, 200);
    globalThis.fetch = async () => new Response('', { status: 500 });
    assert.notEqual((await post(env, event())).status, 200);
    assert.equal((await rows(env)).length, 0);
    assert.equal((await send(env, path, { method: 'POST', body: 'x'.repeat(40000), headers: { origin: 'https://wompi.co' } })).status, 413);
    assert.equal((await send(env, '/entrar/', { method: 'POST', body: '', headers: { origin: 'https://wompi.co' } })).status, 403);
  } finally { globalThis.fetch = original; }
});

test('webhook upsert also preserves event ordering on PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFileSync } = await import('node:fs');
  const { postgresDB } = await import('../worker/postgres.ts');
  const client = new PGlite();
  const original = globalThis.fetch;
  try {
    await client.exec(readFileSync(new URL('../migrations-postgres/0001_schema.sql', import.meta.url), 'utf8'));
    const env = { DB: postgresDB(client), ENVIRONMENT: 'test', ...config };
    const { wompiWebhook } = await import('../worker/billing/wompi-webhook.ts');
    const invoke = (body) => wompiWebhook(new Request('https://fitmagra.test/api/wompi/eventos/', { method: 'POST', body: JSON.stringify(body) }), env);
    globalThis.fetch = async () => response('VOIDED');
    assert.equal((await invoke(event('VOIDED', 200))).status, 200);
    globalThis.fetch = async () => response('APPROVED');
    assert.equal((await invoke(event('APPROVED', 100))).status, 200);
    assert.equal((await rows(env))[0].status, 'VOIDED');
  } finally { globalThis.fetch = original; await client.close(); }
});

test('provider transactions without a payment link are acknowledged without storage', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => response('APPROVED', null);
    assert.equal((await post(env, event())).status, 200);
    assert.equal((await rows(env)).length, 0);
    globalThis.fetch = async () => Response.json({ data: { id: 'tx-1', reference: 'ref', status: 'APPROVED', amount_in_cents: 50000, currency: 'COP' } });
    assert.equal((await post(env, event())).status, 503);
  } finally { globalThis.fetch = original; }
});

test('same-second pending and approved events advance only toward approved', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => response('PENDING');
    assert.equal((await post(env, event('PENDING'))).status, 200);
    globalThis.fetch = async () => response('APPROVED');
    assert.equal((await post(env, event())).status, 200);
    assert.equal((await post(env, event('PENDING'))).status, 200);
    globalThis.fetch = async () => response('PENDING');
    assert.equal((await post(env, event('PENDING', 101))).status, 503);
    assert.equal((await rows(env))[0].status, 'APPROVED');
    assert.equal((await post(env, event('VOIDED'))).status, 503);
  } finally { globalThis.fetch = original; }
});

test('import during a provider lookup prevents the stale webhook from overwriting it', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  let resume, started;
  const waiting = new Promise((resolve) => { resume = resolve; });
  const called = new Promise((resolve) => { started = resolve; });
  try {
    globalThis.fetch = async () => { started(); await waiting; return response('PENDING'); };
    const pending = post(env, event('PENDING'));
    await called;
    await env.DB.prepare("INSERT INTO wompi_link_payments (transaction_id, link_id, status, amount_cents, currency) VALUES ('tx-1', 'VdTCSO', 'APPROVED', 50000, 'COP')").run();
    resume();
    assert.equal((await pending).status, 503);
    assert.equal((await rows(env))[0].status, 'APPROVED');
  } finally { globalThis.fetch = original; }
});

test('concurrent same-second pending and approved events cannot regress approval', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  let release, count = 0, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const both = new Promise((resolve) => { entered = resolve; });
  try {
    globalThis.fetch = async () => { const status = ++count === 1 ? 'PENDING' : 'APPROVED'; if (count === 2) entered(); await gate; return response(status); };
    const pending = post(env, event('PENDING'));
    const approved = post(env, event());
    await both; release();
    const outcomes = await Promise.all([pending, approved]);
    globalThis.fetch = async () => response('APPROVED');
    if (outcomes[1].status === 503) assert.equal((await post(env, event())).status, 200);
    assert.equal((await rows(env))[0].status, 'APPROVED');
  } finally { globalThis.fetch = original; }
});

test('import changing an existing row during lookup invalidates the observed revision', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  let resume, started;
  const waiting = new Promise((resolve) => { resume = resolve; });
  const called = new Promise((resolve) => { started = resolve; });
  try {
    await env.DB.prepare("INSERT INTO wompi_link_payments (transaction_id, link_id, status, amount_cents, currency) VALUES ('tx-1', 'VdTCSO', 'PENDING', 50000, 'COP')").run();
    globalThis.fetch = async () => { started(); await waiting; return response('PENDING'); };
    const pending = post(env, event('PENDING'));
    await called;
    await env.DB.prepare("UPDATE wompi_link_payments SET status = 'APPROVED', revision = revision + 1 WHERE transaction_id = 'tx-1'").run();
    resume();
    assert.equal((await pending).status, 503);
    assert.equal((await rows(env))[0].status, 'APPROVED');
  } finally { globalThis.fetch = original; }
});

test('same-second final states reconcile from an authoritative lookup', async () => {
  const original = globalThis.fetch;
  try {
    for (const [before, after] of [['APPROVED', 'VOIDED'], ['PENDING', 'DECLINED'], ['PENDING', 'ERROR']]) {
      const env = Object.assign(await setup(), config);
      globalThis.fetch = async () => response(before);
      assert.equal((await post(env, event(before))).status, 200);
      globalThis.fetch = async () => response(after);
      assert.equal((await post(env, event(after))).status, 200);
      assert.equal((await rows(env))[0].status, after);
      assert.notEqual((await post(env, event(before))).status, 200);
      assert.equal((await rows(env))[0].status, after);
    }
  } finally { globalThis.fetch = original; }
});

test('same-second delayed lookup cannot overwrite a concurrently reconciled final status', async () => {
  const env = Object.assign(await setup(), config);
  const original = globalThis.fetch;
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const called = new Promise((resolve) => { started = resolve; });
  try {
    globalThis.fetch = async () => response('PENDING');
    assert.equal((await post(env, event('PENDING'))).status, 200);
    globalThis.fetch = async () => { started(); await gate; return response('DECLINED'); };
    const stale = post(env, event('DECLINED'));
    await called;
    globalThis.fetch = async () => response('ERROR');
    assert.equal((await post(env, event('ERROR'))).status, 200);
    release();
    assert.equal((await stale).status, 503);
    assert.equal((await rows(env))[0].status, 'ERROR');
  } finally { globalThis.fetch = original; }
});
