// What a member can use, computed from the subscription and today's date on every request (spec 13.2).
// Time-driven changes (a period ending, grace running out) need no scheduled job.
import { type Subscription, daysBetween } from './state.ts';

export type Level = 'full' | 'full_with_warning' | 'billing_only';
export interface Access { level: Level; daysLeft: number | null }

export function access(s: Subscription | null, today: string): Access {
  const billingOnly: Access = { level: 'billing_only', daysLeft: null };
  if (!s || s.status === 'pending' || s.status === 'cancelled') return billingOnly;
  const end = s.currentPeriodEnd;
  if (end && today <= end) {
    const daysLeft = daysBetween(today, end);
    return daysLeft <= 3 && !s.cancelAtPeriodEnd ? { level: 'full_with_warning', daysLeft } : { level: 'full', daysLeft: null };
  }
  return billingOnly;
}
