import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const ALLOWED = ["q", "category", "bank", "state", "city", "locality", "status", "priceMin", "priceMax"];
const MAX_PER_USER = 20;

/** POST {name, filters} -> keeps the search (only the known filter names, short text values). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; filters?: Record<string, unknown> };
  const filters: Record<string, string> = {};
  for (const k of ALLOWED) {
    const v = body.filters?.[k];
    if (typeof v === "string" && v.trim() && v.length <= 80) filters[k] = v.trim();
  }
  if (Object.keys(filters).length === 0) return NextResponse.json({ error: "no_filters" }, { status: 400, headers: NO_STORE });
  if ((await prisma.savedSearch.count({ where: { userId: user.id } })) >= MAX_PER_USER) return NextResponse.json({ error: "too_many" }, { status: 400, headers: NO_STORE });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  await prisma.savedSearch.create({ data: { userId: user.id, name: name || null, filters } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** DELETE ?id=... -> removes one of the user's own saved searches. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401, headers: NO_STORE });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await prisma.savedSearch.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
