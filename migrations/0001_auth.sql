-- Login-only accounts (spec section 10). Times are Unix seconds. Tokens are stored only as SHA-256 hex.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'deactivated')),
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE login_failures (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_key_at ON login_failures(key, at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  at INTEGER NOT NULL,
  detail TEXT
);
