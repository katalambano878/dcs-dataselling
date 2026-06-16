"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Phone,
  Plus,
  ShoppingCart,
  Wallet,
  X,
} from "lucide-react";
import { WishlistToggle } from "@/components/wishlist/wishlist-toggle";
import { BulkOrdersPanel } from "@/components/vendor/bulk-orders-panel";
import type { MomoClaimItConfig } from "@/components/vendor/momo-claimit-panel";
import { WalletTopupPanel } from "@/components/vendor/wallet-topup-panel";
import { toast } from "sonner";
import type { NetworkId } from "@/lib/constants";
import { formatDataAmount, formatGHS } from "@/lib/format";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useVendorCart } from "@/components/vendor/vendor-cart-context";
import type { WholesaleBundle } from "@/types";

type CatalogueBundle = WholesaleBundle & { tierBuyPrice: number };

interface Props {
  wholesale: CatalogueBundle[];
  buyPriceLabel?: string;
  initialBalance: number;
  topupCallback?: string;
  initialNetwork?: NetworkFilter;
  initialLine?: "ishare" | "bigtime";
  initialMode?: Mode;
  openTopupOnMount?: boolean;
  openCartOnMount?: boolean;
  wishlistIds?: string[];
  momoClaimIt?: MomoClaimItConfig;
}

function phoneValid(raw: string) {
  return /^0\d{9}$/.test(raw.replace(/\D/g, "").slice(0, 10));
}

function normalizeInput(raw: string) {
  return raw.replace(/\D/g, "").slice(0, 10);
}

type NetworkFilter = "all" | NetworkId;
type Mode = "shop" | "bulk";

function buyPrice(wb: CatalogueBundle) {
  return wb.tierBuyPrice ?? wb.agentPrice ?? wb.wholesalePrice;
}

