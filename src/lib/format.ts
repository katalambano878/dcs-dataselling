export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Platform rule: 1 GB = 1000 MB (decimal), so 3000 MB shows as 3GB. */
export function formatDataAmount(mb: number): string {
  if (mb >= 1000) {
    // Round to 1 decimal so legacy binary sizes (1024, 2048…) show clean GB.
    const gb = Math.round((mb / 1000) * 10) / 10;
    return gb % 1 === 0 ? `${gb}GB` : `${gb.toFixed(1)}GB`;
  }
  return `${mb}MB`;
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
