import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// These are source-level guards (the modules that wire the check import Prisma, which does not load in every environment).

test("every generic-source run path records its yield", () => {
  const run = read("src/data-sources/feeds/run.ts");
  assert.match(run, /recordYield\(id, "sheet"/, "Google Sheet runs");
  assert.match(run, /recordYield\(id, aiFeed \? "list" : "sheet"/, "CSV and list-page runs");
  assert.match(run, /recordYield\(feedId, "site"/, "whole-site scans");
  assert.equal((run.match(/yield: /g) ?? []).length >= 3, true, "each path passes the verdict to logRun");
});

test("writers that replace sheetState keep the yield streak", () => {
  const run = read("src/data-sources/feeds/run.ts");
  assert.match(run, /keepYieldState\(feed\.sheetState, sheet\.stateJson\)/);
  assert.match(run, /keepYieldState\(feed\.sheetState, JSON\.stringify\(\{ tabs: \{ csv/);
});

test("the BAANKNET importer is untouched by the yield check (no expansion of that source)", () => {
  const b = read("src/data-sources/feeds/baanknetImport.ts");
  assert.doesNotMatch(b, /recordYield|zeroYield|yieldMonitor/);
});

test("the yield marker is written first in the run-log message so truncation cannot cut it", () => {
  const log = read("src/lib/pipeline/runLog.ts");
  assert.match(log, /formatYieldMarker\(input\.yield\)\}\\n/);
});

test("the coverage admin page is read-only: it never writes", () => {
  const page = read("src/app/admin/(shell)/engine/coverage/page.tsx");
  assert.doesNotMatch(page, /\.(create|update|delete|upsert|deleteMany|updateMany|createMany)\(/);
  assert.doesNotMatch(page, /["']use server["']/);
});

test("the overlap table does not add up the running totals that the BAANKNET importer logs on every tick", () => {
  const page = read("src/app/admin/(shell)/engine/coverage/page.tsx");
  assert.match(page, /isCumulativeLogger/);
  assert.match(page, /source: \{ notIn: cumulativeNames \}/);
});
