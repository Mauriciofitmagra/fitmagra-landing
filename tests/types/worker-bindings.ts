import type { Env } from '../../worker/index.ts';

declare const db: D1Database;
declare const files: R2Bucket;
declare const assets: Fetcher;
const bindings: Env = { DB: db, FILES: files, ASSETS: assets, ENVIRONMENT: 'production' };
void bindings;
