import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { getPremium } from "@/lib/payments/premium";

export const dynamic = "force-dynamic";

/**
 * The official documents of one property (notice, terms, paper publication): the links are returned only to a logged-in PREMIUM
 * user, so the property page itself can stay cached and the links are not in the page for everyone.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (!(await getPremium(user.email)).premium) return NextResponse.json({ error: "premium_required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const { slug } = await params;
  const docs = await prisma.propertyDocument.findMany({
    where: { property: { slug, status: "PUBLISHED" } },
    select: { document: { select: { id: true, title: true, type: true, sourceUrl: true } } },
    take: 30,
  });
  return NextResponse.json(
    { documents: docs.map((d) => ({ id: d.document.id, title: d.document.title ?? d.document.type, url: d.document.sourceUrl })) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
