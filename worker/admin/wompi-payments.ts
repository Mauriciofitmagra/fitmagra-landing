import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { esc, html } from '../http.ts';
import { page } from '../views.ts';

interface Payment {
  transaction_id: string; link_id: string | null; payer_name: string | null; payer_email: string | null;
  status: string; amount_cents: number; occurred_at: string | null;
}
const statusLabel: Record<string, string> = { APPROVED: 'Aprobado', PENDING: 'Pendiente', DECLINED: 'Rechazado', VOIDED: 'Anulado', ERROR: 'Error' };

function cop(cents: bigint): string {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${whole},${(cents % 100n).toString().padStart(2, '0')} COP`;
}

export async function wompiPayments(db: DB, session: Session): Promise<Response> {
  const { results } = await db.prepare('SELECT transaction_id, link_id, payer_name, payer_email, status, amount_cents, occurred_at FROM wompi_link_payments WHERE link_id IN (?, ?) ORDER BY occurred_at DESC, transaction_id DESC').bind('VdTCSO', 'VPOS_h9q1ew').all<Payment>();
  const total = results.reduce((sum, payment) => sum + (payment.status === 'APPROVED' ? BigInt(payment.amount_cents) : 0n), 0n);
  const rows = results.map((p) => `<tr><td>${esc(p.occurred_at ?? '—')}</td><td>${esc(p.transaction_id)}</td><td>${esc(p.link_id ?? '—')}</td><td>${esc(p.payer_name ?? '—')}</td><td>${esc(p.payer_email ?? '—')}</td><td>${esc(statusLabel[p.status] ?? p.status)}</td><td>${esc(cop(BigInt(p.amount_cents)))}</td></tr>`).join('');
  return html(page('Pagos por enlace Wompi', `<h1 class="app-title">Pagos por enlace Wompi</h1>
<p class="notice">La sincronización con Wompi no está conectada. Esta lista no representa el historial completo.</p>
${results.length ? `<p>Total bruto de pagos aprobados registrados de ambos enlaces: <strong>${esc(cop(total))}</strong>. Sin conciliar; no refleja comisiones, devoluciones ni liquidaciones.</p>` : '<p>Sin conciliar; no refleja comisiones, devoluciones ni liquidaciones.</p>'}
${results.length ? `<div class="table-scroll" role="region" aria-label="Pagos por enlace Wompi" tabindex="0"><table class="table"><thead><tr><th>Fecha</th><th>Transacción</th><th>Enlace</th><th>Pagador</th><th>Correo</th><th>Estado</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Sin pagos registrados.</p>'}
<p><a href="/admin/">Volver a miembros</a></p>`, session));
}
