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

interface Row { plan: Plan; status: Status; current_period_end: string | null; grace_until: string | null; cancel_at_period_end: number }

export const readSubscription = async (db: DB, userId: string): Promise<Subscription | null> => {
  const r = await db.prepare('SELECT plan, status, current_period_end, grace_until, cancel_at_period_end FROM subscriptions WHERE user_id = ?').bind(userId).first<Row>();
  return r && { plan: r.plan, status: r.status, currentPeriodEnd: r.current_period_end, graceUntil: r.grace_until, cancelAtPeriodEnd: r.cancel_at_period_end === 1 };
};

// ponytail: two different events for one member at the same instant can race (last write wins). Acceptable at
// a few hundred members; add a version column and a conditional UPDATE if a provider ever sends them together.
export async function applyEvent(db: DB, e: Incoming, today: string, now: number): Promise<{ outcome: Outcome; error?: string }> {
  const seen = await db.prepare('SELECT 1 FROM billing_events WHERE provider_event_id = ?').bind(e.providerEventId).first();
  if (seen) return { outcome: 'duplicate' };
  const record = (outcome: Outcome) => db.prepare('INSERT INTO billing_events (provider_event_id, provider, kind, user_id, outcome, received_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(e.providerEventId, e.provider, e.event.kind, e.userId, outcome, now, JSON.stringify({ amountCop: e.amountCop, method: e.method, reference: e.reference }));
  const current = await readSubscription(db, e.userId);
  if (!current) {
    await record('unknown_member').run();
    return { outcome: 'unknown_member' };
  }
  const result = transition(current, e.event, today);
  if (!result.ok) {
    await record('rejected').run();
    return { outcome: 'rejected', error: result.error };
  }
  const n = result.next;
  const statements = [
    record('applied'),
    db.prepare('UPDATE subscriptions SET status = ?, current_period_end = ?, grace_until = ?, cancel_at_period_end = ?, provider = ?, provider_ref = coalesce(?, provider_ref), updated_at = ? WHERE user_id = ?')
      .bind(n.status, n.currentPeriodEnd, n.graceUntil, n.cancelAtPeriodEnd ? 1 : 0, e.provider, e.providerRef ?? null, now, e.userId),
  ];
  if (e.event.kind === 'payment_succeeded' || e.event.kind === 'payment_failed') {
    statements.push(db.prepare('INSERT INTO payments (id, user_id, period_start, months, amount_cop, status, provider, method, reference, provider_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), e.userId, today, e.event.kind === 'payment_succeeded' ? e.event.months : 1, e.amountCop ?? 0,
        e.event.kind === 'payment_succeeded' ? 'paid' : 'failed', e.provider, e.method ?? null, e.reference ?? null, e.providerRef ?? null, now));
  }
  try {
    await db.batch(statements);
  } catch (err) {
    // A concurrent delivery of the same event won the insert; nothing was applied twice.
    if (String(err).includes('UNIQUE')) return { outcome: 'duplicate' };
    throw err;
  }
  return { outcome: 'applied' };
}
