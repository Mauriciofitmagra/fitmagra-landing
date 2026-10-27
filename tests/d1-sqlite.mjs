// A D1-shaped database over node:sqlite for tests. It covers only the D1 calls the Worker uses
// (prepare, bind, first, all, run, batch) so the same SQL runs here and on Cloudflare D1.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

const migrationsDir = new URL('../migrations/', import.meta.url);

export function d1({ migrations = true } = {}) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  if (migrations) {
    for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
      raw.exec(readFileSync(new URL(f, migrationsDir), 'utf8'));
    }
  }
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async (column) => {
      const row = raw.prepare(sql).get(...params);
      if (!row) return null;
      const plain = { ...row };
      return column ? plain[column] : plain;
    },
    all: async () => ({ success: true, results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    run: async () => {
      const r = raw.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    _exec: () => raw.prepare(sql).run(...params),
  });
  return {
    raw,
    prepare: (sql) => statement(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        const out = stmts.map((s) => s._exec());
        raw.exec('COMMIT');
        return out.map((r) => ({ success: true, meta: { changes: Number(r.changes) } }));
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
