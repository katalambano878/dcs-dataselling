import "server-only";

import { redirect } from "next/navigation";
import type { UserRole } from "@/types";
import { getCurrentProfile } from "@/lib/auth/session";
import { consoleStaffNavHref } from "@/lib/platform/console-host";
import { headers } from "next/headers";
import { isConsoleHost } from "@/lib/platform/console-host";

export function isConsoleStaffRole(role: UserRole | undefined): boolean {
  return role === "admin" || role === "ops";
}

export async function requireConsoleStaff() {
  const profile = await getCurrentProfile();
  if (!profile || !isConsoleStaffRole(profile.role)) {
    const host = (await headers()).get("host");
    const onConsoleHost = isConsoleHost(host);
    redirect(onConsoleHost ? "/" : "/console");
  }
  return profile;
}

export function getConsoleStaffHome(onConsoleHost: boolean): string {
  return consoleStaffNavHref("", onConsoleHost);
}
