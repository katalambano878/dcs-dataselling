import { NETWORKS, type NetworkId } from "@/lib/constants";

/**
 * Networks exposed on the data console Send Bundle form.
 * MTN and Telecel stay in code for future console routing but are off until
 * automated upstream suppliers are wired for console scope.
 */
export const CONSOLE_SEND_NETWORKS: readonly NetworkId[] = ["at"] as const;

export function isConsoleSendNetworkEnabled(network: string): network is NetworkId {
  return (CONSOLE_SEND_NETWORKS as readonly string[]).includes(network);
}

export function assertConsoleSendNetwork(
  network: string,
): { ok: true; network: NetworkId } | { ok: false; error: string; code: string } {
  if (!isConsoleSendNetworkEnabled(network)) {
    const enabled = CONSOLE_SEND_NETWORKS.map(
      (id) => NETWORKS.find((n) => n.id === id)?.name ?? id,
    ).join(", ");
    return {
      ok: false,
      error: `Console sends are only available for ${enabled} right now.`,
      code: "console_network_disabled",
    };
  }
  return { ok: true, network };
}

export function getConsoleSendNetworkOptions() {
  return NETWORKS.filter((n) => (CONSOLE_SEND_NETWORKS as readonly string[]).includes(n.id));
}

/** When only one network is enabled, the UI can lock to it without a picker. */
export function getDefaultConsoleSendNetwork(): NetworkId {
  return CONSOLE_SEND_NETWORKS[0] ?? "at";
}
