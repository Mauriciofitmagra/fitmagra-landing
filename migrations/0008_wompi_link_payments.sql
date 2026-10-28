CREATE TABLE wompi_link_payments (
  transaction_id TEXT PRIMARY KEY,
  link_id TEXT,
  payer_name TEXT,
  payer_email TEXT,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 0 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency = 'COP'),
  occurred_at TEXT
);
