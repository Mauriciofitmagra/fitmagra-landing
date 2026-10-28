import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { postgresDB } from '../worker/postgres.ts';

async function setup() {
  const client = new PGlite();
  await client.exec(readFileSync(new URL('../migrations-postgres/0001_schema.sql', import.meta.url), 'utf8'));
  return { client, db: postgresDB(client) };
}

test('Postgres adapter binds values, returns safe integer results and rolls back a failed batch', async () => {
  const { client, db } = await setup();
  try {
    const insert = db.prepare('INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    await insert.bind('a', 'a@example.com', "Ana's ?", 'member', 2200000000, 0).run();
    assert.equal(await db.prepare('SELECT name FROM users WHERE id = ?').bind('a').first('name'), "Ana's ?");
    assert.equal(await db.prepare('SELECT count(*) AS n FROM users').first('n'), 1);
    await assert.rejects(db.batch([insert.bind('b', 'b@example.com', 'B', 'member', 0, 0), insert.bind('c', 'A@example.com', 'C', 'member', 0, 0)]));
    assert.equal(await db.prepare('SELECT count(*) AS n FROM users').first('n'), 1);
    await assert.rejects(db.prepare('SELECT 9007199254740992::bigint AS n').first(), /safe integer/i);
  } finally { await client.close(); }
});

test('Worker login and invitation preserve case-insensitive email behavior in Postgres', async () => {
  const { client, db } = await setup();
  try {
    const { hashPassword } = await import('../worker/auth/passwords.ts');
    const { login } = await import('../worker/auth/routes.ts');
    const { create } = await import('../worker/admin/routes.ts');
    await db.prepare("INSERT INTO users (id, email, name, role, status, password_hash, created_at, updated_at) VALUES (?, ?, ?, 'admin', 'active', ?, 0, 0)")
      .bind('a', 'Ana@example.com', 'Ana', await hashPassword('password-123')).run();
    const request = (fields) => new Request('https://example.test/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
    const signedIn = await login(request({ email: 'ANA@EXAMPLE.COM', password: 'password-123' }), db, 10);
    assert.equal(signedIn.status, 303);
    const response = await create(request({ name: 'Another', email: 'ana@example.com', role: 'admin' }), db, { userId: 'a', role: 'admin' }, 10);
    assert.equal(response.status, 409);
  } finally { await client.close(); }
});


test('concurrent operations on one Postgres client isolate a failed batch from a successful insert', async () => {
  const { client, db } = await setup();
  try {
    const insert = db.prepare('INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)');
    const [failed, succeeded] = await Promise.allSettled([
      db.batch([insert.bind('a', 'a@example.com', 'A', 'member'), insert.bind('b', 'a@example.com', 'B', 'member')]),
      postgresDB(client).prepare('INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)').bind('c', 'c@example.com', 'C', 'member').run(),
    ]);
    assert.equal(failed.status, 'rejected');
    assert.equal(succeeded.status, 'fulfilled');
    assert.deepEqual((await db.prepare('SELECT id FROM users ORDER BY id').all()).results, [{ id: 'c' }]);
  } finally { await client.close(); }
});

test('billing extensions remain distinct on the Postgres adapter', async () => {
  const { client, db } = await setup();
  try {
    const { applyEvent } = await import('../worker/billing/apply.ts');
    await db.prepare("INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES ('a', 'a@example.com', 'A', 'member', 0, 0)").run();
    await db.prepare("INSERT INTO subscriptions (user_id, plan, status, updated_at) VALUES ('a', 'elite', 'pending', 0)").run();
    const event = (id) => ({ provider: 'test', providerEventId: id, userId: 'a', event: { kind: 'payment_succeeded', months: 1 }, amountCop: 100 });
    const results = await Promise.all([applyEvent(db, event('one'), '2026-11-10', 1), applyEvent(db, event('two'), '2026-11-10', 1)]);
    assert.deepEqual(results.map((r) => r.outcome), ['applied', 'applied']);
    assert.equal(await db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id = 'a'").first('current_period_end'), '2027-01-10');
    assert.equal(await db.prepare('SELECT count(*) AS n FROM payments').first('n'), 2);
  } finally { await client.close(); }
});

test('Postgres nutrition target constraint violations return 400 without saving or auditing', async () => {
  const { client, db } = await setup();
  try {
    const { setTargets } = await import('../worker/admin/routes.ts');
    await db.prepare("INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES ('a', 'a@example.com', 'Ana', 'admin', 0, 0)").run();
    const request = new Request('https://example.test/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ kcal: '799', protein: '100', carbs: '200', fat: '60' }) });
    const response = await setTargets(request, db, { userId: 'a', role: 'admin' }, 1, 'a');
    assert.equal(response.status, 400);
    assert.equal(await db.prepare('SELECT count(*) n FROM nutrition_targets').first('n'), 0);
    assert.equal(await db.prepare('SELECT count(*) n FROM audit_log').first('n'), 0);
  } finally { await client.close(); }
});

test('out-of-range nutrition targets are rejected before database integer conversion', async () => {
  const { client, db } = await setup();
  const { d1 } = await import('./d1-sqlite.mjs');
  const sqlite = d1();
  try {
    const { setTargets } = await import('../worker/admin/routes.ts');
    for (const database of [db, sqlite]) {
      await database.prepare("INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES ('a', 'a@example.com', 'Ana', 'admin', 0, 0)").run();
      for (const fields of [
        { kcal: '9999999999', protein: '100', carbs: '200', fat: '60' },
        { kcal: '1800', protein: '601', carbs: '200', fat: '60' },
        { kcal: '1800', protein: '100', carbs: '1201', fat: '60' },
        { kcal: '1800', protein: '100', carbs: '200', fat: '401' },
      ]) {
        const request = new Request('https://example.test/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
        assert.equal((await setTargets(request, database, { userId: 'a', role: 'admin' }, 1, 'a')).status, 400);
      }
      assert.equal(await database.prepare('SELECT count(*) n FROM nutrition_targets').first('n'), 0);
      assert.equal(await database.prepare('SELECT count(*) n FROM audit_log').first('n'), 0);
    }
  } finally { await client.close(); sqlite.raw.close(); }
});
