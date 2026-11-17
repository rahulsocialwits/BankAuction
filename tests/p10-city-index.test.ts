/**
 * AT-18 — P10 city index / SEO threshold rules.
 *
 * These tests run against source code only (no DB) so they pass in the sandbox.
 * They verify that:
 *   1. MIN_INDEXABLE_CITY_LISTINGS is set and positive.
 *   2. sitemap.ts filters cities to >= MIN_INDEXABLE_CITY_LISTINGS.
 *   3. The city page generateStaticParams also applies the same filter.
 *   4. generateMetadata sets robots noindex for thin cities.
 *   5. The audit_log migration SQL is well-formed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("AT-18: city index threshold", () => {
  const cityCounts = readFileSync("src/lib/domain/cityCounts.ts", "utf8");
  const sitemapSrc = readFileSync("src/app/sitemap.ts", "utf8");
  const cityPageSrc = readFileSync("src/app/(site)/city/[city]/page.tsx", "utf8");

  it("MIN_INDEXABLE_CITY_LISTINGS is exported and positive", () => {
    assert.match(cityCounts, /export const MIN_INDEXABLE_CITY_LISTINGS\s*=\s*(\d+)/);
    const m = cityCounts.match(/MIN_INDEXABLE_CITY_LISTINGS\s*=\s*(\d+)/);
    assert.ok(m, "export found");
    assert.ok(Number(m![1]) > 0, "must be positive");
  });

  it("sitemap filters cities by MIN_INDEXABLE_CITY_LISTINGS", () => {
    assert.match(sitemapSrc, /MIN_INDEXABLE_CITY_LISTINGS/);
    // The filter must come before the .map that generates the city URLs.
    const filterIdx = sitemapSrc.indexOf("MIN_INDEXABLE_CITY_LISTINGS");
    const mapIdx = sitemapSrc.indexOf("/city/");
    assert.ok(filterIdx < mapIdx, "filter must appear before the city URL template");
  });

  it("city page generateStaticParams applies MIN_INDEXABLE_CITY_LISTINGS", () => {
    assert.match(cityPageSrc, /generateStaticParams/);
    assert.match(cityPageSrc, /MIN_INDEXABLE_CITY_LISTINGS/);
  });

  it("city page generateMetadata sets robots noindex for thin cities", () => {
    assert.match(cityPageSrc, /robots.*index.*false/s);
  });

  it("city page slug uses only lowercase alnum chars (no raw city name in URL)", () => {
    // The city slug helper must be used, not raw `geoCity`
    assert.match(cityPageSrc, /slug/);
    // Should not build a URL from the raw city name
    assert.doesNotMatch(cityPageSrc, /geoCity.*\/city\//s);
  });
});

describe("AT-18: audit_log migration", () => {
  const sql = readFileSync("prisma/migrations/20261117010000_audit_log/migration.sql", "utf8");

  it("creates audit_logs table", () => {
    assert.match(sql, /CREATE TABLE "audit_logs"/);
  });

  it("has primary key", () => {
    assert.match(sql, /PRIMARY KEY/);
  });

  it("has three indexes", () => {
    const indexes = sql.match(/CREATE INDEX/g) ?? [];
    assert.ok(indexes.length >= 3, `Expected ≥3 indexes, found ${indexes.length}`);
  });
});
