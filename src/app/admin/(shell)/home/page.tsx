import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import SubmitButton from "@/components/admin/SubmitButton";
import { getHomeConfig } from "@/lib/queries/homeConfig";
import { PROPERTY_TYPE_TILES, SLOT_SPECS, cityKey, heroKey, typeKey } from "@/lib/siteImages";
import MediaPicker from "@/components/admin/MediaPicker";
import { chooseLibraryImage, removeSiteImage, saveHomeConfig, uploadSiteImage } from "./actions";

export const dynamic = "force-dynamic";

type Meta = { updatedAt: Date; sizeBytes: number; width: number | null; height: number | null };

function Slot({ k, title, spec, meta }: { k: string; title: string; spec: { w: number; h: number }; meta?: Meta }) {
  const ratioOk = meta?.width && meta?.height ? Math.abs(meta.width / meta.height - spec.w / spec.h) < 0.08 : true;
  return (
    <div className="border border-brand-border rounded-xl p-3 bg-white">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-brand-muted">{spec.w} × {spec.h} px</div>
      </div>
      <div className="rounded-lg bg-brand-bg overflow-hidden flex items-center justify-center mb-2" style={{ aspectRatio: `${spec.w} / ${spec.h}`, maxHeight: 180 }}>
        {meta ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${k}?v=${meta.updatedAt.getTime()}`} alt={title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-brand-muted">No image yet</span>
        )}
      </div>
      {meta && (
        <div className={`text-[11px] mb-2 ${ratioOk ? "text-green-700" : "text-amber-700"}`}>
          {meta.width && meta.height ? `${meta.width} × ${meta.height}` : "uploaded"} · {(meta.sizeBytes / 1024).toFixed(0)} KB
          {!ratioOk && " · shape differs from the recommended one, so it will be cropped"}
        </div>
      )}
      <form action={uploadSiteImage} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="key" value={k} />
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" className="text-xs max-w-[190px]" />
        <SubmitButton className="text-xs border border-brand-border rounded-lg px-3 py-1.5 hover:bg-brand-bg">Upload</SubmitButton>
      </form>
      <div className="mt-2"><MediaPicker mode="slot" slotKey={k} action={chooseLibraryImage} /></div>
      {meta && (
        <form action={removeSiteImage} className="mt-1.5">
          <input type="hidden" name="key" value={k} />
          <SubmitButton className="text-[11px] text-red-600 hover:underline">Remove</SubmitButton>
        </form>
      )}
    </div>
  );
}

export default async function HomeManagerPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireMaster();
  const { ok, error } = await searchParams;
  const [cfg, rows] = await Promise.all([
    getHomeConfig(),
    prisma.siteImage.findMany({ select: { key: true, updatedAt: true, sizeBytes: true, width: true, height: true } }),
  ]);
  const meta = new Map<string, Meta>(rows.map((r) => [r.key, r]));
  const cities = [...cfg.cities, ...Array(8 - cfg.cities.length).fill("")];

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Home Page</h1>
      <p className="text-sm text-brand-muted mb-5 max-w-3xl">
        Upload the pictures and edit the text of the home page. JPG, PNG or WebP, under 1.5 MB each. Pictures are cropped to fill
        their space, so keep the main subject in the middle. Changes go live immediately.
      </p>
      {ok && <div role="status" className="bg-green-50 text-green-800 text-sm rounded-lg px-3 py-2 mb-4">✓ {ok}</div>}
      {error && <div role="alert" className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-1">1. Hero (top banner)</h2>
        <p className="text-xs text-brand-muted mb-4">The search box sits on top of this picture. Use a darker or calmer image so the white text stays readable.</p>
        <div className="grid md:grid-cols-[2fr_1fr] gap-4 mb-5">
          <Slot k={heroKey("d")} title="Desktop banner" spec={SLOT_SPECS.hero.d} meta={meta.get(heroKey("d"))} />
          <Slot k={heroKey("m")} title="Mobile banner" spec={SLOT_SPECS.hero.m} meta={meta.get(heroKey("m"))} />
        </div>
        <form action={saveHomeConfig} className="grid gap-3 max-w-3xl">
          <div>
            <label className="block text-xs font-semibold mb-1">Headline</label>
            <input name="heroTitle" defaultValue={cfg.heroTitle} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Sub-heading</label>
            <textarea name="heroSubtitle" rows={2} defaultValue={cfg.heroSubtitle} className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="mt-2">
            <div className="text-xs font-semibold mb-1">Cities shown in &quot;Explore by City&quot; (8 tiles, 2 rows of 4)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {cities.map((c, i) => (
                <input key={i} name={`city_${i}`} defaultValue={c} placeholder={`City ${i + 1}`} className="border border-brand-border rounded-lg px-3 py-2 text-sm" />
              ))}
            </div>
            <p className="text-[11px] text-brand-muted mt-1">Use the same spelling as on the site (e.g. Bangalore, Mumbai). Save, then upload each city&apos;s picture below.</p>
          </div>
          <div><SubmitButton className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Save text and cities</SubmitButton></div>
        </form>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-1">2. Explore by City — pictures</h2>
        <p className="text-xs text-brand-muted mb-4">Each city has a desktop picture and a mobile picture ({SLOT_SPECS.city.d.w} × {SLOT_SPECS.city.d.h} px).</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {cfg.cities.map((city) => (
            <div key={city} className="space-y-3">
              <div className="font-medium text-sm">{city}</div>
              <Slot k={cityKey(city, "d")} title="Desktop" spec={SLOT_SPECS.city.d} meta={meta.get(cityKey(city, "d"))} />
              <Slot k={cityKey(city, "m")} title="Mobile" spec={SLOT_SPECS.city.m} meta={meta.get(cityKey(city, "m"))} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-brand-border rounded-xl p-5">
        <h2 className="font-semibold mb-1">3. Property type cards — pictures</h2>
        <p className="text-xs text-brand-muted mb-4">Five cards ({SLOT_SPECS.type.d.w} × {SLOT_SPECS.type.d.h} px). On mobile they become a swipeable row.</p>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {PROPERTY_TYPE_TILES.map((t) => (
            <div key={t.value} className="space-y-3">
              <div className="font-medium text-sm">{t.label}</div>
              <Slot k={typeKey(t.value, "d")} title="Desktop" spec={SLOT_SPECS.type.d} meta={meta.get(typeKey(t.value, "d"))} />
              <Slot k={typeKey(t.value, "m")} title="Mobile" spec={SLOT_SPECS.type.m} meta={meta.get(typeKey(t.value, "m"))} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
