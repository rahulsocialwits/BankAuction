import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_REGISTRY } from "../src/data-sources/registry";
import { checkSourceUrl, isBlockedRecord } from "../src/data-sources/feeds/blockedHosts";

test("manual source URL guard rejects Find Auction and its subdomains", () => {
  for (const url of [
    "https://findauction.in",
    "https://www.findauction.in/listings",
    "https://api.findauction.in/feed",
  ]) {
    const result = checkSourceUrl(url);
    assert.equal(result.ok, false, url);
    if (!result.ok) assert.equal(result.status, "internal_policy_block");
  }
});

test("blocked source records cannot be imported through URL or source-qualified ID", () => {
  assert.equal(isBlockedRecord({ source_url: "https://findauction.in/property/1" }), true);
  assert.equal(isBlockedRecord({ external_id: "src:findauction.in:123" }), true);
  assert.equal(isBlockedRecord({ source_url: "https://authorised-public-source.example/listing/1" }), false);
});

test("Find Auction is not registered as an ingestion source", () => {
  assert.equal(
    SOURCE_REGISTRY.some((source) => new URL(source.baseUrl).hostname === "findauction.in" ||
      new URL(source.baseUrl).hostname.endsWith(".findauction.in")),
    false,
  );
});
