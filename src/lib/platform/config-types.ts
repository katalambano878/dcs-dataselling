import { VENDOR_STORE_SETUP_FEE_GHS } from "@/lib/constants";
import type { NetworkId } from "@/lib/constants";

/** Key used in the `platform_settings` table for the JSON blob below. */
export const PLATFORM_CONFIG_KEY = "platform_config";

export interface MomoDirectConfig {
  /** Master switch — when false the checkout shows Paystack only. */
  enabled: boolean;
  /** Merchant MoMo numbers per network. Empty string = disabled for that network. */
  merchantNumbers: Record<NetworkId, string>;
  /** Display name shown on the payment instructions card. */
  merchantName: string;
  /**
   * Shared secret the Forward-SMS Android app must send in the Authorization
   * header to POST /api/webhooks/momo-sms. Rotate at any time.
   */
  smsForwarderSecret: string;
}

/** Automated or manual supplier module for a network. */
export type NetworkSupplierId =
  | "manual"
  | "skanka5"
  | "successbizhub"
  | "railwayexternal"
  | "ishare"
  | "adaaya"
  | "shopdcs";

export interface SupplierRoutingConfig {
  /** Per-network admin override. When omitted, follows SUPPLIER_FOR_<NETWORK> env. */
  mtn?: NetworkSupplierId;
  telecel?: NetworkSupplierId;
  at?: NetworkSupplierId;
}

export interface ContactConfig {
  /**
   * Support WhatsApp / call number in international digits (e.g. 233241234567).
   * Empty string hides the call + WhatsApp chat buttons.
   */
  supportWhatsApp: string;
  /** Full https link to the WhatsApp channel. Empty string hides the channel button. */
  whatsappChannelUrl: string;
}

export interface PlatformConfig {
  /** When false, store creation is free — no setup fee is charged regardless of the amount below. */
  vendorSetupFeeEnabled: boolean;
  /** One-time fee (GHS) every new agent pays before their store goes live (when enabled). */
  vendorSetupFeeGhs: number;
  /**
   * Block repeat orders to the same beneficiary within this window (minutes).
   * Admin range: 1–3.
   */
  recipientOrderCooldownMinutes: number;
  /** Reward (GHS) credited to referrer when an invited agent completes their first sale. */
  referralRewardGhs: number;
  /**
   * Paystack fee percentage added on top of a wallet top-up so the agent bears
   * the processing cost (e.g. 2 = agent pays amount + 2%). 0 disables the fee.
   */
  paystackFeePercent: number;
  /** When true, public pages and vendor dashboard show a maintenance screen. */
  maintenanceMode: boolean;
  /** Optional message shown on the maintenance page. */
  maintenanceMessage: string;
  /** SMS-forwarder-based direct MoMo payment settings. */
  momoDirect: MomoDirectConfig;
  /** Per-network supplier overrides (admin-controlled without env redeploy). */
  supplierRouting: SupplierRoutingConfig;
  /** Support / WhatsApp contact details shown on the dashboard quick buttons. */
  contact: ContactConfig;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  vendorSetupFeeEnabled: true,
  vendorSetupFeeGhs:
    Number.isFinite(VENDOR_STORE_SETUP_FEE_GHS) && VENDOR_STORE_SETUP_FEE_GHS > 0
      ? VENDOR_STORE_SETUP_FEE_GHS
      : 50,
  recipientOrderCooldownMinutes: 3,
  referralRewardGhs: 10,
  paystackFeePercent: 0,
  maintenanceMode: false,
  maintenanceMessage: "",
  momoDirect: {
    enabled: false,
    merchantNumbers: { mtn: "", telecel: "", at: "" },
    merchantName: "",
    smsForwarderSecret: "",
  },
  supplierRouting: {},
  contact: {
    supportWhatsApp: "",
    whatsappChannelUrl: "",
  },
};

