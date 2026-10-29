import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { html, redirect, form, esc } from '../http.ts';
import { page, messageView } from '../views.ts';
import { access, type Access } from './access.ts';
import { applyEvent, readSubscription } from './apply.ts';
import { wa } from '../../site/i18n.mjs';
import { PLANS, priceCop, cop, isPlan } from './plans.ts';
import { TERMS, type Plan } from './state.ts';

const METHODS = ['nequi', 'daviplata', 'tarjeta', 'bancolombia', 'avvillas', 'efecty', 'remitly', 'western', 'moneygram', 'otro'];

const audit = (db: DB, actor: Session, action: string, target: string, now: number, detail: string) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (?, ?, ?, ?, ?)').bind(actor.userId, action, target, now, detail);

export const warningBanner = (a: Access): string =>
  `<p class="notice" role="status">Tu plan vence ${a.daysLeft === 0 ? 'hoy' : `en ${a.daysLeft} ${a.daysLeft === 1 ? 'día' : 'días'}`}. <a href="/app/cuenta/">Renovar plan</a></p>`;

export async function billingSection(db: DB, s: Session, today: string): Promise<string> {
  const sub = await readSubscription(db, s.userId);
  if (!sub) return '<p>Tu cuenta todavía no tiene un plan asignado. Escríbele a Mauricio.</p>';
  const a = access(sub, today);
  const { results } = await db.prepare('SELECT period_start, months, amount_cop, status, provider, method FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 24')
    .bind(s.userId).all<{ period_start: string; months: number; amount_cop: number; status: string; provider: string; method: string | null }>();
  return `<h2 class="app-subtitle">Tu plan</h2>
<dl class="summary">
<div><dt>Plan</dt><dd>${esc(PLANS[sub.plan].name)}</dd></div>
<div><dt>Acceso</dt><dd>${a.level === 'billing_only' ? 'En pausa' : 'Activo'}${sub.cancelAtPeriodEnd ? ', termina al vencer' : ''}</dd></div>
<div><dt>Pagado hasta</dt><dd>${esc(sub.currentPeriodEnd ?? 'Sin pagos')}</dd></div>
</dl>
${a.level === 'billing_only' ? '<p class="notice">Tu acceso está en pausa hasta que se registre tu pago. Tus datos siguen guardados.</p>' : ''}
<div class="payment-panel">
<h2>Renueva tu plan</h2>
<p>Elige el periodo e ingresa el valor correspondiente en Wompi:</p>
<ul>${TERMS.map((m) => `<li>${m} ${m === 1 ? 'mes' : 'meses'} · ${cop(priceCop(sub.plan, m))}</li>`).join('')}</ul>
<div class="payment-links"><a class="button" href="https://checkout.wompi.co/l/VPOS_h9q1ew">Pagar con Wompi ↗</a>
<a href="${wa('Hola, quiero enviar mi comprobante de pago')}">Enviar comprobante por WhatsApp ↗</a></div>
<p class="small">Después de pagar, envía tu comprobante. Mauricio confirmará y registrará el pago para activar tu acceso.</p>
</div>
<h2 class="app-subtitle">Pagos</h2>
${results.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Meses</th><th>Valor</th><th>Estado</th><th>Medio</th></tr></thead><tbody>
${results.map((p) => `<tr><td>${esc(p.period_start)}</td><td>${p.months}</td><td>${cop(p.amount_cop)}</td><td>${p.status === 'paid' ? 'Pagado' : p.status === 'failed' ? 'Fallido' : esc(p.status)}</td><td>${esc(p.method ?? p.provider)}</td></tr>`).join('\n')}
</tbody></table>` : '<p>Todavía no hay pagos registrados.</p>'}`;
}

export async function manualPayment(request: Request, db: DB, s: Session, id: string, today: string, now: number): Promise<Response> {
  const f = await form(request);
  const months = Number(f.months);
  const amount = Number(f.amount);
  const reference = (f.reference ?? '').trim().slice(0, 80);
  if (!TERMS.includes(months) || !Number.isInteger(amount) || amount <= 0 || !METHODS.includes(f.method ?? '') || !reference) {
    return html(messageView('Pago incompleto', 'Indica meses, un valor mayor que cero, medio y la referencia del comprobante.', s), 400);
  }
  const r = await applyEvent(db, { provider: 'manual', providerEventId: `manual:${crypto.randomUUID()}`, userId: id, event: { kind: 'payment_succeeded', months }, amountCop: amount, method: f.method, reference }, today, now);
  if (r.outcome !== 'applied') return html(messageView('No se registró', r.error ?? 'Ese miembro no tiene plan asignado.', s), 400);
  await audit(db, s, 'billing.manual_payment', id, now, `${months} months, ${amount} COP, ${f.method}, ${reference}`).run();
  return redirect(`/admin/miembros/${id}/`);
}

export async function override(request: Request, db: DB, s: Session, id: string, today: string, now: number): Promise<Response> {
  const f = await form(request);
  const reason = (f.reason ?? '').trim().slice(0, 200);
  if (!reason) return html(messageView('Falta el motivo', 'Cada cambio manual necesita un motivo.', s), 400);
  const sub = await readSubscription(db, id);
  if (!sub) return html(messageView('Sin plan', 'Ese miembro no tiene plan asignado.', s), 404);
  if (f.action === 'cancel_now') {
    const r = await applyEvent(db, { provider: 'admin', providerEventId: `admin:${crypto.randomUUID()}`, userId: id, event: { kind: 'cancel_now' } }, today, now);
    if (r.outcome !== 'applied') return html(messageView('No se canceló', r.error ?? '', s), 400);
    await audit(db, s, 'billing.cancel_now', id, now, reason).run();
  } else if (f.action === 'set_plan' && isPlan(f.plan ?? '')) {
    await db.batch([
      db.prepare('UPDATE subscriptions SET plan = ?, updated_at = ? WHERE user_id = ?').bind(f.plan, now, id),
      audit(db, s, 'billing.set_plan', id, now, `${f.plan}: ${reason}`),
    ]);
  } else {
    return html(messageView('Acción no válida', 'Esa acción no existe.', s), 400);
  }
  return redirect(`/admin/miembros/${id}/`);
}

export async function adminBillingForm(db: DB, id: string, today: string): Promise<string> {
  const sub = await readSubscription(db, id);
  if (!sub) return '<p>Sin plan asignado.</p>';
  const a = access(sub, today);
  return `<h2 class="app-subtitle">Plan y pagos</h2>
