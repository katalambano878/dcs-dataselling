import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

/** Revalidate sitemap every 30 minutes so new vendor stores are discovered. */
export const revalidate = 1800;

type VendorRow = { slug: string; updated_at: string | null; created_at: string };

async function fetchPublicVendorSlugs(): Promise<VendorRow[]> {
  if (!hasSupabaseConfig()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("vendors")
      .select("slug, updated_at, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(40000);
    if (error || !data) return [];
    return data as VendorRow[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url.replace(/\/$/, "");
  const now = new Date();
  const ogImage = `${base}/opengraph-image`;

  // Static, indexable marketing pages
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
      images: [ogImage],
    },
    {
      url: `${base}/create-store`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
      images: [ogImage],
    },
    {
      url: `${base}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/trust`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${base}/status`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    {
      url: `${base}/developers`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/auth/login`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Dynamic vendor storefronts
  const vendors = await fetchPublicVendorSlugs();
  const vendorEntries: MetadataRoute.Sitemap = vendors.map((v) => {
    const url = `${base}/vendor/${v.slug}`;
    const last = v.updated_at ?? v.created_at;
    return {
      url,
      lastModified: last ? new Date(last) : now,
      changeFrequency: "weekly",
      priority: 0.8,
      // Each vendor has its own OG image route — surface it in the image sitemap.
      images: [`${url}/opengraph-image`],
    };
  });

  return [...staticEntries, ...vendorEntries];
}
