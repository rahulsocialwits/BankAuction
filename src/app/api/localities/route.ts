import { NextResponse } from "next/server";
import { getLocalityMap } from "@/lib/queries/localities";

const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

/** The areas of every city, or only of one city with ?city=Mumbai (small answer for the search filters). */
export async function GET(req: Request) {
  const map = await getLocalityMap();
  const city = new URL(req.url).searchParams.get("city");
  if (!city) return NextResponse.json(map, { headers: CACHE });
  const key = Object.keys(map).find((k) => k.toLowerCase() === city.trim().toLowerCase());
  return NextResponse.json(key ? { [key]: map[key] } : {}, { headers: CACHE });
}
