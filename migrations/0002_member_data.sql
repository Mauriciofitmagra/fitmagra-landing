-- Member data (spec section 11.1). Quantities are integers in their smallest unit. Dates are YYYY-MM-DD text.
ALTER TABLE users ADD COLUMN consent_version TEXT;
ALTER TABLE users ADD COLUMN consent_at INTEGER;

CREATE TABLE weights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL CHECK (measured_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  weight_g INTEGER NOT NULL CHECK (weight_g BETWEEN 20000 AND 400000),
  body_fat_pct_x10 INTEGER CHECK (body_fat_pct_x10 BETWEEN 10 AND 800),
  waist_mm INTEGER CHECK (waist_mm BETWEEN 300 AND 2500),
  note TEXT
);
CREATE INDEX weights_user ON weights(user_id, measured_on);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_on TEXT NOT NULL CHECK (performed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  title TEXT NOT NULL,
  minutes INTEGER CHECK (minutes BETWEEN 1 AND 600),
  effort INTEGER CHECK (effort BETWEEN 1 AND 10),
  notes TEXT
);
CREATE INDEX workouts_user ON workouts(user_id, performed_on);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_on TEXT NOT NULL CHECK (taken_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  pose TEXT NOT NULL CHECK (pose IN ('front', 'side', 'back', 'other')),
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp')),
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX photos_user ON photos(user_id, taken_on);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('training_plan', 'nutrition_plan')),
  title TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  bytes INTEGER NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE INDEX documents_user ON documents(user_id, kind, published_at);

CREATE TABLE nutrition_targets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kcal INTEGER NOT NULL CHECK (kcal BETWEEN 800 AND 8000),
  protein_g INTEGER NOT NULL CHECK (protein_g BETWEEN 0 AND 600),
  carbs_g INTEGER NOT NULL CHECK (carbs_g BETWEEN 0 AND 1200),
  fat_g INTEGER NOT NULL CHECK (fat_g BETWEEN 0 AND 400),
  updated_at INTEGER NOT NULL
);

CREATE TABLE nutrition_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eaten_on TEXT NOT NULL CHECK (eaten_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  meal TEXT NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  description TEXT NOT NULL,
  kcal INTEGER CHECK (kcal BETWEEN 0 AND 10000),
  protein_g INTEGER CHECK (protein_g BETWEEN 0 AND 1000),
  carbs_g INTEGER CHECK (carbs_g BETWEEN 0 AND 2000),
  fat_g INTEGER CHECK (fat_g BETWEEN 0 AND 1000)
);
CREATE INDEX nutrition_logs_user ON nutrition_logs(user_id, eaten_on);
