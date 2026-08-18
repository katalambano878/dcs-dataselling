/**
 * Convert catalogue `data_mb` to whole GB for supplier APIs.
 *
 * Catalogue rows may use decimal MB (30000 = 30GB) or legacy binary MB
 * (30720 = 30×1024). Naive `Math.round(mb / 1000)` turns 30720 into 31GB and
 * fails product matching ("No valid recipients or products").
 */
export function gbFromDataMb(dataMb: number): number {
  if (!Number.isFinite(dataMb) || dataMb <= 0) return 0;
  const as1024 = dataMb / 1024;
  const as1000 = dataMb / 1000;
  const round1024 = Math.round(as1024);
  const round1000 = Math.round(as1000);
  const err1024 = Math.abs(as1024 - round1024);
  const err1000 = Math.abs(as1000 - round1000);
  if (err1024 <= 0.05 && err1024 <= err1000) return Math.max(1, round1024);
  if (as1000 <= 0.75) return 1;
  return Math.max(1, round1000);
}

/** Decimal MB for APIs that bill 1GB = 1000 MB. */
export function decimalMbFromDataMb(dataMb: number): number {
  const gb = gbFromDataMb(dataMb);
  return gb > 0 ? gb * 1000 : 0;
}
