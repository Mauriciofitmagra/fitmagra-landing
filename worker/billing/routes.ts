import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { html, redirect, form, esc } from '../http.ts';
import { page, messageView } from '../views.ts';
import { access, type Access } from './access.ts';
import { applyEvent, readSubscription } from './apply.ts';
import { getProvider } from './provider.ts';
import { PLANS, priceCop, cop, isPlan } from './plans.ts';
import { GRACE_DAYS, TERMS, addDays, type Plan } from './state.ts';

const STATUS: Record<string, string> = { pending: 'Pendiente de pago', active: 'Activo', past_due: 'Pago pendiente', cancelled: 'Cancelado' };
const METHODS = ['nequi', 'daviplata', 'tarjeta', 'bancolombia', 'avvillas', 'efecty', 'remitly', 'western', 'moneygram', 'otro'];

const audit = (db: DB, actor: Session, action: string, target: string, now: number, detail: string) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (?, ?, ?, ?, ?)').bind(actor.userId, action, target, now, detail);

export const warningBanner = (a: Access): string =>
  `<p class="notice" role="status">Tu pago está pendiente. Te quedan ${a.daysLeft} días para pagar antes de que se pause tu acceso. <a href="/app/cuenta/">Pagar</a></p>`;

export async function billingSection(db: DB, s: Session, today: string): Promise<string> {
  const sub = await readSubscription(db, s.userId);
  if (!sub) return '<p>Tu cuenta todavía no tiene un plan asignado. Escríbele a Mauricio.</p>';
  const a = access(sub, today);
  const { results } = await db.prepare('SELECT period_start, months, amount_cop, status, provider, method FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 24')
    .bind(s.userId).all<{ period_start: string; months: number; amount_cop: number; status: string; provider: string; method: string | null }>();
  return `<h2 class="app-subtitle">Tu plan</h2>
<dl class="summary">
<div><dt>Plan</dt><dd>${esc(PLANS[sub.plan].name)}</dd></div>
<div><dt>Estado</dt><dd>${esc(STATUS[sub.status])}${sub.cancelAtPeriodEnd ? ', se cancela al final del periodo' : ''}</dd></div>
<div><dt>Pagado hasta</dt><dd>${esc(sub.currentPeriodEnd ?? 'Sin pagos')}</dd></div>
</dl>
${a.level === 'billing_only' ? '<p class="notice">Tu acceso está en pausa hasta que se registre tu pago. Tus datos siguen guardados.</p>' : ''}
<form method="post" action="/app/pagar/" class="app-form">
<label class="field"><span>Pagar</span><select name="months">${TERMS.map((m) => `<option value="${m}">${m} ${m === 1 ? 'mes' : 'meses'}, ${cop(priceCop(sub.plan, m))}</option>`).join('')}</select></label>
<button class="button">Pagar en línea</button>
</form>
<p class="small">También puedes pagar por Nequi, Daviplata, transferencia o Efecty y enviarle el comprobante a Mauricio por WhatsApp.</p>
<h2 class="app-subtitle">Pagos</h2>
${results.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Meses</th><th>Valor</th><th>Estado</th><th>Medio</th></tr></thead><tbody>
${results.map((p) => `<tr><td>${esc(p.period_start)}</td><td>${p.months}</td><td>${cop(p.amount_cop)}</td><td>${p.status === 'paid' ? 'Pagado' : p.status === 'failed' ? 'Fallido' : esc(p.status)}</td><td>${esc(p.method ?? p.provider)}</td></tr>`).join('\n')}
</tbody></table>` : '<p>Todavía no hay pagos registrados.</p>'}`;
}

export async function startPayment(request: Request, db: DB, env: { ENVIRONMENT: string; BILLING_PROVIDER?: string }, s: Session): Promise<Response> {
  let provider = null;
  try { provider = getProvider(env); } catch { provider = null; }
  if (!provider) return html(messageView('Pago en línea no disponible', 'El pago en línea todavía no está activo. Paga por Nequi, Daviplata o transferencia y envíale el comprobante a Mauricio.', s), 503);
  const sub = await readSubscription(db, s.userId);
  const months = Number((await form(request)).months);
  if (!sub || !TERMS.includes(months)) return html(messageView('Datos no válidos', 'Elige 1, 2 o 3 meses.', s), 400);
  const ref = `${months}.${crypto.randomUUID()}`;
  const { redirectUrl } = await provider.startCheckout({ userId: s.userId, plan: sub.plan, months, amountCop: priceCop(sub.plan, months), ref });
  return redirect(redirectUrl);
}

// The stub stands in for a provider's checkout page outside production: two buttons that send the events a real webhook would.
export function stubPage(request: Request, s: Session): Response {
  const ref = new URL(request.url).searchParams.get('ref') ?? '';
  return html(page('Pago de prueba', `<h1 class="app-title">Pago de prueba</h1>
