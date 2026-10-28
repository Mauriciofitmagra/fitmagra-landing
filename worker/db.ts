// The slice of the D1 API the Worker uses. Cloudflare D1 and tests/d1-sqlite.mjs both satisfy it.
export type Row = Record<string, unknown>;
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Row>(column?: string): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface DB {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
