import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL schema preserves account and member-data constraints', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL('../migrations-postgres/0001_schema.sql', import.meta.url), 'utf8'));
    await db.query("INSERT INTO fitmagra.users (id, email, name, role, created_at, updated_at) VALUES ('a', 'Ana@example.com', 'Ana', 'member', 2200000000, 2200000000)");
    await assert.rejects(db.query("INSERT INTO fitmagra.users (id, email, name, role, created_at, updated_at) VALUES ('b', 'ana@example.com', 'Ana', 'member', 0, 0)"));
    await assert.rejects(db.query("INSERT INTO fitmagra.weights (id, user_id, measured_on, weight_g) VALUES ('w', 'a', '2026-01-01', 1)"));
    await assert.rejects(db.query("INSERT INTO fitmagra.weights (id, user_id, measured_on, weight_g) VALUES ('w', 'a', '01/01/2026', 70000)"));
    await db.query("INSERT INTO fitmagra.weights (id, user_id, measured_on, weight_g) VALUES ('w1', 'a', '2026-01-01', 70000), ('w2', 'a', '2026-01-01', 71000)");
    const rows = await db.query('SELECT id FROM fitmagra.weights ORDER BY measured_on, entry_order');
    assert.deepEqual(rows.rows.map((row) => row.id), ['w1', 'w2']);
    await assert.rejects(db.query("INSERT INTO fitmagra.sessions (token_hash, user_id, created_at, expires_at) VALUES ('x', 'missing', 0, 1)"));
    await db.query("INSERT INTO fitmagra.erasure_jobs (id, user_id, status, created_at) VALUES ('j', 'a', 'pending', 0)");
    await assert.rejects(db.query("INSERT INTO fitmagra.erasure_jobs (id, user_id, status, created_at) VALUES ('k', 'a', 'pending', 0)"));
  } finally {
    await db.close();
  }
});
