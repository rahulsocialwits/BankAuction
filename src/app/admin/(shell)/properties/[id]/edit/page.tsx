import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import SubmitButton from "@/components/admin/SubmitButton";
import { updateProperty } from "../../actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  ["RESIDENTIAL", "Residential"],
  ["COMMERCIAL", "Commercial"],
  ["INDUSTRIAL", "Industrial"],
  ["LAND_PLOT", "Land & Plot"],
  ["AGRICULTURAL", "Agricultural"],
  ["VEHICLE", "Vehicle"],
];
const STATUSES = [
  ["PUBLISHED", "Published (visible on the site)"],
  ["PENDING_REVIEW", "Pending review"],
  ["DRAFT", "Draft"],
  ["DUPLICATE", "Duplicate (hidden)"],
  ["EXPIRED", "Expired"],
  ["REMOVED", "Removed (hidden)"],
];

// <input type="datetime-local"> value in IST.
function istInput(d: Date | null | undefined) {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" }).format(d);
  return p.replace(" ", "T");
}

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";
const label = "block text-xs font-semibold mb-1";

export default async function EditPropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const p = await prisma.property.findUnique({
    where: { id },
    include: { auctions: { include: { bank: true }, orderBy: { createdAt: "desc" }, take: 1 }, sourceRecords: { include: { source: true }, take: 1 } },
  });
  if (!p) notFound();
  const a = p.auctions[0];
  const source = p.sourceRecords[0]?.source.name ?? a?.statusSource ?? "Added manually";

  return (
    <div className="max-w-3xl">
      <Link href="/admin/properties" className="text-xs text-brand-muted hover:text-brand">← Back to properties</Link>
      <h1 className="text-2xl font-semibold text-brand mt-2 mb-1">Edit property</h1>
      <p className="text-xs text-brand-muted mb-5">
        Source: {source}
        {a?.bank ? ` · ${a.bank.name}` : ""}
        {p.sourceRecords.length > 0 && " · If the source page changes, the crawler may refresh title, description and dates."}
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <form action={updateProperty} className="space-y-5">
        <input type="hidden" name="propertyId" value={p.id} />

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Listing</h2>
          <div>
            <label className={label}>Title</label>
            <input name="title" required defaultValue={p.title} className={input} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Category</label>
              <select name="category" defaultValue={p.category ?? ""} className={input}>
                <option value="">Not set</option>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <select name="status" defaultValue={p.status} className={input}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Location</label>
            <input name="addressText" defaultValue={p.addressText ?? ""} className={input} />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea name="description" rows={5} defaultValue={p.description ?? ""} className={input} />
          </div>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Auction {!a && <span className="text-xs font-normal text-brand-muted">(no auction record to edit)</span>}</h2>
          {a && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={label}>Reserve price (₹)</label>
                  <input name="reservePrice" inputMode="numeric" defaultValue={a.reservePrice ? Number(a.reservePrice) : ""} className={input} />
                </div>
                <div>
                  <label className={label}>EMD (₹)</label>
                  <input name="emd" inputMode="numeric" defaultValue={a.emd ? Number(a.emd) : ""} className={input} />
                </div>
                <div>
                  <label className={label}>Auction start (IST)</label>
                  <input name="auctionStart" type="datetime-local" defaultValue={istInput(a.auctionStart)} className={input} />
                </div>
                <div>
                  <label className={label}>Auction end (IST)</label>
                  <input name="auctionEnd" type="datetime-local" defaultValue={istInput(a.auctionEnd)} className={input} />
                </div>
                <div>
                  <label className={label}>Application deadline (IST)</label>
                  <input name="applicationDeadline" type="datetime-local" defaultValue={istInput(a.applicationDeadline)} className={input} />
                </div>
                <div>
                  <label className={label}>Auction method</label>
                  <input name="auctionMethod" defaultValue={a.auctionMethod ?? ""} className={input} />
                </div>
              </div>
              <div>
                <label className={label}>Possession status</label>
                <input name="possessionStatus" defaultValue={a.possessionStatus ?? ""} className={input} />
              </div>
            </>
          )}
        </section>

        <div className="flex items-center gap-4">
          <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Save changes</SubmitButton>
          <Link href="/admin/properties" className="text-sm text-brand-muted hover:text-brand">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
