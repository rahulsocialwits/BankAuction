import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Regression: a database error while reading the image list must not be cached as "no images" (home page showed blank tiles for 5 minutes). */
test("getImageVersions: the cached function does not swallow errors, the wrapper does", () => {
  const src = readFileSync("src/lib/siteImages.ts", "utf8");
  const cached = src.slice(src.indexOf("const cachedImageVersions"), src.indexOf("export async function getImageVersions"));
  assert.ok(cached.includes("unstable_cache"));
  assert.ok(!/catch/.test(cached), "an error caught inside unstable_cache would be cached as an empty map");
  const wrapper = src.slice(src.indexOf("export async function getImageVersions"), src.indexOf("/** Public URL"));
  assert.match(wrapper, /try \{[\s\S]*await cachedImageVersions\(\)[\s\S]*\} catch \{\s*return \{\};/);
});
