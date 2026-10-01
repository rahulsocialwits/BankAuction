import Link from "next/link";
import RichText from "./RichText";
import type { AboutContent } from "@/lib/pages/content";

function Medallion({ children }: { children: React.ReactNode }) {
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-bg to-[#dbe4f3] text-brand">{children}</span>;
}

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const Target = () => (
  <svg {...svg}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
);
const Eye = () => (
  <svg {...svg}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);

/** Illustration shown until the master admin uploads a picture. */
function Placeholder() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="BankAuction.co">
      <rect width="400" height="400" fill="#E8EDF5" />
      <g transform="translate(0,20)">
        <g fill="#14233D">
          <rect x="96" y="120" width="96" height="170" rx="4" />
          <rect x="200" y="168" width="80" height="122" rx="4" opacity=".85" />
          <rect x="286" y="206" width="50" height="84" rx="4" opacity=".7" />
        </g>
        <g fill="#A67C1E">
          {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={110 + c * 26} y={138 + r * 30} width="16" height="16" rx="2" />))}
          <rect x="132" y="252" width="26" height="38" rx="3" />
        </g>
        <rect x="70" y="290" width="290" height="4" rx="2" fill="#CBD5E3" />
      </g>
    </svg>
  );
}

/** About Us: picture on the left (1200 × 1200), story, mission and vision on the right; stacked on a phone. */
export default function AboutView({ content }: { content: AboutContent }) {
  const bullets = (pts: string[]) => pts.map((p) => `- ${p}`).join("\n");
  return (
    <main className="w-full px-5 lg:px-10 xl:px-16 py-10 md:py-16">
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 lg:gap-16 items-center">
        <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
          {/* soft offset block behind the picture */}
          <div aria-hidden="true" className="absolute -left-3 top-8 bottom-[-18px] right-8 rounded-3xl bg-brand-bg lg:-left-6" />
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-brand-border">
            {content.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={content.imageUrl} alt={content.imageAlt} width={1200} height={1200} className="h-full w-full object-cover" fetchPriority="high" decoding="async" />
            ) : (
              <Placeholder />
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold text-brand leading-tight">{content.title}</h1>
          {content.intro && <div className="mt-5"><RichText text={content.intro} className="text-base" /></div>}

          {content.missionPoints.length > 0 && (
            <div className="mt-8 flex gap-4">
              <Medallion><Target /></Medallion>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-black/90 mb-2">{content.missionTitle}</h2>
                <RichText text={bullets(content.missionPoints)} />
              </div>
            </div>
          )}

          {content.visionPoints.length > 0 && (
            <div className="mt-7 flex gap-4">
              <Medallion><Eye /></Medallion>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-black/90 mb-2">{content.visionTitle}</h2>
                <RichText text={bullets(content.visionPoints)} />
              </div>
            </div>
          )}

          {content.buttonLabel && content.buttonHref && (
            <div className="mt-9">
              <Link href={content.buttonHref} className="inline-flex items-center gap-2 rounded-lg bg-brand px-7 py-3 text-sm font-semibold uppercase tracking-wide text-white hover:bg-brand-dark">
                {content.buttonLabel} <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
