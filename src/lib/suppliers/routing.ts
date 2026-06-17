import "server-only";

import { getPlatformConfig } from "@/lib/data/platform-config";
import type { NetworkSupplierId, SupplierRoutingConfig } from "@/lib/platform/config-types";
import {
  getSupplierById,
  getSupplierIdForNetwork,
  type NetworkSupplierStatus,
} from "./registry";
import type { SupplierClient, SupplierNetworkSlug } from "./types";

const SUPPLIER_LABELS: Record<NetworkSupplierId, string> = {
  skanka5: "Skanka5",
  successbizhub: "DataCoreGH",
  railwayexternal: "Railway API",
  manual: "Manual fulfilment (no automated supplier)",
};

/** Resolve effective supplier id for a network (admin override, then env, then default). */
export function resolveSupplierId(
  network: SupplierNetworkSlug,
  routing?: SupplierRoutingConfig,
): string {
  const override = routing?.[network];
  if (override) return override;
  return getSupplierIdForNetwork(network);
}

export async function getResolvedSupplierForNetwork(
  network: SupplierNetworkSlug,
): Promise<SupplierClient> {
  const config = await getPlatformConfig();
  const id = resolveSupplierId(network, config.supplierRouting);
  return getSupplierById(id) ?? getSupplierById("manual")!;
}

export function routingSource(
  network: SupplierNetworkSlug,
  routing?: SupplierRoutingConfig,
): NetworkSupplierStatus["source"] {
  if (routing?.[network]) return "admin";
  const envVar = `SUPPLIER_FOR_${network.toUpperCase()}`;
  const fromEnv = process.env[envVar]?.trim().toLowerCase();
  return fromEnv ? "env" : "default";
}

export function envDefaultSupplierId(network: SupplierNetworkSlug): string {
  return getSupplierIdForNetwork(network);
}

export async function getNetworkSupplierMatrixResolved(): Promise<NetworkSupplierStatus[]> {
  const config = await getPlatformConfig();
  const networks: SupplierNetworkSlug[] = ["mtn", "telecel", "at"];

  return networks.map((network) => {
    const id = resolveSupplierId(network, config.supplierRouting) as NetworkSupplierId;
    const client = getSupplierById(id) ?? getSupplierById("manual")!;
    const manual = client.id === "manual";
    const configured = manual || client.isConfigured();
    return {
      network,
      supplierId: client.id,
      supplierLabel: SUPPLIER_LABELS[id] ?? client.label,
      configured,
      manual,
      source: routingSource(network, config.supplierRouting),
    };
  });
}
