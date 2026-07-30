// Auto-generated FK map for dcselites — do not hand-edit blindly
export interface FkEdge {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

export const JSONB_COLUMNS: Record<string, Set<string>> = {
  "audit_logs": new Set(["metadata"]),
  "notifications": new Set(["metadata"]),
  "orders": new Set(["supplier_response"]),
  "platform_settings": new Set(["value"]),
  "sms_logs": new Set(["context", "provider_response"]),
  "supplier_logs": new Set(["request_payload", "response_payload"]),
  "transactions": new Set(["raw_payload"]),
  "vendor_api_logs": new Set(["request_body", "response_summary"]),
  "vendor_webhook_deliveries": new Set(["payload"]),
  "wholesale_order_items": new Set(["supplier_response"]),
  "wholesale_orders": new Set(["supplier_response"]),
};

export const FK_MAP: Record<string, FkEdge[]> = {
  "admin_wishlist_items": [
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
    { column: "wholesale_bundle_id", foreignTable: "wholesale_bundles", foreignColumn: "id" },
  ],
  "audit_logs": [
    { column: "actor_id", foreignTable: "profiles", foreignColumn: "id" },
  ],
  "console_credit_ledger": [
    { column: "created_by", foreignTable: "profiles", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "console_send_ledger": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "console_support_tickets": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "disputes": [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
  ],
  "fulfilment_logs": [
    { column: "actor_id", foreignTable: "profiles", foreignColumn: "id" },
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  "kyc_documents": [
    { column: "reviewed_by", foreignTable: "profiles", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "momo_sms": [
    { column: "matched_order_id", foreignTable: "orders", foreignColumn: "id" },
    { column: "matched_wallet_topup_id", foreignTable: "wallet_topups", foreignColumn: "id" },
  ],
  "notifications": [
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
  ],
  "orders": [
    { column: "bundle_id", foreignTable: "vendor_listings", foreignColumn: "id" },
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
    { column: "vendor_listing_id", foreignTable: "vendor_listings", foreignColumn: "id" },
    { column: "wholesale_bundle_id", foreignTable: "wholesale_bundles", foreignColumn: "id" },
  ],
  "payouts": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "promo_redemptions": [
    { column: "promo_code_id", foreignTable: "promo_codes", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "reward_withdrawals": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "sms_logs": [
    { column: "triggered_by", foreignTable: "profiles", foreignColumn: "id" },
  ],
  "transactions": [
    { column: "order_id", foreignTable: "orders", foreignColumn: "id" },
  ],
  "vendor_api_keys": [
    { column: "created_by", foreignTable: "profiles", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_api_logs": [
    { column: "key_id", foreignTable: "vendor_api_keys", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_complaints": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_console_accounts": [
    { column: "pricing_tier_id", foreignTable: "console_pricing_tiers", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_listings": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
    { column: "wholesale_bundle_id", foreignTable: "wholesale_bundles", foreignColumn: "id" },
  ],
  "vendor_mtn_afa": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_referrals": [
    { column: "referred_vendor_id", foreignTable: "vendors", foreignColumn: "id" },
    { column: "referrer_vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_setup_payments": [
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_webhook_deliveries": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "vendor_wishlist_items": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
    { column: "wholesale_bundle_id", foreignTable: "wholesale_bundles", foreignColumn: "id" },
  ],
  "vendors": [
    { column: "referred_by", foreignTable: "vendors", foreignColumn: "id" },
    { column: "referred_by_vendor_id", foreignTable: "vendors", foreignColumn: "id" },
    { column: "user_id", foreignTable: "profiles", foreignColumn: "id" },
  ],
  "wallet_ledger": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "wallet_topups": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "wallets": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
  "wholesale_bundles": [
    { column: "network", foreignTable: "networks", foreignColumn: "id" },
  ],
  "wholesale_order_items": [
    { column: "wholesale_bundle_id", foreignTable: "wholesale_bundles", foreignColumn: "id" },
    { column: "wholesale_order_id", foreignTable: "wholesale_orders", foreignColumn: "id" },
  ],
  "wholesale_orders": [
    { column: "vendor_id", foreignTable: "vendors", foreignColumn: "id" },
  ],
};
