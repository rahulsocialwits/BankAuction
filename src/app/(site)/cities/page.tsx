import type { Metadata } from "next";
import CityDirectory, { type StateGroup } from "@/components/CityDirectory";
import { getPlaces } from "@/lib/queries/places";
import { citySlug } from "@/lib/queries/cities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Bank Auction Properties by State and City",
  description: "Find bank auction properties by state and city across India: Maharashtra, Gujarat, Karnataka, Tamil Nadu and more, with reserve prices and auction dates.",
  alternates: { canonical: "/cities" },
};

export default async function CitiesPage() {
  const { cities } = await getPlaces();

  const byState = new Map<string, StateGroup>();
  for (const c of cities) {
    const state = c.state ?? "Other";
    const g = byState.get(state) ?? { state, total: 0, cities: [] };
    g.total += c.count;
    g.cities.push({ city: c.city, slug: citySlug(c.city), count: c.count });
    byState.set(state, g);
  }
  const groups = [...byState.values()]
    .map((g) => ({ ...g, cities: g.cities.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)) }))
    .sort((a, b) => (a.state === "Other" ? 1 : b.state === "Other" ? -1 : b.total - a.total || a.state.localeCompare(b.state)));

  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10">
      <h1 className="text-2xl font-semibold mb-1">Browse by State and City</h1>
      <p className="text-brand-muted text-sm mb-6">Every state and city in our catalogue, with the total number of published listings (including auctions that have ended). For auctions you can still bid on, open a city page.</p>
      {groups.length === 0 ? (
        <p className="text-brand-muted text-sm py-10 text-center">No published listings with a location yet.</p>
      ) : (
        <CityDirectory groups={groups} />
      )}
    </main>
  );
}
