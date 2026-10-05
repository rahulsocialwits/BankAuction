import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots, robotsAllows, robotsDecision, robotsMatch } from "../src/lib/fetch/robotsRules";
import { robotsSkipLine } from "../src/lib/fetch/httpStatus";

const allows = (body: string, url: string) => robotsAllows(body, url).allowed;

test("* wildcard matches any characters", () => {
  assert.equal(robotsMatch("/search/*/sort", "/search/a/b/sort"), true);
  assert.equal(robotsMatch("/search/*/sort", "/search/a/b/other"), false);
  assert.equal(allows("User-agent: *\nDisallow: /private*data", "https://x.in/private-secret-data"), false);
  assert.equal(allows("User-agent: *\nDisallow: /private*data", "https://x.in/public"), true);
});

test("$ anchors the end of the address", () => {
  const body = "User-agent: *\nDisallow: /*.pdf$";
  assert.equal(allows(body, "https://x.in/files/a.pdf"), false);
  assert.equal(allows(body, "https://x.in/files/a.pdf?download=1"), true); // '$' = nothing after .pdf
  assert.equal(allows(body, "https://x.in/files/a.pdfx"), true);
});

test("a rule without wildcards is a literal prefix, regex characters are literal", () => {
  assert.equal(allows("User-agent: *\nDisallow: /a.b", "https://x.in/a.b/c"), false);
  assert.equal(allows("User-agent: *\nDisallow: /a.b", "https://x.in/aXb"), true);
  assert.equal(allows("User-agent: *\nDisallow: /q?x=1", "https://x.in/q?x=1&y=2"), false);
});

test("longest match wins: Allow beats a shorter Disallow", () => {
  const body = "User-agent: *\nDisallow: /auction\nAllow: /auction/public";
  assert.equal(allows(body, "https://x.in/auction/private"), false);
  assert.equal(allows(body, "https://x.in/auction/public/1"), true);
});

test("a longer Disallow beats a shorter Allow", () => {
  const body = "User-agent: *\nAllow: /\nDisallow: /admin/";
  assert.equal(allows(body, "https://x.in/admin/users"), false);
  assert.equal(allows(body, "https://x.in/home"), true);
});

test("equal length: Allow wins", () => {
  const body = "User-agent: *\nDisallow: /page\nAllow: /page";
  assert.equal(robotsAllows(body, "https://x.in/page").allowed, true);
});

test("our own group wins over *, and multiple groups of ours are merged", () => {
  const body = "User-agent: *\nDisallow: /\n\nUser-agent: BankAuctionBot\nDisallow: /a\n\nUser-agent: bankauctionbot\nDisallow: /b";
  assert.equal(allows(body, "https://x.in/c"), true);
  assert.equal(allows(body, "https://x.in/a/1"), false);
  assert.equal(allows(body, "https://x.in/b/1"), false);
});

test("other bots groups do not apply; short agent names do not match us", () => {
  assert.equal(allows("User-agent: bot\nDisallow: /", "https://x.in/p"), true);
  assert.equal(allows("User-agent: googlebot\nDisallow: /", "https://x.in/p"), true);
});

test("empty Disallow allows everything; comments are ignored; Crawl-delay and Sitemap are read", () => {
  const p = parseRobots("User-agent: *\nDisallow:   # nothing\nCrawl-delay: 7\nSitemap: https://x.in/s.xml");
  assert.equal(p.delay, 7);
  assert.deepEqual(p.sitemaps, ["https://x.in/s.xml"]);
  assert.equal(robotsDecision(p.groups, "/anything").allowed, true);
});

test("query string is part of the matched address", () => {
  assert.equal(allows("User-agent: *\nDisallow: /*?sort=", "https://x.in/list?sort=price"), false);
  assert.equal(allows("User-agent: *\nDisallow: /*?sort=", "https://x.in/list?page=2"), true);
});

test("robots-disallowed URL: decision names the rule and the log line says the request is skipped", () => {
  const d = robotsAllows("User-agent: *\nDisallow: /search/*", "https://x.in/search/mumbai");
  assert.equal(d.allowed, false);
  assert.equal(d.rule, "Disallow: /search/*");
  assert.match(robotsSkipLine("https://x.in/search/mumbai", d.rule), /robots\.txt → URL disallowed.*request skipped/);
});
