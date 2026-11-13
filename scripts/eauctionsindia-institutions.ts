/*
 * Builds the reconciliation of the 105 reference institutions against what eAuctionsIndia itself shows. Read-only: no request to any website, no database.
 *
 *   npx tsx scripts/eauctionsindia-institutions.ts
 *   npx tsx scripts/eauctionsindia-institutions.ts --directory=eauctions-banks.html [--directory-complete]
 *
 * Evidence = the hand-saved eAuctionsIndia pages in the project folder (eauctions-*.html: institution links /bank/<slug> and logos on listing cards) plus, if given,
 * a saved institution DIRECTORY page (--directory, comma separated). --directory-complete says that the directory files hold the WHOLE directory; only then can a
 * name that is absent be reported as MISSING (otherwise it stays UNCERTAIN). Writes docs/launch/eauctionsindia-institution-mapping.csv and the three .txt lists.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildMapping, evidenceFromHtml, mappingToCsv, mappingToTxt, parseDirectory, ORIGINAL_INSTITUTIONS, type Evidence } from "../src/data-sources/eauctionsindia/institutions";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const dirFiles = (arg("directory") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const evidence: Evidence[] = [];
for (const f of readdirSync(".").filter((n) => /^eauctions-.*\.html?$/i.test(n))) evidence.push(...evidenceFromHtml(readFileSync(f, "utf8"), f));
for (const f of dirFiles) evidence.push(...parseDirectory(readFileSync(f, "utf8"), f));

const rows = buildMapping(evidence, { directoryComplete: process.argv.includes("--directory-complete"), directoryFiles: dirFiles });
if (rows.length !== ORIGINAL_INSTITUTIONS.length || new Set(rows.map((r) => r.original)).size !== ORIGINAL_INSTITUTIONS.length) throw new Error("reconciliation does not hold each original entry exactly once");
mkdirSync("docs/launch", { recursive: true });
writeFileSync("docs/launch/eauctionsindia-institution-mapping.csv", mappingToCsv(rows), "utf8");
writeFileSync("docs/launch/eauctionsindia-institutions-available.txt", mappingToTxt(rows, "CONFIRMED"), "utf8");
writeFileSync("docs/launch/eauctionsindia-institutions-missing.txt", mappingToTxt(rows, "MISSING"), "utf8");
writeFileSync("docs/launch/eauctionsindia-institutions-uncertain.txt", mappingToTxt(rows, ["UNCERTAIN", "CATEGORY"]), "utf8");
const c = (s: string) => rows.filter((r) => r.status === s).length;
console.log(`Original entries: ${rows.length}  |  CONFIRMED: ${c("CONFIRMED")}  MISSING: ${c("MISSING")}  UNCERTAIN: ${c("UNCERTAIN")}  CATEGORY (not an institution): ${c("CATEGORY")}`);
console.log(`Evidence items read: ${evidence.length} (${dirFiles.length ? `directory file(s): ${dirFiles.join(", ")}` : "no directory file supplied"})`);
for (const r of rows.filter((x) => x.status === "CONFIRMED")) console.log(`  CONFIRMED  ${r.original}  ->  ${r.matched}  ${r.url || "(no directory URL seen)"}  [${r.match}]`);
console.log("Files: docs/launch/eauctionsindia-institution-mapping.csv, -institutions-available.txt, -institutions-missing.txt, -institutions-uncertain.txt");
