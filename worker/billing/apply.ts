// The one path every billing event takes, whether it comes from a provider webhook, the stub or an admin
// recording a manual payment (spec 13.4). The event row, the subscription change and the payment row are one batch.
import type { DB } from '../db.ts';
import { transition, type BillingEvent, type Subscription, type Plan, type Status } from './state.ts';

export interface Incoming {
  provider: string;
  providerEventId: string;
  userId: string;
  event: BillingEvent;
  amountCop?: number;
  method?: string;
  reference?: string;
  providerRef?: string;
}
export type Outcome = 'applied' | 'duplicate' | 'rejected' | 'unknown_member';

interface Row { plan: Plan; status: Status; current_period_end: string | null; grace_until: string | null; cancel_at_period_end: number; revision: number }

export const readSubscription = async (db: DB, userId: string): Promise<Subscription | null> => {
  const r = await db.prepare('SELECT plan, status, current_period_end, grace_until, cancel_at_period_end FROM subscriptions WHERE user_id = ?').bind(userId).first<Row>();
  return r && { plan: r.plan, status: r.status, currentPeriodEnd: r.current_period_end, graceUntil: r.grace_until, cancelAtPeriodEnd: r.cancel_at_period_end === 1 };
};

export async function applyEvent(db: DB, e: Incoming, today: string, now: number): Promise<{ outcome: Outcome; error?: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const seen = await db.prepare('SELECT 1 FROM billing_events WHERE provider_event_id = ?').bind(e.providerEventId).first();
    if (seen) return { outcome: 'duplicate' };
    const payload = JSON.stringify({ amountCop: e.amountCop, method: e.method, reference: e.reference, operation: crypto.randomUUID() });
    const row = await db.prepare('SELECT plan, status, current_period_end, grace_until, cancel_at_period_end, revision FROM subscriptions WHERE user_id = ?').bind(e.userId).first<Row>();
    const record = (outcome: Outcome) => db.prepare(`INSERT INTO billing_events (provider_event_id, provider, kind, user_id, outcome, received_at, payload)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ? AND revision = ?)`)
      .bind(e.providerEventId, e.provider, e.event.kind, e.userId, outcome, now, payload, e.userId, row!.revision);
    if (!row) {
      try {
        const saved = await db.prepare('INSERT INTO billing_events (provider_event_id, provider, kind, user_id, outcome, received_at, payload) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ?)')
          .bind(e.providerEventId, e.provider, e.event.kind, e.userId, 'unknown_member', now, payload, e.userId).run();
        if (saved.meta.changes) return { outcome: 'unknown_member' };
      } catch (err) {
        if (await db.prepare('SELECT 1 FROM billing_events WHERE provider_event_id = ?').bind(e.providerEventId).first()) return { outcome: 'duplicate' };
        throw err;
      }
      continue;
    }
    const current: Subscription = { plan: row.plan, status: row.status, currentPeriodEnd: row.current_period_end, graceUntil: row.grace_until, cancelAtPeriodEnd: row.cancel_at_period_end === 1 };
    const result = transition(current, e.event, today);
    if (!result.ok) {
      try {
        if ((await record('rejected').run()).meta.changes) return { outcome: 'rejected', error: result.error };
      } catch (err) {
        if (await db.prepare('SELECT 1 FROM billing_events WHERE provider_event_id = ?').bind(e.providerEventId).first()) return { outcome: 'duplicate' };
        throw err;
      }
      continue;
    }
    const n = result.next;
    const statements = [
      record('applied'),
      db.prepare('UPDATE subscriptions SET status = ?, current_period_end = ?, grace_until = ?, cancel_at_period_end = ?, provider = ?, provider_ref = coalesce(?, provider_ref), updated_at = ?, revision = revision + 1 WHERE user_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM billing_events WHERE provider_event_id = ? AND payload = ?)')
        .bind(n.status, n.currentPeriodEnd, n.graceUntil, n.cancelAtPeriodEnd ? 1 : 0, e.provider, e.providerRef ?? null, now, e.userId, row.revision, e.providerEventId, payload),
    ];
    if (e.event.kind === 'payment_succeeded' || e.event.kind === 'payment_failed') {
      statements.push(db.prepare('INSERT INTO payments (id, user_id, period_start, months, amount_cop, status, provider, method, reference, provider_ref, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM billing_events WHERE provider_event_id = ? AND payload = ?)')
        .bind(crypto.randomUUID(), e.userId, today, e.event.kind === 'payment_succeeded' ? e.event.months : 1, e.amountCop ?? 0,
          e.event.kind === 'payment_succeeded' ? 'paid' : 'failed', e.provider, e.method ?? null, e.reference ?? null, e.providerRef ?? null, now, e.providerEventId, payload));
    }
    try {
      const [inserted] = await db.batch(statements);
      if (inserted.meta.changes) return { outcome: 'applied' };
    } catch (err) {
      if (await db.prepare('SELECT 1 FROM billing_events WHERE provider_event_id = ?').bind(e.providerEventId).first()) return { outcome: 'duplicate' };
      throw err;
    }
  }
  throw new Error('Concurrent billing update; retry event');
}
