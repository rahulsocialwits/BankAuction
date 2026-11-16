import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { assignCity, unassignCity } from "./actions";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const take = 30;
  const skip = (pageNum - 1) * take;

  // Cities from geoCity field (AI-verified)
  const cityCounts = await prisma.property.groupBy({
    by: ["geoCity"],
    where: {
      geoCity: { not: null },
      status: { notIn: ["REMOVED"] },
      ...(q ? { geoCity: { contains: q, mode: "insensitive" } } : {}),
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take,
    skip,
  });

  const totalCities = await prisma.property.groupBy({
    by: ["geoCity"],
    where: {
      geoCity: { not: null },
      status: { notIn: ["REMOVED"] },
      ...(q ? { geoCity: { contains: q, mode: "insensitive" } } : {}),
    },
  }).then((r) => r.length);

  // Properties with no geoCity
  const unassigned = await prisma.property.count({
    where: { geoCity: null, status: { notIn: ["REMOVED", "DUPLICATE"] } },
  });

  // States summary
  const stateCounts = await prisma.property.groupBy({
    by: ["geoState"],
    where: { geoState: { not: null }, status: { notIn: ["REMOVED"] } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const totalPages = Math.ceil(totalCities / take);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Location Management</h1>
          <p className="text-sm text-brand-muted">
            Cities and areas derived from property data. Manually assigned cities take precedence over automated parsing.
          </p>
        </div>
        <Link href="/admin/localities" className="text-sm font-medium border border-brand-border rounded-lg px-4 py-2 hover:border-brand hover:text-brand">
          Manage search suggestions →
        </Link>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className="text-2xl font-bold text-brand">{totalCities}</div>
          <div className="text-xs text-brand-muted">Cities with properties</div>
        </div>
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className={`text-2xl font-bold ${unassigned > 0 ? "text-amber-600" : "text-green-700"}`}>{unassigned}</div>
          <div className="text-xs text-brand-muted">Properties missing city</div>
          {unassigned > 0 && (
            <Link href="/admin/properties?geoCity=__none__" className="text-xs text-brand mt-1 inline-block hover:underline">View →</Link>
          )}
        </div>
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className="text-2xl font-bold text-brand">{stateCounts.length}</div>
          <div className="text-xs text-brand-muted">States represented</div>
        </div>
        <div className="bg-white border border-brand-border rounded-xl p-4">
          <div className="text-sm font-semibold text-brand-muted mb-1">Top states</div>
          {stateCounts.slice(0, 3).map((s) => (
            <div key={s.geoState} className="text-xs text-brand-muted">{s.geoState}: {s._count.id}</div>
          ))}
        </div>
      </div>

      {/* Search + city list */}
      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex flex-wrap items-center gap-3">
          <span className="font-semibold text-sm">Cities ({totalCities})</span>
          <form className="flex gap-2 ml-auto">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search city…"
              className="border border-brand-border rounded-lg px-3 py-1.5 text-sm w-48"
            />
            <button type="submit" className="bg-brand text-white text-sm px-4 py-1.5 rounded-lg hover:bg-brand-dark">Search</button>
            {q && <Link href="/admin/locations" className="text-sm px-3 py-1.5 border border-brand-border rounded-lg hover:border-brand">Clear</Link>}
          </form>
        </div>

        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-brand-bg text-left text-xs text-brand-muted">
            <tr>
              <th className="px-4 py-2.5">City</th>
              <th className="px-4 py-2.5 text-right">Properties</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cityCounts.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-brand-muted">No cities found{q ? ` matching "${q}"` : ""}.</td>
              </tr>
            )}
            {cityCounts.map((row) => (
              <tr key={row.geoCity} className="border-t border-brand-border hover:bg-brand-bg">
                <td className="px-4 py-2.5 font-medium">{row.geoCity}</td>
                <td className="px-4 py-2.5 text-right text-brand-muted">{row._count.id}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/locations/${encodeURIComponent(row.geoCity ?? "")}`}
                    className="text-xs text-brand hover:underline mr-3"
                  >
                    View areas →
                  </Link>
                  <Link
                    href={`/admin/properties?geoCity=${encodeURIComponent(row.geoCity ?? "")}`}
                    className="text-xs text-brand-muted hover:underline"
                  >
                    Browse properties
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-brand-border flex items-center justify-between text-xs text-brand-muted">
            <span>Page {pageNum} of {totalPages}</span>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Link href={`/admin/locations?${q ? `q=${q}&` : ""}page=${pageNum - 1}`} className="border border-brand-border rounded px-3 py-1 hover:border-brand">← Prev</Link>
              )}
              {pageNum < totalPages && (
                <Link href={`/admin/locations?${q ? `q=${q}&` : ""}page=${pageNum + 1}`} className="border border-brand-border rounded px-3 py-1 hover:border-brand">Next →</Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unassigned banner */}
      {unassigned > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>{unassigned} properties</strong> have no assigned city (geoCity is blank). These will not appear in city-filtered searches or the homepage Browse by Location section. Run the geo enrichment from Admin → Engine to assign cities automatically, or assign manually via the property edit page.
        </div>
      )}
    </div>
  );
}
