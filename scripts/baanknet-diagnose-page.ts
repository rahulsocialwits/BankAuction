/*
 * BAANKNET page diagnostic. READ-ONLY: it cannot import, save a cursor or write to the database.
 *
 *   npx tsx scripts/baanknet-diagnose-page.ts                       -> reads the saved cursors (database READ only), sends NO request
 *   $env:BAANKNET_DIAGNOSE_AUTHORIZED="yes"; npx tsx scripts/baanknet-diagnose-page.ts --page=201
 *                                                                   -> ONE listing request for that page (plus the robots.txt check
 *                                                                      and the CSRF handshake the site's own page makes first)
 *
 * Optional, each still a single request: --limit=50 (default 50), --status=all (default all).
 * Printed: HTTP status, content type, the shape of the JSON (keys, total, totalPages, rows on the page) and a redacted excerpt of the
 * body (at most 1,500 characters). Cookies, CSRF tokens, request headers and environment variables are never printed.
 * robots.txt is checked first; any refusal (robots, 401, 403, CAPTCHA page) stops the run and nothing is retried or worked around.
 * It does not import records, does not call the importer and does not touch FeedSource.sheetState.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { RobotsGate } from "../src/data-sources/feeds/robotsGate";
import { UA } from "../src/data-sources/feeds/webScan";
import { redactExcerpt } from "../src/lib/fetch/redactExcerpt";

const API = "https://baanknet.com/api/v1/auction/detail/auction-listing";
const CSRF = "https://baanknet.com/api/v1/auth/csrf-token";
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function showSavedCursors() {
  const feed = await prisma.feedSource.findFirst({ where: { url: { contains: "baanknet.com" } }, select: { name: true, lastStatus: true, lastRunAt: true, lastMessage: true, sheetState: true } });
  if (!feed) return console.log("No baanknet.com feed source in the database.");
  let state: Record<string, unknown> = {};
  try { state = feed.sheetState ? JSON.parse(feed.sheetState) : {}; } catch { /* unreadable: shown as empty */ }
  console.log(`Feed "${feed.name}": last status ${feed.lastStatus ?? "-"} at ${feed.lastRunAt?.toISOString() ?? "-"}`);
  console.log(`Last message: ${(feed.lastMessage ?? "").replace(/\s+/g, " ").slice(0, 400)}`);
  for (const key of ["baanknet", "baanknetAllProperties"]) {
    const c = state[key] as Record<string, unknown> | undefined;
    if (!c) { console.log(`Cursor "${key}": none saved`); continue; }
    const pick = ["page", "done", "pagesDone", "recordsRead", "created", "updated", "skipped", "rejected", "totalPages", "completedAt", "lastError", "status", "si"];
    console.log(`Cursor "${key}":`, JSON.stringify(Object.fromEntries(pick.filter((k) => k in c).map((k) => [k, c[k]]))));
  }
}

async function onePage(page: number, limit: number, status: string) {
  const gate = new RobotsGate();
  for (const url of [API, CSRF]) {
    const decision = await gate.check(url);
    if (decision !== "allowed") return console.log(`Stopped: robots/access check for ${url} returned ${decision}. Not bypassed, no request sent.`);
  }
  const base = { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://baanknet.com/auction-listing/property", Origin: "https://baanknet.com" };
  const csrf = await fetch(CSRF, { headers: base, signal: AbortSignal.timeout(20_000) });
  if (csrf.status === 401 || csrf.status === 403 || !csrf.ok) return console.log(`Stopped: the CSRF handshake answered HTTP ${csrf.status}. Not bypassed, no listing request sent.`);
  const token = csrf.headers.get("x-csrf-token") ?? csrf.headers.get("csrf-token") ?? "";
  const cookie = (csrf.headers.getSetCookie?.() ?? []).map((v) => v.split(";")[0]).join("; ");

  const body = { search: {}, range: {}, sort: { type: "closest" }, page, limit, auctionStatus: status };
  console.log(`Sending ONE request: page ${page}, limit ${limit}, auctionStatus "${status}"`);
  const res = await fetch(API, {
    method: "POST",
    headers: { ...base, "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const type = res.headers.get("content-type") ?? "none";
  const text = await res.text();
  console.log(`HTTP ${res.status}; content-type: ${type}`);
  if (res.status === 401 || res.status === 403) console.log("Access refusal. Stop here: no retry and no workaround.");
  try {
    const j = JSON.parse(text) as { data?: { data?: unknown[]; total?: number; totalPages?: number }; message?: unknown; error?: unknown };
    console.log("JSON keys:", Object.keys(j).join(", "), "| data keys:", j.data && typeof j.data === "object" ? Object.keys(j.data).join(", ") : "-");
    console.log("rows on this page:", Array.isArray(j.data?.data) ? j.data!.data!.length : "-", "| total:", j.data?.total ?? "-", "| totalPages:", j.data?.totalPages ?? "-");
  } catch { console.log("The answer is not JSON."); }
  console.log(`Body (first 1500 characters, redacted): ${redactExcerpt(text) || "(empty)"}`);
}

(async () => {
  await showSavedCursors();
  const page = arg("page");
  if (!page) {
    console.log("\nNo --page given: no request was sent.");
  } else if (process.env.BAANKNET_DIAGNOSE_AUTHORIZED !== "yes") {
    console.log("\nBAANKNET_DIAGNOSE_AUTHORIZED is not \"yes\": no request was sent.");
  } else if (!Number.isInteger(Number(page)) || Number(page) < 1) {
    console.log("\n--page must be a whole number of 1 or more. No request was sent.");
  } else {
    await onePage(Number(page), Number(arg("limit") ?? "50") || 50, arg("status") ?? "all");
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("Diagnostic failed:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
