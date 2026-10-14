/* The eAuctionsIndia import schedule (.github/workflows/eauctions-import.yml) and the run lock. Static checks of the workflow file: they prove how it is
 * configured, NOT that GitHub is running it: activation needs the owner's repository variable and secrets (see the file header). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock } from "../src/data-sources/eauctionsindia/runLock";

const text = readFileSync(".github/workflows/eauctions-import.yml", "utf8");
const code = text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"); // without the comment header
const lines = code.split("\n").map((l) => l.trim());

test("daily schedule at 21:30 UTC (03:00 IST) and a manual trigger", () => {
  assert.ok(lines.includes('- cron: "30 21 * * *"'));
  assert.ok(lines.includes("workflow_dispatch:"));
  assert.ok(text.includes("03:00 IST"));
});

test("overlap protection: one run at a time, never cancelled half-way; a timeout is set", () => {
  const i = lines.indexOf("concurrency:");
  assert.ok(i >= 0);
  assert.equal(lines[i + 1], "group: eauctions-import");
  assert.equal(lines[i + 2], "cancel-in-progress: false");
  const t = Number((lines.find((l) => l.startsWith("timeout-minutes:")) ?? "").split(":")[1]);
  assert.ok(t > 0 && t <= 60);
});

test("the schedule is OFF until the owner sets EAUCTIONS_CRON_ENABLED; a manual run is always possible", () => {
  assert.ok(lines.includes("if: github.event_name == 'workflow_dispatch' || vars.EAUCTIONS_CRON_ENABLED == 'true'"));
  assert.ok(text.includes("NOT ACTIVE until the owner switches it on"));
});

test("secrets come only from GitHub secrets (never literal) and are not echoed; writes need the scope variable", () => {
  for (const k of ["DATABASE_URL", "DIRECT_URL", "EAUCTIONS_AUTH_NOTE", "EAUCTIONS_ALLOW_HEADER_VALUE"]) {
    const line = lines.find((l) => l.startsWith(`${k}:`));
    assert.ok(line && line.includes("${{ secrets."), `${k} must come from secrets`);
  }
  const auth = lines.find((l) => l.startsWith("EAUCTIONS_AUTHORIZED:")) ?? "";
  assert.ok(auth.includes("vars.EAUCTIONS_SCOPE_AUTOMATED == 'yes'"));
  assert.ok(!code.includes("postgres://") && !code.includes("postgresql://"));
  for (const l of lines.filter((x) => x.startsWith("echo"))) for (const secret of ["DATABASE_URL", "DIRECT_URL", "ALLOW_HEADER_VALUE", "AUTH_NOTE"]) assert.ok(!l.includes("$" + secret) && !l.includes("secrets." + secret), `no echo of ${secret}`);
});

test("it runs only the eAuctionsIndia bulk script: no BAANKNET, no other source, not the scheduler tick or its secret", () => {
  assert.ok(code.includes("scripts/eauctions-maharashtra-bulk.ts"));
  assert.ok(!/baanknet/i.test(code));
  assert.ok(!code.includes("CRON_SECRET") && !code.includes("api/cron/ingest"));
  for (const other of ["scripts/baanknet", "scripts/ingest", "scripts/acre"]) assert.ok(!code.includes(other));
});

test("a manual dry run reads at most 2 pages and writes nothing; resume state is cached between runs", () => {
  assert.ok(code.includes("--live --dry-run --check-duplicates --max-pages=2"));
  assert.ok(code.includes("actions/cache@v4"));
  assert.ok(lines.includes("staging") && lines.includes("import-state"));
});

test("run lock: a second start is refused while the first holds it; a stale lock is replaced; release frees it", () => {
  const dir = mkdtempSync(join(tmpdir(), "eauc-"));
  const path = join(dir, "x.lock");
  const t0 = new Date("2026-10-14T10:00:00Z");
  const a = acquireLock(path, t0);
  assert.equal(a.ok, true);
  const b = acquireLock(path, new Date(t0.getTime() + 60_000));
  assert.equal(b.ok, false);
  const stale = acquireLock(path, new Date(t0.getTime() + 3 * 3600_000));
  assert.equal(stale.ok, true); // older than 2 hours: left behind by a crash
  if (stale.ok) stale.release();
  assert.equal(acquireLock(path, t0).ok, true);
  writeFileSync(path, "not json");
  assert.equal(acquireLock(path, t0).ok, true); // unreadable lock is replaced
});
