/**
 * One-time master admin bootstrap endpoint.
 * POST /api/admin/setup
 * Requires ADMIN_SETUP_SECRET header to match ADMIN_SETUP_SECRET env var.
 * Creates the first master admin from MASTER_ADMIN_EMAIL + MASTER_ADMIN_PASSWORD env vars.
 * Idempotent: if the master admin already exists, returns 200 without changing anything.
 * This endpoint is a no-op once an admin_users row with MASTER role exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // constant time even on mismatch
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SETUP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SETUP_SECRET is not configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-setup-secret") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.MASTER_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    return NextResponse.json(
      { error: "MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD (min 12 chars) must be set" },
      { status: 400 }
    );
  }

  const existing = await prisma.adminUser.findFirst({ where: { role: "MASTER" } });
  if (existing) {
    return NextResponse.json({ ok: true, message: "Master admin already exists", email: existing.email });
  }

  await prisma.adminUser.create({
    data: { email, passwordHash: hashPassword(password), role: "MASTER", active: true },
  });

  return NextResponse.json({ ok: true, message: "Master admin created", email });
}
