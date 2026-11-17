/**
 * P1.7: data-quality page smoke tests.
 * Pure file-read tests: no database, no Prisma client needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const page = readFileSync(join(root, "src", "app", "admin", "(shell)", "data-quality", "page.tsx"), "utf8");
const sidebar = readFileSync(join(root, "src", "components", "admin", "AdminSidebar.tsx"), "utf8");

test("data-quality page: exports async default function", () => {
  assert.match(page, /export default async function DataQualityPage/, "must export async default");
});

test("data-quality page: has force-dynamic export", () => {
  assert.match(page, /export const dynamic = "force-dynamic"/, "must opt out of static generation");
});

test("data-quality page: calls requireMaster", () => {
  assert.match(page, /requireMaster/, "must require master admin auth");
});

test("data-quality page: queries reservePrice completeness", () => {
  assert.ok(page.includes("reservePrice"), "must query reservePrice completeness");
});

test("data-quality page: queries auctionStart completeness", () => {
  assert.ok(page.includes("auctionStart"), "must query auctionStart completeness");
});

test("data-quality page: queries geoCity completeness", () => {
  assert.ok(page.includes("geoCity"), "must query geoCity (AI-verified city) completeness");
});

test("data-quality page: queries borrower completeness", () => {
  assert.ok(page.includes("borrower"), "must query borrower name completeness");
});

test("data-quality page: queries document completeness", () => {
  assert.ok(page.includes("documents"), "must query document completeness");
});

test("sidebar: data-quality link is present", () => {
  assert.ok(sidebar.includes("/admin/data-quality"), "AdminSidebar must link to /admin/data-quality");
});

test("sidebar: data-quality is master-only", () => {
  const idx = sidebar.indexOf("/admin/data-quality");
  const lineStart = sidebar.lastIndexOf("\n", idx);
  const lineEnd = sidebar.indexOf("\n", idx);
  const line = sidebar.slice(lineStart, lineEnd);
  assert.ok(line.includes("master: true"), "data-quality nav item must be master: true");
});
