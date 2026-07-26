CREATE TABLE IF NOT EXISTS wo_numbering_daily (
  number_date date PRIMARY KEY,
  current_value bigint NOT NULL CHECK (current_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
