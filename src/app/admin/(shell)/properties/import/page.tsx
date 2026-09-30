import Link from "next/link";
import { importProperties } from "./actions";
import EngineTabs from "@/components/admin/EngineTabs";

const TEMPLATE =
  "title,bank,category,location,description,borrower,reserve_price,emd,auction_start,auction_method,possession_status\n" +
  '"3 BHK flat, Ghatkopar West",State Bank of India,RESIDENTIAL,Mumbai,"Flat on 5th floor",Mr. Sharma,8500000,850000,2026-11-10T11:00,E-Auction,Symbolic\n';

export const maxDuration = 300;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; skipped?: string; failed?: string; error?: string }>;
}) {
  const { created, skipped, failed, error } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Data Engine</h1>
      <EngineTabs />
      <h2 className="text-lg font-semibold mb-1">Bulk Import</h2>
      <p className="text-sm text-brand-muted mb-6">
        Upload a CSV of listings you are entitled to publish (bank notices, partner feeds, your own data). Rows publish
        immediately as Upcoming auctions. Rows whose title already exists for the same bank are skipped, so re-uploading
        is safe. Max 500 rows per upload.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">
          {error === "header" ? "The first row must be a header row that includes a \"title\" column." : "Upload a file or paste CSV text."}
        </div>
      )}
      {created !== undefined && (
        <div className="bg-green-50 text-green-800 text-sm rounded-lg px-3 py-2 mb-4 max-w-2xl">
          Imported {created} new, skipped {skipped} duplicate(s), {failed} failed.{" "}
          <Link href="/admin/properties" className="underline">View properties</Link>
        </div>
      )}

      <form action={importProperties} className="space-y-4 max-w-2xl bg-white border border-brand-border rounded-xl p-5">
        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">…or paste CSV</label>
          <textarea name="csv" rows={6} className="w-full border border-brand-border rounded-lg px-3 py-2 text-xs font-mono" placeholder="title,bank,category,location,..." />
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Import</button>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="bankauction-import-template.csv"
            className="text-sm text-brand hover:underline"
          >
            Download template
          </a>
        </div>
        <p className="text-xs text-brand-muted">
          Columns: title (required), bank, category (RESIDENTIAL, COMMERCIAL, INDUSTRIAL, LAND_PLOT, AGRICULTURAL, VEHICLE),
          location, description, borrower, reserve_price, emd, auction_start (e.g. 2026-11-10T11:00), auction_method,
          possession_status.
        </p>
      </form>
    </div>
  );
}
