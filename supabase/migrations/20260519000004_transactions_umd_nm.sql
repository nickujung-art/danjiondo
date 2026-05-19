ALTER TABLE transactions ADD COLUMN IF NOT EXISTS umd_nm VARCHAR(50);

CREATE INDEX IF NOT EXISTS transactions_umd_nm_idx
  ON transactions(umd_nm)
  WHERE umd_nm IS NOT NULL;
