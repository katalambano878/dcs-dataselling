import "server-only";
import { redirect } from "next/navigation";
import { getDashboardHome } from "@/lib/auth/roles";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export async function getSessionUser() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getCurrentProfile() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    email: data.email as string,
    fullName: (data.full_name as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    role: data.role as UserRole,
  };
}

export async function requireRole(allowed: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (!allowed.includes(profile.role)) redirect(getDashboardHome(profile.role));
  return profile;
}

export async function getCurrentVendor() {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("vendors")
    .select(
      "id, slug, business_name, tagline, status, kyc_status, tier, theme_color, emoji, banner_url, whatsapp_number, momo_number, referral_code, verified, rating, total_orders, fulfilment_minutes, commission_rate, featured, setup_fee_paid_at, api_only, created_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  type Row = {
    id: string;
    slug: string;
    business_name: string;
    tagline: string | null;
    status: "pending" | "approved" | "suspended" | "rejected";
    kyc_status: "not_started" | "pending_review" | "verified" | "rejected";
    tier: "starter" | "verified" | "pro" | "express";
    theme_color: string | null;
    emoji: string | null;
    banner_url: string | null;
    whatsapp_number: string | null;
    momo_number: string | null;
    referral_code: string;
    verified: boolean;
    rating: number;
    total_orders: number;
    fulfilment_minutes: number;
    commission_rate: number;
    featured: boolean;
    setup_fee_paid_at: string | null;
    api_only: boolean | null;
    created_at: string;
  };
  const row = data as Row;
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.business_name,
    tagline: row.tagline,
    logoUrl: null,
    status: row.status,
    kycStatus: row.kyc_status,
    tier: row.tier,
    themeColor: row.theme_color ?? "#0A2E5D",
    emoji: row.emoji,
    bannerUrl: row.banner_url,
    whatsappNumber: row.whatsapp_number,
    momoNumber: row.momo_number,
    referralCode: row.referral_code,
    verified: row.verified,
    rating: Number(row.rating),
    totalOrders: row.total_orders,
    fulfilmentMinutes: row.fulfilment_minutes,
    commissionRate: Number(row.commission_rate),
    featured: row.featured,
    setupFeePaidAt: row.setup_fee_paid_at,
    apiOnly: row.api_only ?? false,
    createdAt: row.created_at,
  };
}
