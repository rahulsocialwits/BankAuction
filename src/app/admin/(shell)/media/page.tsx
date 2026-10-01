import { prisma } from "@/lib/db/prisma";
import { requireMaster } from "@/lib/auth/adminAuth";
import SubmitButton from "@/components/admin/SubmitButton";
import CopyButton from "@/components/admin/CopyButton";
import { deleteMedia, renameMedia, uploadMedia } from "./actions";

export const dynamic = "force-dynamic";

export default async function MediaLibraryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; q?: string }> }) {
  await requireMaster();
  const { ok, error, q } = await searchParams;
  const [items, total, bytes] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: { createdAt: "desc" },
      take: 120,
      select: { id: true, name: true, width: true, height: true, sizeBytes: true, createdAt: true, contentType: true },
    }),
    prisma.mediaAsset.count(),
    prisma.mediaAsset.aggregate({ _sum: { sizeBytes: true } }),
  ]);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold text-brand mb-1">Media Library</h1>
      <p className="text-sm text-brand-muted mb-5 max-w-3xl">
        Every picture you upload is kept here, so you can reuse it anywhere (Home Page tiles, hero, logos) without uploading it again.
        JPG, PNG or WebP, under 1.5 MB each. The same picture is never stored twice.
      </p>
      {ok && <div role="status" className="bg-green-50 text-green-800 text-sm rounded-lg px-3 py-2 mb-4">✓ {ok}</div>}
      {error && <div role="alert" className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <section className="bg-white border border-brand-border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">Upload pictures</h2>
        <form action={uploadMedia} className="flex flex-wrap items-center gap-3">
          <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp" className="text-sm max-w-full" />
          <SubmitButton className="bg-brand text-white text-sm font-medium rounded-lg px-5 py-2 hover:bg-brand-dark">Upload</SubmitButton>
          <span className="text-xs text-brand-muted">Pick several at once (up to about 4 MB in total per upload).</span>
        </form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-brand-muted">{total} picture{total === 1 ? "" : "s"} · {((bytes._sum.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB stored</div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search by name…" className="border border-brand-border rounded-lg px-3 py-1.5 text-sm w-56" />
          <button className="border border-brand-border rounded-lg px-3 text-sm hover:bg-brand-bg">Search</button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-brand-border rounded-xl p-12 text-center text-sm text-brand-muted">
          {q ? "No picture matches that name." : "The library is empty. Upload your first pictures above."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {items.map((m) => (
            <div key={m.id} className="bg-white border border-brand-border rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] bg-[repeating-conic-gradient(#f1f3f7_0%_25%,#fff_0%_50%)] [background-size:16px_16px] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/${m.id}?thumb=1`} alt={m.name} loading="lazy" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="p-3 flex-1 flex flex-col gap-2">
                <form action={renameMedia} className="flex gap-1">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="name" defaultValue={m.name} aria-label="Name" className="min-w-0 flex-1 text-xs font-medium border border-transparent hover:border-brand-border focus:border-brand rounded px-1 py-0.5" />
                  <button className="text-[10px] text-brand-muted hover:text-brand" title="Save the new name">Save</button>
                </form>
                <div className="text-[11px] text-brand-muted">
                  {m.width && m.height ? `${m.width} × ${m.height} · ` : ""}
                  {(m.sizeBytes / 1024).toFixed(0)} KB · {m.createdAt.toLocaleDateString("en-IN")}
                </div>
                <div className="flex items-center gap-1.5 mt-auto">
                  <CopyButton path={`/api/media/${m.id}`} />
                  <a href={`/api/media/${m.id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] border border-brand-border rounded px-2 py-1 hover:bg-brand-bg">Open</a>
                  <form action={deleteMedia} className="ml-auto">
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton className="text-[11px] text-red-600 hover:underline">Delete</SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
