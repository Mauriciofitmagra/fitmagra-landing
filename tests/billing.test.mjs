import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, send, login } from './helpers.mjs';
import { applyEvent } from '../worker/billing/apply.ts';
import { getProvider } from '../worker/billing/provider.ts';
import { priceCop } from '../worker/billing/plans.ts';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const subOf = (env, id) => env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(id).first();
const setSub = (env, id, status, periodEnd = null, grace = null) =>
  env.DB.prepare(`INSERT INTO subscriptions (user_id, plan, status, current_period_end, grace_until, cancel_at_period_end, updated_at) VALUES (?, 'elite', ?, ?, ?, 0, 0)
    ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, current_period_end = excluded.current_period_end, grace_until = excluded.grace_until`).bind(id, status, periodEnd, grace).run();

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







test('the stub provider is refused in production', async () => {
  assert.throws(() => getProvider({ ENVIRONMENT: 'production', BILLING_PROVIDER: 'stub' }), /stub.*production/);
  assert.equal(getProvider({ ENVIRONMENT: 'staging', BILLING_PROVIDER: 'stub' }).name, 'stub');
  assert.equal(getProvider({ ENVIRONMENT: 'production' }), null, 'no online provider until one is chosen (spec Q2)');
  const env = await setup();
  env.ENVIRONMENT = 'production';
  env.BILLING_PROVIDER = 'stub';
  const ana = await login(env, 'ana');
  await setSub(env, 'ana', 'pending');
  assert.equal((await send(env, '/app/pagar/', { method: 'POST', cookie: ana, form: { months: '1' } })).status, 404);
  assert.equal((await send(env, '/api/billing/stub/', { method: 'POST', cookie: ana, form: { ref: 'r', outcome: 'success' } })).status, 404);
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

test('concurrent distinct successful events do not lose an extension', async () => {
  const env = await setup();
  await setSub(env, 'ana', 'pending');
  const event = (id) => ({ provider: 'stub', providerEventId: id, userId: 'ana', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 400000 });
  const results = await Promise.all([applyEvent(env.DB, event('evt-a'), '2026-11-10', 1), applyEvent(env.DB, event('evt-b'), '2026-11-10', 1)]);
  assert.deepEqual(results.map((r) => r.outcome), ['applied', 'applied']);
  assert.equal((await subOf(env, 'ana')).current_period_end, '2027-01-10');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM payments').first()).n, 2);
});

test('concurrent delivery of one event records only one payment', async () => {
  const env = await setup();
  await setSub(env, 'ana', 'pending');
  const event = { provider: 'stub', providerEventId: 'same-event', userId: 'ana', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 400000 };
  const results = await Promise.all([applyEvent(env.DB, event, '2026-11-10', 1), applyEvent(env.DB, event, '2026-11-10', 1)]);
  assert.deepEqual(results.map((r) => r.outcome).sort(), ['applied', 'duplicate']);
  assert.equal((await subOf(env, 'ana')).current_period_end, '2026-12-10');
  assert.equal((await env.DB.prepare('SELECT count(*) n FROM payments').first()).n, 1);
});

test('an illegal event is recorded as rejected and the subscription does not move', async () => {
  const env = await setup();
  await setSub(env, 'ana', 'pending');
  const r = await applyEvent(env.DB, { provider: 'stub', providerEventId: 'evt-x', userId: 'ana', event: { kind: 'payment_failed' } }, '2026-11-10', 1);
  assert.equal(r.outcome, 'rejected');
  assert.equal((await subOf(env, 'ana')).status, 'pending');
  assert.ok(await env.DB.prepare("SELECT 1 FROM billing_events WHERE provider_event_id = 'evt-x'").first(), 'kept for audit');
});









test('invited members have access and payments are coming soon', async () => {
  const env = await setup();
  env.BILLING_PROVIDER = 'stub';
  const ana = await login(env, 'ana');
  for (const status of ['pending', 'past_due', 'cancelled']) {
    await setSub(env, 'ana', status);
    assert.equal((await send(env, '/app/peso/', { cookie: ana })).status, 200);
  }
  const body = await (await send(env, '/app/cuenta/', { cookie: ana })).text();
  assert.match(body, /Próximamente/);
  assert.match(body, /Coming soon/);
  assert.doesNotMatch(body, /action="\/app\/pagar\//);
  assert.equal((await send(env, '/app/pagar/', { method: 'POST', cookie: ana, form: { months: '1' } })).status, 404);
  assert.equal((await send(env, '/api/billing/stub/', { cookie: ana })).status, 404);
  const admin = await login(env, 'admin1');
  const adminBody = await (await send(env, '/admin/', { cookie: admin })).text();
  assert.match(adminBody, /Facturación: Próximamente/);
  assert.match(adminBody, /Billing: Coming soon/);
  const oldAdmin = await send(env, '/admin/facturacion/', { cookie: admin });
  assert.equal(oldAdmin.status, 303);
  assert.equal(oldAdmin.headers.get('location'), '/admin/');
});


test('old billing links lead to the coming-soon state without enabling checkout', async () => {
  const env = await setup();
  const member = await login(env, 'ana');
  const res = await send(env, '/app/pagar/', { cookie: member });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/cuenta/');
  const account = await (await send(env, res.headers.get('location'), { cookie: member })).text();
  assert.match(account, /Próximamente/);
  assert.match(account, /Coming soon/);
  assert.equal((await send(env, '/app/pagar/', { method: 'POST', cookie: member, form: { months: '1' } })).status, 404);
  assert.equal((await send(env, '/admin/facturacion/', { cookie: member })).status, 403);
});
