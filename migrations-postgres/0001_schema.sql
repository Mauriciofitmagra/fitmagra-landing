CREATE SCHEMA fitmagra;
REVOKE ALL ON SCHEMA fitmagra FROM PUBLIC;
SET search_path TO fitmagra, pg_catalog;

-- Login-only accounts (spec section 10). Times are Unix seconds. Tokens are stored only as SHA-256 hex.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'deactivated')),
  password_hash TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE TABLE login_failures (
  key TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX login_failures_key_at ON login_failures(key, at);

CREATE TABLE audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  at BIGINT NOT NULL,
  detail TEXT
);

-- Member data (spec section 11.1). Quantities are integers in their smallest unit. Dates are YYYY-MM-DD text.
ALTER TABLE users ADD COLUMN consent_version TEXT;
ALTER TABLE users ADD COLUMN consent_at BIGINT;

CREATE TABLE weights (
  id TEXT PRIMARY KEY,
  entry_order BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL CHECK (measured_on ~ '^\d{4}-\d{2}-\d{2}$'),
  weight_g INTEGER NOT NULL CHECK (weight_g BETWEEN 20000 AND 400000),
  body_fat_pct_x10 INTEGER CHECK (body_fat_pct_x10 BETWEEN 10 AND 800),
  waist_mm INTEGER CHECK (waist_mm BETWEEN 300 AND 2500),
  note TEXT
);
CREATE INDEX weights_user ON weights(user_id, measured_on);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  entry_order BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_on TEXT NOT NULL CHECK (performed_on ~ '^\d{4}-\d{2}-\d{2}$'),
  title TEXT NOT NULL,
  minutes INTEGER CHECK (minutes BETWEEN 1 AND 600),
  effort INTEGER CHECK (effort BETWEEN 1 AND 10),
  notes TEXT
);
CREATE INDEX workouts_user ON workouts(user_id, performed_on);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_on TEXT NOT NULL CHECK (taken_on ~ '^\d{4}-\d{2}-\d{2}$'),
  pose TEXT NOT NULL CHECK (pose IN ('front', 'side', 'back', 'other')),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp')),
  bytes INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX photos_user ON photos(user_id, taken_on);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('training_plan', 'nutrition_plan')),
  title TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL,
  published_at BIGINT NOT NULL
);
CREATE INDEX documents_user ON documents(user_id, kind, published_at);

CREATE TABLE nutrition_targets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal INTEGER NOT NULL CHECK (kcal BETWEEN 800 AND 8000),
  protein_g INTEGER NOT NULL CHECK (protein_g BETWEEN 0 AND 600),
  carbs_g INTEGER NOT NULL CHECK (carbs_g BETWEEN 0 AND 1200),
  fat_g INTEGER NOT NULL CHECK (fat_g BETWEEN 0 AND 400),
  updated_at BIGINT NOT NULL
);

CREATE TABLE nutrition_logs (
  id TEXT PRIMARY KEY,
  entry_order BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eaten_on TEXT NOT NULL CHECK (eaten_on ~ '^\d{4}-\d{2}-\d{2}$'),
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  description TEXT NOT NULL,
  kcal INTEGER CHECK (kcal BETWEEN 0 AND 10000),
  protein_g INTEGER CHECK (protein_g BETWEEN 0 AND 1000),
  carbs_g INTEGER CHECK (carbs_g BETWEEN 0 AND 2000),
  fat_g INTEGER CHECK (fat_g BETWEEN 0 AND 1000)
);
CREATE INDEX nutrition_logs_user ON nutrition_logs(user_id, eaten_on);

-- Provider-agnostic monthly billing (spec section 13). Amounts are whole pesos (COP has no cents in practice).
ALTER TABLE users ADD COLUMN phone TEXT;

CREATE TABLE subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('standard', 'elite', 'platino')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'cancelled')),
  current_period_end TEXT,
  grace_until TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_ref TEXT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  months INTEGER NOT NULL CHECK (months IN (1, 2, 3)),
  amount_cop INTEGER NOT NULL CHECK (amount_cop >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  provider TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  provider_ref TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX payments_user ON payments(user_id, created_at);

-- The provider's event id is the key, so a repeated webhook delivery cannot apply twice.
CREATE TABLE billing_events (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'rejected', 'unknown_member')),
  received_at BIGINT NOT NULL,
  payload TEXT
);

ALTER TABLE users ADD COLUMN auth_revision TEXT NOT NULL DEFAULT '';

ALTER TABLE users ADD COLUMN data_revision TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN data_erasing INTEGER NOT NULL DEFAULT 0 CHECK (data_erasing IN (0, 1));
ALTER TABLE users ADD COLUMN erasure_owner TEXT;

CREATE TABLE upload_intents (
  r2_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at BIGINT NOT NULL
);
CREATE INDEX upload_intents_user ON upload_intents(user_id);

CREATE TABLE erasure_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX erasure_jobs_pending ON erasure_jobs(user_id) WHERE status = 'pending';
