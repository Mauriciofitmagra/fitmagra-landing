import type { DB, Statement } from './db.ts';

type Result = { rows: Record<string, unknown>[]; fields: { name: string; dataTypeID: number }[]; rowCount?: number | null; affectedRows?: number };
export interface PostgresClient { query(sql: string, values?: unknown[]): Promise<Result> }

type PgStatement = Statement & { sql: string; values: unknown[] };
const clientQueues = new WeakMap<PostgresClient, Promise<void>>();

// The Worker owns these SQL strings; values remain parameters, never SQL text.
function postgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, (part) => part === '?' ? `$${++index}` : part)
    .replace(/\browid\b/g, 'entry_order')
    .replace(/\bIS (\$\d+)/g, 'IS NOT DISTINCT FROM $1');
}

function rows(result: Result): Record<string, unknown>[] {
  const bigintFields = result.fields.filter((field) => field.dataTypeID === 20).map((field) => field.name);
  return result.rows.map((row) => {
    const converted = { ...row };
    for (const key of bigintFields) {
      if (row[key] === null) continue;
      const value = Number(row[key]);
      if (!Number.isSafeInteger(value)) throw new RangeError('PostgreSQL bigint exceeds the safe integer range');
      converted[key] = value;
    }
    return converted;
  });
}

// Prototype only: client must be a dedicated, pinned session, never a pool; do not use it outside this adapter.
export function postgresDB(client: PostgresClient): DB {
  // This lock serializes operations only when every database writer cooperates.
  function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const task = (clientQueues.get(client) ?? Promise.resolve()).then(() => runTransaction(fn));
    clientQueues.set(client, task.then(() => undefined, () => undefined));
    return task;
  }
  async function runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(721603815)');
      await client.query('SET LOCAL search_path TO fitmagra, pg_catalog');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const execute = (statement: PgStatement) => client.query(postgresSql(statement.sql), statement.values);
  const statement = (sql: string, values: unknown[] = []): PgStatement => ({
    sql, values,
    bind: (...args) => statement(sql, args),
    first: async <T>(column?: string) => transaction(async () => {
      const row = rows(await execute(statement(sql, values)))[0];
      return row ? (column ? row[column] : row) as T : null;
    }),
    all: async <T>() => transaction(async () => ({ results: rows(await execute(statement(sql, values))) as T[] })),
    run: async () => transaction(async () => {
      const result = await execute(statement(sql, values));
      return { meta: { changes: result.rowCount ?? result.affectedRows ?? 0 } };
    }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: (statements) => transaction(async () => {
      const results = [];
      for (const item of statements) {
        const result = await execute(item as PgStatement);
        results.push({ meta: { changes: result.rowCount ?? result.affectedRows ?? 0 } });
      }
      return results;
    }),
  };
}
