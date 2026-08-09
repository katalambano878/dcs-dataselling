import "server-only";
import { cookies } from "next/headers";

/** Plain-Postgres session cookies (GoTrue-compatible names for middleware reuse). */
export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";

const SESSION_SEC = 60 * 60 * 24 * 2; // 48 hours — match auth token TTL

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function readAccessTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}

export async function setPlainPgSessionCookies(session: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}): Promise<void> {
  const jar = await cookies();
  const accessMax = session.expires_in && session.expires_in > 0 ? session.expires_in : SESSION_SEC;
  jar.set(ACCESS_COOKIE, session.access_token, cookieBase(accessMax));
  jar.set(REFRESH_COOKIE, session.refresh_token, cookieBase(SESSION_SEC));
}

export async function clearPlainPgSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
}
