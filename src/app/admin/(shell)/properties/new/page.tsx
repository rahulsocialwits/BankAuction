import { prisma } from "@/lib/db/prisma";
import SubmitButton from "@/components/admin/SubmitButton";
import { createManualProperty } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { label: "Residential", value: "RESIDENTIAL" },
  { label: "Commercial", value: "COMMERCIAL" },
  { label: "Industrial", value: "INDUSTRIAL" },
  { label: "Land & Plot", value: "LAND_PLOT" },
  { label: "Agricultural", value: "AGRICULTURAL" },
];

const DOC_TYPES = [
  ["SALE_NOTICE", "Sale notice"],
  ["AUCTION_NOTICE", "Auction notice"],
  ["SALE_PROCLAMATION", "Sale proclamation"],
  ["BID_FORM", "Bid form"],
  ["TERMS_AND_CONDITIONS", "Terms & conditions"],
  ["PROPERTY_SCHEDULE", "Property schedule"],
  ["POSSESSION_NOTICE", "Possession notice"],
  ["DEMAND_NOTICE", "Demand notice"],
  ["CORRIGENDUM", "Corrigendum"],
  ["INSPECTION_NOTICE", "Inspection notice"],
  ["APPLICATION_FORM", "Application form"],
  ["OTHER", "Other"],
];

const input = "w-full border border-brand-border rounded-lg px-3 py-2 text-sm bg-white";
const label = "block text-xs font-semibold mb-1";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-brand-border rounded-xl p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-brand-muted mt-0.5 mb-3">{hint}</p>}
      <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${hint ? "" : "mt-3"}`}>{children}</div>
    </section>
  );
}

function F({ name, text, type = "text", placeholder, span, required }: { name: string; text: string; type?: string; placeholder?: string; span?: boolean; required?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2 lg:col-span-3" : ""}>
      <label className={label}>{text}{required && <span className="text-red-600"> *</span>}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className={input} />
    </div>
  );
}

export default async function AddPropertyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const banks = await prisma.bank.findMany({ orderBy: { name: "asc" }, select: { name: true } });

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Add Property</h1>
      <p className="text-sm text-brand-muted mb-5">
        Create a listing with every detail a buyer needs. Fields marked * are required; the rest can be filled in later from Edit.
      </p>
      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <form action={createManualProperty} className="space-y-5">
        <Section title="1. Basics">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label}>Title <span className="text-red-600">*</span></label>
            <input name="title" required minLength={8} placeholder="e.g. 3 BHK Flat at Kurla West, Mumbai" className={input} />
          </div>
          <div>
            <label className={label}>Category</label>
            <select name="category" className={input}>
              <option value="">Not set</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <F name="listedType" text="Property type as listed" placeholder="e.g. Residential Flat" />
          <F name="areaSize" text="Area / size" placeholder="e.g. 1,250 sq ft" />
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label}>Description</label>
            <textarea name="description" rows={3} className={input} placeholder="A short summary a buyer can read in ten seconds." />
          </div>
        </Section>

        <Section title="2. Location" hint="The city and area power the City / Area filters on the site.">
          <F name="city" text="City" required placeholder="e.g. Mumbai" />
          <F name="area" text="Area / locality" placeholder="e.g. Kurla West" />
          <F name="state" text="State" placeholder="e.g. Maharashtra" />
          <F name="addressText" text="Full address (optional)" span placeholder="Building, street, landmark, pincode" />
        </Section>

        <Section title="3. Auction details">
          <div>
            <label className={label}>Bank</label>
            <input name="bankName" list="banks" placeholder="Start typing a bank name" className={input} />
            <datalist id="banks">{banks.map((b) => <option key={b.name} value={b.name} />)}</datalist>
          </div>
          <F name="branchName" text="Branch" />
          <F name="noticeNumber" text="Notice / reference number" />
          <F name="reservePrice" text="Reserve price (₹)" type="number" />
          <F name="emd" text="EMD (₹)" type="number" />
          <F name="minimumIncrement" text="Minimum bid increment (₹)" type="number" />
          <F name="auctionStart" text="Auction start (IST)" type="datetime-local" />
          <F name="auctionEnd" text="Auction end (IST)" type="datetime-local" />
          <F name="applicationDeadline" text="Application deadline (IST)" type="datetime-local" />
          <F name="auctionMethod" text="Auction method" placeholder="e.g. E-Auction" />
          <F name="possessionStatus" text="Possession status" placeholder="Physical / Symbolic" />
          <div>
            <label className={label}>DSC required?</label>
            <select name="dscRequired" className={input}>
              <option value="">Not stated</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </Section>

        <Section title="4. Borrower and authorised officer" hint="The borrower name is blurred for visitors without a premium plan.">
          <F name="borrower" text="Borrower name" />
          <F name="officerName" text="Authorised officer" />
          <F name="officerDesignation" text="Officer designation" />
          <F name="officerPhone" text="Officer phone" />
          <F name="officerEmail" text="Officer email" type="email" />
        </Section>

        <Section title="5. Inspection">
          <F name="inspectionDate" text="Inspection date and time (IST)" type="datetime-local" />
          <F name="inspectionTime" text="Inspection timing note" placeholder="e.g. 11 AM to 4 PM" />
          <F name="inspectionContact" text="Inspection contact" />
          <F name="inspectionLocation" text="Inspection location" span />
        </Section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold">6. Legal schedule and extra details</h2>
          <div className="mt-3">
            <label className={label}>Property schedule / legal description</label>
            <textarea name="legalSchedule" rows={4} className={input} placeholder="Survey numbers, boundaries (North / South / East / West), registered deed details…" />
          </div>
          <div className="text-xs font-semibold mt-4 mb-2">Extra details (label and value)</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <input name={`extra_${i}_label`} placeholder="Label (e.g. Floor)" className={input} />
                <input name={`extra_${i}_value`} placeholder="Value (e.g. 5th)" className={input} />
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-brand-border rounded-xl p-5">
          <h2 className="font-semibold">7. Documents</h2>
          <p className="text-xs text-brand-muted mt-0.5 mb-3">Paste a link for each official document (sale notice, bid form …). Visitors need a premium plan to open them.</p>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid sm:grid-cols-[180px_1fr_2fr] gap-2">
                <select name={`doc_${i}_type`} defaultValue="OTHER" className={input}>
                  {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input name={`doc_${i}_title`} placeholder="Document name" className={input} />
                <input name={`doc_${i}_url`} placeholder="https:// link to the file" className={input} />
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-white/90 backdrop-blur border-t border-brand-border flex flex-wrap items-center gap-3">
          <SubmitButton className="bg-brand text-white font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark">Publish property</SubmitButton>
          <button name="publish" value="draft" className="border border-brand-border rounded-lg px-5 py-2.5 text-sm hover:bg-brand-bg">Save as draft</button>
          <span className="text-xs text-brand-muted">Draft listings stay hidden until you publish them from Properties.</span>
        </div>
      </form>
    </div>
  );
}