export function WholesaleTerminal({
  wholesale,
  buyPriceLabel = "Your price",
  initialBalance,
  topupCallback,
  initialNetwork = "all",
  initialLine,
  initialMode = "shop",
  openTopupOnMount = false,
  openCartOnMount = false,
  wishlistIds = [],
  momoClaimIt,
}: Props) {
  const { cart, addLine, removeLine, clearCart } = useVendorCart();
  const [balance, setBalance] = useState(initialBalance);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [network, setNetwork] = useState<NetworkFilter>(initialNetwork);
  const [lineFilter] = useState<"ishare" | "bigtime" | undefined>(initialLine);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [cartOpen, setCartOpen] = useState(openCartOnMount);
  const [topupOpen, setTopupOpen] = useState(openTopupOnMount);
  const [loading, setLoading] = useState(false);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/vendor/wallet");
      if (!res.ok) return;
      const data = await res.json();
      setBalance(Number(data.balance ?? 0));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (topupCallback) {
      toast.success("Top-up received — balance updated");
      void refreshBalance();
    }
  }, [topupCallback, refreshBalance]);

  const filtered = useMemo(() => {
    let items = network === "all" ? wholesale : wholesale.filter((w) => w.network === network);
    if (lineFilter && network === "at") {
      items = items.filter((w) => {
        if (w.productLine) return w.productLine === lineFilter;
        const q = lineFilter === "ishare" ? "ishare" : "bigtime";
        return (
          w.name.toLowerCase().includes(q) ||
          w.sku.toLowerCase().includes(q)
        );
      });
    }
    return items;
  }, [wholesale, network, lineFilter]);

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const b = wholesale.find((w) => w.id === line.bundleId);
        return sum + (b ? buyPrice(b) : 0);
      }, 0),
    [cart, wholesale],
  );

  const networkCounts = useMemo(() => {
    const counts: Record<string, number> = { all: wholesale.length };
    for (const w of wholesale) {
      counts[w.network] = (counts[w.network] ?? 0) + 1;
    }
    return counts;
  }, [wholesale]);

  function addToCart(bundle: CatalogueBundle) {
    const phone = normalizeInput(phones[bundle.id] ?? "");
    if (!phoneValid(phone)) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    addLine({ bundleId: bundle.id, phone });
    toast.success("Added to cart");
  }

  function removeFromCart(key: string) {
    removeLine(key);
  }

  async function checkoutCart() {
    if (cart.length === 0) return;
    if (balance < cartTotal) {
      toast.error("Insufficient balance — top up your wallet");
      setTopupOpen(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/wholesale/orders/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            wholesaleBundleId: c.bundleId,
            recipientPhone: c.phone,
          })),
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        toast.error(`Need ${formatGHS(data.shortfall ?? 0)} more — top up wallet`);
        setTopupOpen(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      clearCart();
      setCartOpen(false);
      setBalance(Number(data.balance ?? balance - cartTotal));
      toast.success(`Order placed · ${data.reference}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  const networkPills: { id: NetworkFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mtn", label: "MTN" },
    { id: "telecel", label: "TELECEL" },
    { id: "at", label: "AirtelTigo" },
  ];

  return (
    <div className="relative -mx-4 -mt-2 sm:-mx-6">
      <div className="overflow-hidden rounded-2xl border border-navy-800 bg-navy-950 text-white shadow-xl sm:mx-0">
        {/* Wallet bar */}
        <div className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/95 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15">
                <Wallet className="h-5 w-5 text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                  Wallet balance
                </p>
                <p className="num truncate text-xl font-bold text-gold">{formatGHS(balance)}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 border-gold/30 bg-gold/10 text-gold hover:bg-gold/20"
              onClick={() => setTopupOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Top up
            </Button>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
              aria-label="Open cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {cart.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-950">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mode + network */}
        <div className="space-y-3 px-4 py-3">
          <div className="flex gap-2">
            {(
              [
                { id: "shop" as const, label: "Products", icon: ShoppingCart },
                { id: "bulk" as const, label: "Bulk orders", icon: ClipboardList },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-colors",
                  mode === m.id
                    ? "bg-gold text-navy-950"
                    : "bg-white/5 text-white/70 hover:bg-white/10",
                )}
              >
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            ))}
          </div>

          {mode === "shop" && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {networkPills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setNetwork(pill.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                    network === pill.id
                      ? "bg-white text-navy-950"
                      : "bg-white/8 text-white/60 hover:bg-white/12",
                  )}
                >
                  {pill.label}
                  <span className="ml-1 opacity-60">({networkCounts[pill.id] ?? 0})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Shop grid */}
        {mode === "shop" && (
          <div className="space-y-3 px-4 pb-6">
            <p className="text-xs text-white/45">
              {filtered.length} product{filtered.length === 1 ? "" : "s"} · {buyPriceLabel} shown · enter customer number on each card
            </p>
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-white/10 py-12 text-center text-sm text-white/50">
                No products for this network.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
                {filtered.map((wb) => (
                  <article
                    key={wb.id}
                    className="rounded-lg border border-white/10 bg-navy-900/80 p-2.5 sm:rounded-xl sm:p-4"
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                          <NetworkBadge network={wb.network} size="xs" />
                          {wb.popular && (
                            <Badge variant="warning" className="px-1 py-0 text-[8px] sm:text-[9px]">
                              Hot
                            </Badge>
                          )}
                        </div>
                        <h3 className="mt-1 text-[11px] font-bold leading-snug sm:mt-2 sm:text-sm">
                          {wb.name}
                        </h3>
                        <p className="mt-0.5 text-[9px] text-white/45 sm:text-[11px]">
                          {formatDataAmount(wb.dataMb)} · {wb.validityDays}d
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-1 sm:flex-col sm:items-end sm:gap-1.5">
                        <WishlistToggle
                          bundleId={wb.id}
                          apiBase="/api/vendor/wishlist"
                          initialSaved={wishlistIds.includes(wb.id)}
                        />
                        <p className="num text-sm font-bold text-gold sm:text-lg">
                          {formatGHS(buyPrice(wb))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 rounded-md border border-white/10 bg-navy-950/60 px-2 py-1.5 sm:mt-3 sm:gap-2 sm:rounded-lg sm:px-3 sm:py-2">
                      <Phone className="h-3 w-3 shrink-0 text-white/40 sm:h-3.5 sm:w-3.5" />
                      <span className="text-[10px] font-bold text-white/40 sm:text-xs">+233</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="024…"
                        value={phones[wb.id] ?? ""}
                        onChange={(e) =>
                          setPhones((p) => ({ ...p, [wb.id]: normalizeInput(e.target.value) }))
                        }
                        className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold placeholder:text-white/25 focus:outline-none sm:text-sm"
                      />
                    </div>

                    <Button
                      size="sm"
                      className="mt-2 h-8 w-full bg-gold text-[11px] text-navy-950 hover:bg-gold-glow sm:mt-3 sm:h-9 sm:text-sm"
                      onClick={() => addToCart(wb)}
                    >
                      <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      Add to Cart
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "bulk" && (
          <BulkOrdersPanel
            balance={balance}
            onBalanceChange={setBalance}
            onNeedTopup={() => setTopupOpen(true)}
          />
        )}
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          />
          <div className="relative max-h-[85vh] overflow-hidden rounded-t-2xl border border-white/10 bg-navy-950 sm:mx-auto sm:max-w-md sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="font-bold">Cart ({cart.length})</h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto px-4 py-3">
              {cart.length === 0 ? (
                <li className="py-8 text-center text-sm text-white/45">Cart is empty</li>
              ) : (
                cart.map((line) => {
                  const b = wholesale.find((w) => w.id === line.bundleId);
                  return (
                    <li
                      key={line.key}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-navy-900/80 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{b?.name ?? "Bundle"}</p>
                        <p className="text-xs text-white/45">{line.phone}</p>
                      </div>
                      <p className="num text-sm font-bold text-gold">
                        {formatGHS(b ? buyPrice(b) : 0)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFromCart(line.key)}
                        className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t border-white/10 px-4 py-4">
              <div className="mb-3 flex justify-between text-sm">
                <span className="text-white/60">Total</span>
                <span className="num font-bold text-gold">{formatGHS(cartTotal)}</span>
              </div>
              <Button
                className="w-full bg-gold text-navy-950"
                disabled={loading || cart.length === 0}
                onClick={checkoutCart}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Place order · ${formatGHS(cartTotal)}`
                )}
              </Button>
              {balance < cartTotal && cart.length > 0 && (
                <p className="mt-2 text-center text-[11px] text-red-400">
                  Need {formatGHS(cartTotal - balance)} more — top up wallet
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top-up modal */}
      {topupOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close top-up"
            onClick={() => setTopupOpen(false)}
          />
          <div className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-navy-950 p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Top up wallet</h3>
              <button type="button" onClick={() => setTopupOpen(false)} className="rounded p-1 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <WalletTopupPanel
                compact
                momoConfig={
                  momoClaimIt ?? {
                    enabled: false,
                    merchantNumber: "",
                    merchantName: "",
                    merchantNumbers: { mtn: "", telecel: "", at: "" },
                  }
                }
                onSuccess={() => {
                  void refreshBalance();
                  setTopupOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
