import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { getPlatformConfig, savePlatformConfig } from "@/lib/data/platform-config";
import { normalizePlatformConfig, type NetworkSupplierId } from "@/lib/platform/config-types";
import {
  envDefaultSupplierId,
  resolveSupplierId,
} from "@/lib/suppliers/routing";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const supplierIdSchema = z.enum([
  "manual",
  "skanka5",
  "successbizhub",
  "railwayexternal",
  "ishare",
  "shopdcs",
]);

const patchSchema = z
  .object({
    network: z.enum(["mtn", "telecel", "at"]).optional(),
    supplier: supplierIdSchema.optional(),
    mtn: supplierIdSchema.optional(),
    telecel: supplierIdSchema.optional(),
    at: supplierIdSchema.optional(),
  })
  .refine(
    (body) =>
      (body.network != null && body.supplier != null) ||
      body.mtn != null ||
      body.telecel != null ||
      body.at != null,
    { message: "Provide network+supplier or at least one network key" },
  );

function effectiveRouting(
  routing: ReturnType<typeof normalizePlatformConfig>["supplierRouting"],
) {
  const networks: SupplierNetworkSlug[] = ["mtn", "telecel", "at"];
  return Object.fromEntries(
    networks.map((n) => [n, resolveSupplierId(n, routing)]),
  ) as Record<SupplierNetworkSlug, string>;
}

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = await getPlatformConfig();
  const networks: SupplierNetworkSlug[] = ["mtn", "telecel", "at"];
  return NextResponse.json({
    routing: config.supplierRouting,
    envDefaults: Object.fromEntries(networks.map((n) => [n, envDefaultSupplierId(n)])),
    effective: effectiveRouting(config.supplierRouting),
  });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const current = await getPlatformConfig();
  const nextRouting = { ...current.supplierRouting };

  if (body.network && body.supplier) {
    nextRouting[body.network] = body.supplier;
  }
  if (body.mtn) nextRouting.mtn = body.mtn;
  if (body.telecel) nextRouting.telecel = body.telecel;
  if (body.at) nextRouting.at = body.at;

  const merged = normalizePlatformConfig({
    ...current,
    supplierRouting: nextRouting,
  });

  await savePlatformConfig(merged);
  return NextResponse.json({
    ok: true,
    routing: merged.supplierRouting,
    effective: effectiveRouting(merged.supplierRouting),
  });
}
