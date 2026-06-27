import "server-only";

/**
 * Per-network supplier abstraction. Each upstream data provider implements
 * `SupplierClient`; the registry routes orders by network slug.
 *
 * Add a new supplier:
 *   1. Create src/lib/suppliers/<id>.ts that exports a `SupplierClient`.
 *   2. Register it in src/lib/suppliers/registry.ts.
 *   3. Set env var SUPPLIER_FOR_<NETWORK>=<id> in .env.local / Vercel.
 */

export type SupplierNetworkSlug = "mtn" | "telecel" | "at";

export type SupplierOrderScope = "customer_order" | "wholesale_order" | "console_send";

export interface SupplierSubmitSingleParams {
  network: SupplierNetworkSlug;
  msisdn: string;
  volumeMb: number;
  /** Our internal reference (used as idempotency key with most APIs) */
  reference: string;
  scope: SupplierOrderScope;
}

export interface SupplierSubmitBulkParams {
  network: SupplierNetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: SupplierOrderScope;
}

export interface SupplierOrderRow {
  order_code?: string;
  msisdn?: string;
  status?: string;
}

export interface SupplierSubmitResult {
  ok: boolean;
  /**
   * When `true`, the supplier is intentionally manual (no automated upstream).
   * The dispatcher will keep the order in `queued` and tag it
   * `supplier_status = "awaiting_manual"` so an admin can fulfil it by hand.
   */
  manual?: boolean;
  /** Supplier's own batch reference, e.g. ORDER-000123 */
  reference?: string;
  /** Single-item supplier order code */
  orderCode?: string;
  /** Supplier-reported status string */
  status?: string;
  /** For bulk submissions, the per-recipient supplier rows */
  orders?: SupplierOrderRow[];
  /** Raw supplier response for the audit log */
  rawResponse?: unknown;
  /** Human-readable error, only when `ok` is false */
  error?: string;
  httpStatus?: number;
}

export interface SupplierPingResult {
  ok: boolean;
  error?: string;
  raw?: unknown;
}

export interface SupplierClient {
  /** Stable identifier persisted to orders.supplier and supplier_logs.supplier */
  id: string;
  /** Display label for the admin console */
  label: string;
  /** Returns true when the env vars required to use this supplier are present */
  isConfigured(): boolean;
  submitSingle(params: SupplierSubmitSingleParams): Promise<SupplierSubmitResult>;
  submitBulk(params: SupplierSubmitBulkParams): Promise<SupplierSubmitResult>;
  /** Optional connectivity / credential check used by the admin diagnostics */
  ping?(): Promise<SupplierPingResult>;
}
