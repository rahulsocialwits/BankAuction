"use server";

import { requireMaster } from "@/lib/auth/adminAuth";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { ensureSourceRow, runBankAuctionsIngestion, setBuiltInImportAll } from "@/data-sources/bankauctions/adapter";
import { isAiFeed, runFeedFull, runWebDiscovery, UNREACHABLE } from "@/data-sources/feeds/run";
import { webStateOf, withWebState } from "@/data-sources/feeds/siteScan";
import { fixThinListings } from "@/lib/pipeline/thinFix";
import { logRun } from "@/lib/pipeline/runLog";

function refresh() {
  revalidatePath("/admin/engine");
  revalidatePath("/admin/feeds");
}

/** Pause / resume the built-in BankAuctions.in crawler. */
export async function toggleBuiltIn() {
  await requireMaster();
  const row = await ensureSourceRow();
  await prisma.source.update({
    where: { id: row.id },
    data: { status: row.status === "DISABLED" ? "HEALTHY" : "DISABLED" },
  });
  refresh();
}

export async function toggleFeedSource(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (feed) {
    const active = !feed.active;
    await prisma.feedSource.update({ where: { id }, data: { active, ...(active && { lastMessage: "Fetching…" }) } });
    if (active) after(() => runFeedFull(id)); // "Run" = start now, then automatic until paused
  }
  refresh();
}

/** Remove a link source for good (used for sources that refuse automated access). */
export async function deleteFeedSource(formData: FormData) {
  await requireMaster();
  await prisma.feedSource.deleteMany({ where: { id: String(formData.get("id")) } });
  refresh();
}

export async function runFeedSourceNow(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  await prisma.feedSource.update({ where: { id }, data: { lastMessage: "Fetching…" } });
  after(() => runFeedFull(id));
  refresh();
}

/**
 * "Import all now" for one website source: flag it so that EVERY scheduler tick keeps reading its new listing pages in
 * big batches (six at a time) until none are left, and start the first batch right now.
 */
export async function importAllNow(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (feed && isAiFeed(feed.url)) {
    await prisma.feedSource.update({
      where: { id },
      data: { active: true, sheetState: withWebState(feed.sheetState, { ...webStateOf(feed.sheetState), importAll: true }), lastMessage: "Importing all properties of this website…" },
    });
    after(() => runWebDiscovery(id, "manual", { all: true }));
  }
  refresh();
}

/** The same for every live website source: all are flagged; the first three start now, the scheduler carries on with the rest. */
export async function importEverythingNow() {
  await requireMaster();
  const feeds = (await prisma.feedSource.findMany({ where: { active: true } })).filter((f) => isAiFeed(f.url) && !f.lastMessage?.startsWith(UNREACHABLE));
  for (const f of feeds) {
    await prisma.feedSource.update({ where: { id: f.id }, data: { sheetState: withWebState(f.sheetState, { ...webStateOf(f.sheetState), importAll: true }) } });
  }
  after(async () => {
    for (const f of feeds.slice(0, 3)) await runWebDiscovery(f.id, "manual", { all: true, budgetMs: 85_000 }).catch(() => null);
  });
  refresh();
}
/** Stops "Import all" for one website: the source stays Live (hourly new-listing checks) but no longer reads in big batches. */
export async function pauseImportAll(formData: FormData) {
  await requireMaster();
  const id = String(formData.get("id"));
  const feed = await prisma.feedSource.findUnique({ where: { id } });
  if (feed) {
    await prisma.feedSource.update({ where: { id }, data: { sheetState: withWebState(feed.sheetState, { ...webStateOf(feed.sheetState), importAll: false }), lastMessage: `${(feed.lastMessage ?? "").replace("Importing all properties of this website…", "").trim()} Import all paused.`.trim().slice(0, 1800) } });
  }
  refresh();
}

/** The same for every website source. A read that is already running finishes its current batch, then stops. */
export async function pauseImportingEverything() {
  await requireMaster();
  const feeds = (await prisma.feedSource.findMany()).filter((f) => isAiFeed(f.url) && webStateOf(f.sheetState).importAll);
  for (const f of feeds) await prisma.feedSource.update({ where: { id: f.id }, data: { sheetState: withWebState(f.sheetState, { ...webStateOf(f.sheetState), importAll: false }) } });
  refresh();
}

/** Reads the own page of every thin website listing again (60 per press): price found = filled, still no price = hidden. */
export async function fixThinNow() {
  await requireMaster();
  after(async () => {
    const startedAt = new Date();
    try {
      const r = await fixThinListings({ max: 60 });
      await logRun({ source: "Thin listing fix", kind: "feed", trigger: "manual", status: "ok", created: 0, duplicates: 0, rejected: r.hidden, aiTokens: r.tokens, message: `${r.fixed} filled with their reserve price, ${r.hidden} hidden (no price on their own page)${r.heldBack ? `, ${r.heldBack} kept because their source's latest run is flagged (data protection)` : ""}, ${r.left} still waiting${r.left ? " — press again" : ""}`, startedAt });
    } catch (e) {
      await logRun({ source: "Thin listing fix", kind: "feed", trigger: "manual", status: "error", message: e instanceof Error ? e.message : String(e), startedAt });
    }
  });
  refresh();
}

/** "Import all" for BankAuctions.in: reads every listing page of the site (2 s apart, as its rules ask), starts now, then every tick carries on until none are left. */
export async function importAllBuiltIn() {
  await requireMaster();
  const row = await ensureSourceRow();
  if (row.status === "DISABLED") await prisma.source.update({ where: { id: row.id }, data: { status: "HEALTHY" } });
  await setBuiltInImportAll(true);
  after(async () => {
    // nothing left to read (the whole site is already imported) = switch the mode off again instead of showing "Importing all…" forever
    const r = await runBankAuctionsIngestion({ all: true, budgetMs: 240_000, triggeredBy: "manual" }).catch(() => null);
    if (r && !r.skipped && !r.remaining && r.errors.length === 0) await setBuiltInImportAll(false).catch(() => undefined);
  });
  refresh();
}

export async function pauseBuiltInImportAll() {
  await requireMaster();
  await setBuiltInImportAll(false);
  refresh();
}
