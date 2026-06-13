-- Storefront checkout stores vendor_listings.id in orders.bundle_id (via marketplace_bundles).
-- Repoint the FK from legacy bundles → vendor_listings so PostgREST joins resolve correctly.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_bundle_id_fkey;

ALTER TABLE orders
  ADD CONSTRAINT orders_bundle_id_fkey
  FOREIGN KEY (bundle_id) REFERENCES vendor_listings(id);

COMMENT ON COLUMN orders.bundle_id IS
  'Vendor storefront listing id (vendor_listings.id). Legacy rows may still reference bundles.id until migrated.';
