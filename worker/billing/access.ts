// What a member can use, computed from the subscription and today's date on every request (spec 13.2).
// Time-driven changes (a period ending, grace running out) need no scheduled job.
import { type Subscription, GRACE_DAYS, addDays, daysBetween } from './state.ts';

export type Level = 'full' | 'full_with_warning' | 'billing_only';
export interface Access { level: Level; daysLeft: number | null }

export function access(s: Subscription | null, today: string): Access {
  const billingOnly: Access = { level: 'billing_only', daysLeft: null };
  if (!s || s.status === 'pending' || s.status === 'cancelled') return billingOnly;
  const end = s.currentPeriodEnd;
  if (s.status === 'active' && end && today <= end) return { level: 'full', daysLeft: null };
  const graceEnd = s.status === 'past_due' ? s.graceUntil : s.cancelAtPeriodEnd || !end ? null : addDays(end, GRACE_DAYS);
  if (graceEnd && today <= graceEnd) return { level: 'full_with_warning', daysLeft: daysBetween(today, graceEnd) };
  return billingOnly;
}
