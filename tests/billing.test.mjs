import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, send, login, upload, JPEG } from './helpers.mjs';
import { applyEvent } from '../worker/billing/apply.ts';
import { priceCop } from '../worker/billing/plans.ts';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const subOf = (env, id) => env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(id).first();
const setSub = (env, id, status, periodEnd = null, grace = null) =>
  env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, status, current_period_end, grace_until, cancel_at_period_end, updated_at) VALUES (?, 'elite', ?, ?, ?, 0, 0)
    ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, current_period_end = excluded.current_period_end, grace_until = excluded.grace_until`).bind(id, status, periodEnd, grace).run();

test('paid access lasts 30 days per month and blocks private files after expiry', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-01-01', pose: 'front' } });
  const photo = await env.DB.prepare("SELECT id FROM photos WHERE user_id = 'ana'").first();
  await setSub(env, 'ana', 'pending');
  await applyEvent(env.DB, { provider: 'manual', providerEventId: 'thirty', userId: 'ana', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 400000 }, '2026-01-01', 1);
  assert.equal((await subOf(env, 'ana')).current_period_end, '2026-01-31');
  const file = await send(env, `/app/archivos/${photo.id}`, { cookie: ana });
  assert.equal(file.headers.get('location'), '/app/cuenta/');
  const admin = await login(env, 'admin1');
  assert.equal((await send(env, `/app/archivos/${photo.id}`, { cookie: admin })).status, 200);
  assert.equal((await send(env, '/admin/miembros/ana/pago-manual/', { method: 'POST', cookie: admin, form: { months: '1', amount: '0', method: 'tarjeta', reference: 'ABC' } })).status, 400);
  assert.equal((await send(env, '/admin/miembros/ana/pago-manual/', { method: 'POST', cookie: admin, form: { months: '1', amount: '400000', method: 'tarjeta', reference: 'ABC' } })).status, 303);
  assert.equal((await send(env, `/app/archivos/${photo.id}`, { cookie: ana })).status, 200);
});

test('an expired account offers Wompi and receipt instructions but cannot simulate payment', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await setSub(env, 'ana', 'pending');
  const body = await (await send(env, '/app/cuenta/', { cookie: ana })).text();
  assert.match(body, /https:\/\/checkout\.wompi\.co\/l\/VPOS_h9q1ew/);
  assert.match(body, /comprobante/);
  assert.match(body, /https:\/\/wa\.me\/573165754416\?/);
  assert.equal((await send(env, '/api/billing/stub/', { method: 'POST', cookie: ana, form: { ref: 'fake', outcome: 'success' } })).status, 404);
  assert.equal((await subOf(env, 'ana')).status, 'pending');
});

test('prices follow the current plans and the prepaid discounts', () => {
  assert.equal(priceCop('standard', 1), 250000);
  assert.equal(priceCop('elite', 2), 720000);
  assert.equal(priceCop('platino', 3), 1530000);
});

test('provisioning a member creates a pending subscription with the chosen plan and phone', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  await send(env, '/admin/miembros/', { method: 'POST', cookie: admin, form: { name: 'Laura', email: 'laura@x.co', role: 'member', plan: 'platino', phone: '+57 300 123 4567' } });
  const id = (await env.DB.prepare("SELECT id, phone FROM users WHERE email = 'laura@x.co'").first());
  assert.equal(id.phone, '573001234567');
  const s = await subOf(env, id.id);
  assert.equal(s.plan, 'platino');
  assert.equal(s.status, 'pending');
  assert.equal((await send(env, '/admin/miembros/', { method: 'POST', cookie: admin, form: { name: 'X', email: 'x2@x.co', role: 'member', plan: 'oro' } })).status, 400);
});

test('access gating: pending and lapsed members only reach their account; active members reach everything', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await setSub(env, 'ana', 'pending');
  const gated = await send(env, '/app/peso/', { cookie: ana });
  assert.equal(gated.status, 303);
  assert.equal(gated.headers.get('location'), '/app/cuenta/');
  assert.equal((await send(env, '/app/cuenta/', { cookie: ana })).status, 200);
  await setSub(env, 'ana', 'active', '2099-01-01');
  assert.equal((await send(env, '/app/peso/', { cookie: ana })).status, 200);
});

test('members are reminded shortly before their paid period ends', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const end = new Date(Date.parse(`${today()}T00:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
  await setSub(env, 'ana', 'active', end);
  const res = await send(env, '/app/peso/', { cookie: ana });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Tu plan vence en 3 días/);
});

