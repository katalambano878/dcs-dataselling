-- Allow admin debit corrections on console_credit_ledger (negative amount_mb).
-- Credits stay positive; wrong-allocation reversals use negative amounts.

ALTER TABLE console_credit_ledger
  DROP CONSTRAINT IF EXISTS console_credit_ledger_amount_mb_check;

ALTER TABLE console_credit_ledger
  ADD CONSTRAINT console_credit_ledger_amount_mb_check
  CHECK (amount_mb <> 0);
