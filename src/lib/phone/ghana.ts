/**
 * Ghana MSISDN helpers.
 *
 * MTN local prefixes (common): 024, 054, 025, 053, 055, 059
 * Telecel: 020, 050
 * AirtelTigo / AT: 026, 027, 056, 057, 023
 */

export const MTN_MSISDN_PREFIXES = ["024", "054", "025", "053", "055", "059"] as const;
export const TELECEL_MSISDN_PREFIXES = ["020", "050"] as const;
export const AT_MSISDN_PREFIXES = ["026", "027", "056", "057", "023"] as const;

export type GhanaNetworkSlug = "mtn" | "telecel" | "at";

/** Normalize to local 0XXXXXXXXX. */
export function normalizeGhanaMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

export function detectGhanaNetwork(localPhone: string): GhanaNetworkSlug | null {
  const p = localPhone.replace(/\D/g, "");
  if (MTN_MSISDN_PREFIXES.some((x) => p.startsWith(x))) return "mtn";
  if (TELECEL_MSISDN_PREFIXES.some((x) => p.startsWith(x))) return "telecel";
  if (AT_MSISDN_PREFIXES.some((x) => p.startsWith(x))) return "at";
  return null;
}

export function isLikelyMtnMsisdn(localPhone: string): boolean {
  return detectGhanaNetwork(localPhone) === "mtn";
}
