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
