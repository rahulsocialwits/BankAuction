import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { isAiFeed, UNREACHABLE } from "@/data-sources/feeds/run";
import { webStateOf } from "@/data-sources/feeds/siteScan";
import { importAllNow, importEverythingNow, pauseImportAll, pauseImportingEverything, fixThinNow, importAllBuiltIn, pauseBuiltInImportAll, runFeedSourceNow, toggleFeedSource } from "../engine/actions";
import { countThin } from "@/lib/pipeline/thinFix";
import AutoRefresh from "@/components/admin/AutoRefresh";
import { builtInImportAll } from "@/data-sources/bankauctions/adapter";
import SubmitButton from "@/components/admin/SubmitButton";

const inr = (n: unknown) => (n === null || n === undefined ? "—" : "₹" + Number(n).toLocaleString("en-IN"));
const day = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * What the live website sources have actually put on the site: per source its state and counts, and the newest properties
 * in one fixed format (title, bank, place, reserve, EMD, auction time, documents). Read-only view of production data.
 */
export default async function LiveView() {
  const feeds = (await prisma.feedSource.findMany({ orderBy: { createdAt: "desc" } })).filter((f) => isAiFeed(f.url));
  const counts = await Promise.all(feeds.map((f) => prisma.auction.count({ where: { statusSource: `feed:${f.name}`, property: { status: "PUBLISHED" } } })));
  const rows = await prisma.auction.findMany({
    where: { statusSource: { in: feeds.map((f) => `feed:${f.name}`) }, property: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      statusSource: true,
      reservePrice: true,
      emd: true,
      auctionStart: true,
      authorizedOfficer: true,
      createdAt: true,
      bank: { select: { name: true } },
      property: { select: { slug: true, title: true, addressText: true, geoCity: true, _count: { select: { documents: true } } } },
    },
  });
  const thin = await countThin();
  const builtInAll = await builtInImportAll().catch(() => false);
  const importing = builtInAll || feeds.some((f) => f.active && webStateOf(f.sheetState).importAll);

  return (
    <section className="mt-8 space-y-4">
      {/* while something imports, the numbers refresh in place every 30 s (no page reload) */}
      {importing && <AutoRefresh seconds={30} />}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-brand">Live website sources &amp; imported properties</h2>
        {importing && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">IMPORTING… numbers update every 30 s</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <form action={importEverythingNow}>
            <button type="submit" className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-white hover:bg-gold-dark">⚡ Import ALL properties of every website</button>
          </form>
          <form action={pauseImportingEverything}>
            <button type="submit" className="rounded-lg border border-brand-border bg-white px-4 py-2 text-xs font-semibold hover:bg-brand-bg">⏸ Pause importing all</button>
          </form>
        </div>
      </div>

      {thin > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><b>{thin}</b> website listing(s) have no reserve price (visitors see “Not Available”). Fix them automatically: each one’s own page is read again; a price found is filled in, otherwise the listing is hidden.</span>
          <form action={fixThinNow} className="ml-auto">
            <SubmitButton className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white">Fix or hide them now (60 at a time)</SubmitButton>
          </form>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-border bg-white px-4 py-3 text-sm">
        <div>
          <div className="font-semibold">BankAuctions.in <span className="text-xs font-normal text-brand-muted">· built-in crawler</span></div>
          <div className="text-xs text-brand-muted">Reads every listing page of bankauctions.in (2 s apart, as the site asks); continues on every scheduler tick until none are left.</div>
        </div>
        <form action={builtInAll ? pauseBuiltInImportAll : importAllBuiltIn} className="ml-auto">
          <button type="submit" className={builtInAll ? "rounded-lg border border-brand-border bg-white px-4 py-2 text-xs font-semibold hover:bg-brand-bg" : "rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-white hover:bg-gold-dark"}>{builtInAll ? "⏸ Pause importing BankAuctions.in" : "⚡ Import ALL from BankAuctions.in"}</button>
        </form>
      </div>

      {feeds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-brand-border bg-white px-6 py-8 text-center text-sm text-brand-muted">No website sources yet. Run the demo on a website and press “Add as Live source”.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-brand-bg text-brand-muted">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Properties on site</th>
                <th className="px-3 py-2">Pages read</th>
                <th className="px-3 py-2">Last message</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {feeds.map((f, i) => {
                const w = webStateOf(f.sheetState);
                const state = !f.active ? "Paused" : f.lastMessage?.startsWith(UNREACHABLE) ? "Not responding" : f.lastStatus === "error" ? "Error" : w.importAll ? "Importing all" : "Live";
                return (
                  <tr key={f.id} className="border-t border-brand-border align-top">
                    <td className="px-3 py-2"><div className="font-semibold">{f.name}</div><div className="break-all text-brand-muted">{f.url}</div></td>
                    <td className="px-3 py-2 font-medium">{state}</td>
                    <td className="px-3 py-2 text-sm font-bold text-brand">{counts[i]}</td>
                    <td className="px-3 py-2">{w.seen.length}</td>
                    <td className="max-w-[420px] break-words px-3 py-2 text-brand-muted">{f.lastMessage ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <form action={runFeedSourceNow}>
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="whitespace-nowrap rounded-md border border-brand-border px-2.5 py-1 font-semibold hover:bg-brand-bg">▶ Run</button>
                        </form>
                        <form action={toggleFeedSource}>
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="whitespace-nowrap rounded-md border border-brand-border px-2.5 py-1 font-semibold hover:bg-brand-bg">{f.active ? "⏸ Pause" : "▶ Resume"}</button>
                        </form>
                        <form action={w.importAll ? pauseImportAll : importAllNow}>
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="whitespace-nowrap rounded-md border border-brand-border px-2.5 py-1 font-semibold hover:bg-brand-bg">{w.importAll ? "⏸ Pause importing" : "⚡ Import all"}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Newest imported properties</h3>
          <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-brand-bg text-brand-muted">
                <tr>
                  <th className="px-3 py-2">Property</th>
                  <th className="px-3 py-2">Bank</th>
                  <th className="px-3 py-2">Place</th>
                  <th className="px-3 py-2">Reserve</th>
                  <th className="px-3 py-2">EMD</th>
                  <th className="px-3 py-2">Auction</th>
                  <th className="px-3 py-2">Docs</th>
                  <th className="px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-brand-border align-top">
                    <td className="max-w-[300px] px-3 py-2"><Link href={`/property/${a.property.slug}`} target="_blank" className="font-semibold text-brand hover:underline">{a.property.title}</Link></td>
                    <td className="px-3 py-2">{a.bank?.name ?? "—"}</td>
                    <td className="max-w-[220px] break-words px-3 py-2">{a.property.geoCity ?? a.property.addressText ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{inr(a.reservePrice)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{inr(a.emd)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{day(a.auctionStart)}</td>
                    <td className="px-3 py-2">{a.property._count.documents}</td>
                    <td className="px-3 py-2 text-brand-muted">{a.statusSource?.replace(/^feed:/, "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
