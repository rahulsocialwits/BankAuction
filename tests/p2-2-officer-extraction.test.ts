import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractEmail, extractDesignation } from "../src/lib/normalization/parsers";

describe("extractEmail", () => {
  it("extracts a plain email", () => {
    assert.equal(extractEmail("Contact: john.smith@sbi.co.in, Phone: 9876543210"), "john.smith@sbi.co.in");
  });

  it("extracts email regardless of case", () => {
    assert.equal(extractEmail("Email: Officer@Bank.com"), "officer@bank.com");
  });

  it("returns null when no email is present", () => {
    assert.equal(extractEmail("Branch Manager, Phone: 9876543210"), null);
  });

  it("returns null for null input", () => {
    assert.equal(extractEmail(null), null);
  });

  it("returns null for empty string", () => {
    assert.equal(extractEmail(""), null);
  });
});

describe("extractDesignation", () => {
  it("extracts explicit Designation label", () => {
    assert.equal(
      extractDesignation("Name: Amit Kumar, Designation: Branch Manager, Phone: 9876543210"),
      "Branch Manager",
    );
  });

  it("recognises Authorized Officer title without explicit label", () => {
    assert.equal(extractDesignation("Authorized Officer: Mr. Sharma, 9876543210"), "Authorized Officer");
  });

  it("recognises AGM title", () => {
    assert.equal(extractDesignation("AGM, State Bank of India, Mumbai"), "AGM");
  });

  it("recognises DGM title", () => {
    assert.equal(extractDesignation("Contact DGM for details"), "DGM");
  });

  it("returns null when no designation is found", () => {
    assert.equal(extractDesignation("Phone: 9876543210"), null);
  });

  it("returns null for null input", () => {
    assert.equal(extractDesignation(null), null);
  });

  it("does not invent a designation from arbitrary text", () => {
    assert.equal(extractDesignation("Visit the property on Monday"), null);
  });
});

describe("normalize.ts wires officer fields", () => {
  it("NormalizedAuctionRecord includes officerDesignation and officerEmail fields", () => {
    const src = require("fs").readFileSync("src/data-sources/bankauctions/normalize.ts", "utf8");
    assert.match(src, /officerDesignation\s*:/);
    assert.match(src, /officerEmail\s*:/);
    assert.match(src, /extractDesignation/);
    assert.match(src, /extractEmail/);
  });

  it("adapter.ts writes officerDesignation at every Prisma auction write", () => {
    const src = require("fs").readFileSync("src/data-sources/bankauctions/adapter.ts", "utf8");
    const matches = [...src.matchAll(/officerDesignation\s*:/g)];
    assert.ok(matches.length >= 3, `Expected at least 3 officerDesignation writes, found ${matches.length}`);
  });

  it("adapter.ts writes officerEmail at every Prisma auction write", () => {
    const src = require("fs").readFileSync("src/data-sources/bankauctions/adapter.ts", "utf8");
    const matches = [...src.matchAll(/officerEmail\s*:/g)];
    assert.ok(matches.length >= 3, `Expected at least 3 officerEmail writes, found ${matches.length}`);
  });
});
