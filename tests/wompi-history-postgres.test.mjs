import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { postgresDB } from '../worker/postgres.ts';
import { wompiPayments } from '../worker/admin/wompi-payments.ts';

test('Postgres history uses exact cents for large approved totals', async () => {
  const client = new PGlite();
  try {
    await client.exec(readFileSync(new URL('../migrations-postgres/0001_schema.sql', import.meta.url), 'utf8'));
    const db = postgresDB(client);
    const insert = db.prepare('INSERT INTO wompi_link_payments (transaction_id, status, amount_cents, currency, link_id) VALUES (?, ?, ?, ?, ?)');
    await insert.bind('1', 'APPROVED', 9007199254740991, 'COP', 'VdTCSO').run();
    await insert.bind('2', 'APPROVED', 1, 'COP', 'VdTCSO').run();
    const html = await (await wompiPayments(db, { userId: 'test-admin', role: 'admin' })).text();
    assert.match(html, /90\.071\.992\.547\.409,92 COP/);
    assert.match(html, /sincronización.*no están conciliados/i);
    await assert.rejects(insert.bind('3', 'APPROVED', 10, 'USD', 'VdTCSO').run());
  } finally { await client.close(); }
});
