-- Console vendor extras: pricing tiers, support, FAQ, low-balance alerts.

CREATE TABLE IF NOT EXISTS console_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_per_gb NUMERIC(10, 2) NOT NULL CHECK (price_per_gb > 0),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendor_console_accounts
  ADD COLUMN IF NOT EXISTS pricing_tier_id UUID REFERENCES console_pricing_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS low_balance_threshold_mb NUMERIC(14, 2) NOT NULL DEFAULT 1000 CHECK (low_balance_threshold_mb >= 0),
  ADD COLUMN IF NOT EXISTS last_low_balance_alert_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS console_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS console_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_console_support_vendor_created
  ON console_support_tickets(vendor_id, created_at DESC);

INSERT INTO console_pricing_tiers (name, price_per_gb, description, sort_order)
VALUES
  ('Bronze', 5.00, 'Small volume agents', 1),
  ('Silver', 4.50, 'Mid volume agents', 2),
  ('Gold', 4.00, 'High volume agents', 3),
  ('Platinum', 3.50, 'Top tier agents', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO console_faq (question, answer, sort_order)
SELECT q, a, s FROM (VALUES
  (
    'What is the data console?',
    'The data console is a separate product from the main vendor dashboard. You send bundles using a GB/MB balance allocated by admin — not your GHS wallet.',
    1
  ),
  (
    'How do I get data credit?',
    'Ask DCS admin to allocate GB to your account from Admin → Data Consoles. You will receive an SMS when credit is loaded.',
    2
  ),
  (
    'Which networks can I send to?',
    'MTN, Telecel, and AirtelTigo bundles are supported through our supplier network.',
    3
  ),
  (
    'How do I use the API?',
    'Create an API key under the API page. Use the console endpoints documented there with your key in the Authorization header.',
    4
  )
) AS v(q, a, s)
WHERE NOT EXISTS (SELECT 1 FROM console_faq LIMIT 1);

ALTER TABLE console_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS console_pricing_tiers_read ON console_pricing_tiers;
CREATE POLICY console_pricing_tiers_read ON console_pricing_tiers
  FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS console_pricing_tiers_admin ON console_pricing_tiers;
CREATE POLICY console_pricing_tiers_admin ON console_pricing_tiers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

DROP POLICY IF EXISTS console_support_vendor_select ON console_support_tickets;
CREATE POLICY console_support_vendor_select ON console_support_tickets
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS console_support_vendor_insert ON console_support_tickets;
CREATE POLICY console_support_vendor_insert ON console_support_tickets
  FOR INSERT WITH CHECK (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS console_support_admin_all ON console_support_tickets;
CREATE POLICY console_support_admin_all ON console_support_tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

DROP POLICY IF EXISTS console_faq_read ON console_faq;
CREATE POLICY console_faq_read ON console_faq
  FOR SELECT USING (active = TRUE);

DROP POLICY IF EXISTS console_faq_admin ON console_faq;
CREATE POLICY console_faq_admin ON console_faq
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
