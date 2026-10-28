import { sha256Hex } from '../auth/tokens.ts';

// Wompi signs reference + amount in cents + currency + integrity secret, server-side.
export async function checkoutIntegrity(reference: string, amountCents: number, secret: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(reference) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !secret) {
    throw new Error('Invalid checkout parameters');
  }
  return sha256Hex(`${reference}${amountCents}COP${secret}`);
}
