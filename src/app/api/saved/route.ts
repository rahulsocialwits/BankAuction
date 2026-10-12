import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET ?slug=...  -> is this property saved by the logged-in user? */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!user || !slug) return NextResponse.json({ saved: false }, { headers: NO_STORE });
  const row = await prisma.savedProperty.findFirst({ where: { userId: user.id, property: { slug } }, select: { propertyId: true } });
  return NextResponse.json({ saved: !!row }, { headers: NO_STORE });
}

/** POST {slug} -> save, or remove when already saved. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { slug?: unknown };
  const property = typeof body.slug === "string" ? await prisma.property.findUnique({ where: { slug: body.slug }, select: { id: true, status: true } }) : null;
  if (!property || property.status !== "PUBLISHED") return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const key = { userId_propertyId: { userId: user.id, propertyId: property.id } };
  const had = await prisma.savedProperty.findUnique({ where: key });
  if (had) await prisma.savedProperty.delete({ where: key });
  else await prisma.savedProperty.create({ data: { userId: user.id, propertyId: property.id } });
  return NextResponse.json({ saved: !had }, { headers: NO_STORE });
}
