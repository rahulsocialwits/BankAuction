import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";

export const dynamic = "force-dynamic";

const pct = (n: number, total: number) =>
  total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("en-IN");

/** Colour code a completeness ratio: bad < 50%, warn < 80%, good otherwise. */
function tone(n: number, total: number): string {
  if (total === 0) return "text-brand-muted";
  const r = n / total;
  if (r < 0.5) return "text-red-700 font-semibold";
  if (r < 0.8) return "text-amber-700 font-semibold";
  return "text-green-700";
}

export default async function DataQualityPage() {
  await requireMaster();

  // All published properties with at least one auction (the standard content unit).
  const total = await prisma.property.count({ where: { status: "PUBLISHED" } });

  // Auction-level field completeness: a property counts as "having" a field when at least one
  // of its auction rounds has a non-null value for that field.
  const [
    withReservePrice,
    withEmd,
    withAuctionDate,
    withBorrower,
    withOfficer,
    withOfficerContact,
    withAddress,
    withGeoCity,
    withDocuments,
  ] = await Promise.all([
    // Auction fields
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { reservePrice: { not: null } } } } }),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { emd: { not: null } } } } }),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { auctionStart: { not: null } } } } }),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { AND: [{ borrower: { not: null } }, { borrower: { not: "" } }] } } } }),
    prisma.property.count({ where: { status: "PUBLISHED", auctions: { some: { AND: [{ authorizedOfficer: { not: null } }, { authorizedOfficer: { not: "" } }] } } } }),
    prisma.property.count({
      where: {
        status: "PUBLISHED",
        auctions: {
          some: {
            OR: [
              { AND: [{ officerPhone: { not: null } }, { officerPhone: { not: "" } }] },
              { AND: [{ officerEmail: { not: null } }, { officerEmail: { not: "" } }] },
            ],
          },
        },
      },
    }),
    // Property-level fields
    prisma.property.count({ where: { status: "PUBLISHED", AND: [{ addressText: { not: null } }, { addressText: { not: "" } }] } }),
    prisma.property.count({ where: { status: "PUBLISHED", AND: [{ geoCity: { not: null } }, { geoCity: { not: "" } }] } }),
    prisma.property.count({ where: { status: "PUBLISHED", documents: { some: {} } } }),
  ]);

  const fields: Array<{ label: string; n: number; note: string }> = [
    { label: "Reserve price", n: withReservePrice, note: "Auctions without a reserve price cannot be bid on" },
    { label: "Auction date", n: withAuctionDate, note: "Required to show upcoming / active status" },
    { label: "Address", n: withAddress, note: "Raw source address (addressText)" },
    { label: "AI-verified city", n: withGeoCity, note: "Required for city-filter and homepage counts" },
    { label: "EMD (earnest money deposit)", n: withEmd, note: "Required for buyer to prepare funds" },
    { label: "Borrower name", n: withBorrower, note: "Helps buyers assess risk" },
    { label: "Authorized officer name", n: withOfficer, note: "Contact for inspections and queries" },
    { label: "Officer contact (phone/email)", n: withOfficerContact, note: "Direct contact details" },
    { label: "At least one document", n: withDocuments, note: "Sale notice, valuation report, etc." },
  ];

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Data quality</h1>
      <p className="text-sm text-brand-muted mb-5">
        Field completeness for the {num(total)} published {total === 1 ? "property" : "properties"}.
        A property counts as having a field when at least one of its auction rounds has a non-null value.
        Percentages below 80% are amber; below 50% are red.
      </p>

      <div className="bg-white border border-brand-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-left text-xs text-brand-muted border-b border-brand-border">
            <tr>
              <th className="px-5 py-3">Field</th>
              <th className="px-4 py-3 text-right">With data</th>
              <th className="px-4 py-3 text-right">Missing</th>
              <th className="px-4 py-3 text-right">Completeness</th>
              <th className="px-4 py-3 hidden md:table-cell">Note</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(({ label, n, note }) => (
              <tr key={label} className="border-t border-brand-border">
                <td className="px-5 py-2.5 font-medium">{label}</td>
                <td className="px-4 py-2.5 text-right">{num(n)}</td>
                <td className="px-4 py-2.5 text-right text-brand-muted">{num(total - n)}</td>
                <td className={`px-4 py-2.5 text-right ${tone(n, total)}`}>{pct(n, total)}</td>
                <td className="px-4 py-2.5 text-xs text-brand-muted hidden md:table-cell">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-brand-muted mt-4">
        Counts are live from the database. Refresh the page to update. Missing-data listings can be
        enriched manually (Admin → Properties → edit) or by running a deep scan.
      </p>
    </div>
  );
}
