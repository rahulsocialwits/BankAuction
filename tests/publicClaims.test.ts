import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Public copy must describe only what customers can use today (P0 B4).
 * Not available yet: document links for customers, alerts, refunds. These tests stop the old claims coming back.
 * When a feature really ships, update the matching test in the same PR.
 */

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const PUBLIC = [
  "src/app/(site)/page.tsx",
  "src/app/(site)/pricing/page.tsx",
  "src/app/(site)/how-it-works/page.tsx",
  "src/app/(site)/blog/[slug]/page.tsx",
  "src/lib/pages/content.ts",
  "src/lib/payments/settings.ts",
];

test("no public copy says notices or bid forms are linked on every listing", () => {
  for (const f of PUBLIC) {
    const s = read(f);
    assert.doesNotMatch(s, /linked directly on every listing/i, f);
    assert.doesNotMatch(s, /links to the official sale notices/i, f);
    assert.doesNotMatch(s, /any linked official documents/i, f);
  }
  assert.match(read("src/app/(site)/page.tsx"), /Document availability varies by listing/);
});

test("no public copy promises daily, mobile, WhatsApp or email alerts as available", () => {
  const pricing = read("src/app/(site)/pricing/page.tsx");
  assert.doesNotMatch(pricing, /Daily mobile notification|Daily email alert|Multiple city email alert|priority alerts/i);
  assert.match(pricing, /Personalised auction alerts are planned and are not yet available/);
  const faq = read("src/lib/pages/content.ts");
  assert.doesNotMatch(faq, /opens the official documents attached to each listing, along with alerts/);
  assert.match(faq, /alerts are planned and are not yet available/i);
});

test("no refund promise is shown: not in the default plans, and the pricing page hides any saved refund note", () => {
  // read as text: settings.ts imports the database client, which cannot load without a generated Prisma client
  const defaults = read("src/lib/payments/settings.ts").match(/DEFAULT_PLANS[^=]*=\s*\[([\s\S]*?)\n\];/)![1];
  assert.doesNotMatch(defaults, /refund/i);
  const pricing = read("src/app/(site)/pricing/page.tsx");
  assert.match(pricing, /\/refund\/i\.test\(p\.note\)/);
  assert.doesNotMatch(read("src/lib/pages/content.ts"), /refund rules, where they apply, are stated on the pricing page/);
});

test("prices are untouched by this copy change", () => {
  const defaults = read("src/lib/payments/settings.ts").match(/DEFAULT_PLANS[^=]*=\s*\[([\s\S]*?)\n\];/)![1];
  assert.deepEqual([...defaults.matchAll(/priceInr:\s*(\d+)/g)].map((m) => Number(m[1])), [2500, 4000, 7000]);
});
