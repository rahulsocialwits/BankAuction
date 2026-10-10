import Link from "next/link";

/** Previous / next links with "Page x of y". `basePath` may already carry a query string. */
export default function PagerNav({ basePath, page, totalPages }: { basePath: string; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => `${basePath}${basePath.includes("?") ? "&" : "?"}page=${p}`;
  const btn = "px-4 py-2 rounded-lg border border-brand-border text-sm font-medium hover:border-brand";
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 && <Link href={page === 2 ? basePath : href(page - 1)} className={btn}>← Previous</Link>}
      <span className="px-4 py-2 text-sm text-brand-muted">Page {page} of {totalPages}</span>
      {page < totalPages && <Link href={href(page + 1)} className={btn}>Next →</Link>}
    </nav>
  );
}
