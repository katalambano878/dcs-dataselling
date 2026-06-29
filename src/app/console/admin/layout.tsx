import { redirect } from "next/navigation";
import { requireConsoleStaff } from "@/lib/console/admin-access";

export const dynamic = "force-dynamic";

export default async function ConsoleAdminLayout({ children }: { children: React.ReactNode }) {
  await requireConsoleStaff();
  return children;
}
