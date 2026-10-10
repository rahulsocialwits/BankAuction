import Link from "next/link";
import { viewHref, type ListingView } from "@/lib/map/coordinates";

/** List / Map switch for /properties. Plain links, so filters and the page number are kept and it works without JavaScript. */
export default function ViewToggle({ params, view, mapEnabled = true }: { params: Record<string, string | undefined>; view: ListingView; mapEnabled?: boolean }) {
  const item = (v: ListingView, label: string) => (
    <Link
      href={viewHref(params, v)}
      scroll={false}
      aria-current={view === v ? "page" : undefined}
      className={`px-4 py-2 text-sm font-semibold transition ${view === v ? "bg-brand text-white" : "bg-white text-brand hover:bg-brand-bg"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Listing view" className="inline-flex rounded-lg border border-brand-border overflow-hidden shadow-sm">
      {item("list", "List")}
      {mapEnabled ? item("map", "Map") : null}
    </nav>
  );
}
