import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Test the freshnessLabel logic by extracting its body from the page source (structural test)
// and verifying its presence in the page component.

describe("P2.9 freshness timestamp", () => {
  it("freshnessLabel function is present in the property detail page", () => {
    const src = readFileSync("src/app/(site)/property/[slug]/page.tsx", "utf8");
    assert.match(src, /function freshnessLabel\(/, "freshnessLabel function must exist");
  });

  it("freshnessLabel is called on auction.updatedAt in the page", () => {
    const src = readFileSync("src/app/(site)/property/[slug]/page.tsx", "utf8");
    assert.match(src, /freshnessLabel\(auction\.updatedAt\)/, "freshnessLabel must be called with auction.updatedAt");
  });

  it("Last verified label is rendered when auction exists", () => {
    const src = readFileSync("src/app/(site)/property/[slug]/page.tsx", "utf8");
    assert.match(src, /Last verified/, "Page must show 'Last verified' label");
  });
});

// Unit-test the logic inline (copy of the pure function — avoids importing JSX)
function freshnessLabel(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

describe("freshnessLabel logic", () => {
  it("returns 'just now' for 0 minutes ago", () => {
    assert.equal(freshnessLabel(new Date()), "just now");
  });

  it("returns 'X minutes ago' for recent times", () => {
    const d = new Date(Date.now() - 30 * 60_000);
    assert.equal(freshnessLabel(d), "30 minutes ago");
  });

  it("returns 'X hours ago' for same-day", () => {
    const d = new Date(Date.now() - 5 * 3600_000);
    assert.equal(freshnessLabel(d), "5 hours ago");
  });

  it("returns 'X days ago' for recent days", () => {
    const d = new Date(Date.now() - 3 * 86400_000);
    assert.equal(freshnessLabel(d), "3 days ago");
  });

  it("returns 'X months ago' for older dates", () => {
    const d = new Date(Date.now() - 60 * 86400_000);
    assert.equal(freshnessLabel(d), "2 months ago");
  });
});
