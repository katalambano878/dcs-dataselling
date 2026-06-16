import { fetchWholesaleCatalogue } from "@/lib/data/wholesale";
import { resolveAgentBuyPrice } from "@/lib/wholesale/tier-pricing";

import { externalCorsPreflight, handleExternalApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

export const GET = handleExternalApi(async ({ ctx }) => {
  const catalogue = await fetchWholesaleCatalogue(true);
  return {
    data: catalogue.map((b) => ({
      id: b.id,
      name: b.name,
      description: `${b.network.toUpperCase()} · ${b.dataMb >= 1024 ? `${Math.round(b.dataMb / 1024)}GB` : `${b.dataMb}MB`} · ${b.validityDays} days`,
      price: resolveAgentBuyPrice(b, ctx.vendorTier),
      stock: 9999,
      sku: b.sku,
      network: b.network,
    })),
  };
});

export function OPTIONS() {
  return externalCorsPreflight();
}
