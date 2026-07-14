import Link from "next/link";
import { ArrowRight, Clock, Star, Zap, Flame, Sparkles } from "lucide-react";
import type { Bundle } from "@/types";
import { formatDataAmount, formatGHS } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { cn } from "@/lib/utils";

interface BundleCardProps {
  bundle: Bundle;
  className?: string;
  variant?: "default" | "compact";
  /** Show vendor row on compact cards (e.g. marketplace grid) */
  showVendor?: boolean;
}

const NETWORK_TINT: Record<Bundle["network"], string> = {
  mtn: "from-amber-50/60",
  telecel: "from-red-50/50",
  at: "from-sky-50/60",
};

export function BundleCard({
  bundle,
  className,
  variant = "default",
  showVendor = false,
}: BundleCardProps) {
  const compact = variant === "compact";
  const showFooter = !compact || showVendor;

  const savings =
    bundle.originalPrice && bundle.originalPrice > bundle.price
      ? Math.round(((bundle.originalPrice - bundle.price) / bundle.originalPrice) * 100)
      : null;

  const pricePerGB = bundle.dataMb > 0 ? bundle.price / (bundle.dataMb / 1000) : 0;

  return (
    <Link
      href={`/checkout?bundle=${bundle.id}`}
      className={cn(
        "card-elevated card-lift group relative flex flex-col overflow-hidden p-0",
        "bg-gradient-to-b to-white",
        NETWORK_TINT[bundle.network],
        className,
      )}
    >
      <div
        className={cn(
          "h-1",
          bundle.network === "mtn" && "bg-mtn",
          bundle.network === "telecel" && "bg-telecel",
          bundle.network === "at" && "bg-at",
        )}
      />

      <div className={cn("flex-1", compact ? "p-2.5 sm:p-4" : "p-4")}>
        <div className="flex items-start justify-between gap-1 sm:gap-2">
          <NetworkBadge
            network={bundle.network}
            size={compact ? "xs" : "sm"}
            className={compact ? "sm:!px-2 sm:!py-0.5 sm:!text-[10px]" : undefined}
          />

          <div className="flex flex-wrap justify-end gap-0.5 sm:gap-1">
            {bundle.popular && (
              <Badge
                variant="warning"
                className={cn(
                  "gap-0.5 font-bold",
                  compact ? "px-1 py-0 text-[7px] sm:px-1.5 sm:text-[9px]" : "px-1.5 py-0 text-[9px]",
                )}
              >
                <Flame className={compact ? "h-2 w-2 sm:h-2.5 sm:w-2.5" : "h-2.5 w-2.5"} />
                Hot
              </Badge>
            )}
            {bundle.recommended && (
              <Badge
                variant="default"
                className={cn(
                  "gap-0.5 font-bold",
                  compact ? "px-1 py-0 text-[7px] sm:px-1.5 sm:text-[9px]" : "px-1.5 py-0 text-[9px]",
                )}
              >
                <Sparkles className={compact ? "h-2 w-2 sm:h-2.5 sm:w-2.5" : "h-2.5 w-2.5"} />
                {compact ? (
                  <>
                    <span className="sm:hidden">Best</span>
                    <span className="hidden sm:inline">Best value</span>
                  </>
                ) : (
                  "Best value"
                )}
              </Badge>
            )}
          </div>
        </div>

        <div className={cn(compact ? "mt-2 sm:mt-3" : "mt-3")}>
          <p
            className={cn(
              "num font-extrabold leading-none tracking-tight text-foreground",
              compact ? "text-base sm:text-xl lg:text-2xl" : "text-xl sm:text-2xl",
            )}
          >
            {formatDataAmount(bundle.dataMb)}
          </p>
          <p
            className={cn(
              "text-muted leading-tight",
              compact ? "mt-0.5 text-[9px] sm:text-[11px]" : "mt-0.5 text-[11px]",
            )}
          >
            {compact ? (
              <>
                <span className="block sm:inline">{bundle.validityDays}d</span>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline">₵{pricePerGB.toFixed(2)}/GB</span>
              </>
            ) : (
              <>Valid {bundle.validityDays} days · ₵{pricePerGB.toFixed(2)}/GB</>
            )}
          </p>
        </div>

        <div
          className={cn(
            "flex items-end justify-between gap-1 border-t border-border/80 sm:gap-2",
            compact ? "mt-2 pt-2 sm:mt-3 sm:pt-3" : "mt-3 pt-3",
          )}
        >
          <div className="min-w-0">
            <p
              className={cn(
                "num font-extrabold leading-none text-foreground",
                compact ? "text-sm sm:text-[18px]" : "text-[18px]",
              )}
            >
              {formatGHS(bundle.price)}
            </p>
            {bundle.originalPrice && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1 sm:mt-1 sm:gap-1.5">
                <p
                  className={cn(
                    "num text-muted-soft line-through",
                    compact ? "text-[8px] sm:text-[10px]" : "text-[10px]",
                  )}
                >
                  {formatGHS(bundle.originalPrice)}
                </p>
                {savings != null && savings > 0 && (
                  <span
                    className={cn(
                      "rounded bg-emerald-500/10 font-bold text-emerald-700",
                      compact ? "px-1 py-0 text-[7px] sm:px-1.5 sm:text-[9px]" : "px-1.5 py-0.5 text-[9px]",
                    )}
                  >
                    −{savings}%
                  </span>
                )}
              </div>
            )}
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 font-bold text-white shadow-md shadow-cyan-500/20 transition-all group-hover:shadow-cyan-500/35",
              compact
                ? "gap-0 px-2 py-1 text-[9px] group-hover:gap-0.5 sm:gap-0.5 sm:px-2.5 sm:py-1.5 sm:text-[11px] group-hover:sm:gap-1"
                : "gap-0.5 px-2.5 py-1.5 text-[11px] group-hover:gap-1",
            )}
          >
            Buy
            <ArrowRight className={compact ? "h-2.5 w-2.5 sm:h-3 sm:w-3" : "h-3 w-3"} />
          </span>
        </div>
      </div>

      {showFooter && (
        <div
          className={cn(
            "border-t border-border/80 bg-slate-50/90",
            compact ? "px-2 py-1.5 sm:px-4 sm:py-2.5" : "px-4 py-2.5",
          )}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Avatar
              name={bundle.vendor.businessName}
              size="xs"
              verified={bundle.vendor.verified}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate font-semibold text-foreground",
                  compact ? "text-[9px] sm:text-[11px]" : "text-[11px]",
                )}
              >
                {bundle.vendor.businessName}
              </p>
              <div
                className={cn(
                  "mt-0 flex items-center gap-1.5 text-muted sm:gap-2",
                  compact ? "text-[8px] sm:text-[9px]" : "text-[9px]",
                )}
              >
                <span className="flex items-center gap-0.5">
                  <Star
                    className={cn(
                      "fill-amber-400 text-amber-400",
                      compact ? "h-2 w-2 sm:h-2.5 sm:w-2.5" : "h-2.5 w-2.5",
                    )}
                  />
                  <span className="num font-semibold">{bundle.vendor.rating.toFixed(1)}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className={compact ? "h-2 w-2 sm:h-2.5 sm:w-2.5" : "h-2.5 w-2.5"} />
                  <span className="num">~{bundle.vendor.fulfilmentMinutes}m</span>
                </span>
                <span
                  className={cn(
                    "items-center gap-0.5 text-emerald-600",
                    compact ? "hidden min-[360px]:flex" : "flex",
                  )}
                >
                  <Zap className={compact ? "h-2 w-2 sm:h-2.5 sm:w-2.5" : "h-2.5 w-2.5"} />
                  Live
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Link>
  );
}
