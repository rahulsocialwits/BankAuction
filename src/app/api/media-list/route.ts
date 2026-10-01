import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isMasterAdmin } from "@/lib/auth/adminAuth";

export const dynamic = "force-dynamic";

/** The library list for the "Choose from library" pop-up. Master admin only. */
export async function GET() {
  if (!(await isMasterAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const rows = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, name: true, width: true, height: true, sizeBytes: true },
  });
  return NextResponse.json(rows, { headers: { "Cache-Control": "private, no-store" } });
}
