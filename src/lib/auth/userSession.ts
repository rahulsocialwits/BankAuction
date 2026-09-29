import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

export const USER_COOKIE_NAME = "user_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("USER_SESSION_SECRET (or ADMIN_SESSION_SECRET) is not set");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createUserSessionValue(userId: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function readUserIdFromSession(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, signature] = parts;
  const payload = `${userId}.${expiresAtStr}`;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null;

  return userId;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = readUserIdFromSession(cookieStore.get(USER_COOKIE_NAME)?.value);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export const USER_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;
