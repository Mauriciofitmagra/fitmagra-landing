// Subscription state machine (spec 13.1). Pure: no database, no clock. Dates are YYYY-MM-DD.
export type Status = 'pending' | 'active' | 'past_due' | 'cancelled';
export type Plan = 'standard' | 'elite' | 'platino';
export interface Subscription { status: Status; plan: Plan; currentPeriodEnd: string | null; graceUntil: string | null; cancelAtPeriodEnd: boolean }
export type BillingEvent =
  | { kind: 'payment_succeeded'; months: number }
  | { kind: 'payment_failed' }
  | { kind: 'cancel_requested' }
  | { kind: 'cancel_now' };
export type Result = { ok: true; next: Subscription } | { ok: false; error: string };

export const GRACE_DAYS = 7;
export const TERMS = [1, 2, 3]; // months one payment covers (spec Q14)

const day = (d: string): Date => new Date(`${d}T00:00:00Z`);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number): string => iso(new Date(day(d).getTime() + n * 86_400_000));
export const daysBetween = (from: string, to: string): number => Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000);

export function addMonths(d: string, months: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dd, last));
  return iso(target);
}

type Handler = (s: Subscription, e: BillingEvent, today: string) => Subscription | string;

const paid: Handler = (s, e, today) => {
  const months = (e as { months: number }).months;
  if (!TERMS.includes(months)) return `a payment covers ${TERMS.join(', ')} months, not ${months}`;
  const from = s.status === 'active' && s.currentPeriodEnd && s.currentPeriodEnd >= today ? s.currentPeriodEnd : today;
  return { ...s, status: 'active', currentPeriodEnd: addMonths(from, months), graceUntil: null, cancelAtPeriodEnd: false };
};
const failed: Handler = (s, _e, today) => ({ ...s, status: 'past_due', graceUntil: s.graceUntil ?? addDays(today, GRACE_DAYS) });
const cancelAtEnd: Handler = (s) => ({ ...s, cancelAtPeriodEnd: true });
const cancelNow: Handler = (s) => ({ ...s, status: 'cancelled', graceUntil: null, cancelAtPeriodEnd: false });

// One row per state; a missing event is illegal in that state.
const TABLE: Record<Status, Partial<Record<BillingEvent['kind'], Handler>>> = {
  pending: { payment_succeeded: paid, cancel_now: cancelNow },
  active: { payment_succeeded: paid, payment_failed: failed, cancel_requested: cancelAtEnd, cancel_now: cancelNow },
  past_due: { payment_succeeded: paid, payment_failed: failed, cancel_now: cancelNow },
  cancelled: { payment_succeeded: paid },
};

export function transition(s: Subscription, e: BillingEvent, today: string): Result {
  const handler = TABLE[s.status]?.[e.kind];
  if (!handler) return { ok: false, error: `${e.kind} is not allowed while ${s.status}` };
  const next = handler(s, e, today);
  return typeof next === 'string' ? { ok: false, error: next } : { ok: true, next };
}
