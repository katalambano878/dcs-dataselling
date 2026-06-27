-- Agent data console (BestPay-style): balance in MB, separate from GHS wallet.

CREATE TABLE IF NOT EXISTS vendor_console_accounts (
  vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  balance_mb NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance_mb >= 0),
  total_sends INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS console_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount_mb NUMERIC(14, 2) NOT NULL CHECK (amount_mb > 0),
  balance_after_mb NUMERIC(14, 2) NOT NULL,
  reference TEXT NOT NULL,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, reference)
);

CREATE TABLE IF NOT EXISTS console_send_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  network network_id NOT NULL,
  amount_mb NUMERIC(14, 2) NOT NULL CHECK (amount_mb > 0),
  balance_after_mb NUMERIC(14, 2),
  reference TEXT NOT NULL UNIQUE,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  supplier TEXT,
  supplier_reference TEXT,
  supplier_status TEXT,
  supplier_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_console_credit_vendor_created
  ON console_credit_ledger(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_console_send_vendor_created
  ON console_send_ledger(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_console_send_reference
  ON console_send_ledger(reference);

CREATE INDEX IF NOT EXISTS idx_console_send_status
  ON console_send_ledger(status)
  WHERE status IN ('pending', 'processing');

ALTER TABLE vendor_console_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_send_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_console_accounts_vendor_select ON vendor_console_accounts;
CREATE POLICY vendor_console_accounts_vendor_select ON vendor_console_accounts
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS console_credit_ledger_vendor_select ON console_credit_ledger;
CREATE POLICY console_credit_ledger_vendor_select ON console_credit_ledger
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS console_send_ledger_vendor_select ON console_send_ledger;
CREATE POLICY console_send_ledger_vendor_select ON console_send_ledger
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS vendor_console_accounts_admin_all ON vendor_console_accounts;
CREATE POLICY vendor_console_accounts_admin_all ON vendor_console_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

DROP POLICY IF EXISTS console_credit_ledger_admin_all ON console_credit_ledger;
CREATE POLICY console_credit_ledger_admin_all ON console_credit_ledger
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

DROP POLICY IF EXISTS console_send_ledger_admin_all ON console_send_ledger;
CREATE POLICY console_send_ledger_admin_all ON console_send_ledger
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
