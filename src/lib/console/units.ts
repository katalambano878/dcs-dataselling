/** 1 GB = 1000 MB (decimal), not 1024. */
export const MB_PER_GB = 1000;

export function gbToMb(gb: number): number {
  return +(gb * MB_PER_GB).toFixed(2);
}

export function mbToGb(mb: number): number {
  return +(mb / MB_PER_GB).toFixed(3);
}

/** Human label e.g. 500MB, 1GB, 100GB */
export function formatConsoleData(mb: number): string {
  const n = Number(mb);
  if (!Number.isFinite(n) || n <= 0) return "0MB";
  if (n >= MB_PER_GB && n % MB_PER_GB === 0) {
    return `${n / MB_PER_GB}GB`;
  }
  if (n >= MB_PER_GB) {
    return `${mbToGb(n)}GB`;
  }
  return `${n % 1 === 0 ? n : n.toFixed(1)}MB`;
}

export function generateConsoleReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DCS-CON-${date}-${rand}`;
}

export function generateConsoleCreditReference(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DCS-CON-CREDIT-${date}-${rand}`;
}

/** Common send sizes (MB) matching typical reseller consoles. */
export const CONSOLE_SEND_SIZES_MB = [
  500, 1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000,
] as const;