export function normalizePlatformConfig(input: unknown): PlatformConfig {
  const base = DEFAULT_PLATFORM_CONFIG;
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<PlatformConfig>;

  return {
    vendorSetupFeeEnabled:
      typeof raw.vendorSetupFeeEnabled === "boolean"
        ? raw.vendorSetupFeeEnabled
        : base.vendorSetupFeeEnabled,
    vendorSetupFeeGhs: clampNum(raw.vendorSetupFeeGhs, base.vendorSetupFeeGhs, 1, 100000),
    recipientOrderCooldownMinutes: clampInt(
      raw.recipientOrderCooldownMinutes,
      base.recipientOrderCooldownMinutes,
      1,
      3,
    ),
    referralRewardGhs: clampNum(raw.referralRewardGhs, base.referralRewardGhs, 1, 10000),
    paystackFeePercent: clampNum(raw.paystackFeePercent, base.paystackFeePercent, 0, 10),
    maintenanceMode:
      typeof raw.maintenanceMode === "boolean" ? raw.maintenanceMode : base.maintenanceMode,
    maintenanceMessage:
      typeof raw.maintenanceMessage === "string"
        ? raw.maintenanceMessage.trim().slice(0, 500)
        : base.maintenanceMessage,
    momoDirect: normalizeMomoDirect(raw.momoDirect, base.momoDirect),
    supplierRouting: normalizeSupplierRouting(raw.supplierRouting, base.supplierRouting),
    contact: normalizeContact(raw.contact, base.contact),
  };
}

function normalizeContact(
  input: Partial<ContactConfig> | undefined,
  fallback: ContactConfig,
): ContactConfig {
  if (!input || typeof input !== "object") return fallback;
  return {
    supportWhatsApp: normalizeWhatsAppNumber(input.supportWhatsApp, fallback.supportWhatsApp),
    whatsappChannelUrl: normalizeChannelUrl(input.whatsappChannelUrl, fallback.whatsappChannelUrl),
  };
}

/** Returns the number in international digits (e.g. 233241234567) or "" when blank. */
function normalizeWhatsAppNumber(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("233")) return digits.slice(0, 12);
  if (digits.length === 10 && digits.startsWith("0")) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return digits.slice(0, 15);
}

function normalizeChannelUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return url.toString().slice(0, 300);
  } catch {
    return fallback;
  }
}

const VALID_SUPPLIER_IDS = new Set<NetworkSupplierId>([
  "manual",
  "skanka5",
  "successbizhub",
  "railwayexternal",
  "ishare",
  "adaaya",
  "shopdcs",
]);

function normalizeNetworkSupplierId(value: unknown): NetworkSupplierId | undefined {
  return typeof value === "string" && VALID_SUPPLIER_IDS.has(value as NetworkSupplierId)
    ? (value as NetworkSupplierId)
    : undefined;
}

function normalizeSupplierRouting(
  input: Partial<SupplierRoutingConfig> | undefined,
  fallback: SupplierRoutingConfig,
): SupplierRoutingConfig {
  if (!input || typeof input !== "object") return fallback;
  const out: SupplierRoutingConfig = {};
  const mtn = normalizeNetworkSupplierId(input.mtn) ?? fallback.mtn;
  const telecel = normalizeNetworkSupplierId(input.telecel) ?? fallback.telecel;
  const at = normalizeNetworkSupplierId(input.at) ?? fallback.at;
  if (mtn) out.mtn = mtn;
  if (telecel) out.telecel = telecel;
  if (at) out.at = at;
  return out;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeMomoDirect(
  input: Partial<MomoDirectConfig> | undefined,
  fallback: MomoDirectConfig,
): MomoDirectConfig {
  if (!input || typeof input !== "object") return fallback;

  const inputNumbers = (input.merchantNumbers ?? {}) as Partial<Record<NetworkId, string>>;
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : fallback.enabled,
    merchantNumbers: {
      mtn: normalizeMomoNumber(inputNumbers.mtn, fallback.merchantNumbers.mtn),
      telecel: normalizeMomoNumber(inputNumbers.telecel, fallback.merchantNumbers.telecel),
      at: normalizeMomoNumber(inputNumbers.at, fallback.merchantNumbers.at),
    },
    merchantName: typeof input.merchantName === "string"
      ? input.merchantName.trim().slice(0, 80)
      : fallback.merchantName,
    smsForwarderSecret: typeof input.smsForwarderSecret === "string"
      ? input.smsForwarderSecret.trim().slice(0, 200)
      : fallback.smsForwarderSecret,
  };
}

function normalizeMomoNumber(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 9) return `0${digits}`;
  return digits.slice(-10);
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}
