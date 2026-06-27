export { BRAND, BRAND_GRADIENT } from "@/lib/brand";

export const SITE = {
  name: "DCS ELITE",
  shortName: "DCS",
  brandLine: "ELITE",
  domain: "dcselite.com",
  tagline: "Ghana's Elite Data Platform",
  /** Short SEO description (<=160 chars, indexable) */
  description:
    "Buy MTN, Telecel & AirtelTigo data bundles in Ghana — or launch your own data store on DCS ELITE. Instant delivery, secure MoMo payments, 24/7 support.",
  /** Long marketing description for OG/social cards */
  longDescription:
    "DCS ELITE is Ghana's elite data platform. Vendors launch their own branded storefront in minutes, customers buy MTN, Telecel and AirtelTigo data bundles with secure MoMo or card payments, and orders are fulfilled instantly via licensed suppliers.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://dcselite.com",
  consoleUrl: process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.dcselite.com",
  /** ISO country & locale used for Open Graph + structured data */
  locale: "en_GH",
  language: "en",
  country: "Ghana",
  countryCode: "GH",
  currency: "GHS",
  /** Founders' / publisher details (used in JSON-LD) */
  legalName: "DCS ELITE",
  foundingYear: 2025,
  supportWhatsApp: "+233200000000",
  supportEmail: "support@dcselite.com",
  /** Brand assets */
  logo: "/brand/dcs-elite-logo.png",
  ogImage: "/og.png",
  /** Social handles (used for Twitter card + sameAs in JSON-LD) */
  twitterHandle: "@dcselite",
  socials: {
    twitter: "https://x.com/dcselite",
    instagram: "https://instagram.com/dcselite",
    tiktok: "https://tiktok.com/@dcselite",
    facebook: "https://facebook.com/dcselite",
    linkedin: "https://www.linkedin.com/company/dcselite",
  },
  /** Brand colours used in PWA manifest and theme-color */
  themeColor: "#0A2E5D",
  backgroundColor: "#0A2E5D",
  /** SEO keyword bank (used in root metadata & expanded in pages) */
  keywords: [
    "buy data Ghana",
    "MTN data bundle",
    "Telecel data bundle",
    "AirtelTigo data bundle",
    "AT data Ghana",
    "cheap data Ghana",
    "data reseller Ghana",
    "data vendor Ghana",
    "data store Ghana",
    "MoMo data payment",
    "Mobile Money data",
    "instant data delivery",
    "DCS ELITE",
    "dcselite",
    "dcselite.com",
    "wholesale data Ghana",
    "AFA bundles MTN",
    "sell data online Ghana",
  ],
} as const;

export const NETWORKS = [
  { id: "mtn", name: "MTN", color: "#FFCC00", textColor: "#1a1a1a" },
  { id: "telecel", name: "Telecel", color: "#E4002B", textColor: "#ffffff" },
  { id: "at", name: "AT (AirtelTigo)", color: "#E30613", textColor: "#ffffff" },
] as const;

export type NetworkId = (typeof NETWORKS)[number]["id"];

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "queued",
  "processing",
  "fulfilled",
  "failed",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SORT_OPTIONS = [
  { id: "best_value", label: "Best Value" },
  { id: "fastest", label: "Fastest Fulfilment" },
  { id: "lowest_price", label: "Lowest Price" },
  { id: "popular", label: "Most Popular" },
] as const;

export const PAYMENT_PROVIDERS = ["paystack"] as const;

/** One-time fee (GHS) vendors pay before store onboarding is submitted */
export const VENDOR_STORE_SETUP_FEE_GHS = Number(
  process.env.VENDOR_STORE_SETUP_FEE_GHS ?? process.env.NEXT_PUBLIC_VENDOR_STORE_SETUP_FEE_GHS ?? 50,
);
