import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("P2.10 search trigram migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20261116040000_search_trigram_indexes/migration.sql",
    "utf8",
  );

  it("enables pg_trgm extension", () => {
    assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_trgm/i);
  });

  it("creates GIN index on properties.title", () => {
    assert.match(sql, /properties_title_trgm_idx/);
    assert.ok(sql.includes('"title" gin_trgm_ops'), 'title GIN index missing gin_trgm_ops');
  });

  it("creates GIN index on properties.description", () => {
    assert.match(sql, /properties_description_trgm_idx/);
    assert.ok(sql.includes('"description" gin_trgm_ops'), 'description GIN index missing gin_trgm_ops');
  });

  it("creates GIN index on properties.addressText", () => {
    assert.match(sql, /properties_address_text_trgm_idx/);
    assert.ok(sql.includes('"addressText" gin_trgm_ops'), 'addressText GIN index missing gin_trgm_ops');
  });

  it("creates GIN index on properties.geoCity", () => {
    assert.match(sql, /properties_geo_city_trgm_idx/);
    assert.ok(sql.includes('"geoCity" gin_trgm_ops'), 'geoCity GIN index missing gin_trgm_ops');
  });

  it("uses IF NOT EXISTS for idempotency", () => {
    const count = (sql.match(/IF NOT EXISTS/g) ?? []).length;
    assert.ok(count >= 5, `Expected at least 5 IF NOT EXISTS clauses, found ${count}`);
  });
});

describe("P2.10 publishedWhere uses ILIKE-compatible pattern", () => {
  it("publishedWhere.ts uses contains+insensitive (maps to ILIKE)", () => {
    const src = readFileSync("src/lib/queries/publishedWhere.ts", "utf8");
    assert.match(src, /mode.*insensitive/);
    assert.match(src, /contains/);
  });
});
