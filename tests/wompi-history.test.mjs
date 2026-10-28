import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, login, send } from './helpers.mjs';

const path = '/admin/pagos-wompi/';

test('Wompi history is private and warns that the history is not reconciled', async () => {
  const env = await setup();
  assert.equal((await send(env, path)).status, 303);
  const member = await login(env, 'ana');
  assert.equal((await send(env, path, { cookie: member })).status, 403);
  const admin = await login(env, 'admin1');
  const res = await send(env, path, { cookie: admin });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(body, /sincronización.*no están conciliados/i);
  assert.match(body, /lista puede estar incompleta/i);
  assert.match(body, /sin pagos registrados/i);
  assert.doesNotMatch(body, /\$ 0,00 COP/);
  assert.match(body, /sin conciliar/i);
  assert.match(await (await send(env, '/admin/', { cookie: admin })).text(), /href="\/admin\/pagos-wompi\/"/);
});

test('Wompi history totals only approved recorded amounts and escapes payer details', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const insert = env.DB.prepare('INSERT INTO wompi_link_payments (transaction_id, link_id, payer_name, payer_email, status, amount_cents, currency, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  await insert.bind('a', 'VdTCSO', '<script>alert(1)</script>', 'payer@example.test', 'APPROVED', 123456, 'COP', '2026-10-28').run();
  await insert.bind('b', 'VdTCSO', 'Another', 'another@example.test', 'PENDING', 999999, 'COP', '2026-10-27').run();
  await insert.bind('c', 'VPOS_h9q1ew', 'Third', 'third@example.test', 'APPROVED', 100, 'COP', '2026-10-26').run();
  await insert.bind('d', 'other-link', 'Excluded', 'excluded@example.test', 'APPROVED', 999999, 'COP', '2026-10-25').run();
  const res = await send(env, path, { cookie: admin });
  const body = await res.text();
  assert.match(body, /1\.235,56/);
  assert.match(body, /Aprobado/);
  assert.match(body, /Pendiente/);
  assert.match(body, /VPOS_h9q1ew/);
  assert.match(body, /ambos enlaces/);
  assert.doesNotMatch(body, /excluded@example\.test/);
  assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(body, /<script>alert/);
  const member = await login(env, 'ana');
  assert.doesNotMatch(await (await send(env, path, { cookie: member })).text(), /payer@example\.test/);
});
