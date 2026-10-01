import DragScroll from "./DragScroll";
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
    <DragScroll arrows className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 snap-x snap-mandatory -mx-5 px-5 scroll-px-5 lg:mx-0 lg:px-0 lg:scroll-px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {properties.map((p) => (
        <div key={p.slug} className="snap-start shrink-0 w-[78%] sm:w-80 flex [&>a]:w-full">
          <PropertyCard property={p} />
        </div>
      ))}
    </DragScroll>
  );
}
