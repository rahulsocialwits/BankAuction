import { canonState } from "@/lib/domain/states";

/*
 * Is THIS PROPERTY located in Maharashtra? Decided only from the property's own location evidence: its state field, its district / city / area, its address
 * text and its PIN code. The bank, the branch, the auction office, the service provider and the page the listing was found on are NEVER evidence (a bank
 * headquartered in Mumbai can hold a plot in Hyderabad). Verdicts:
 *   accept  positively verified as Maharashtra, no conflicting evidence
 *   reject  positive evidence that it is in another state
 *   review  missing, ambiguous or conflicting evidence: NOT imported as Maharashtra, logged for a person to check
 */

export const MAHARASHTRA_DISTRICTS: readonly string[] = [
  "Ahmednagar", "Ahilyanagar", "Akola", "Amravati", "Chhatrapati Sambhajinagar", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli",
  "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Dharashiv", "Palghar", "Parbhani",
  "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal",
];

/** Cities that sites use where a district would be, and that exist only in Maharashtra under that spelling. */
export const MAHARASHTRA_CITIES: readonly string[] = [
  "Mumbai", "Navi Mumbai", "Greater Mumbai", "Kalyan", "Dombivli", "Dombivali", "Vasai", "Virar", "Vasai Virar", "Panvel", "Bhiwandi", "Mira Bhayandar", "Mira Road", "Bhayandar", "Ulhasnagar",
  "Ambernath", "Badlapur", "Kalyan Dombivli", "Pimpri Chinchwad", "Pimpri-Chinchwad", "Pimpri", "Chinchwad", "Kolhapur", "Ichalkaranji", "Malegaon", "Shirdi", "Lonavala", "Alibag", "Baramati",
  "Nashik", "Nagpur", "Pune", "Thane", "Solapur", "Sangli", "Satara", "Latur", "Jalgaon", "Akola", "Amravati", "Nanded", "Ahmednagar",
];

/** Names that also exist in another state: the name alone is NOT evidence. */
export const AMBIGUOUS_PLACES: readonly string[] = ["Aurangabad", "Raigarh", "Bijapur", "Hamirpur", "Pratapgarh", "Bilaspur"];

const OTHER_STATES: readonly string[] = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Orissa", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Chandigarh", "Puducherry", "Jammu and Kashmir", "Ladakh", "Daman and Diu", "Dadra and Nagar Haveli",
];

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const districtSet = new Set([...MAHARASHTRA_DISTRICTS, ...MAHARASHTRA_CITIES].map(norm));
const ambiguousSet = new Set(AMBIGUOUS_PLACES.map(norm));

/** PIN codes of Maharashtra: 400xxx to 402xxx and 404xxx to 445xxx (403xxx is Goa). */
export function pincodeInMaharashtra(pin: string): boolean | null {
  const p = pin.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(p)) return null;
  const three = Number(p.slice(0, 3));
  return (three >= 400 && three <= 402) || (three >= 404 && three <= 445);
}

export interface LocationInput { state?: string; district?: string; city?: string; area?: string; address?: string; pincode?: string }
export interface LocationVerdict { verdict: "accept" | "reject" | "review"; basis: string[]; reasons: string[] }

const mentionsState = (text: string, state: string) => new RegExp(`\\b${state.replace(/ /g, "\\s+")}\\b`, "i").test(text);

export function validateMaharashtra(i: LocationInput): LocationVerdict {
  const basis: string[] = [];
  const reasons: string[] = [];
  const state = (i.state ?? "").trim();
  const stateCanon = state ? canonState(state) : "";

  if (stateCanon && stateCanon !== "Maharashtra") return { verdict: "reject", basis: [], reasons: [`the property's state is "${state}"`] };
  const stateOk = stateCanon === "Maharashtra";
  if (stateOk) basis.push("state field says Maharashtra");

  const text = [i.address, i.area, i.city, i.district].filter(Boolean).join(" ");
  const textMh = /\bmaharashtra\b/i.test(text);
  const otherInText = OTHER_STATES.filter((s) => mentionsState(text, s));
  if (textMh) basis.push("address text names Maharashtra");

  // a PIN is read from the text only when it is introduced as one ("Pincode-416 310"): a lot or survey number is not a PIN
  const pin = (i.pincode ?? "").trim() || (text.match(/pin\s*code\s*[-:]?\s*(\d{3})\s?(\d{3})\b/i)?.slice(1, 3).join("") ?? "");
  const pinMh = pin ? pincodeInMaharashtra(pin) : null;
  if (pinMh === true) basis.push(`PIN ${pin} is a Maharashtra PIN`);

  const places = [i.district, i.city, i.area].filter((x): x is string => !!x && !!x.trim());
  const keys = places.flatMap((p) => p.split(/[,/]/).map((x) => norm(x)).filter(Boolean));
  // a district / city named in the address text counts the same way (whole words only; ambiguous names never do)
  const textKey = ` ${norm(text)} `;
  const inText = [...districtSet].find((d) => !ambiguousSet.has(d) && textKey.includes(` ${d} `));
  const mhPlace = keys.find((k) => districtSet.has(k) && !ambiguousSet.has(k)) ?? inText;
  const ambiguousPlace = keys.find((k) => ambiguousSet.has(k));
  if (mhPlace) basis.push(`district / city "${mhPlace}" is in Maharashtra`);

  // conflicts: the evidence points to more than one state
  if (pinMh === false && (stateOk || textMh || mhPlace)) reasons.push(`PIN ${pin} is not a Maharashtra PIN but other evidence says Maharashtra`);
  if (otherInText.length && (stateOk || textMh || mhPlace)) reasons.push(`the address also names ${otherInText.join(", ")}`);
  if (reasons.length) return { verdict: "review", basis, reasons };
  if (pinMh === false && !stateOk && !textMh && !mhPlace) return { verdict: "reject", basis, reasons: [`PIN ${pin} is not a Maharashtra PIN`] };
  if (otherInText.length && !stateOk && !textMh && !mhPlace) return { verdict: "reject", basis, reasons: [`the address names ${otherInText.join(", ")} and not Maharashtra`] };

  if (stateOk || textMh) return { verdict: "accept", basis, reasons: [] };
  if (mhPlace && pinMh !== false) return { verdict: "accept", basis, reasons: [] };
  if (ambiguousPlace && pinMh === true) return { verdict: "accept", basis: [...basis, `"${ambiguousPlace}" is ambiguous but the PIN settles it`], reasons: [] };
  if (ambiguousPlace) return { verdict: "review", basis, reasons: [`"${ambiguousPlace}" exists in more than one state and no state or PIN settles it`] };
  return { verdict: "review", basis, reasons: [places.length || text ? "the location text does not name a Maharashtra district, city or state, and there is no state field or PIN code" : "no location evidence"] };
}
