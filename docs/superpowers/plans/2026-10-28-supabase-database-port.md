# Supabase database port

FitMagra runs on a Cloudflare Worker. Move its member database from D1 to the supplied Supabase PostgreSQL project; retain the existing invitation-based login, coming-soon payments, and private R2 files. Do not apply migrations to the remote project until its existing contents and a safe connection method are established. The Supabase API keys are not PostgreSQL connection credentials.

## Work

1. Inventory the target project without exposing credentials or changing data. Establish an isolated staging database or project before testing destructive operations. Keep production data untouched until its ownership and migration requirements are known.
2. Port the six D1 migrations to an isolated PostgreSQL schema. Preserve constraints, case-insensitive email uniqueness, indexes, and deterministic ordering of same-day records. Do not use Supabase's API-exposed schema for member records or expose privileged database access to browsers.
3. Implement a server-only PostgreSQL connection for the Worker, using parameterized queries and explicit transactions. Replace SQLite-specific SQL, including `rowid`, null-safe `IS ?` comparisons, and SQLite error handling. Convert PostgreSQL `BIGINT` values to safe JavaScript integers where the application expects numbers, rejecting values outside the safe range. Keep the database credential in a protected server-side binding, never in source, logs, or client assets.
4. Revisit concurrency: D1 batches serialize SQLite writes; PostgreSQL transaction isolation and row locking have different behavior. Prove password resets, session issuance, account revisions, uploads, and erasure fences remain safe under genuinely concurrent PostgreSQL transactions. A wrapper that merely translates placeholders and wraps batches in `BEGIN` is insufficient.
5. Run the existing member and authentication behavior tests against PostgreSQL, plus concurrent reset, stale session, upload/erasure, rollback, and duplicate-email tests. Test the Worker-to-Postgres path in an isolated environment before considering production.
6. Update deployment configuration, bootstrap and operational runbooks, legal drafts, retention review, and release checks to reflect Supabase and R2. Keep the existing legal, browser QA, and release gates; never claim that a local test proves the hosted connection or privacy controls.

## Evidence and constraints

- The current D1 interface uses prepared statements and atomic batches across authentication, member data, and erasure. Six migrations use SQLite-specific syntax and the Worker has three `rowid` ordering queries.
- Supabase documents a transaction pooler for serverless connections, with prepared-statement and pipelining limitations: https://supabase.com/docs/guides/database/connecting-to-postgres
- Cloudflare documents PostgreSQL drivers for Workers and recommends node-postgres for Hyperdrive: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/
- Local PostgreSQL initialization in this environment failed because the operating system refused shared-memory creation. PostgreSQL integration tests need an available isolated database or an environment that permits a local server.
- The Supabase secret key was shared in conversation and must be rotated. Do not use it for the migration.
