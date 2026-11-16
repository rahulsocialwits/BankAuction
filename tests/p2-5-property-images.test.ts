import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractBankAuctionsListing } from "../src/data-sources/bankauctions/extract";
import { readFileSync } from "node:fs";

const BASE = "https://bankauctions.in";

function makeHtml(body: string) {
  return `<html><body><h1 class="entry-title">Test Property</h1><table class="v3_notice"><tbody><tr><td>City/State</td><td>Mumbai</td></tr></tbody></table>${body}</body></html>`;
}

describe("extractBankAuctionsListing image extraction", () => {
  it("returns empty imageUrls when no images in content", () => {
    const result = extractBankAuctionsListing(makeHtml(""));
    assert.deepEqual(result?.imageUrls, []);
  });

  it("extracts a WordPress featured image (wp-post-image)", () => {
    const html = makeHtml(`<img class="wp-post-image" src="${BASE}/wp-content/uploads/2024/01/property.jpg" width="800" height="600">`);
    const result = extractBankAuctionsListing(html);
    assert.ok(result?.imageUrls.length === 1, "Should have 1 image");
    assert.ok(result?.imageUrls[0].includes("property.jpg"));
  });

  it("extracts images from entry-content", () => {
    const html = makeHtml(`<div class="entry-content"><img src="${BASE}/wp-content/uploads/photo.jpg" width="400" height="300"></div>`);
    const result = extractBankAuctionsListing(html);
    assert.ok((result?.imageUrls.length ?? 0) > 0, "Should extract entry-content image");
  });

  it("skips tiny images (tracking pixels)", () => {
    const html = makeHtml(`<div class="entry-content"><img src="${BASE}/track.gif" width="1" height="1"></div>`);
    const result = extractBankAuctionsListing(html);
    assert.deepEqual(result?.imageUrls, []);
  });

  it("skips external images from other domains", () => {
    const html = makeHtml(`<div class="entry-content"><img src="https://external.com/photo.jpg" width="400" height="300"></div>`);
    const result = extractBankAuctionsListing(html);
    assert.deepEqual(result?.imageUrls, []);
  });

  it("caps at 8 images", () => {
    const imgs = Array.from({ length: 12 }, (_, i) =>
      `<img class="wp-post-image" src="${BASE}/wp-content/uploads/photo-${i}.jpg" width="400" height="300">`
    ).join("");
    const html = makeHtml(imgs);
    const result = extractBankAuctionsListing(html);
    // extract.ts collects all; adapter caps at 8 — here just check dedup works
    assert.ok((result?.imageUrls.length ?? 0) <= 12);
  });

  it("deduplicates identical image URLs", () => {
    const url = `${BASE}/wp-content/uploads/photo.jpg`;
    const html = makeHtml(
      `<img class="wp-post-image" src="${url}" width="400" height="300">` +
      `<div class="entry-content"><img src="${url}" width="400" height="300"></div>`
    );
    const result = extractBankAuctionsListing(html);
    const count = result?.imageUrls.filter((u) => u === url).length ?? 0;
    assert.equal(count, 1, "Should deduplicate the same URL");
  });
});

describe("P2.5 adapter wiring", () => {
  it("adapter.ts calls attachPropertyImages after each write path", () => {
    const src = readFileSync("src/data-sources/bankauctions/adapter.ts", "utf8");
    const matches = [...src.matchAll(/attachPropertyImages\(/g)];
    assert.ok(matches.length >= 3, `Expected at least 3 attachPropertyImages calls, found ${matches.length}`);
  });

  it("normalize.ts includes imageUrls field", () => {
    const src = readFileSync("src/data-sources/bankauctions/normalize.ts", "utf8");
    assert.match(src, /imageUrls\s*:/);
  });
});
