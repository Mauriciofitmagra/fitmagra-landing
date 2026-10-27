-- Provider-agnostic monthly billing (spec section 13). Amounts are whole pesos (COP has no cents in practice).
ALTER TABLE users ADD COLUMN phone TEXT;

CREATE TABLE subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('standard', 'elite', 'platino')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'cancelled')),
  current_period_end TEXT,
  grace_until TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  provider TEXT,
  provider_ref TEXT,
  updated_at INTEGER NOT NULL
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
  created_at INTEGER NOT NULL
);
CREATE INDEX payments_user ON payments(user_id, created_at);

-- The provider's event id is the key, so a repeated webhook delivery cannot apply twice.
CREATE TABLE billing_events (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'rejected', 'unknown_member')),
  received_at INTEGER NOT NULL,
  payload TEXT
);
