import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Serves an admin-uploaded image. The page URL carries ?v=<version>, so it can be cached for a year. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(key)) return new Response("Not found", { status: 404 });

  const img = await prisma.siteImage.findUnique({ where: { key } });
  if (!img) return new Response("Not found", { status: 404 });

  const etag = `"${img.updatedAt.getTime()}-${img.sizeBytes}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const versioned = request.nextUrl.searchParams.has("v");
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.contentType,
      "Content-Length": String(img.data.length),
      ETag: etag,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