<p>${esc(PLANS[sub.plan].name)}, ${a.level === 'billing_only' ? 'acceso en pausa' : 'acceso activo'}, pagado hasta ${esc(sub.currentPeriodEnd ?? 'sin pagos')}.</p>
<form method="post" action="/admin/miembros/${esc(id)}/pago-manual/" class="app-form">
<label class="field"><span>Meses</span><select name="months">${TERMS.map((m) => `<option>${m}</option>`).join('')}</select></label>
<label class="field"><span>Valor en COP</span><input name="amount" inputmode="numeric" value="${PLANS[sub.plan].monthlyCop}" required></label>
<label class="field"><span>Medio</span><select name="method">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></label>
<label class="field"><span>Referencia del comprobante</span><input name="reference" required></label>
<button class="button">Registrar pago manual</button>
</form>
<form method="post" action="/admin/miembros/${esc(id)}/facturacion/" class="app-form">
<label class="field"><span>Cambio manual</span><select name="action"><option value="set_plan">Cambiar plan</option><option value="cancel_now">Cancelar ya</option></select></label>
<label class="field"><span>Plan (para cambiar plan)</span><select name="plan">${Object.entries(PLANS).map(([k, p]) => `<option value="${k}"${k === sub.plan ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label>
<label class="field"><span>Motivo</span><input name="reason" required></label>
<button class="button">Aplicar</button>
</form>`;
}

export async function adminBilling(db: DB, s: Session, today: string): Promise<Response> {
  const { results } = await db.prepare(`SELECT u.id, u.name, u.phone, b.plan, b.status, b.current_period_end, b.grace_until, b.cancel_at_period_end
    FROM subscriptions b JOIN users u ON u.id = b.user_id WHERE u.role = 'member' AND u.status != 'deactivated' ORDER BY u.name`)
    .all<{ id: string; name: string; phone: string | null; plan: Plan; status: 'pending' | 'active' | 'past_due' | 'cancelled'; current_period_end: string | null; grace_until: string | null; cancel_at_period_end: number }>();
  const rows = results.map((r) => ({ ...r, a: access({ status: r.status, plan: r.plan, currentPeriodEnd: r.current_period_end, graceUntil: r.grace_until, cancelAtPeriodEnd: r.cancel_at_period_end === 1 }, today) }));
  const count = (level: string) => rows.filter((r) => r.a.level === level).length;
  const due = rows.filter((r) => r.a.level === 'full_with_warning');
  const remind = (r: (typeof rows)[number]) => {
    const text = encodeURIComponent(`Hola ${r.name}, tu plan FitMagra vence ${r.a.daysLeft === 0 ? 'hoy' : `en ${r.a.daysLeft} días`}. Recuerda enviar tu comprobante de pago.`);
    return r.phone ? `<a href="https://wa.me/${esc(r.phone)}?text=${text}">Recordar por WhatsApp</a>` : 'Sin teléfono';
  };
  return html(page('Facturación', `<h1 class="app-title">Facturación</h1>
<dl class="summary">
<div><dt>Al día</dt><dd>${count('full')}</dd></div>
<div><dt>Pago pendiente</dt><dd>${count('full_with_warning')}</dd></div>
<div><dt>Sin acceso</dt><dd>${count('billing_only')}</dd></div>
</dl>
<h2 class="app-subtitle">Pago pendiente</h2>
${due.length ? `<table class="table"><thead><tr><th>Miembro</th><th>Plan</th><th>Días para vencer</th><th>Recordatorio</th></tr></thead><tbody>
${due.map((r) => `<tr><td><a href="/admin/miembros/${esc(r.id)}/">${esc(r.name)}</a></td><td>${esc(PLANS[r.plan].name)}</td><td>${r.a.daysLeft}</td><td>${remind(r)}</td></tr>`).join('\n')}
</tbody></table>` : '<p>Nadie tiene pagos pendientes.</p>'}
<h2 class="app-subtitle">Pagos recientes</h2>
${await recentPayments(db)}`, s));
}

async function recentPayments(db: DB): Promise<string> {
  const { results } = await db.prepare('SELECT u.name, p.period_start, p.amount_cop, p.status, p.provider, p.method FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 30')
    .all<{ name: string; period_start: string; amount_cop: number; status: string; provider: string; method: string | null }>();
  if (!results.length) return '<p>Sin pagos todavía.</p>';
  return `<table class="table"><thead><tr><th>Miembro</th><th>Fecha</th><th>Valor</th><th>Estado</th><th>Medio</th></tr></thead><tbody>
${results.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.period_start)}</td><td>${cop(p.amount_cop)}</td><td>${esc(p.status)}</td><td>${esc(p.method ?? p.provider)}</td></tr>`).join('\n')}
</tbody></table>`;
}
