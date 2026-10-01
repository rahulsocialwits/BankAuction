import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** A new key looks like bk_live_3f9a… The full key is shown once at creation; only its hash is stored. */
export function generateApiKey() {
  const key = `bk_live_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: sha(key) };
}

export const RATE_LIMIT_PER_MINUTE = 120;
const hits = new Map<string, number[]>(); // per server instance; good enough to stop a runaway client

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export const apiError = (status: number, code: string, message: string, headers?: Record<string, string>) => json(status, { error: { code, message } }, headers);

/** Checks the key on a /api/v1 request. Returns the key id, or the error response to send back. */
export async function authenticateApi(request: NextRequest): Promise<{ ok: true; keyId: string } | { ok: false; response: NextResponse }> {
  const header = request.headers.get("authorization");
  const token = (header?.toLowerCase().startsWith("bearer ") ? header.slice(7) : request.headers.get("x-api-key"))?.trim();
  if (!token) return { ok: false, response: apiError(401, "missing_key", "Send your key as 'Authorization: Bearer <key>' or the 'x-api-key' header.", { "WWW-Authenticate": "Bearer" }) };

  const row = await prisma.apiKey.findUnique({ where: { keyHash: sha(token) }, select: { id: true, active: true } });
  if (!row || !row.active) return { ok: false, response: apiError(401, "invalid_key", "That API key is not valid or has been switched off.") };

  const now = Date.now();
  const recent = (hits.get(row.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, response: apiError(429, "rate_limited", `Limit is ${RATE_LIMIT_PER_MINUTE} requests per minute per key.`, { "Retry-After": "30" }) };
  }
  recent.push(now);
  hits.set(row.id, recent);

  // Usage numbers for the admin page. A failed write must never fail the request.
  prisma.apiKey.update({ where: { id: row.id }, data: { requestCount: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
  return { ok: true, keyId: row.id };
}

export const apiJson = (body: unknown) => json(200, body);
