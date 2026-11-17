import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function CityDetailPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const cityName = decodeURIComponent(city);

  const [totalInCity, localityCounts, recentProperties] = await Promise.all([
    prisma.property.count({
      where: { geoCity: cityName, status: { notIn: ["REMOVED"] } },
    }),
    prisma.property.groupBy({
      by: ["geoLocality"],
      where: { geoCity: cityName, geoLocality: { not: null }, status: { notIn: ["REMOVED"] } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.property.findMany({
      where: { geoCity: cityName, status: { notIn: ["REMOVED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true, geoLocality: true, createdAt: true },
    }),
  ]);

  if (totalInCity === 0) notFound();

  const noLocality = await prisma.property.count({
    where: { geoCity: cityName, geoLocality: null, status: { notIn: ["REMOVED"] } },
  });

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-muted mb-4">
        <Link href="/admin/locations" className="hover:text-brand">Locations</Link>
        <span>›</span>
        <span className="text-brand font-medium">{cityName}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">{cityName}</h1>
          <p className="text-sm text-brand-muted">{totalInCity} properties</p>
        </div>
        <Link
          href={`/admin/properties?geoCity=${encodeURIComponent(cityName)}`}
          className="text-sm font-medium border border-brand-border rounded-lg px-4 py-2 hover:border-brand hover:text-brand"
        >
          Browse all properties →
        </Link>
      </div>

      {/* Areas grid */}
      <div className="bg-white border border-brand-border rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-brand-border">
          <span className="font-semibold text-sm">Areas / Localities ({localityCounts.length})</span>
          {noLocality > 0 && (
            <span className="ml-3 text-xs text-amber-600">{noLocality} properties without an area</span>
          )}
        </div>
        {localityCounts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-muted text-center">No locality data for properties in {cityName}.</p>
        ) : (
          <div className="p-4 flex flex-wrap gap-2">
            {localityCounts.map((row) => (
              <Link
                key={row.geoLocality}
                href={`/admin/properties?geoCity=${encodeURIComponent(cityName)}&geoLocality=${encodeURIComponent(row.geoLocality ?? "")}`}
                className="inline-flex items-center gap-2 bg-brand-bg border border-brand-border rounded-full px-3 py-1 text-xs hover:border-brand hover:text-brand"
              >
                <span>{row.geoLocality}</span>
                <span className="font-semibold">{row._count.id}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent properties */}
      <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex justify-between items-center">
          <span className="font-semibold text-sm">Recent properties in {cityName}</span>
          <Link href={`/admin/properties?geoCity=${encodeURIComponent(cityName)}`} className="text-xs text-brand hover:underline">View all →</Link>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {recentProperties.map((p) => (
              <tr key={p.id} className="border-t border-brand-border hover:bg-brand-bg">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/properties/${p.id}/edit`} className="font-medium hover:text-brand truncate max-w-xs block">{p.title}</Link>
                  {p.geoLocality && <span className="text-xs text-brand-muted">{p.geoLocality}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    p.status === "PUBLISHED" ? "bg-green-50 text-green-700" :
                    p.status === "PENDING_REVIEW" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>{p.status}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-brand-muted text-right">
                  {p.createdAt.toLocaleDateString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
