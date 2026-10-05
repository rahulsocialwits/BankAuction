"use server";

import { requireMaster } from "@/lib/auth/adminAuth";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { runFeedFull, runWebDiscovery, validateFeedUrl } from "@/data-sources/feeds/run";
import { webStateOf, withWebState } from "@/data-sources/feeds/siteScan";
import { runDemo } from "@/lib/scrapDemo/run";
import { clampSettings } from "@/lib/scrapDemo/settings";
import type { DemoResult, DemoSourceType } from "@/lib/scrapDemo/types";

export interface DemoState {
  result: DemoResult | null;
}

const TYPES: DemoSourceType[] = ["sample", "url", "paste", "diagnose"];

/**
 * The one step that leaves the demo: the master admin clicks "Add as Live source". The website becomes a normal Link Source
 * (Data Engine: Live / Pause, scanned for new listings every hour, "Import all now") and its first import starts right away.
 * Nothing is added unless this button is pressed.
 */
export async function addAsLiveSource(formData: FormData) {
  await requireMaster();
  const url = String(formData.get("url") ?? "").trim();
  const check = validateFeedUrl(url);
  if (!check.ok) redirect("/admin/scrap-demo?error=" + encodeURIComponent(check.reason));
  const host = new URL(check.url).hostname.replace(/^www\./, "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || host;
  const existing = await prisma.feedSource.findFirst({ where: { OR: [{ url: check.url }, { name }] } });
  if (existing) {
    // Already a source: make sure it is live and read everything it has not imported yet.
    await prisma.feedSource.update({ where: { id: existing.id }, data: { active: true, sheetState: withWebState(existing.sheetState, { ...webStateOf(existing.sheetState), importAll: true }), lastMessage: "Importing all properties of this website…" } });
    after(() => runWebDiscovery(existing.id, "manual", { all: true }).catch(() => null));
    redirect("/admin/scrap-demo?added=" + encodeURIComponent(existing.name));
  }
  // "importAll" makes every scheduler tick keep reading the site's listing pages until none are left (no duplicates: known
  // listings are skipped), so the whole website comes in even though one request can only read a batch.
  const feed = await prisma.feedSource.create({ data: { name, url: check.url, lastMessage: "Fetching…", sheetState: withWebState(null, { seen: [], lastAt: null, importAll: true }) } });
  after(() => runFeedFull(feed.id));
  redirect("/admin/scrap-demo?added=" + encodeURIComponent(name));
}

/** Runs one demo workflow in memory and returns what it found. It never writes to the database. */
export async function runScrapDemo(_prev: DemoState, formData: FormData): Promise<DemoState> {
  await requireMaster();
  const raw = String(formData.get("type") ?? "");
  const type = TYPES.includes(raw as DemoSourceType) ? (raw as DemoSourceType) : "sample";
  const settings = clampSettings({
    maxPages: formData.get("maxPages"),
    maxDepth: formData.get("maxDepth"),
    maxCandidates: formData.get("maxCandidates"),
    maxDeepPages: formData.get("maxDeepPages"),
    timeLimitSec: formData.get("timeLimitSec"),
    concurrency: formData.get("concurrency"),
    maxBrowserPages: formData.get("maxBrowserPages"),
    useSitemap: formData.get("useSitemap") === "on",
    useBrowser: formData.get("useBrowser") === "on",
  });
  const result = await runDemo({
    name: String(formData.get("name") ?? "").trim().slice(0, 80),
    type,
    url: String(formData.get("url") ?? "").trim().slice(0, 500),
    urls: String(formData.get("urls") ?? "").slice(0, 2000),
    pasted: String(formData.get("pasted") ?? ""),
    mock: formData.get("mock") === "on",
    settings,
  });
  return { result };
}
