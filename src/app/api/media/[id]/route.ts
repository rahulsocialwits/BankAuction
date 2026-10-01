import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Serves a library image (the original, or `?thumb=1` for the small preview). Content never changes for an id, so it is cached for a year. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return new Response("Not found", { status: 404 });

  const wantThumb = request.nextUrl.searchParams.has("thumb");
  const row = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { contentType: true, sizeBytes: true, hash: true, ...(wantThumb ? { thumb: true, data: true } : { data: true }) },
  });
  if (!row) return new Response("Not found", { status: 404 });

  const etag = `"${row.hash.slice(0, 16)}${wantThumb ? "-t" : ""}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const thumb = wantThumb ? (row as { thumb?: Buffer | null }).thumb : null;
  const body = thumb ?? row.data;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": thumb ? "image/webp" : row.contentType,
      "Content-Length": String(body.length),
      ETag: etag,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
