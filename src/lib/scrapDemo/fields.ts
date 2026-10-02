// AI Python Scrap — DEMO. The A-to-Z list of property fields the demo asks for. Only fields actually found in the source are filled.

export type FieldKind = "text" | "money" | "date" | "number";
export interface FieldDef {
  key: string;
  label: string;
  group: GroupKey;
  kind: FieldKind;
}

export const GROUPS = [
  { key: "basic", label: "Basic Information" },
  { key: "bank", label: "Bank & Auction" },
  { key: "location", label: "Location" },
  { key: "financial", label: "Financial" },
  { key: "schedule", label: "Auction Schedule" },
  { key: "details", label: "Property Details" },
  { key: "legal", label: "Legal & Possession" },
] as const;
export type GroupKey = (typeof GROUPS)[number]["key"];

const f = (group: GroupKey, key: string, label: string, kind: FieldKind = "text"): FieldDef => ({ key, label, group, kind });

export const FIELDS: FieldDef[] = [
  f("basic", "property_id", "Property ID"),
  f("basic", "auction_id", "Auction ID"),
  f("basic", "external_id", "External ID"),
  f("basic", "notice_number", "Notice Number"),
  f("basic", "title", "Property Title"),
  f("basic", "property_type", "Property Type"),
  f("basic", "asset_type", "Asset Type"),
  f("basic", "sub_type", "Sub Type"),
  f("basic", "category", "Category"),
  f("basic", "status", "Status"),

  f("bank", "bank_name", "Bank Name"),
  f("bank", "branch", "Branch"),
  f("bank", "circle_region", "Circle / Region"),
  f("bank", "authorized_officer", "Authorized Officer"),
  f("bank", "contact_person", "Contact Person"),
  f("bank", "contact_number", "Contact Number"),
  f("bank", "email", "Email"),
  f("bank", "auction_platform", "Auction Platform"),
  f("bank", "auction_reference", "Auction Reference"),
  f("bank", "auction_number", "Auction Number"),

  f("location", "full_address", "Full Property Address"),
  f("location", "address_line", "Address Line"),
  f("location", "landmark", "Landmark"),
  f("location", "village", "Village"),
  f("location", "taluka", "Taluka"),
  f("location", "tehsil", "Tehsil"),
  f("location", "district", "District"),
  f("location", "city", "City"),
  f("location", "state", "State"),
  f("location", "pincode", "Pincode"),
  f("location", "latitude", "Latitude", "number"),
  f("location", "longitude", "Longitude", "number"),
  f("location", "map_url", "Location / Map URL"),

  f("financial", "reserve_price", "Reserve Price", "money"),
  f("financial", "emd", "EMD", "money"),
  f("financial", "emd_percentage", "EMD Percentage", "number"),
  f("financial", "bid_increment", "Bid Increment", "money"),
  f("financial", "minimum_bid", "Minimum Bid", "money"),
  f("financial", "outstanding_amount", "Outstanding Amount", "money"),
  f("financial", "demand_amount", "Demand Amount", "money"),
  f("financial", "other_charges", "Other Charges"),
  f("financial", "inspection_fee", "Inspection Fee", "money"),

  f("schedule", "auction_date", "Auction Date", "date"),
  f("schedule", "auction_time", "Auction Time"),
  f("schedule", "auction_start", "Auction Start", "date"),
  f("schedule", "auction_end", "Auction End", "date"),
  f("schedule", "registration_start", "Registration Start", "date"),
  f("schedule", "registration_end", "Registration End", "date"),
  f("schedule", "emd_submission_start", "EMD Submission Start", "date"),
  f("schedule", "emd_submission_end", "EMD Submission End", "date"),
  f("schedule", "inspection_date", "Inspection Date", "date"),
  f("schedule", "inspection_start_time", "Inspection Start Time"),
  f("schedule", "inspection_end_time", "Inspection End Time"),
  f("schedule", "bid_submission_deadline", "Bid Submission Deadline", "date"),

  f("details", "description", "Property Description (complete text)"),
  f("details", "construction_details", "Construction Details"),
  f("details", "area", "Area"),
  f("details", "built_up_area", "Built-up Area"),
  f("details", "carpet_area", "Carpet Area"),
  f("details", "super_built_up_area", "Super Built-up Area"),
  f("details", "plot_area", "Plot Area"),
  f("details", "land_area", "Land Area"),
  f("details", "floor", "Floor"),
  f("details", "number_of_floors", "Number of Floors"),
  f("details", "bedrooms", "Bedrooms"),
  f("details", "bathrooms", "Bathrooms"),
  f("details", "parking", "Parking"),
  f("details", "building_project_name", "Building / Project Name"),
  f("details", "survey_number", "Survey Number"),
  f("details", "cts_number", "CTS Number"),
  f("details", "gat_number", "Gat Number"),
  f("details", "khasra_number", "Khasra Number"),
  f("details", "municipal_number", "Municipal Number"),
  f("details", "other_identifiers", "Other Identifiers"),

  f("legal", "possession_status", "Possession Status"),
  f("legal", "physical_possession", "Physical Possession"),
  f("legal", "symbolic_possession", "Symbolic Possession"),
  f("legal", "constructive_possession", "Constructive Possession"),
  f("legal", "encumbrance", "Encumbrance Information"),
  f("legal", "legal_description", "Legal Description"),
  f("legal", "title_information", "Title Information"),
  f("legal", "case_reference_number", "Case / Reference Number"),
  f("legal", "notice_date", "Notice Date", "date"),
  f("legal", "demand_notice_date", "Demand Notice Date", "date"),
  f("legal", "possession_notice_date", "Possession Notice Date", "date"),
];

export const REQUIRED_KEYS = ["title", "bank_name", "property_type", "full_address", "reserve_price"];
