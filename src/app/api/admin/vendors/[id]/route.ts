import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { purgeVendorAccount } from "@/lib/admin/purge-vendor";
import { fetchAdminVendorDetail } from "@/lib/data/admin-vendor-detail";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(
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
  const detail = await fetchAdminVendorDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  return NextResponse.json({ vendor: detail });
}

/** Permanently remove a suspended/rejected agent so they can register again. */
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
  const result = await purgeVendorAccount(service, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, userId: result.userId });
}
