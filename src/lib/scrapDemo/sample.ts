/** A made-up public notice used by the demo. The names, prices and IDs are fictional. It lists several lots on purpose: the deep scan keeps only the FIRST one. */
export const SAMPLE_NOTICE = `SAMPLE BANK LTD. — E-AUCTION SALE NOTICE (DEMO DATA, NOT A REAL NOTICE)
Sale of secured assets under the SARFAESI Act, 2002
Authorised Officer: Mr. A. Demo, Sample Bank Ltd., ARC Branch, Mumbai. Contact: +91 98000 00000, arc.demo@samplebank.example
E-auction platform: Demo E-Auction Portal. Notice No.: SBL/ARC/2026/045. Notice date: 20-10-2026

Lot 1
Description: Residential flat No. 402, 4th floor, Sunrise Apartments, Andheri East, Mumbai, Maharashtra 400069. Built-up area 780 sq ft. Two bedrooms, two bathrooms, one covered parking.
Reserve Price: Rs. 85,00,000   EMD: Rs. 8,50,000   Bid increment: Rs. 25,000
Date and time of e-auction: 14-11-2026 11:00 AM to 4:00 PM
EMD submission last date: 13-11-2026
Inspection: 05-11-2026 and 06-11-2026, 11:00 AM to 4:00 PM
Bank reference / Baanknet Property ID: DEMO-BNK-100234
Possession: Symbolic possession. Demand notice dated 02-06-2026.

Lot 2
Description: Commercial shop No. 7, Ground floor, City Plaza, MG Road, Pune, Maharashtra 411001. Area 420 sq ft.
Reserve Price: Rs. 62,50,000   EMD: Rs. 6,25,000
Date and time of e-auction: 14-11-2026 11:00 AM to 4:00 PM

Lot 3
Description: Toyota Innova car, registration MH 12 AB 1234, 2018 model (vehicle auction).
Reserve Price: Rs. 6,50,000   EMD: Rs. 65,000
`;

/** What a working extraction would return for Lot 1 (used only when "mock extraction" is ticked, so the screen can be shown without calling the AI). */
export const MOCK_FIELDS: Record<string, string> = {
  notice_number: "SBL/ARC/2026/045",
  external_id: "DEMO-BNK-100234",
  title: "Residential flat No. 402, 4th floor, Sunrise Apartments, Andheri East, Mumbai",
  property_type: "Residential flat",
  bank_name: "Sample Bank Ltd.",
  branch: "ARC Branch, Mumbai",
  authorized_officer: "Mr. A. Demo",
  contact_number: "+91 98000 00000",
  email: "arc.demo@samplebank.example",
  auction_platform: "Demo E-Auction Portal",
  full_address: "Residential flat No. 402, 4th floor, Sunrise Apartments, Andheri East, Mumbai, Maharashtra 400069",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400069",
  reserve_price: "Rs. 85,00,000",
  emd: "Rs. 8,50,000",
  bid_increment: "Rs. 25,000",
  auction_date: "14-11-2026",
  auction_time: "11:00 AM to 4:00 PM",
  emd_submission_end: "13-11-2026",
  inspection_date: "05-11-2026 and 06-11-2026",
  inspection_start_time: "11:00 AM",
  inspection_end_time: "4:00 PM",
  description: "Residential flat No. 402, 4th floor, Sunrise Apartments, Andheri East, Mumbai, Maharashtra 400069. Built-up area 780 sq ft. Two bedrooms, two bathrooms, one covered parking.",
  built_up_area: "780 sq ft",
  floor: "4th floor",
  bedrooms: "Two",
  bathrooms: "two",
  parking: "one covered parking",
  building_project_name: "Sunrise Apartments",
  possession_status: "Symbolic possession",
  symbolic_possession: "Symbolic possession",
  notice_date: "20-10-2026",
  demand_notice_date: "02-06-2026",
};
