import { NextResponse } from "next/server";
import { getLocalityMap } from "@/lib/queries/localities";

export async function GET() {
  const map = await getLocalityMap();
  return NextResponse.json(map, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
