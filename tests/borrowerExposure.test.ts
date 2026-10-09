import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Borrower names must never reach a public page (P0-01).
 * The property page is cached (revalidate) and shared by every visitor, so a blur or a hidden element is not protection:
 * the name must not be selected from the database or rendered at all until a tested entitlement system exists.
 * These are source-level guards (no database, no real names).
 */

const root = join(__dirname, "..");
const PAGE = "src/app/(site)/property/[slug]/page.tsx";
const read = (f: string) => readFileSync(join(root, f), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(root, dir))) {
    const rel = join(dir, n);
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
}

/** Everything a visitor can reach without a login: the public site, the public components, the public API and the query helpers. */
const PUBLIC_FILES = [
  ...walk("src/app/(site)"),
  ...walk("src/app/api"),
  ...walk("src/lib/queries"),
  ...readdirSync(join(root, "src/components")).filter((n) => /\.tsx?$/.test(n)).map((n) => join("src/components", n)),
  "src/lib/apiShape.ts",
  "src/lib/seo.ts",
  "src/app/sitemap.ts",
].filter((f) => !/\/api\/cron\//.test(f));

test("the property page does not select the borrower column", () => {
  const code = stripComments(read(PAGE));
  assert.match(code, /auctions:\s*\{\s*omit:\s*\{\s*borrower:\s*true\s*\}/, "the auction include must omit borrower");
});

test("the property page never renders or passes on a borrower value", () => {
  const code = stripComments(read(PAGE));
  assert.doesNotMatch(code, /\.borrower\b/, "no property access to a borrower value");
  const rest = code.replace(/omit:\s*\{\s*borrower:\s*true\s*\}/, "");
  assert.doesNotMatch(rest, /\bborrower\s*[:?,}]/, "no other borrower key");
});

test("the blurred borrower text is gone and a neutral message is shown", () => {
  const code = stripComments(read(PAGE));
  const block = code.slice(code.indexOf(">Borrower</dt>"), code.indexOf("</dl>", code.indexOf(">Borrower</dt>")));
  assert.ok(block.length > 20, "the Borrower row exists");
  assert.doesNotMatch(block, /blur|select-none|hidden|sr-only|aria-hidden|data-/, "no blurred or hidden text in the borrower row");
  assert.match(code, /Borrower details available with Premium/);
  assert.doesNotMatch(code, /(unlocked|you have premium|activate now)/i, "must not imply Premium already works");
});

test("no public route, component, query helper or API shape reads a borrower value", () => {
  assert.ok(PUBLIC_FILES.length > 20, "the scan really covers the public tree");
  for (const f of PUBLIC_FILES) {
    const code = stripComments(read(f));
    const offending = code
      .replace(/omit:\s*\{\s*borrower:\s*true\s*\}/g, "")
      .match(/\.borrower\b|\bborrower\s*:\s*(true|\{)|\["borrower"\]|select:\s*\{[^}]*\bborrower\b/);
    assert.equal(offending, null, `${relative(root, join(root, f))} must not read the borrower field`);
  }
});

test("the property page has no structured data or client-component hand-off of whole auction objects", () => {
  const code = stripComments(read(PAGE));
  assert.doesNotMatch(code, /JsonLd|application\/ld\+json/);
  assert.doesNotMatch(code, /JSON\.stringify\(\s*(auction|property)\s*\)/);
  assert.doesNotMatch(code, /(auction|property)=\{(auction|property)\}/, "do not hand a full row to a component");
});
