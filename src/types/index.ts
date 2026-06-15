import type { NetworkId, OrderStatus } from "@/lib/constants";

export type UserRole = "customer" | "vendor" | "admin" | "ops";

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
}

export type VendorStatus = "pending" | "approved" | "suspended" | "rejected";
export type KycStatus = "not_started" | "pending_review" | "verified" | "rejected";
export type VendorTier = "starter" | "verified" | "pro" | "express";

export interface AdminProfileRecord {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  phone: string | null;
  role: UserRole;
  roleLabel: string;
  username: string;
  memberSince: string;
  accountAge: string;
  createdAt: string;
}

export interface AdminPlatformSnapshot {
  gmv30d: number;
  platformRevenue30d: number;
  ordersToday: number;
  activeVendors: number;
  successRate: number;
}

export interface AdminOrderSnapshot {
  totalOrders: number;
  completedOrders: number;
  successRate: number;
  lifetimeRevenue: number;
}

export interface WishlistItem {
  id: string;
  wholesaleBundleId: string;
  createdAt: string;
  bundle: WholesaleBundle & { tierBuyPrice?: number };
}

export interface VendorReferralStats {
  referralCode: string;
  inviteLink: string;
  rewardAmount: number;
  totalInvites: number;
  pendingInvites: number;
  rewardedInvites: number;
  totalEarned: number;
  recent: {
    id: string;
    businessName: string;
    status: string;
    rewardedAt: string | null;
    createdAt: string;
  }[];
}

export interface Vendor {
  id: string;
  slug: string;
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  status: VendorStatus;
  kycStatus?: KycStatus;
  tier?: VendorTier;
  themeColor?: string;
  emoji?: string | null;
  bannerUrl?: string | null;
  whatsappNumber?: string | null;
  momoNumber?: string | null;
  referralCode?: string;
  verified: boolean;
  rating: number;
  totalOrders: number;
  fulfilmentMinutes: number;
  commissionRate: number;
  featured: boolean;
  setupFeePaidAt?: string | null;
  createdAt: string;
}

export interface WholesaleBundle {
  id: string;
  sku: string;
  network: NetworkId;
  name: string;
  dataMb: number;
  validityDays: number;
  /** Supplier cost (admin). */
  costPrice: number;
  /** Default customer storefront price before agent markup. */
  customerPrice: number;
  customerProPrice: number;
  /** Starter agent buy price. */
  agentPrice: number;
  /** Pro agent buy price. */
  agentProPrice: number;
  /** Super Agent buy price (verified tier). */
  xpressAgentPrice: number;
  /** Express Agent buy price (admin-assigned tier). Falls back to costPrice. */
  expressAgentPrice: number;
  /** @deprecated use agentPrice — kept for API compat */
  wholesalePrice: number;
  /** @deprecated use customerPrice */
  suggestedRetail: number;
  minMarkup: number;
  maxMarkup: number | null;
  popular: boolean;
  productLine?: "standard" | "ishare" | "bigtime" | null;
}

export interface VendorListing {
  id: string;
  vendorId: string;
  wholesaleBundleId: string;
  markupAmount: number;
  customName: string | null;
  active: boolean;
  salesCount: number;
  wholesale: WholesaleBundle;
  finalPrice: number;
  vendorEarning: number;
}

export interface Bundle {
  id: string;
  vendorId: string;
  vendor: Pick<Vendor, "id" | "slug" | "businessName" | "verified" | "rating" | "fulfilmentMinutes">;
  network: NetworkId;
  name: string;
  dataMb: number;
  validityDays: number;
  price: number;
  originalPrice: number | null;
  popular: boolean;
  recommended: boolean;
  active: boolean;
  salesCount: number;
}

export interface Order {
  id: string;
  reference: string;
  userId: string;
  vendorId: string;
  bundleId: string;
  bundle: Pick<Bundle, "name" | "network" | "dataMb" | "validityDays" | "price">;
  vendor: Pick<Vendor, "businessName" | "slug">;
  recipientPhone: string;
  amount: number;
  platformFee: number;
  status: OrderStatus;
  paymentProvider: "paystack" | "moolre" | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
  fulfilledAt: string | null;
}

export interface PlatformStats {
  ordersToday: number;
  ordersFulfilled: number;
  activeVendors: number;
  successRate: number;
}

export interface DashboardMetric {
  label: string;
  value: string | number;
  change?: number;
  trend?: "up" | "down" | "neutral";
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: "order" | "payment" | "vendor" | "promo" | "system";
  read: boolean;
  createdAt: string;
}

export interface FulfilmentQueueItem {
  id: string;
  order: Order;
  priority: "high" | "normal" | "low";
  waitingMinutes: number;
}
