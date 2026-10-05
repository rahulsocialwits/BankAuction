import test from "node:test";
import assert from "node:assert/strict";
import { extractBaanknetEmbeddedAuctions } from "../src/data-sources/feeds/deepScan";

test("BAANKNET Next.js Flight auction data is imported without rendering the detail shell", () => {
  const source = {
    auctionId: 366354,
    auctionFrom: "2026-10-06T04:30:00.000Z",
    auctionTo: "2026-10-06T10:30:00.000Z",
    emd: "398000.00000",
    emdEnd: "2026-10-05T18:29:00.000Z",
    reservePrice: 3980000,
    incrementPrice: 10000,
    auctionBranch: "BRANCH - CIRCLE OFFICE ETAWAH",
    propertyDetailId: 277843,
    propertyUniqueId: "PUNBTEST123",
    pincode: "209725",
    cityName: "Kannauj",
    districtName: "Kannauj",
    stateName: "Uttar Pradesh",
    address: "116 square meter Individual House for sale in Kannauj",
    propertyPossessionType: "Symbolic",
    propertySubType: "Individual House",
    propertyType: "Residential",
    propertyHeading: "116 square meter Individual House for sale in Kannauj",
    borrowerName: "TEST BORROWER",
    propertyBankName: "Punjab National Bank",
    propertyBranchName: "Kannauj Branch",
    checkerName: "Test Officer",
    roMobile: "9999999999",
    auctionDocuments: [
      {
        filename: "Sale Notice.pdf",
        filepath: "Production/Application-Documents/Generic-Instance/Auction/366354/notice.pdf",
        description: "Sale Notice",
      },
    ],
  };
  const flight = "15:" + JSON.stringify(["$", "$L41", null, {
    auctionData: {
      data: [{ _index: "psba_auction_property", _id: "366354", _score: null, _source: source }],
      total: 1,
      currentPage: 1,
      totalPages: 1,
    },
    vehicleAuctionData: { data: [] },
  }]);
  const html = "<script>self.__next_f.push([1," + JSON.stringify(flight) + "])</script>";

  const records = extractBaanknetEmbeddedAuctions(html, "https://baanknet.com/auction-listing/property");
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "116 square meter Individual House for sale in Kannauj");
  assert.equal(records[0].bank, "Punjab National Bank");
  assert.equal(records[0].reserve_price, "3980000");
  assert.equal(records[0].emd, "398000");
  assert.equal(records[0].auction_start, "2026-10-06T10:00:00");
  assert.equal(records[0].auction_end, "2026-10-06T16:00:00");
  assert.equal(records[0].application_deadline, "2026-10-05T23:59:00");
  assert.equal(records[0].external_id, "src:baanknet.com:366354");
  assert.equal(records[0].source_url, "https://baanknet.com/auction-detail/366354");
  assert.equal(records[0].borrower, "TEST BORROWER");
  assert.match(records[0].documents ?? "", /cdn\.baanknet\.com/);
});
