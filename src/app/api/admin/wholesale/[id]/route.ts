import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import {
  legacyPriceSync,
  prepareWholesalePricesForSave,
  validateWholesalePrices,
} from "@/lib/wholesale/tier-pricing";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

const priceSchema = z.object({
  costPrice: z.number().min(0).optional(),
  customerPrice: z.number().min(0).optional(),
  customerProPrice: z.number().min(0).optional(),
  agentPrice: z.number().min(0).optional(),
  agentProPrice: z.number().min(0).optional(),
  xpressAgentPrice: z.number().min(0).optional(),
  expressAgentPrice: z.number().min(0).optional(),
});

const schema = z.object({
  prices: priceSchema.optional(),
  wholesalePrice: z.number().positive().optional(),
  suggestedRetail: z.number().positive().optional(),
  minMarkup: z.number().min(0).optional(),
  maxMarkup: z.number().positive().nullable().optional(),
  active: z.boolean().optional(),
  popular: z.boolean().optional(),
  name: z.string().min(2).optional(),
  productLine: z.enum(["standard", "ishare", "bigtime"]).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const service = createServiceClient();
  let existingResult = await service
    .from("wholesale_bundles")
    .select(
      "cost_price, customer_price, customer_pro_price, agent_price, agent_pro_price, xpress_agent_price, express_agent_price, wholesale_price, suggested_retail, min_markup",
    )
    .eq("id", id)
    .maybeSingle();
  if (existingResult.error && /express_agent_price/.test(existingResult.error.message)) {
    existingResult = await service
      .from("wholesale_bundles")
      .select(
        "cost_price, customer_price, customer_pro_price, agent_price, agent_pro_price, xpress_agent_price, wholesale_price, suggested_retail, min_markup",
      )
      .eq("id", id)
      .maybeSingle();
  }
  const existing = existingResult.data;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.prices || body.wholesalePrice !== undefined || body.suggestedRetail !== undefined) {
    const row = existing as Record<string, number | null> | null;
    const minMarkup = Number(body.minMarkup ?? row?.min_markup ?? 0.5);
    const merged = prepareWholesalePricesForSave(
      {
        costPrice: body.prices?.costPrice ?? row?.cost_price ?? undefined,
        customerPrice:
          body.prices?.customerPrice ?? body.suggestedRetail ?? row?.customer_price ?? undefined,
        customerProPrice: body.prices?.customerProPrice ?? row?.customer_pro_price ?? undefined,
        agentPrice: body.prices?.agentPrice ?? body.wholesalePrice ?? row?.agent_price ?? undefined,
        agentProPrice: body.prices?.agentProPrice ?? row?.agent_pro_price ?? undefined,
        xpressAgentPrice: body.prices?.xpressAgentPrice ?? row?.xpress_agent_price ?? undefined,
        expressAgentPrice:
          body.prices?.expressAgentPrice ?? row?.express_agent_price ?? undefined,
        wholesalePrice: row?.wholesale_price ?? undefined,
        suggestedRetail: row?.suggested_retail ?? undefined,
      },
      minMarkup,
    );
    const validationError = validateWholesalePrices(merged, minMarkup);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const legacy = legacyPriceSync(merged, minMarkup);
    updates.cost_price = merged.costPrice;
    updates.customer_price = merged.customerPrice;
    updates.customer_pro_price = merged.customerProPrice;
    updates.agent_price = merged.agentPrice;
    updates.agent_pro_price = merged.agentProPrice;
    updates.xpress_agent_price = merged.xpressAgentPrice;
    updates.express_agent_price = merged.expressAgentPrice;
    updates.wholesale_price = legacy.wholesale_price;
    updates.suggested_retail = legacy.suggested_retail;
  }

  if (body.minMarkup !== undefined) updates.min_markup = body.minMarkup;
  if (body.maxMarkup !== undefined) updates.max_markup = body.maxMarkup;
  if (body.active !== undefined) updates.active = body.active;
  if (body.popular !== undefined) updates.popular = body.popular;
  if (body.name !== undefined) updates.name = body.name;
  if (body.productLine !== undefined) updates.product_line = body.productLine;

  let { error } = await service.from("wholesale_bundles").update(updates).eq("id", id);
  if (error && /express_agent_price/.test(error.message)) {
    const { express_agent_price: _omit, ...legacyUpdates } = updates;
    void _omit;
    ({ error } = await service.from("wholesale_bundles").update(legacyUpdates).eq("id", id));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const service = createServiceClient();

  const { data: existing } = await service
    .from("wholesale_bundles")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }

  const { count: orderItemCount } = await service
    .from("wholesale_order_items")
    .select("id", { count: "exact", head: true })
    .eq("wholesale_bundle_id", id);

  if (orderItemCount && orderItemCount > 0) {
    return NextResponse.json(
      {
        error:
          "This bundle has wholesale orders on record. Deactivate it instead of deleting.",
      },
      { status: 409 },
    );
  }

  await service.from("vendor_listings").delete().eq("wholesale_bundle_id", id);

  const { error } = await service.from("wholesale_bundles").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
