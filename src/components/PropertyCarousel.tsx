import PropertyCard, { PropertyCardData } from "./PropertyCard";

export default function PropertyCarousel({ properties }: { properties: PropertyCardData[] }) {
  if (properties.length === 0) {
    return (
      <p className="text-brand-muted text-sm py-6 text-center border border-dashed border-brand-border rounded-xl">
        No live or upcoming listings right now — check back soon.
      </p>
    );
  }

  return (
    <div className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory">
      {properties.map((p) => (
        <div key={p.slug} className="snap-start shrink-0 w-72 sm:w-80 flex [&>a]:w-full">
          <PropertyCard property={p} />
        </div>
      ))}
    </div>
  );
}
