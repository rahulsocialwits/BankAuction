import test from "node:test";
import assert from "node:assert/strict";
import { baanknetRecordsFromSources } from "../src/data-sources/feeds/deepScan";
import { baanknetStateOf, isBaanknetUrl } from "../src/data-sources/feeds/baanknetImport";

// A record exactly as BAANKNET's public listing data delivers it (shortened).
const SOURCE = {
  auctionId: 363831, auctionFrom: "2026-10-06T06:00:00.000Z", auctionTo: "2026-10-06T10:00:00.000Z", auctionBranch: "BRANCH - CIRCLE OFFICE KOLKATA - WEST",
  checkerName: "MUKESH KUMAR CHATURVEDI", emd: "117000.00000", emdEnd: "2026-10-06T09:30:00.000Z", reservePrice: 1170000, incrementPrice: 10000,
  propertyDetailId: 237007, propertyUniqueId: "PUNBABA37943566", pincode: "700063", cityName: "Kolkata", stateName: "West Bengal", districtName: "Kolkata",
  address: "MOUZA-PASCHIM BARISHA,PREMISES NO 22/1,CRISTAN PATHWAY,KOLKATA-700063", propertyPossessionType: "Symbolic", propertySubType: "Flat", propertyType: "Residential",
  typeOfAction: "Under SARFAESI", borrowerName: "PABITRA BEVERAGES", propertyBankName: "Punjab National Bank", propertyBranchName: "BRANCH - CIRCLE OFFICE KOLKATA - WEST",
  auctionDocuments: [{ size: 1, filename: "n.pdf", filepath: "Production/Application-Documents/Auction/363831/475583.pdf", description: "E AUCTION SALE NOTICE" }],
  propertyMedia: [{ filename: "a.jpg", filepath: "Production/Images/237007/329540.jpg", url: "https://cdn.baanknet.com/Production/Images/237007/329540.jpg" }],
  carpetAreaSqft: "425.00", propertyHeading: "425 square feet Flat for sale in Kolkata",
};

test("a BAANKNET listing record becomes a complete importer record (all fields, images, documents)", () => {
  const [r] = baanknetRecordsFromSources([SOURCE]);
  assert.ok(r, "record produced");
  assert.equal(r.external_id, "src:baanknet.com:363831"); // stable identity: reading it again UPDATES, never duplicates
  assert.equal(r.source_url, "https://baanknet.com/auction-detail/363831");
  assert.equal(r.borrower, "PABITRA BEVERAGES");
  assert.match(r.bank ?? "", /Punjab National Bank/i);
  assert.equal(r.reserve_price, "1170000");
  assert.equal(r.emd, "117000");
  assert.equal(r.auction_start, "2026-10-06T11:30:00"); // 06:00Z = 11:30 IST
  assert.match(r.location ?? "", /Kolkata/);
  assert.ok(JSON.parse(r.documents ?? "[]").some((d: { url: string }) => /475583\.pdf$/.test(d.url)), "notice document attached");
  assert.ok(JSON.parse(r.media ?? "[]").some((m: { url: string }) => /329540\.jpg$/.test(m.url)), "image attached");
});

test("the same auction twice in one batch is one record; ten different ones are ten", () => {
  assert.equal(baanknetRecordsFromSources([SOURCE, SOURCE]).length, 1);
  const many = Array.from({ length: 10 }, (_, i) => ({ ...SOURCE, auctionId: 400000 + i, propertyDetailId: 500000 + i }));
  assert.equal(baanknetRecordsFromSources(many).length, 10);
});

test("the import cursor is read back exactly (no restart from page 1)", () => {
  const raw = JSON.stringify({ web: { seen: [], lastAt: null }, baanknet: { si: 0, page: 37, totalPages: { upcoming: 91 }, done: false, pagesDone: 36, records: 1800, created: 1700, updated: 100, skipped: 0, held: 0, rejected: 0, startedAt: "2026-10-06T00:00:00Z" } });
  const st = baanknetStateOf(raw);
  assert.equal(st?.page, 37);
  assert.equal(st?.totalPages.upcoming, 91);
  assert.equal(baanknetStateOf(null), null);
  assert.equal(baanknetStateOf("not json"), null);
});

test("only baanknet.com addresses use the dedicated importer", () => {
  assert.equal(isBaanknetUrl("https://baanknet.com/"), true);
  assert.equal(isBaanknetUrl("https://www.baanknet.com/x"), true);
  assert.equal(isBaanknetUrl("https://notbaanknet.com/"), false);
  assert.equal(isBaanknetUrl("https://bankauctions.in/"), false);
});
