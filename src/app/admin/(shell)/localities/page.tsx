import { prisma } from "@/lib/db/prisma";
import { PRIORITY_CITIES } from "@/lib/constants";
import { addLocalities, deleteLocality, toggleLocality } from "./actions";

export const dynamic = "force-dynamic";

export default async function LocalitiesPage() {
  const rows = await prisma.locality.findMany({ orderBy: [{ city: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
  const byCity = new Map<string, typeof rows>();
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r]);
  const cities = [...new Set([...PRIORITY_CITIES, ...byCity.keys()])];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Locations</h1>
      <p className="text-sm text-brand-muted mb-6">
        Areas shown in the search suggestions, listing filters and homepage &quot;Browse by Location&quot;. Add the
        neighbourhoods people actually search for (e.g. Ghatkopar, Kurla, Dadar under Mumbai) — good for SEO.
      </p>

      <form action={addLocalities} className="bg-white border border-brand-border rounded-xl p-5 mb-8 grid sm:grid-cols-[200px_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">City</label>
          <input name="city" list="city-list" required placeholder="Mumbai" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          <datalist id="city-list">
            {cities.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Areas (comma or new-line separated)</label>
          <input name="names" required placeholder="Bhandup, Mulund, Vikhroli" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:bg-brand-dark">Add</button>
      </form>

      <div className="space-y-5">
        {cities.map((city) => {
          const list = byCity.get(city) ?? [];
          return (
            <div key={city} className="bg-white border border-brand-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{city}</h2>
                <span className="text-xs text-brand-muted">{list.length} area(s)</span>
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-brand-muted">No areas yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {list.map((l) => (
                    <div key={l.id} className={`flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs border ${l.active ? "bg-brand-bg border-brand-border" : "bg-gray-100 border-gray-200 text-gray-400 line-through"}`}>
                      <span>{l.name}</span>
                      <form action={toggleLocality}>
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" title={l.active ? "Hide" : "Show"} className="px-1.5 hover:text-brand">{l.active ? "◉" : "○"}</button>
                      </form>
                      <form action={deleteLocality}>
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" title="Delete" className="px-1.5 hover:text-red-600">×</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
