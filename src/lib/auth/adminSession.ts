import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export type AdminRoleName = "MASTER" | "ADMIN";
export interface AdminSession {
  role: AdminRoleName;
  adminId: string | null; // null for the master-password login
}

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

/** Signed "expiresAt.role.adminId.signature" cookie value — no server-side session store needed. */
export function createAdminSessionValue(session: AdminSession): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}.${session.role}.${session.adminId ?? "-"}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the session, or null when the cookie is missing, forged, expired or from before roles existed. */
export function readAdminSession(cookieValue: string | undefined): AdminSession | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return null;
  const [expires, role, adminId, signature] = parts;
  const payload = `${expires}.${role}.${adminId}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;
  if (role !== "MASTER" && role !== "ADMIN") return null;
  return { role, adminId: adminId === "-" ? null : adminId };
}

export const isValidAdminSession = (cookieValue: string | undefined) => readAdminSession(cookieValue) !== null;

export const ADMIN_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

// What a normal admin may open. Everything else under /admin is for the master admin only.
const ADMIN_ALLOWED: { prefix: string; blocked?: string[] }[] = [
  { prefix: "/admin", blocked: undefined }, // the dashboard itself (exact match handled below)
  { prefix: "/admin/properties", blocked: ["/admin/properties/import"] },
  { prefix: "/admin/blog" },
  { prefix: "/admin/localities" },
];

export function canAccessAdminPath(role: AdminRoleName, pathname: string): boolean {
  if (role === "MASTER") return true;
  const p = pathname.replace(/\/+$/, "") || "/admin";
  if (p === "/admin") return true;
  return ADMIN_ALLOWED.some(
    (r) => r.prefix !== "/admin" && (p === r.prefix || p.startsWith(r.prefix + "/")) && !(r.blocked ?? []).some((b) => p === b || p.startsWith(b + "/")),
  );
}
