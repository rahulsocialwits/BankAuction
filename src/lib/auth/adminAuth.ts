import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, readAdminSession, type AdminSession } from "./adminSession";

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return readAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
}

export async function isMasterAdmin(): Promise<boolean> {
  return (await getAdminSession())?.role === "MASTER";
}

/**
 * Call first in every master-only server action and page. The proxy already blocks these URLs for a
 * normal admin; this is the second lock, because a server action can be invoked directly.
 */
export async function requireMaster(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (s.role !== "MASTER") redirect("/admin");
  return s;
}
