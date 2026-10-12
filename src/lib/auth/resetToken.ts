import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Password-reset links without a database table. A token is  <userId>.<expiresAt>.<signature>  where the signature is an HMAC of
 * the first two parts AND of the user's CURRENT password hash. So a link stops working as soon as the password is changed (it can
 * be used once) or when it expires, and nobody can forge one without the server secret.
 */

const secret = () => {
  const s = process.env.USER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("USER_SESSION_SECRET (or ADMIN_SESSION_SECRET) is not set");
  return s;
};

const sign = (payload: string, passwordHash: string) => createHmac("sha256", secret()).update(`${payload}|${passwordHash}`).digest("hex");

export function createResetToken(userId: string, passwordHash: string, validMinutes = 60, now = Date.now()): string {
  const payload = `${userId}.${now + validMinutes * 60_000}`;
  return `${payload}.${sign(payload, passwordHash)}`;
}

/** The user id inside a token (to look the user up); it is NOT trusted until verifyResetToken passes. */
export function resetTokenUserId(token: string): string | null {
  const parts = token.split(".");
  return parts.length === 3 && parts[0] ? parts[0] : null;
}

export function verifyResetToken(token: string, passwordHash: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, expiresAt, signature] = parts;
  const exp = Number(expiresAt);
  if (!userId || !Number.isFinite(exp) || now >= exp) return false;
  const expected = Buffer.from(sign(`${userId}.${expiresAt}`, passwordHash));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
