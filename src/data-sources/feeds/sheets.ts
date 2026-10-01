import { UA } from "./webScan";

export interface SheetTab {
  gid: string;
  name: string;
}

export const sheetIdFromUrl = (url: string) => url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/)?.[1] ?? null;

const NOT_PUBLIC = "Sheet is not public. In Google Sheets use Share → General access → Anyone with the link (Viewer).";

async function get(url: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause;
    throw new Error(`Could not reach Google Sheets (${cause?.code ?? "network error"})`);
  }
}

/**
 * Every tab of a shared spreadsheet. Google lists the tabs on the sheet's public "htmlview" page.
 * If that page cannot be read, the tab named in the link (or the first tab) is used.
 */
export async function listSheetTabs(id: string, fallbackGid: string | null): Promise<SheetTab[]> {
  const res = await get(`https://docs.google.com/spreadsheets/d/${id}/htmlview`);
  const html = res.ok ? await res.text() : "";
  const tabs: SheetTab[] = [];
  for (const m of html.matchAll(/id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>([^<]*)<\/a>/g)) {
    tabs.push({ gid: m[1], name: decodeEntities(m[2]).trim() || `Tab ${m[1]}` });
  }
  if (tabs.length) return tabs;
  return [{ gid: fallbackGid ?? "0", name: "Sheet" }];
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function fetchTabCsv(id: string, gid: string): Promise<string> {
  const res = await get(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error(NOT_PUBLIC);
  if (!res.ok) throw new Error(`Google Sheets answered HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error(NOT_PUBLIC); // an HTML sign-in page instead of data
  return text;
}
