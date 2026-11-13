/* Local-file import and the remote write gate. Real fixture: tests/fixtures/eauctionsindia-maharashtra-page1.html (one saved page, 12 cards).
 * Preview is the default; writes are refused without authorization, a note, the scope flag and the explicit --import flag. No network, no database. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localWriteAllowed, localLimit, planLocalImport, writeLocalImport, LOCAL_DEFAULT_LIMIT, LOCAL_HARD_CAP } from "../src/data-sources/eauctionsindia/localFile";
import { runMaharashtra } from "../src/data-sources/eauctionsindia/maharashtraRun";
import type { FetchOutcome } from "../src/lib/fetch/httpStatus";

const real1 = readFileSync("tests/fixtures/eauctionsindia-maharashtra-page1.html", "utf8");
const residential = readFileSync("tests/fixtures/eauctionsindia-residential-page1.html", "utf8");
const OK = { EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_AUTH_NOTE: "test note from the operator" };
const okEnv = { ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "yes" };
const counter = () => { const c = { calls: 0 }; return { c, fn: async (r: unknown[]) => { c.calls++; return { created: r.length, updated: 0, skipped: 0, failed: 0 }; } }; };

test("limits: default 12, hard cap 50, minimum 1", () => {
  assert.equal(LOCAL_DEFAULT_LIMIT, 12);
  assert.equal(localLimit(undefined), 12);
  assert.equal(localLimit(1000), LOCAL_HARD_CAP);
  assert.equal(LOCAL_HARD_CAP, 50);
  assert.equal(localLimit(-5), 1);
  assert.equal(localLimit(Number.NaN), 12);
});

test("write gate: no flag, no authorization, no note, no scope -> refused; all present -> allowed", () => {
  assert.equal(localWriteAllowed(okEnv, false).ok, false); // no --import
  assert.equal(localWriteAllowed({}, true).ok, false); // no authorization
  assert.equal(localWriteAllowed({ EAUCTIONS_AUTHORIZED: "yes", EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, true).ok, false); // no note
  assert.equal(localWriteAllowed(OK, true).ok, false); // no scope: the source stays restricted
  assert.equal(localWriteAllowed({ ...OK, EAUCTIONS_SCOPE_LOCAL_FILE: "no" }, true).ok, false);
  assert.equal(localWriteAllowed(okEnv, true).ok, true);
});

test("a refused write never reaches the importer (missing authorization, missing scope, preview)", async () => {
  const plan = await planLocalImport(real1);
  assert.equal(plan.ok, true);
  for (const [env, flag] of [[{}, true], [OK, true], [okEnv, false], [{ EAUCTIONS_SCOPE_LOCAL_FILE: "yes" }, true]] as const) {
    const { c, fn } = counter();
    const w = await writeLocalImport(plan, env, flag, fn);
    assert.equal(w.written, false);
    assert.equal(c.calls, 0);
  }
});

test("allowed write: only the limited records go to the importer, tagged Maharashtra; default 12, cap 50", async () => {
  const sent: Array<Record<string, unknown>> = [];
  const w = await writeLocalImport(await planLocalImport(real1, { limit: 5 }), okEnv, true, async (r) => { sent.push(...(r as Array<Record<string, unknown>>)); return { created: r.length, updated: 0, skipped: 0, failed: 0 }; });
  assert.equal(w.written, true);
  assert.equal(sent.length, 5);
  assert.ok(sent.every((x) => x.geo_state === "Maharashtra"));
  assert.match(w.message, /not a live-site run/);
  assert.equal((await planLocalImport(real1)).toSend.length, 12);
  assert.equal((await planLocalImport(real1, { limit: 9999 })).limit, 50);
});

test("a page that does not name Maharashtra gives no plan and no write", async () => {
  const plan = await planLocalImport(residential);
  assert.equal(plan.ok, false);
  const { c, fn } = counter();
  assert.equal((await writeLocalImport(plan, okEnv, true, fn)).written, false);
  assert.equal(c.calls, 0);
});

test("duplicate preview: ids already in the database are reported (read-only lookup); 'not checked' when no lookup is given", async () => {
  const known = ["src:eauctionsindia.com:894455", "src:eauctionsindia.com:882072"];
  const p = await planLocalImport(real1, { existingIds: async (ids) => ids.filter((i) => known.includes(i)) });
  assert.deepEqual(p.alreadyInDatabase, known);
  assert.equal(p.newToDatabase, 10);
  const q = await planLocalImport(real1);
  assert.equal(q.alreadyInDatabase, null);
  assert.equal(q.newToDatabase, null);
});

test("a card repeated inside the file is counted once (source id)", async () => {
  const first = real1.indexOf('<div class="row mb-3"');
  const end = real1.indexOf('<ul class="pagination">');
  const p = await planLocalImport(real1 + real1.slice(first, end));
  assert.equal(new Set(p.toSend.map((r) => r.external_id)).size, p.toSend.length);
  assert.equal(p.cards, 12);
});

test("remote sample (automated write) is refused without EAUCTIONS_SCOPE_AUTOMATED, before any request", async () => {
  let fetches = 0, robots = 0;
  const r = await runMaharashtra({ mode: "sample", url: "https://www.eauctionsindia.com/properties-in-maharashtra" }, {
    env: OK,
    robots: async () => { robots++; return "allowed"; },
    fetchPage: async () => { fetches++; return { status: "success", http: 200, res: new Response(real1), attempts: 1, waitedSec: 0, log: [] } as FetchOutcome; },
    importBatch: async () => ({ created: 1, updated: 0, skipped: 0, failed: 0 }),
  });
  assert.equal(r.state, "awaiting_authorization");
  assert.equal(fetches + robots, 0);
  assert.equal(r.imported.created, 0);
});
