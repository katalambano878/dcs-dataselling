export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Display helper for bundle sizes.
 * - Decimal catalogue: 1000/2000/3000 MB → 1GB/2GB/3GB
 * - Legacy binary SKUs: 1024/2048/3072/4096/5120 MB → 1GB/2GB/3GB/4GB/5GB
 * Never show misleading labels like "3.1GB" for a 3GB package.
 */
export function formatDataAmount(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "0MB";
  if (mb < 1000) return `${mb % 1 === 0 ? mb : mb.toFixed(1)}MB`;

  if (mb % 1000 === 0) return `${mb / 1000}GB`;
  if (mb % 1024 === 0) return `${mb / 1024}GB`;

  const gb1000 = mb / 1000;
  const gb1024 = mb / 1024;
  const err1000 = Math.abs(gb1000 - Math.round(gb1000));
  const err1024 = Math.abs(gb1024 - Math.round(gb1024));
  if (err1024 <= 0.05 && err1024 <= err1000) return `${Math.round(gb1024)}GB`;
  if (err1000 <= 0.05) return `${Math.round(gb1000)}GB`;

  const gb = Math.round(gb1000 * 10) / 10;
  return gb % 1 === 0 ? `${gb}GB` : `${gb.toFixed(1)}GB`;
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-GH", { notation: "compact" }).format(n);
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return `+233 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return phone;
}