<p class="notice">Esto es una simulación. No se cobra nada. Solo existe fuera de producción.</p>
<form method="post" action="/api/billing/stub/" class="app-form"><input type="hidden" name="ref" value="${esc(ref)}">
<button class="button" name="outcome" value="success">Simular pago exitoso</button>
<button class="button" name="outcome" value="failure">Simular pago rechazado</button>
</form>`, s));
}

export async function stubResult(request: Request, db: DB, s: Session, today: string, now: number): Promise<Response> {
  const { ref = '', outcome = '' } = await form(request);
  const sub = await readSubscription(db, s.userId);
  if (!sub) return redirect('/app/cuenta/');
  const months = TERMS.includes(Number(ref.split('.')[0])) ? Number(ref.split('.')[0]) : 1;
  const event = outcome === 'success' ? { kind: 'payment_succeeded' as const, months } : { kind: 'payment_failed' as const };
  await applyEvent(db, { provider: 'stub', providerEventId: `stub:${ref}:${outcome}`, userId: s.userId, event, amountCop: priceCop(sub.plan, months), providerRef: ref }, today, now);
  return redirect('/app/cuenta/');
}

export async function manualPayment(request: Request, db: DB, s: Session, id: string, today: string, now: number): Promise<Response> {
  const f = await form(request);
  const months = Number(f.months);
  const amount = Number(f.amount);
  const reference = (f.reference ?? '').trim().slice(0, 80);
  if (!TERMS.includes(months) || !Number.isInteger(amount) || amount < 0 || !METHODS.includes(f.method ?? '') || !reference) {
    return html(messageView('Pago incompleto', 'Indica meses, valor, medio y la referencia del comprobante.', s), 400);
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
  if (f.action === 'extend_grace') {
    const days = Number(f.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) return html(messageView('Días no válidos', 'Entre 1 y 30 días.', s), 400);
    await db.batch([
      db.prepare("UPDATE subscriptions SET status = CASE WHEN status = 'active' THEN 'active' ELSE 'past_due' END, grace_until = ?, updated_at = ? WHERE user_id = ?").bind(addDays(today, days), now, id),
      audit(db, s, 'billing.extend_grace', id, now, `${days} days: ${reason}`),
    ]);
  } else if (f.action === 'cancel_now') {
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
<p>${esc(PLANS[sub.plan].name)}, ${esc(STATUS[sub.status])}, pagado hasta ${esc(sub.currentPeriodEnd ?? 'sin pagos')}${a.daysLeft !== null ? `, ${a.daysLeft} días de gracia` : ''}.</p>
<form method="post" action="/admin/miembros/${esc(id)}/pago-manual/" class="app-form">
<label class="field"><span>Meses</span><select name="months">${TERMS.map((m) => `<option>${m}</option>`).join('')}</select></label>
<label class="field"><span>Valor en COP</span><input name="amount" inputmode="numeric" value="${PLANS[sub.plan].monthlyCop}" required></label>
<label class="field"><span>Medio</span><select name="method">${METHODS.map((m) => `<option>${m}</option>`).join('')}</select></label>
<label class="field"><span>Referencia del comprobante</span><input name="reference" required></label>
<button class="button">Registrar pago manual</button>
</form>
<form method="post" action="/admin/miembros/${esc(id)}/facturacion/" class="app-form">
<label class="field"><span>Cambio manual</span><select name="action"><option value="extend_grace">Extender gracia</option><option value="set_plan">Cambiar plan</option><option value="cancel_now">Cancelar ya</option></select></label>
<label class="field"><span>Días (para extender gracia)</span><input name="days" inputmode="numeric" value="7"></label>
<label class="field"><span>Plan (para cambiar plan)</span><select name="plan">${Object.entries(PLANS).map(([k, p]) => `<option value="${k}"${k === sub.plan ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label>
<label class="field"><span>Motivo</span><input name="reason" required></label>
<button class="button">Aplicar</button>
</form>`;
}

// Reminders go out on day 0, 3 and 6 of grace (spec 13.3). Until a sending channel is approved (Q16), the admin sends them by hand.
const REMIND_ON = [0, 3, 6];

export async function adminBilling(db: DB, s: Session, today: string): Promise<Response> {
  const { results } = await db.prepare(`SELECT u.id, u.name, u.phone, b.plan, b.status, b.current_period_end, b.grace_until, b.cancel_at_period_end
    FROM subscriptions b JOIN users u ON u.id = b.user_id WHERE u.role = 'member' AND u.status != 'deactivated' ORDER BY u.name`)
    .all<{ id: string; name: string; phone: string | null; plan: Plan; status: 'pending' | 'active' | 'past_due' | 'cancelled'; current_period_end: string | null; grace_until: string | null; cancel_at_period_end: number }>();
  const rows = results.map((r) => ({ ...r, a: access({ status: r.status, plan: r.plan, currentPeriodEnd: r.current_period_end, graceUntil: r.grace_until, cancelAtPeriodEnd: r.cancel_at_period_end === 1 }, today) }));
  const count = (level: string) => rows.filter((r) => r.a.level === level).length;
  const due = rows.filter((r) => r.a.level === 'full_with_warning');
  const remind = (r: (typeof rows)[number]) => {
    const text = encodeURIComponent(`Hola ${r.name}, tu pago de FitMagra está pendiente. Te quedan ${r.a.daysLeft} días antes de que se pause tu acceso.`);
    return r.phone ? `<a href="https://wa.me/${esc(r.phone)}?text=${text}">Recordar por WhatsApp</a>` : 'Sin teléfono';
  };
  return html(page('Facturación', `<h1 class="app-title">Facturación</h1>
<dl class="summary">
<div><dt>Al día</dt><dd>${count('full')}</dd></div>
<div><dt>Pago pendiente</dt><dd>${count('full_with_warning')}</dd></div>
<div><dt>Sin acceso</dt><dd>${count('billing_only')}</dd></div>
</dl>
<h2 class="app-subtitle">Pago pendiente</h2>
${due.length ? `<table class="table"><thead><tr><th>Miembro</th><th>Plan</th><th>Días de gracia</th><th>Recordatorio</th></tr></thead><tbody>
${due.map((r) => `<tr><td><a href="/admin/miembros/${esc(r.id)}/">${esc(r.name)}</a></td><td>${esc(PLANS[r.plan].name)}</td><td>${r.a.daysLeft}</td><td>${REMIND_ON.includes(GRACE_DAYS - (r.a.daysLeft ?? 0)) ? `Hoy: ${remind(r)}` : remind(r)}</td></tr>`).join('\n')}
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
