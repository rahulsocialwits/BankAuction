import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifySourceMessage, summarizeTicks } from "../src/lib/health/runHealth";
import { budgetLevel } from "../src/lib/ai/dailyBudget";

const at = (min: number) => new Date(Date.UTC(2026, 9, 12, 0, min));

test("tick summary: counts ticks, finds the longest gap and the gaps over 20 minutes", () => {
  const s = summarizeTicks([at(0), at(5), at(10), at(250), at(255)]);
  assert.equal(s.count, 5);
  assert.equal(s.maxGapMin, 240);
  assert.equal(s.gapsOver20, 1);
  assert.equal(s.last?.getTime(), at(255).getTime());
  assert.deepEqual(summarizeTicks([]), { count: 0, last: null, maxGapMin: null, gapsOver20: 0 });
});

test("source labels: a robots.txt refusal is a refusal, a robots.txt timeout is only unknown permission, unchanged is not a problem", () => {
  const refused = classifySourceMessage(false, "error", "Blocked: this site's robots.txt says automated access to this page is not allowed. Paused automatically");
  assert.equal(refused.kind, "off");
  assert.match(refused.action, /official feed/);
  assert.equal(classifySourceMessage(true, "error", "Blocked: this site's robots.txt says automated access is not allowed").kind, "refused");
  const timeout = classifySourceMessage(true, "error", "Site not responding to our crawler: its robots.txt gave no answer (timeout).");
  assert.equal(timeout.kind, "unknown_permission");
  assert.match(timeout.action, /NOT a confirmed block/);
  assert.equal(classifySourceMessage(true, "ok", "Unchanged: AI skipped (content unchanged).").kind, "unchanged");
  assert.equal(classifySourceMessage(true, "ok", "Site scan: 0 listing page(s) found, 0 new").kind, "zero_yield");
  assert.equal(classifySourceMessage(true, "ok", "Scanned page, found 9 listing(s): 8 new").kind, "healthy");
  assert.equal(classifySourceMessage(true, null, null).kind, "unknown_permission");
});

test("AI daily budget: no cap means no limit; warning from 80 percent; exceeded at the cap", () => {
  assert.equal(budgetLevel(5_000_000, 0), "none");
  assert.equal(budgetLevel(100, 1000), "ok");
  assert.equal(budgetLevel(800, 1000), "warning");
  assert.equal(budgetLevel(1000, 1000), "exceeded");
});

test("the budget check runs before an AI call is made and never touches data; the run-health page is master-only", () => {
  const client = readFileSync("src/lib/ai/relayModelsClient.ts", "utf8");
  assert.ok(client.indexOf("dailyBudgetExceeded()") < client.indexOf("fetch(`${cfg.baseUrl}/chat/completions`"), "checked before the request");
  assert.doesNotMatch(readFileSync("src/lib/ai/dailyBudget.ts", "utf8"), /\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
  assert.match(readFileSync("src/app/admin/(shell)/health/page.tsx", "utf8"), /await requireMaster\(\)/);
});
