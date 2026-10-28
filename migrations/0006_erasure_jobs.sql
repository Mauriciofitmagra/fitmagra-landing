CREATE TABLE erasure_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX erasure_jobs_pending ON erasure_jobs(user_id) WHERE status = 'pending';
