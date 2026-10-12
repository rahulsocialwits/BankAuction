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
