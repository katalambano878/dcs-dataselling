/** Shared fetch with AbortSignal timeout for external APIs. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15_000,
): Promise<Response> {
  const signal =
    init.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(ms)
      : undefined);

  return fetch(url, { ...init, signal });
}
