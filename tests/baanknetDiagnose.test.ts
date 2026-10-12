import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { redactExcerpt } from "../src/lib/fetch/redactExcerpt";

test("redactExcerpt hides cookies, tokens and bearer values and cuts the text to 1,500 characters", () => {
  const out = redactExcerpt('{"message":"bad request","csrfToken":"abc123","cookie":"sid=9; x=1"} Authorization: Bearer eyJhbGci.abc.def');
  assert.doesNotMatch(out, /abc123|sid=9|eyJhbGci/);
  assert.match(out, /bad request/);
  assert.equal(redactExcerpt("x".repeat(5000)).length, 1500);
});

test("the page diagnostic cannot write: no importer, no cursor save, no Prisma write call, no request without the explicit flag", () => {
  const src = readFileSync("scripts/baanknet-diagnose-page.ts", "utf8");
  assert.doesNotMatch(src, /importRecords|csvImport|saveCursor|baanknetImport|runBaanknetImport/);
  assert.doesNotMatch(src, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw/);
  assert.match(src, /BAANKNET_DIAGNOSE_AUTHORIZED !== "yes"/);
  assert.match(src, /RobotsGate/);
  assert.match(src, /--page/);
});

test("the sizing plan is read-only: no database, no importer, no cursor, and nothing is sent without the explicit flag", () => {
  const src = readFileSync("scripts/baanknet-plan-split.ts", "utf8");
  assert.doesNotMatch(src, /prisma|importRecords|csvImport|saveCursor|sheetState|runBaanknetImport/);
  assert.match(src, /BAANKNET_SPLIT_AUTHORIZED !== "yes"/);
  assert.match(src, /RobotsGate/);
  assert.match(src, /res\.status === 401 \|\| res\.status === 403/);
});

test("the slice importer: explicit authorization flag first, robots check, refusal stops, no delete, plan-only writes nothing", () => {
  const src = readFileSync("scripts/baanknet-import-slices.ts", "utf8");
  assert.ok(src.indexOf('BAANKNET_SPLIT_AUTHORIZED !== "yes"') < src.indexOf("prisma.feedSource.findFirst"), "the flag is checked before anything else");
  assert.match(src, /RobotsGate/);
  assert.match(src, /isRefusal\(out\.status\)/);
  assert.doesNotMatch(src, /\.(delete|deleteMany)\(|\$executeRaw|TRUNCATE/i);
  assert.match(src, /if \(!planOnly\) await save/);
  assert.match(src, /if \(planOnly\) \{[^}]*nothing was imported/);
  assert.match(src, /REAL_ESTATE\.includes/);
  assert.doesNotMatch(src, /baanknetAllProperties|"baanknet"\]/, "the other cursors are not touched");
});
