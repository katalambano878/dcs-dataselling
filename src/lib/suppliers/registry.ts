import "server-only";

import { ishareClient } from "./ishare-client";
import { manualClient } from "./manual";
import { railwayExternalClient } from "./railway-external-client";
import { skanka5Client } from "./skanka5-client";
import { successBizHubClient } from "./successbizhub-client";
import type { SupplierClient, SupplierNetworkSlug } from "./types";

/**
 * Registry of all known supplier integrations.
 *
 * To wire up a new supplier:
 *   1. Implement `SupplierClient` in src/lib/suppliers/<id>.ts
 *   2. Import + add it here keyed by its id.
 *   3. Set SUPPLIER_FOR_<NETWORK>=<id> in env to route that network through it.
 */
const SUPPLIERS: Record<string, SupplierClient> = {
  skanka5: skanka5Client,
  successbizhub: successBizHubClient,
  railwayexternal: railwayExternalClient,
  ishare: ishareClient,
  manual: manualClient,
};

/** Default supplier per network if no env var is set. */
const DEFAULT_BY_NETWORK: Record<SupplierNetworkSlug, string> = {
  mtn: "skanka5",
  telecel: "manual",
  at: "manual",
};

const NETWORK_TO_ENV: Record<SupplierNetworkSlug, string> = {
  mtn: "SUPPLIER_FOR_MTN",
  telecel: "SUPPLIER_FOR_TELECEL",
  at: "SUPPLIER_FOR_AT",
};

export function getSupplierIdForNetwork(network: SupplierNetworkSlug): string {
  const envVar = NETWORK_TO_ENV[network];
  const fromEnv = process.env[envVar]?.trim().toLowerCase();
  if (fromEnv && SUPPLIERS[fromEnv]) return fromEnv;
  return DEFAULT_BY_NETWORK[network];
}

export function getSupplierForNetwork(network: SupplierNetworkSlug): SupplierClient {
  const id = getSupplierIdForNetwork(network);
  return SUPPLIERS[id] ?? manualClient;
}

export function getSupplierById(id: string): SupplierClient | null {
  return SUPPLIERS[id] ?? null;
}

/** Snapshot of network → supplier mapping for the admin console. */
export interface NetworkSupplierStatus {
  network: SupplierNetworkSlug;
  supplierId: string;
  supplierLabel: string;
  configured: boolean;
  manual: boolean;
  source: "env" | "default" | "admin";
}

export function getNetworkSupplierMatrix(): NetworkSupplierStatus[] {
  const networks: SupplierNetworkSlug[] = ["mtn", "telecel", "at"];
  return networks.map((n) => {
    const envVar = NETWORK_TO_ENV[n];
    const fromEnv = process.env[envVar]?.trim().toLowerCase();
    const id = fromEnv && SUPPLIERS[fromEnv] ? fromEnv : DEFAULT_BY_NETWORK[n];
    const client = SUPPLIERS[id] ?? manualClient;
    return {
      network: n,
      supplierId: client.id,
      supplierLabel: client.label,
      configured: client.isConfigured(),
      manual: client.id === "manual",
      source: fromEnv && SUPPLIERS[fromEnv] ? "env" : "default",
    };
  });
}
