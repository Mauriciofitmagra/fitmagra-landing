import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutIntegrity } from '../worker/billing/wompi.ts';

test('Wompi checkout integrity signs the reference, cents and COP with the server secret', async () => {
  assert.equal(await checkoutIntegrity('order-123', 2490000, 'test_integrity_example'), '8811248c3671de4aeb584a34b99f93bcdb2722e01d98ab6c51b7e90bc2f4c1ef');
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
