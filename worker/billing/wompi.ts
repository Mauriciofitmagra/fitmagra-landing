import { sha256Hex } from '../auth/tokens.ts';

// Wompi signs reference + amount in cents + currency + integrity secret, server-side.
export async function checkoutIntegrity(reference: string, amountCents: number, secret: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(reference) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !secret) {
    throw new Error('Invalid checkout parameters');
  }
  return sha256Hex(`${reference}${amountCents}COP${secret}`);
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);

// A valid checksum does not authenticate fields omitted from properties; fetch the transaction before settlement.
export async function verifyTransactionEvent(value: unknown, secret: string): Promise<{ id: string; status: string; amountCents: number } | null> {
  if (!secret || !object(value) || value.event !== 'transaction.updated' || !object(value.data) || !object(value.signature)) return null;
  const { properties, checksum } = value.signature;
  if (!Array.isArray(properties) || properties.length > 32 || !properties.every((p) => typeof p === 'string') || typeof checksum !== 'string' || !/^[a-f\d]{64}$/i.test(checksum) || !Number.isSafeInteger(value.timestamp)) return null;
  if (!['transaction.id', 'transaction.status', 'transaction.amount_in_cents'].every((p) => properties.includes(p))) return null;
  const values: string[] = [];
  for (const property of properties) {
    if (!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/.test(property)) return null;
    let current: unknown = value.data;
    for (const key of property.split('.')) {
      if (!object(current) || !Object.hasOwn(current, key)) return null;
      current = current[key];
    }
    if (typeof current !== 'string' && !(typeof current === 'number' && Number.isSafeInteger(current))) return null;
    values.push(String(current));
  }
  const expected = await sha256Hex(`${values.join('')}${value.timestamp}${secret}`);
  const supplied = checksum.toLowerCase();
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (difference || !object(value.data.transaction)) return null;
  const transaction = value.data.transaction;
  if (typeof transaction.id !== 'string' || !transaction.id || typeof transaction.status !== 'string' || !Number.isSafeInteger(transaction.amount_in_cents) || (transaction.amount_in_cents as number) <= 0) return null;
  return { id: transaction.id, status: transaction.status, amountCents: transaction.amount_in_cents as number };
}
