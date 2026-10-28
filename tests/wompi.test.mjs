import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkoutIntegrity, verifyTransactionEvent } from '../worker/billing/wompi.ts';

test('Wompi checkout integrity signs the reference, cents and COP with the server secret', async () => {
  assert.equal(await checkoutIntegrity('order-123', 2490000, 'test_integrity_example'), '8811248c3671de4aeb584a34b99f93bcdb2722e01d98ab6c51b7e90bc2f4c1ef');
});

test('Wompi events verify signed fields in the advertised order and return only signed transaction data', async () => {
  const properties = ['transaction.status', 'transaction.amount_in_cents', 'transaction.id'];
  const event = { event: 'transaction.updated', data: { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 2490000, reference: 'untrusted' } }, timestamp: 123, signature: { properties, checksum: createHash('sha256').update('APPROVED2490000tx-1123test_events_example').digest('hex').toUpperCase() } };
  assert.deepEqual(await verifyTransactionEvent(event, 'test_events_example'), { id: 'tx-1', status: 'APPROVED', amountCents: 2490000 });
  const altered = structuredClone(event);
  altered.data.transaction.amount_in_cents++;
  assert.equal(await verifyTransactionEvent(altered, 'test_events_example'), null);
  const incomplete = structuredClone(event);
  incomplete.signature.properties = ['transaction.id'];
  incomplete.signature.checksum = createHash('sha256').update('tx-1123test_events_example').digest('hex');
  assert.equal(await verifyTransactionEvent(incomplete, 'test_events_example'), null);
  assert.equal(await verifyTransactionEvent(event, ''), null);
  assert.equal(await verifyTransactionEvent(null, 'test_events_example'), null);
});

test('Wompi checkout integrity rejects invalid amounts and missing input', async () => {
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(checkoutIntegrity('order-123', amount, 'test_integrity_example'));
  }
  await assert.rejects(checkoutIntegrity('', 100, 'test_integrity_example'));
  await assert.rejects(checkoutIntegrity('order.invalid', 100, 'test_integrity_example'));
  await assert.rejects(checkoutIntegrity('a'.repeat(256), 100, 'test_integrity_example'));
  await assert.rejects(checkoutIntegrity('order-123', 100, ''));
});

test('Wompi merchant policies use the current endpoint and reject malformed policy URLs', async () => {
  const { merchantPolicies } = await import('../worker/billing/wompi.ts');
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://sandbox.wompi.co/v1/merchants/info');
    assert.equal(init.headers['x-merchant-public-key'], 'pub_test_example');
    assert.equal(init.redirect, 'error');
    return Response.json({ data: { presigned_acceptance: { acceptance_token: 'a', permalink: 'https://wompi.co/terms' }, presigned_personal_data_auth: { acceptance_token: 'b', permalink: 'https://wompi.co/privacy' } } });
  };
  try {
    assert.deepEqual(await merchantPolicies('test', 'pub_test_example'), { acceptanceToken: 'a', acceptanceUrl: 'https://wompi.co/terms', personalAuthToken: 'b', personalAuthUrl: 'https://wompi.co/privacy' });
    globalThis.fetch = async () => Response.json({ data: { presigned_acceptance: { acceptance_token: 'a', permalink: 'javascript:alert(1)' }, presigned_personal_data_auth: { acceptance_token: 'b', permalink: 'https://wompi.co/privacy' } } });
    await assert.rejects(merchantPolicies('test', 'pub_test_example'));
    await assert.rejects(merchantPolicies('test', 'pub_prod_example'));
  } finally { globalThis.fetch = original; }
});

test('Wompi transaction lookup uses the private key and rejects mismatched responses', async () => {
  const { lookupTransaction } = await import('../worker/billing/wompi.ts');
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://production.wompi.co/v1/transactions/tx-1');
    assert.equal(init.headers.Authorization, 'Bearer prv_prod_example');
    assert.equal(init.redirect, 'error');
    return Response.json({ data: { id: 'tx-1', reference: 'order-1', status: 'APPROVED', amount_in_cents: 2490000, currency: 'COP' } });
  };
  try {
    assert.deepEqual(await lookupTransaction('prod', 'prv_prod_example', 'tx-1'), { id: 'tx-1', reference: 'order-1', status: 'APPROVED', amountCents: 2490000, currency: 'COP' });
    globalThis.fetch = async () => Response.json({ data: { id: 'other', reference: 'order-1', status: 'APPROVED', amount_in_cents: 2490000, currency: 'COP' } });
    await assert.rejects(lookupTransaction('prod', 'prv_prod_example', 'tx-1'));
    await assert.rejects(lookupTransaction('prod', 'prv_test_example', 'tx-1'));
    await assert.rejects(lookupTransaction('prod', 'prv_prod_example', '../tx'));
    globalThis.fetch = async () => new Response('', { status: 500 });
    await assert.rejects(lookupTransaction('prod', 'prv_prod_example', 'tx-1'));
  } finally { globalThis.fetch = original; }
});

test('link payment lookup requires an authoritative match to the requested payment link', async () => {
  const { lookupLinkTransaction } = await import('../worker/billing/wompi.ts');
  const original = globalThis.fetch;
  const data = { id: 'tx-1', reference: 'ref-1', status: 'APPROVED', amount_in_cents: 1234500, currency: 'COP', payment_link_id: 'VdTCSO', customer_email: 'ana@example.test', finalized_at: '2026-10-28T12:00:00Z' };
  try {
    globalThis.fetch = async () => Response.json({ data });
    assert.deepEqual(await lookupLinkTransaction('test', 'prv_test_example', 'tx-1', 'VdTCSO'), { id: 'tx-1', reference: 'ref-1', status: 'APPROVED', amountCents: 1234500, currency: 'COP', paymentLinkId: 'VdTCSO', customerEmail: 'ana@example.test', finalizedAt: '2026-10-28T12:00:00Z' });
    globalThis.fetch = async () => Response.json({ data: { ...data, payment_link_id: 'other' } });
    await assert.rejects(lookupLinkTransaction('test', 'prv_test_example', 'tx-1', 'VdTCSO'));
    globalThis.fetch = async () => Response.json({ data: { ...data, payment_link_id: undefined } });
    await assert.rejects(lookupLinkTransaction('test', 'prv_test_example', 'tx-1', 'VdTCSO'));
    globalThis.fetch = async () => Response.json({ data: { ...data, finalized_at: 'invalid' } });
    await assert.rejects(lookupLinkTransaction('test', 'prv_test_example', 'tx-1', 'VdTCSO'));
  } finally { globalThis.fetch = original; }
});
