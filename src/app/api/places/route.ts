import { NextResponse } from "next/server";
import { getPlaces } from "@/lib/queries/places";

export async function GET() {
  return NextResponse.json(await getPlaces(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
