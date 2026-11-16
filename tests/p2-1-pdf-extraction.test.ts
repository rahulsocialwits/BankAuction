import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("P2.1 PDF extraction setup", () => {
  it("unpdf is listed as a dependency in package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, unknown>;
    const deps = pkg.dependencies as Record<string, string>;
    assert.ok(deps["unpdf"], "unpdf must be in dependencies");
  });

  it("DEEP_MAX_LISTINGS is 50", () => {
    const src = readFileSync("src/data-sources/feeds/deepScan.ts", "utf8");
    assert.match(src, /DEEP_MAX_LISTINGS\s*=\s*50/, "DEEP_MAX_LISTINGS must be 50");
  });

  it("AI prompt includes distinguishing attribute fields", () => {
    const src = readFileSync("src/data-sources/feeds/deepScan.ts", "utf8");
    assert.match(src, /unit_or_door_number/);
    assert.match(src, /floor_number/);
    assert.match(src, /survey_or_khasra/);
    assert.match(src, /area_sqft/);
    assert.match(src, /inspection_date/);
  });

  it("AI prompt instructs how to find distinguishing attributes", () => {
    const src = readFileSync("src/data-sources/feeds/deepScan.ts", "utf8");
    assert.match(src, /unit_or_door_number.*flat\/shop\/unit\/door number/s);
  });
});

describe("P2.3 migration and schema", () => {
  it("migration SQL adds all P2.3 columns", () => {
    const sql = readFileSync("prisma/migrations/20261116030000_auction_distinguishing_attributes/migration.sql", "utf8");
    for (const col of ["unitOrDoorNumber", "floorNumber", "buildingName", "surveyOrKhasra", "plotNumber", "areaSqft", "areaType"]) {
      assert.match(sql, new RegExp(`ADD COLUMN.*"${col}"`, "s"), `migration must add ${col}`);
    }
  });

  it("Prisma schema includes P2.3 fields on Auction model", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    for (const field of ["unitOrDoorNumber", "floorNumber", "buildingName", "surveyOrKhasra", "plotNumber", "areaSqft", "areaType"]) {
      assert.match(schema, new RegExp(`\\b${field}\\b`), `schema must include ${field}`);
    }
  });
});
