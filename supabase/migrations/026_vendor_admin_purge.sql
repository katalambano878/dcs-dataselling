-- Allow admin to purge suspended/rejected agents while preserving customer order history.

ALTER TABLE orders ALTER COLUMN vendor_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_vendor_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

ALTER TABLE orders ALTER COLUMN bundle_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_bundle_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_bundle_id_fkey
  FOREIGN KEY (bundle_id) REFERENCES vendor_listings(id) ON DELETE SET NULL;

ALTER TABLE payouts ALTER COLUMN vendor_id DROP NOT NULL;
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_vendor_id_fkey;
ALTER TABLE payouts
  ADD CONSTRAINT payouts_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
