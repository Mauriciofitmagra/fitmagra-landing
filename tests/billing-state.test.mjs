import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transition } from '../worker/billing/state.ts';
import { access } from '../worker/billing/access.ts';

const sub = (over = {}) => ({ status: 'pending', plan: 'elite', currentPeriodEnd: null, graceUntil: null, cancelAtPeriodEnd: false, ...over });
const TODAY = '2026-11-10';

test('a successful payment adds 30 days per prepaid month', () => {
  const first = transition(sub(), { kind: 'payment_succeeded', months: 1 }, TODAY);
  assert.deepEqual(first, { ok: true, next: sub({ status: 'active', currentPeriodEnd: '2026-12-10' }) });
  const renewed = transition(sub({ status: 'active', currentPeriodEnd: '2026-11-20' }), { kind: 'payment_succeeded', months: 3 }, TODAY);
  assert.equal(renewed.next.currentPeriodEnd, '2027-02-18', 'prepaid three months stack on the current period');
  const late = transition(sub({ status: 'past_due', currentPeriodEnd: '2026-11-05', graceUntil: '2026-11-12' }), { kind: 'payment_succeeded', months: 1 }, TODAY);
  assert.deepEqual(late.next, sub({ status: 'active', currentPeriodEnd: '2026-12-10', graceUntil: null }), 'a late payment restarts from today');
});

test('a failed charge does not extend the paid period', () => {
  const r = transition(sub({ status: 'active', currentPeriodEnd: TODAY }), { kind: 'payment_failed' }, TODAY);
  assert.deepEqual(r.next, sub({ status: 'past_due', currentPeriodEnd: TODAY }));
  const again = transition(r.next, { kind: 'payment_failed' }, '2026-11-12');
  assert.equal(again.next.currentPeriodEnd, TODAY, 'retries do not extend access');
});

test('cancelling: a member keeps access to the end of the paid period; an admin can cancel now', () => {
  const atEnd = transition(sub({ status: 'active', currentPeriodEnd: '2026-12-01' }), { kind: 'cancel_requested' }, TODAY);
  assert.deepEqual(atEnd.next, sub({ status: 'active', currentPeriodEnd: '2026-12-01', cancelAtPeriodEnd: true }));
  const now = transition(sub({ status: 'past_due', currentPeriodEnd: '2026-11-01', graceUntil: '2026-11-08' }), { kind: 'cancel_now' }, TODAY);
  assert.equal(now.next.status, 'cancelled');
  const resumed = transition(atEnd.next, { kind: 'payment_succeeded', months: 1 }, TODAY);
  assert.equal(resumed.next.cancelAtPeriodEnd, false, 'paying again clears the pending cancellation');
});

test('every illegal pair returns an error and no next state', () => {
  const illegal = [
    [sub({ status: 'pending' }), { kind: 'payment_failed' }],
    [sub({ status: 'pending' }), { kind: 'cancel_requested' }],
    [sub({ status: 'cancelled' }), { kind: 'payment_failed' }],
    [sub({ status: 'cancelled' }), { kind: 'cancel_requested' }],
    [sub({ status: 'cancelled' }), { kind: 'cancel_now' }],
    [sub({ status: 'past_due', graceUntil: '2026-11-12' }), { kind: 'cancel_requested' }],
    [sub({ status: 'active', currentPeriodEnd: '2026-12-01' }), { kind: 'payment_succeeded', months: 4 }],
    [sub({ status: 'active', currentPeriodEnd: '2026-12-01' }), { kind: 'unknown' }],
  ];
  for (const [s, e] of illegal) {
    const r = transition(s, e, TODAY);
    assert.equal(r.ok, false, `${s.status} + ${e.kind}`);
    assert.ok(r.error);
    assert.equal(r.next, undefined);
  }
});

test('a cancelled member who pays again becomes active', () => {
  const r = transition(sub({ status: 'cancelled', currentPeriodEnd: '2026-10-01' }), { kind: 'payment_succeeded', months: 1 }, TODAY);
  assert.deepEqual(r.next, sub({ status: 'active', currentPeriodEnd: '2026-12-10' }));
});

test('access is computed from status and dates on every request, so no job is needed', () => {
  const cases = [
    [sub({ status: 'pending' }), 'billing_only'],
    [sub({ status: 'active', currentPeriodEnd: '2026-11-10' }), 'full_with_warning', 'the last paid day is included'],
    [sub({ status: 'active', currentPeriodEnd: '2026-11-09' }), 'billing_only', 'period ended'],
    [sub({ status: 'active', currentPeriodEnd: '2026-11-03' }), 'billing_only', 'no grace period'],
    [sub({ status: 'active', currentPeriodEnd: '2026-11-02' }), 'billing_only', 'expired'],
    [sub({ status: 'active', currentPeriodEnd: '2026-11-09', cancelAtPeriodEnd: true }), 'billing_only', 'cancelled at period end gets no grace'],
    [sub({ status: 'past_due', currentPeriodEnd: '2026-11-05', graceUntil: '2026-11-10' }), 'billing_only'],
    [sub({ status: 'past_due', currentPeriodEnd: '2026-11-01', graceUntil: '2026-11-09' }), 'billing_only'],
    [sub({ status: 'cancelled', currentPeriodEnd: '2026-12-01' }), 'billing_only'],
  ];
  for (const [s, expected, why = ''] of cases) assert.equal(access(s, TODAY).level, expected, `${s.status} ${s.currentPeriodEnd} ${why}`);
  assert.equal(access(sub({ status: 'active', currentPeriodEnd: '2026-11-13' }), TODAY).daysLeft, 3);
  assert.equal(access(null, TODAY).level, 'billing_only', 'no subscription row means no access');
});
