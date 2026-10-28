import type { DB } from '../db.ts';
import { lookupPaymentLinkTransaction, verifyTransactionEvent } from './wompi.ts';

const LIMIT = 32768;
const reply = (status: number): Response => new Response(null, { status });

export async function wompiWebhook(request: Request, env: { DB: DB; ENVIRONMENT: string; WOMPI_ENVIRONMENT?: string; WOMPI_PRIVATE_KEY?: string; WOMPI_EVENTS_SECRET?: string }): Promise<Response> {
  const environment = env.WOMPI_ENVIRONMENT;
  const privateKey = env.WOMPI_PRIVATE_KEY;
  const secret = env.WOMPI_EVENTS_SECRET;
  if ((environment !== 'test' && environment !== 'prod') || (environment === 'prod') !== (env.ENVIRONMENT === 'production') || !privateKey?.startsWith(`prv_${environment}_`) || !secret?.startsWith(`${environment}_events_`)) return reply(503);
  if (!request.body) return reply(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMIT) { await reader.cancel(); return reply(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    const event = await verifyTransactionEvent(value, secret);
    if (!event || !value || typeof value !== 'object' || !('timestamp' in value) || typeof value.timestamp !== 'number' || value.timestamp <= 0) return reply(400);
    const existing = await env.DB.prepare('SELECT event_timestamp, status, amount_cents, revision FROM wompi_link_payments WHERE transaction_id = ?').bind(event.id).first<{ event_timestamp: number; status: string; amount_cents: number; revision: number }>();
    if (existing && existing.event_timestamp >= value.timestamp) {
      if (existing.event_timestamp > value.timestamp) return reply(200);
      if (existing.amount_cents !== event.amountCents) return reply(503);
      if (existing.status === event.status || (existing.status === 'APPROVED' && event.status === 'PENDING')) return reply(200);
      // Terminal states cannot be ordered by the event's second alone.
      if (!(existing.status === 'PENDING' && ['APPROVED', 'DECLINED', 'ERROR', 'VOIDED'].includes(event.status)) && !(existing.status === 'APPROVED' && event.status === 'VOIDED')) return reply(503);
    }
    if (existing?.status === 'APPROVED' && event.status === 'PENDING') return reply(503);
    const transaction = await lookupPaymentLinkTransaction(environment, privateKey, event.id);
    if (transaction.paymentLinkId !== 'VdTCSO' && transaction.paymentLinkId !== 'VPOS_h9q1ew') return reply(200);
    if (transaction.amountCents !== event.amountCents || transaction.status !== event.status) return reply(503);
    const result = await env.DB.prepare(`INSERT INTO wompi_link_payments (transaction_id, link_id, payer_email, status, amount_cents, currency, occurred_at, event_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (transaction_id) DO UPDATE SET link_id = excluded.link_id, payer_email = excluded.payer_email, status = excluded.status, amount_cents = excluded.amount_cents, currency = excluded.currency, occurred_at = excluded.occurred_at, event_timestamp = excluded.event_timestamp, revision = wompi_link_payments.revision + 1
      WHERE ? = 1 AND wompi_link_payments.revision = ?`)
      .bind(transaction.id, transaction.paymentLinkId, transaction.customerEmail, transaction.status, transaction.amountCents, transaction.currency, transaction.finalizedAt, value.timestamp, existing ? 1 : 0, existing?.revision ?? 0).run();
    if (result.meta.changes !== 1) return reply(503);
    return reply(200);
  } catch {
    return reply(503);
  }
}
