// The provider boundary (spec 13.4). The real adapter is milestone M7, chosen by Roberto from
// docs/superpowers/specs/2026-10-27-fitmagra-payments-colombia-research.md. Until then only the stub exists,
// and it is refused in production. Manual payments do not need a provider: admins record them (billing/routes.ts).
import type { Plan } from './state.ts';

export interface Checkout { userId: string; plan: Plan; months: number; amountCop: number; ref: string }
export interface BillingProvider {
  name: string;
  startCheckout(c: Checkout): Promise<{ redirectUrl: string }>;
}

const stub: BillingProvider = {
  name: 'stub',
  startCheckout: async (c) => ({ redirectUrl: `/api/billing/stub/?ref=${encodeURIComponent(c.ref)}` }),
};

export function getProvider(env: { ENVIRONMENT: string; BILLING_PROVIDER?: string }): BillingProvider | null {
  if (env.BILLING_PROVIDER === 'stub') {
    if (env.ENVIRONMENT === 'production') throw new Error('the stub billing provider is refused in production');
    return stub;
  }
  return null;
}
