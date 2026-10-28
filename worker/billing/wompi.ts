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

type WompiEnvironment = 'test' | 'prod';

function apiUrl(environment: WompiEnvironment, key: string, kind: 'pub' | 'prv'): string {
  if ((environment !== 'test' && environment !== 'prod') || !new RegExp(`^${kind}_${environment}_[a-zA-Z0-9]+$`).test(key)) throw new Error('Invalid Wompi configuration');
  return environment === 'test' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
}

async function responseData(response: Response): Promise<ObjectValue> {
  if (!response.ok) throw new Error('Wompi request failed');
  const body: unknown = await response.json();
  if (!object(body) || !object(body.data)) throw new Error('Invalid Wompi response');
  return body.data;
}

export async function merchantPolicies(environment: WompiEnvironment, publicKey: string): Promise<{ acceptanceToken: string; acceptanceUrl: string; personalAuthToken: string; personalAuthUrl: string }> {
  const base = apiUrl(environment, publicKey, 'pub');
  const data = await responseData(await fetch(`${base}/merchants/info`, { headers: { 'x-merchant-public-key': publicKey }, redirect: 'error' }));
  const acceptance = data.presigned_acceptance;
  const personal = data.presigned_personal_data_auth;
  const valid = (v: unknown): v is ObjectValue & { acceptance_token: string; permalink: string } => {
    if (!object(v) || typeof v.acceptance_token !== 'string' || !v.acceptance_token || typeof v.permalink !== 'string') return false;
    try { return new URL(v.permalink).protocol === 'https:'; } catch { return false; }
  };
  if (!valid(acceptance) || !valid(personal)) throw new Error('Invalid Wompi policies');
  return { acceptanceToken: acceptance.acceptance_token, acceptanceUrl: acceptance.permalink, personalAuthToken: personal.acceptance_token, personalAuthUrl: personal.permalink };
}

// A lookup alone is not settlement: compare it with the saved purchase and merchant before crediting.
async function transactionData(environment: WompiEnvironment, privateKey: string, id: string): Promise<ObjectValue> {
  const base = apiUrl(environment, privateKey, 'prv');
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(id)) throw new Error('Invalid Wompi transaction ID');
  const data = await responseData(await fetch(`${base}/transactions/${id}`, { headers: { Authorization: `Bearer ${privateKey}`, Accept: 'application/json' }, redirect: 'error' }));
  if (data.id !== id || typeof data.reference !== 'string' || !data.reference || typeof data.status !== 'string' || !['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(data.status) || !Number.isSafeInteger(data.amount_in_cents) || (data.amount_in_cents as number) <= 0 || data.currency !== 'COP') throw new Error('Invalid Wompi transaction');
  return data;
}

export async function lookupTransaction(environment: WompiEnvironment, privateKey: string, id: string): Promise<{ id: string; reference: string; status: string; amountCents: number; currency: string }> {
  const data = await transactionData(environment, privateKey, id);
  return { id, reference: data.reference as string, status: data.status as string, amountCents: data.amount_in_cents as number, currency: data.currency as string };
}

// Provider link identity is required before deciding which payments to record.
export async function lookupPaymentLinkTransaction(environment: WompiEnvironment, privateKey: string, id: string): Promise<{ id: string; reference: string; status: string; amountCents: number; currency: string; paymentLinkId: string | null; customerEmail: string | null; finalizedAt: string | null }> {
  const data = await transactionData(environment, privateKey, id);
  if ((!Object.hasOwn(data, 'payment_link_id') || (data.payment_link_id !== null && (typeof data.payment_link_id !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(data.payment_link_id)))) || (data.customer_email != null && (typeof data.customer_email !== 'string' || data.customer_email.length > 320)) || (data.finalized_at != null && (typeof data.finalized_at !== 'string' || !Number.isFinite(Date.parse(data.finalized_at))))) throw new Error('Invalid link transaction');
  return { id, reference: data.reference as string, status: data.status as string, amountCents: data.amount_in_cents as number, currency: data.currency as string, paymentLinkId: data.payment_link_id, customerEmail: data.customer_email as string | null ?? null, finalizedAt: data.finalized_at as string | null ?? null };
}

export async function lookupLinkTransaction(environment: WompiEnvironment, privateKey: string, id: string, linkId: string): Promise<{ id: string; reference: string; status: string; amountCents: number; currency: string; paymentLinkId: string; customerEmail: string | null; finalizedAt: string | null }> {
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(linkId)) throw new Error('Invalid payment link ID');
  const transaction = await lookupPaymentLinkTransaction(environment, privateKey, id);
  if (transaction.paymentLinkId !== linkId) throw new Error('Invalid link transaction');
  return { ...transaction, paymentLinkId: linkId };
}
