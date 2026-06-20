import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  fetchMaintenanceState,
  isMaintenanceBypassPath,
} from "@/lib/platform/maintenance-edge";

const PROTECTED_PREFIXES = ["/admin", "/vendor/dashboard", "/account", "/checkout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response: NextResponse;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    response = await updateSession(request);
    if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
      // Auth enforcement hooks in when Supabase is configured
    }
  } else {
    response = NextResponse.next();
  }

  if (!isMaintenanceBypassPath(pathname)) {
    const maintenance = await fetchMaintenanceState();
    if (maintenance.enabled) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
