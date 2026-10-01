import Link from "next/link";
import { safeHref } from "@/lib/pages/content";

/**
 * Renders the admin's text safely: blank line = new paragraph, "- " lines = bullet list, **bold**, [text](link).
 * Nothing the admin types is ever treated as HTML.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${keyBase}-b${i++}`} className="font-semibold text-black/90">{m[1]}</strong>);
    } else {
      const href = safeHref(m[3]);
      if (!href) out.push(m[2]);
      else if (href.startsWith("/")) out.push(<Link key={`${keyBase}-l${i++}`} href={href} className="text-brand underline underline-offset-2 hover:text-gold-dark">{m[2]}</Link>);
      else out.push(<a key={`${keyBase}-l${i++}`} href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2 hover:text-gold-dark">{m[2]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={`space-y-3 text-[15px] leading-7 text-black/75 ${className}`}>
      {blocks.map((block, bi) => {
        const rows = block.split("\n");
        // A block made only of "- item" lines is a list; a block that mixes text and bullets keeps the text first.
        const bullets = rows.filter((r) => /^[-•]\s+/.test(r));
        if (bullets.length === rows.length) {
          return (
            <ul key={bi} className="space-y-1.5 list-none">
              {rows.map((r, ri) => (
                <li key={ri} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{inline(r.replace(/^[-•]\s+/, ""), `${bi}-${ri}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-line">
            {inline(block, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}
