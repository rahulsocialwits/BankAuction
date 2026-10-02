import type { ListingRecord } from "@/lib/import/csvImport";

/** A made-up public notice used by the demo. The names, prices and IDs are fictional. It includes one vehicle on purpose, to show that vehicles are rejected. */
export const SAMPLE_NOTICE = `SAMPLE BANK LTD. — E-AUCTION SALE NOTICE (DEMO DATA, NOT A REAL NOTICE)
Sale of secured assets under the SARFAESI Act, 2002

Lot 1
Description: Residential flat No. 402, 4th floor, Sunrise Apartments, Andheri East, Mumbai, Maharashtra 400069. Built-up area 780 sq ft.
Reserve Price: Rs. 85,00,000   EMD: Rs. 8,50,000
Date and time of e-auction: 14-11-2026 11:00 AM to 4:00 PM
Inspection: 05-11-2026 and 06-11-2026, 11:00 AM to 4:00 PM
Bank reference / Baanknet Property ID: DEMO-BNK-100234
Possession: Symbolic

Lot 2
Description: Commercial shop No. 7, Ground floor, City Plaza, MG Road, Pune, Maharashtra 411001. Area 420 sq ft.
Reserve Price: Rs. 62,50,000   EMD: Rs. 6,25,000
Date and time of e-auction: 14-11-2026 11:00 AM to 4:00 PM
Inspection: 07-11-2026, 11:00 AM to 4:00 PM
Notice No.: SBL/ARC/2026/045

Lot 3
Description: Industrial land and shed, Plot No. 22, MIDC Phase II, Nashik, Maharashtra 422010. Area 12,000 sq ft.
Reserve Price: Rs. 1,45,00,000   EMD: Rs. 14,50,000
Date and time of e-auction: 21-11-2026 11:00 AM
Inspection: 10-11-2026

Lot 4
Description: Toyota Innova car, registration MH 12 AB 1234, 2018 model (vehicle auction).
Reserve Price: Rs. 6,50,000   EMD: Rs. 65,000
Date and time of e-auction: 14-11-2026 11:00 AM
`;

/** What a working extraction would return for the sample (used only when "mock extraction" is ticked, so the screen can be shown without calling the AI). */
export const MOCK_RECORDS: ListingRecord[] = [
  {
    title: "Residential flat No. 402, Sunrise Apartments, Andheri East, Mumbai",
    bank: "Sample Bank Ltd.",
    category: "RESIDENTIAL",
    location: "Andheri East, Mumbai, Maharashtra 400069",
    description: "Built-up area 780 sq ft. Symbolic possession.",
    reserve_price: "8500000",
    emd: "850000",
    auction_start: "2026-11-14T11:00",
    possession_status: "Symbolic",
  },
  {
    title: "Commercial shop No. 7, City Plaza, MG Road, Pune",
    bank: "Sample Bank Ltd.",
    category: "COMMERCIAL",
    location: "MG Road, Pune, Maharashtra 411001",
    description: "Ground floor shop, 420 sq ft.",
    reserve_price: "6250000",
    emd: "625000",
    auction_start: "2026-11-14T11:00",
  },
  {
    title: "Industrial land and shed, Plot 22, MIDC Phase II, Nashik",
    bank: "Sample Bank Ltd.",
    category: "INDUSTRIAL",
    location: "MIDC Phase II, Nashik, Maharashtra 422010",
    description: "Area 12,000 sq ft.",
    reserve_price: "14500000",
    auction_start: "2026-11-21T11:00",
  },
  {
    title: "Toyota Innova car, MH 12 AB 1234",
    bank: "Sample Bank Ltd.",
    description: "2018 model (vehicle auction).",
    reserve_price: "650000",
    emd: "65000",
    auction_start: "2026-11-14T11:00",
  },
];
