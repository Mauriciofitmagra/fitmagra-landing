import type { Plan } from './state.ts';

// Today's monthly prices and prepaid discounts from the current site. Both are open questions (spec Q5, Q14).
export const PLANS: Record<Plan, { name: string; monthlyCop: number }> = {
  standard: { name: 'Standard', monthlyCop: 250_000 },
  elite: { name: 'Elite', monthlyCop: 400_000 },
  platino: { name: 'Platino', monthlyCop: 600_000 },
};
const DISCOUNT: Record<number, number> = { 1: 0, 2: 0.1, 3: 0.15 };

export const isPlan = (p: string): p is Plan => p in PLANS;
export const priceCop = (plan: Plan, months: number): number => Math.round(PLANS[plan].monthlyCop * months * (1 - (DISCOUNT[months] ?? 0)));
export const cop = (n: number): string => `$${n.toLocaleString('es-CO')}`;
