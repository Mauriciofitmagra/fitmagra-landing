import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { esc, html, form, redirect } from '../http.ts';
import { lookupPaymentLinkTransaction } from '../billing/wompi.ts';
import { page } from '../views.ts';

interface Payment {
  transaction_id: string; link_id: string | null; payer_name: string | null; payer_email: string | null;
  status: string; amount_cents: number; occurred_at: string | null;
}
type Config = { ENVIRONMENT: string; WOMPI_ENVIRONMENT?: string; WOMPI_PRIVATE_KEY?: string };

function validConfig(config?: Config): config is Config & { WOMPI_ENVIRONMENT: 'test' | 'prod'; WOMPI_PRIVATE_KEY: string } {
  const environment = config?.WOMPI_ENVIRONMENT;
  return !!config && (environment === 'test' || environment === 'prod') && (environment === 'prod') === (config.ENVIRONMENT === 'production') && new RegExp(`^prv_${environment}_[a-zA-Z0-9]+$`).test(config.WOMPI_PRIVATE_KEY ?? '');
}

const statusLabel: Record<string, string> = { APPROVED: 'Aprobado', PENDING: 'Pendiente', DECLINED: 'Rechazado', VOIDED: 'Anulado', ERROR: 'Error' };

function cop(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${whole},${(cents % 100n).toString().padStart(2, '0')} COP`;
}

export async function wompiPayments(db: DB, session: Session, config?: Config): Promise<Response> {
  const { results } = await db.prepare('SELECT transaction_id, link_id, payer_name, payer_email, status, amount_cents, occurred_at FROM wompi_link_payments WHERE link_id IN (?, ?) ORDER BY occurred_at DESC, transaction_id DESC').bind('VdTCSO', 'VPOS_h9q1ew').all<Payment>();
  const total = results.reduce((sum, payment) => sum + (payment.status === 'APPROVED' ? BigInt(payment.amount_cents) : 0n), 0n);
  const rows = results.map((p) => `<tr><td>${esc(p.occurred_at ?? '—')}</td><td>${esc(p.transaction_id)}</td><td>${esc(p.link_id ?? '—')}</td><td>${esc(p.payer_name ?? '—')}</td><td>${esc(p.payer_email ?? '—')}</td><td>${esc(statusLabel[p.status] ?? p.status)}</td><td>${esc(cop(BigInt(p.amount_cents)))}</td></tr>`).join('');
  return html(page('Pagos por enlace Wompi', `<h1 class="app-title">Pagos por enlace Wompi</h1>
<p class="notice">La sincronización y el histórico aún no están conciliados con Wompi. Esta lista puede estar incompleta.</p>
<form method="post" action="/admin/pagos-wompi/importar/" class="app-form">
<label class="field"><span>ID de transacción</span><input name="id" required maxlength="255" ${validConfig(config) ? '' : 'disabled'}></label>
<button class="button" ${validConfig(config) ? '' : 'disabled'}>Consultar e importar</button>
${validConfig(config) ? '' : '<p>La consulta manual no está configurada.</p>'}
</form>
${results.length ? `<p>Total bruto de pagos aprobados registrados de ambos enlaces: <strong>${esc(cop(total))}</strong>. Sin conciliar; no refleja comisiones, devoluciones ni liquidaciones.</p>` : '<p>Sin conciliar; no refleja comisiones, devoluciones ni liquidaciones.</p>'}
${results.length ? `<div class="table-scroll" role="region" aria-label="Pagos por enlace Wompi" tabindex="0"><table class="table"><thead><tr><th>Fecha</th><th>Transacción</th><th>Enlace</th><th>Pagador</th><th>Correo</th><th>Estado</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Sin pagos registrados.</p>'}
<p><a href="/admin/">Volver a miembros</a></p>`, session));
}

export async function importWompiPayment(request: Request, db: DB, session: Session, config: Config): Promise<Response> {
  const reply = (message: string, status: number) => html(page('Consulta Wompi', `<h1 class="app-title">Consulta Wompi</h1><p>${esc(message)}</p><p><a href="/admin/pagos-wompi/">Volver</a></p>`, session), status, { 'cache-control': 'private, no-store' });
  if (session.role !== 'admin') return reply('Sin acceso.', 403);
  if (!validConfig(config)) return reply('La consulta no está disponible.', 503);
  let id: string;
  try { id = (await form(request)).id ?? ''; } catch { return reply('Solicitud no válida.', 400); }
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(id)) return reply('ID no válido.', 400);
  try {
    const transaction = await lookupPaymentLinkTransaction(config.WOMPI_ENVIRONMENT, config.WOMPI_PRIVATE_KEY, id);
    if (transaction.paymentLinkId !== 'VdTCSO' && transaction.paymentLinkId !== 'VPOS_h9q1ew') return reply('La transacción no pertenece a los enlaces configurados.', 400);
    const saved = await db.prepare(`INSERT INTO wompi_link_payments (transaction_id, link_id, payer_email, status, amount_cents, currency, occurred_at, event_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT (transaction_id) DO NOTHING`)
      .bind(transaction.id, transaction.paymentLinkId, transaction.customerEmail, transaction.status, transaction.amountCents, transaction.currency, transaction.finalizedAt).run();
    if (!saved.meta.changes) return reply('La transacción ya existe y no se actualizó.', 200);
    return redirect('/admin/pagos-wompi/', { 'cache-control': 'private, no-store' });
  } catch {
    return reply('No se pudo consultar la transacción. Inténtalo de nuevo.', 503);
  }
}
