import { describe, expect, it } from "vitest";
import { isRefusal } from "@/lib/fetch/httpStatus";

describe("eAuctionsIndia Vitest alias setup", () => {
  it("resolves the project @ alias and classifies explicit refusals", () => {
    expect(isRefusal("forbidden")).toBe(true);
    expect(isRefusal("success")).toBe(false);
  });
});
