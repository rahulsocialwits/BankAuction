import { NextRequest } from "next/server";
import { apiJson, authenticateApi } from "@/lib/apiKeys";
import { getPlaces } from "@/lib/queries/places";

export const dynamic = "force-dynamic";

/** GET /api/v1/places: states, cities (with their state) and areas that have published listings, with counts. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return auth.response;
  return apiJson({ data: await getPlaces() });
}
