import "server-only";
import { cache } from "react";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  DEFAULT_PLATFORM_CONFIG,
  PLATFORM_CONFIG_KEY,
  type PlatformConfig,
  normalizePlatformConfig,
} from "@/lib/platform/config-types";

async function loadPlatformConfigRaw(): Promise<PlatformConfig> {
  if (!hasSupabaseConfig()) return DEFAULT_PLATFORM_CONFIG;

  const service = createServiceClient();
  const { data, error } = await service
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_CONFIG_KEY)
    .maybeSingle();

  if (error) {
    console.error("[loadPlatformConfig]", error);
    return DEFAULT_PLATFORM_CONFIG;
  }

  return normalizePlatformConfig(data?.value);
}

/** Cached per-request fetch of platform-wide settings (fee, etc.). */
export const getPlatformConfig = cache(loadPlatformConfigRaw);

export async function savePlatformConfig(config: PlatformConfig): Promise<void> {
  if (!hasSupabaseConfig()) throw new Error("Database not configured");

  const normalized = normalizePlatformConfig(config);
  const service = createServiceClient();

  const { error } = await service.from("platform_settings").upsert(
    {
      key: PLATFORM_CONFIG_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) throw new Error(error.message);
}

export async function getVendorSetupFee(): Promise<number> {
  const config = await getPlatformConfig();
  return config.vendorSetupFeeEnabled ? config.vendorSetupFeeGhs : 0;
}

export async function getMomoDirectConfig() {
  const config = await getPlatformConfig();
  return config.momoDirect;
}

export async function getPaystackFeePercent(): Promise<number> {
  const config = await getPlatformConfig();
  return config.paystackFeePercent ?? 0;
}

/**
 * Given the amount an agent wants credited to their wallet, return the gross
 * amount to charge on Paystack (base + fee) so the agent bears the fee.
 */
export function applyPaystackFee(baseAmount: number, feePercent: number) {
  const pct = Number.isFinite(feePercent) && feePercent > 0 ? feePercent : 0;
  const fee = +((baseAmount * pct) / 100).toFixed(2);
  const gross = +(baseAmount + fee).toFixed(2);
  return { base: +baseAmount.toFixed(2), fee, gross, feePercent: pct };
}
