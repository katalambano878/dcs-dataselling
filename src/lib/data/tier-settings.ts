import "server-only";
import { cache } from "react";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  AGENT_TIER_SETTINGS_KEY,
  type AgentTierSettings,
} from "@/lib/vendor/tier-settings-types";
import { DEFAULT_AGENT_TIER_SETTINGS, normalizeAgentTierSettings } from "@/lib/vendor/tiers";
import type { VendorTier } from "@/types";

async function loadAgentTierSettingsRaw(): Promise<AgentTierSettings> {
  if (!hasSupabaseConfig()) return DEFAULT_AGENT_TIER_SETTINGS;

  const service = createServiceClient();
  const { data, error } = await service
    .from("platform_settings")
    .select("value")
    .eq("key", AGENT_TIER_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    console.error("[loadAgentTierSettings]", error);
    return DEFAULT_AGENT_TIER_SETTINGS;
  }

  return normalizeAgentTierSettings(data?.value);
}

export const getAgentTierSettings = cache(loadAgentTierSettingsRaw);

export async function saveAgentTierSettings(settings: AgentTierSettings): Promise<void> {
  if (!hasSupabaseConfig()) {
    throw new Error("Database not configured");
  }

  const normalized = normalizeAgentTierSettings(settings);
  const service = createServiceClient();

  const { error: upsertError } = await service.from("platform_settings").upsert(
    {
      key: AGENT_TIER_SETTINGS_KEY,
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (upsertError) throw new Error(upsertError.message);

  for (const tierId of ["starter", "verified", "pro", "express"] as VendorTier[]) {
    const tier = normalized.tiers[tierId];
    const { error } = await service
      .from("vendors")
      .update({
        commission_rate: tier.commissionRate,
        updated_at: new Date().toISOString(),
      })
      .eq("tier", tierId);

    if (error) {
      console.error("[saveAgentTierSettings] vendor sync", tierId, error);
    }
  }
}
