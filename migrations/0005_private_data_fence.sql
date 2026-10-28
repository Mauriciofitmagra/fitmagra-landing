ALTER TABLE users ADD COLUMN data_revision TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN data_erasing INTEGER NOT NULL DEFAULT 0 CHECK (data_erasing IN (0, 1));
ALTER TABLE users ADD COLUMN erasure_owner TEXT;

CREATE TABLE upload_intents (
  r2_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);
CREATE INDEX upload_intents_user ON upload_intents(user_id);