test('a repeated event id changes nothing', async () => {
  const env = await setup();
  await setSub(env, 'ana', 'pending');
  const ev = { provider: 'stub', providerEventId: 'evt-1', userId: 'ana', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 400000 };
  assert.equal((await applyEvent(env.DB, ev, '2026-11-10', 1)).outcome, 'applied');
  const first = await subOf(env, 'ana');
  assert.equal((await applyEvent(env.DB, ev, '2026-11-11', 2)).outcome, 'duplicate');
  assert.deepEqual(await subOf(env, 'ana'), first);
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM payments').first()).n, 1);
  assert.equal((await applyEvent(env.DB, { ...ev, providerEventId: 'evt-2', event: { kind: 'cancel_requested' } }, '2026-11-11', 3)).outcome, 'applied');
  assert.equal((await applyEvent(env.DB, { ...ev, providerEventId: 'evt-3', userId: 'nobody' }, '2026-11-11', 4)).outcome, 'unknown_member');
});

test('an illegal event is recorded as rejected and the subscription does not move', async () => {
  const env = await setup();
  await setSub(env, 'ana', 'pending');
  const r = await applyEvent(env.DB, { provider: 'stub', providerEventId: 'evt-x', userId: 'ana', event: { kind: 'payment_failed' } }, '2026-11-10', 1);
  assert.equal(r.outcome, 'rejected');
  assert.equal((await subOf(env, 'ana')).status, 'pending');
  assert.ok(await env.DB.prepare("SELECT 1 FROM billing_events WHERE provider_event_id = 'evt-x'").first(), 'kept for audit');
});

test('an admin records a manual payment with a reason, and it goes through the same event path', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  await setSub(env, 'ana', 'pending');
  assert.equal((await send(env, '/admin/miembros/ana/pago-manual/', { method: 'POST', cookie: admin, form: { months: '3', amount: '1020000', method: 'nequi', reference: '' } })).status, 400, 'reference required');
  const res = await send(env, '/admin/miembros/ana/pago-manual/', { method: 'POST', cookie: admin, form: { months: '3', amount: '1020000', method: 'nequi', reference: 'NQ-77' } });
  assert.equal(res.status, 303);
  assert.equal((await subOf(env, 'ana')).status, 'active');
  const pay = await env.DB.prepare("SELECT provider, method, reference, amount_cop FROM payments WHERE user_id = 'ana'").first();
  assert.deepEqual(pay, { provider: 'manual', method: 'nequi', reference: 'NQ-77', amount_cop: 1020000 });
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_log WHERE action = 'billing.manual_payment' AND target_user_id = 'ana'").first());
});

test('admin overrides need a reason and are logged', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  await setSub(env, 'ana', 'past_due', '2026-10-01', '2026-10-08');
  assert.equal((await send(env, '/admin/miembros/ana/facturacion/', { method: 'POST', cookie: admin, form: { action: 'cancel_now', reason: '' } })).status, 400);
  assert.equal((await send(env, '/admin/miembros/ana/facturacion/', { method: 'POST', cookie: admin, form: { action: 'extend_grace', days: '5', reason: 'Viaje' } })).status, 400);
  await send(env, '/admin/miembros/ana/facturacion/', { method: 'POST', cookie: admin, form: { action: 'cancel_now', reason: 'Pidió cancelar' } });
  assert.equal((await subOf(env, 'ana')).status, 'cancelled');
  const actions = (await env.DB.prepare("SELECT action, detail FROM audit_log WHERE target_user_id = 'ana' ORDER BY id").all()).results;
  assert.deepEqual(actions.map((a) => a.action), ['billing.cancel_now']);
  assert.match(actions[0].detail, /Pidió cancelar/);
});

test('the admin billing view counts states and lists who to remind today with a WhatsApp link', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  await env.DB.prepare("UPDATE users SET phone = '573001112233' WHERE id = 'ana'").run();
  await setSub(env, 'ana', 'active', today());
  await setSub(env, 'beto', 'active', '2099-01-01');
  const body = await (await send(env, '/admin/facturacion/', { cookie: admin })).text();
  assert.match(body, /Al día<\/dt><dd>1/);
  assert.match(body, /Pago pendiente<\/dt><dd>1/);
  assert.ok(body.includes('https://wa.me/573001112233?text='), 'reminder link');
  assert.equal((await send(env, '/admin/facturacion/', { cookie: await login(env, 'ana') })).status, 403);
});

test('the member account screen shows plan, status and payment history', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await setSub(env, 'ana', 'pending');
  await applyEvent(env.DB, { provider: 'manual', providerEventId: 'm-1', userId: 'ana', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 400000, method: 'nequi', reference: 'NQ-1' }, today(), 1);
  const body = await (await send(env, '/app/cuenta/', { cookie: ana })).text();
  assert.ok(body.includes('Elite'));
  assert.ok(body.includes('Activo'));
  assert.ok(body.includes('400.000'));
});
