import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, req, login, send } from './helpers.mjs';
import { wompiPayments, importWompiPayment } from '../worker/admin/wompi-payments.ts';

const config = { ENVIRONMENT: 'test', WOMPI_ENVIRONMENT: 'test', WOMPI_PRIVATE_KEY: 'prv_test_example' };
const admin = { userId: 'admin1', role: 'admin' };
const member = { userId: 'ana', role: 'member' };
const request = (id) => req('/admin/pagos-wompi/importar/', { method: 'POST', form: { id } });
const api = (data = {}) => Response.json({ data: { id: 'tx-1', reference: 'ref', status: 'APPROVED', amount_in_cents: 12345, currency: 'COP', payment_link_id: 'VdTCSO', customer_email: 'payer@example.test', finalized_at: '2026-10-28T00:00:00Z', ...data } });

test('imports only verified link transactions and never overwrites event data', async () => {
  const { DB } = await setup();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { assert.equal(url, 'https://sandbox.wompi.co/v1/transactions/tx-1'); assert.equal(opts.headers.Authorization, 'Bearer prv_test_example'); return api(); };
  try {
    assert.equal((await importWompiPayment(request('tx-1'), DB, admin, config)).status, 303);
    let row = await DB.prepare('SELECT * FROM wompi_link_payments WHERE transaction_id = ?').bind('tx-1').first();
    assert.equal(row.payer_email, 'payer@example.test'); assert.equal(row.amount_cents, 12345); assert.equal(row.event_timestamp, 0);
    await DB.prepare("UPDATE wompi_link_payments SET status = 'VOIDED', event_timestamp = 42 WHERE transaction_id = 'tx-1'").run();
    const duplicate = await importWompiPayment(request('tx-1'), DB, admin, config);
    assert.equal(duplicate.status, 200);
    assert.match(await duplicate.text(), /ya existe.*no se actualizó/i);
    row = await DB.prepare('SELECT status, event_timestamp FROM wompi_link_payments WHERE transaction_id = ?').bind('tx-1').first();
    assert.equal(row.status, 'VOIDED'); assert.equal(row.event_timestamp, 42);
  } finally { globalThis.fetch = original; }
});

test('fails closed for bad configuration, non-admins, invalid IDs and unverified API data', async () => {
  const { DB } = await setup();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return api({ payment_link_id: 'other' }); };
  try {
    assert.equal((await importWompiPayment(request('tx-1'), DB, member, config)).status, 403);
    assert.equal((await importWompiPayment(request('tx-1'), DB, admin, { ...config, WOMPI_PRIVATE_KEY: '' })).status, 503);
    assert.equal((await importWompiPayment(request('tx-1'), DB, admin, { ...config, ENVIRONMENT: 'production' })).status, 503);
    assert.equal((await importWompiPayment(request('../bad'), DB, admin, config)).status, 400);
    assert.equal(calls, 0);
    const wrongLink = await importWompiPayment(request('tx-1'), DB, admin, config);
    assert.equal(wrongLink.status, 400);
    globalThis.fetch = async () => api({ id: 'other', customer_email: 'secret@example.test' });
    const invalid = await importWompiPayment(request('tx-1'), DB, admin, config);
    assert.equal(invalid.status, 503);
    assert.doesNotMatch(await invalid.text(), /secret@example\.test|prv_test_example/);
    assert.equal((await DB.prepare('SELECT count(*) n FROM wompi_link_payments').first()).n, 0);
  } finally { globalThis.fetch = original; }
});

test('import form is enabled only with valid configuration', async () => {
  const { DB } = await setup();
  const enabled = await (await wompiPayments(DB, admin, config)).text();
  const disabled = await (await wompiPayments(DB, admin, { ...config, WOMPI_PRIVATE_KEY: '' })).text();
  assert.match(enabled, /action="\/admin\/pagos-wompi\/importar\/"/);
  assert.doesNotMatch(enabled, /<button[^>]*disabled/);
  assert.match(disabled, /<button[^>]*disabled/);
  assert.doesNotMatch(enabled, /prv_test_example/);
});

test('the import route requires an administrator and a same-origin submission', async () => {
  const env = Object.assign(await setup(), config);
  const path = '/admin/pagos-wompi/importar/';
  const memberCookie = await login(env, 'ana');
  const adminCookie = await login(env, 'admin1');
  assert.equal((await send(env, path, { method: 'POST', form: { id: 'tx-1' } })).status, 303);
  assert.equal((await send(env, path, { method: 'POST', cookie: memberCookie, form: { id: 'tx-1' } })).status, 403);
  assert.equal((await send(env, path, { method: 'POST', cookie: adminCookie, form: { id: 'tx-1' }, headers: { origin: 'https://other.example' } })).status, 403);
  const original = globalThis.fetch;
  globalThis.fetch = async () => api();
  try {
    assert.equal((await send(env, path, { method: 'POST', cookie: adminCookie, form: { id: 'tx-1' } })).status, 303);
  } finally { globalThis.fetch = original; }
});

test('rejects invalid provider amounts or states and accepts the second configured link', async () => {
  const { DB } = await setup();
  const original = globalThis.fetch;
  try {
    for (const data of [{ status: 'UNKNOWN' }, { amount_in_cents: 0 }, { currency: 'USD' }]) {
      globalThis.fetch = async () => api(data);
      assert.equal((await importWompiPayment(request('tx-1'), DB, admin, config)).status, 503);
    }
    globalThis.fetch = async () => api({ payment_link_id: 'VPOS_h9q1ew' });
    assert.equal((await importWompiPayment(request('tx-1'), DB, admin, config)).status, 303);
    assert.equal((await DB.prepare('SELECT link_id FROM wompi_link_payments').first()).link_id, 'VPOS_h9q1ew');
  } finally { globalThis.fetch = original; }
});
