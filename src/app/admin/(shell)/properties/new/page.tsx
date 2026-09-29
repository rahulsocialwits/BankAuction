import { createManualProperty } from "./actions";

const CATEGORIES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
  { label: "Vehicles", value: "VEHICLE" },
];

export default function AddPropertyPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand mb-1">Add Property</h1>
      <p className="text-sm text-brand-muted mb-6">
        Manually create a listing. It publishes immediately — use this for properties you have direct, verified
        information about.
      </p>

      <form action={createManualProperty} className="space-y-4 max-w-2xl bg-white border border-brand-border rounded-xl p-5">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input name="title" required className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select name="category" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm">
              <option value="">Unclassified</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input name="addressText" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea name="description" rows={3} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Bank Name</label>
            <input name="bankName" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Borrower</label>
            <input name="borrower" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Reserve Price (₹)</label>
            <input name="reservePrice" type="number" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">EMD (₹)</label>
            <input name="emd" type="number" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Auction Start</label>
            <input name="auctionStart" type="datetime-local" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Auction Method</label>
            <input name="auctionMethod" placeholder="e.g. E-Auction" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Possession Status</label>
          <input name="possessionStatus" className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">
          Publish Property
        </button>
      </form>
    </div>
  );
}
