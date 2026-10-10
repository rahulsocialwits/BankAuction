"use client";

import { useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ATTRIBUTION, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_TILE_URL } from "@/lib/map/config";
import { initialSelection, selectionReducer } from "@/lib/map/coordinates";
import { groupPins, qualityLabel, type MapPin } from "@/lib/map/mapPins";

export interface MapItem {
  id: string;
  slug: string;
  title: string;
  /** Present only when the property has reliable coordinates (see lib/map/coordinates.ts). */
  point: { lat: number; lng: number } | null;
  /** The server-rendered property card. */
  card: ReactNode;
}

const pinHtml = (active: boolean) =>
  `<span style="display:block;width:${active ? 30 : 22}px;height:${active ? 30 : 22}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${active ? "#c79a3b" : "#10213d"};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>`;

const countHtml = (n: number, active: boolean) =>
  `<span style="display:flex;align-items:center;justify-content:center;width:${active ? 40 : 34}px;height:${active ? 40 : 34}px;border-radius:50%;background:${active ? "#c79a3b" : "#10213d"};color:#fff;font:600 12px sans-serif;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${n}</span>`;

/**
 * Map + cards side by side (stacked on a phone, map first). A pin and its card highlight each other: clicking a pin scrolls to the
 * card, "Show on map" on a card (or hovering it) moves to the pin. Pins exist only for properties with reliable coordinates.
 */
export default function PropertyMapView({ items, pins, summary }: { items: MapItem[]; pins: MapPin[]; summary: string }) {
  // Pins cover every listing that matches the filters; the cards on the side are the current page.
  const mappable = pins;
  const ids = useMemo(() => new Set(pins.map((i) => i.id)), [pins]);
  const groups = useMemo(() => groupPins(pins), [pins]);
  // property id -> the marker (group) that holds it
  const keyOf = useMemo(() => new Map(groups.flatMap((g) => g.pins.map((p) => [p.id, g.key] as const))), [groups]);
  const [sel, dispatch] = useReducer((s: typeof initialSelection, a: Parameters<typeof selectionReducer>[1]) => selectionReducer(s, a, ids), initialSelection);

  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const fit = useRef<() => void>(() => undefined);

  // Create the map once per set of listings. Leaflet touches `window`, so it is loaded only in the browser.
  useEffect(() => {
    if (!box.current || mappable.length === 0) return;
    let cancelled = false;
    const pins = markers.current;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      leaflet.current = L;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
      L.tileLayer(MAP_TILE_URL, { attribution: MAP_ATTRIBUTION, maxZoom: 18 }).addTo(m);
      for (const group of groups) {
        const many = group.pins.length > 1;
        const first = group.pins[0];
        const marker = L.marker([group.point.lat, group.point.lng], {
          icon: L.divIcon({ className: "", html: many ? countHtml(group.pins.length, false) : pinHtml(false), iconSize: many ? [34, 34] : [22, 22], iconAnchor: many ? [17, 17] : [11, 22] }),
          title: many ? `${group.pins.length} properties` : first.title,
          keyboard: true,
        });
        const popup = document.createElement("div");
        popup.style.cssText = "max-height:240px;overflow:auto;min-width:200px";
        const head = document.createElement("strong");
        head.textContent = many ? `${group.pins.length} properties here` : first.title; // text only, never HTML
        const meta = document.createElement("div");
        meta.style.cssText = "margin:4px 0 6px;font-size:12px;color:#5b6577";
        meta.textContent = many
          ? `${qualityLabel(first.quality)}: they share one map point, the exact address is in each notice.`
          : [first.city, first.reservePrice != null ? `Reserve ₹${first.reservePrice.toLocaleString("en-IN")}` : null, qualityLabel(first.quality)].filter(Boolean).join(" · ");
        popup.append(head, meta);
        for (const item of group.pins.slice(0, 15)) {
          const link = document.createElement("a");
          link.href = `/property/${item.slug}`;
          link.textContent = many ? item.title : "View details →";
          link.style.cssText = "display:block;margin-top:4px;color:#10213d;font-weight:600;font-size:12px";
          popup.append(link);
        }
        if (group.pins.length > 15) {
          const more = document.createElement("div");
          more.style.cssText = "margin-top:6px;font-size:12px;color:#5b6577";
          more.textContent = `and ${group.pins.length - 15} more: see the list.`;
          popup.append(more);
        }
        marker.bindPopup(popup);
        marker.on("click", () => dispatch({ type: "pin", id: first.id }));
        marker.addTo(m);
        pins.set(group.key, marker);
      }
      const bounds = L.latLngBounds(mappable.map((i) => [i.point.lat, i.point.lng] as [number, number]));
      fit.current = () => (mappable.length === 1 ? m.setView(bounds.getCenter(), 13) : m.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 }));
      if (mappable.length === 1) m.setView(bounds.getCenter(), 13);
      else m.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      m.on("click", () => dispatch({ type: "clear" }));
      map.current = m;
    })().catch((e) => console.error("The map could not be drawn", e));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      pins.clear();
    };
  }, [mappable, groups]);

  // Highlight the selected / hovered pin; move the map when the pick came from a card, scroll the card when it came from a pin.
  useEffect(() => {
    const L = leaflet.current;
    if (!L) return;
    const activeKeys = new Set([sel.selectedId, sel.hoverId].filter((x): x is string => !!x).map((id) => keyOf.get(id)));
    for (const g of groups) {
      const marker = markers.current.get(g.key);
      if (!marker) continue;
      const active = activeKeys.has(g.key);
      const many = g.pins.length > 1;
      const size = many ? (active ? 40 : 34) : active ? 30 : 22;
      marker.setIcon(L.divIcon({ className: "", html: many ? countHtml(g.pins.length, active) : pinHtml(active), iconSize: [size, size], iconAnchor: many ? [size / 2, size / 2] : [size / 2, size] }));
      marker.setZIndexOffset(active ? 1000 : 0);
    }
    if (!sel.selectedId) return;
    const marker = markers.current.get(keyOf.get(sel.selectedId) ?? "");
    if (sel.source === "card" && marker && map.current) {
      map.current.flyTo(marker.getLatLng(), Math.max(map.current.getZoom(), 13), { duration: 0.6 });
      marker.openPopup();
    }
    if (sel.source === "pin") document.getElementById(`card-${sel.selectedId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel, groups, keyOf]);

  return (
    <section aria-label="Properties on a map">
      <p className="text-xs text-brand-muted mb-1" role="status">{summary}</p>
      {mappable.some((p) => p.approximate) && <p className="text-xs text-brand-muted mb-3">A pin with a number groups the properties that share one map point (the PIN code area, or the city centre when there is no PIN). Click it to see them. The exact address is in each auction notice.</p>}
      {mappable.length > 0 && <button type="button" onClick={() => fit.current()} className="mb-3 text-xs font-semibold text-brand hover:underline">Fit all results</button>}
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="lg:order-2 lg:w-[55%] lg:sticky lg:top-24 lg:self-start">
          {mappable.length > 0 ? (
            <div ref={box} className="w-full h-[50vh] lg:h-[calc(100vh-9rem)] min-h-[320px] rounded-2xl border border-brand-border overflow-hidden bg-[#E8EDF5] z-0" />
          ) : (
            <div className="w-full h-[240px] lg:h-[420px] rounded-2xl border border-dashed border-brand-border bg-white flex flex-col items-center justify-center text-center px-6">
              <p className="font-medium text-brand mb-1">Map locations are not available for these listings yet</p>
              <p className="text-sm text-brand-muted">We only place a pin when the notice gives reliable coordinates. The listings are shown below, or switch to List view.</p>
            </div>
          )}
        </div>
        <ul className="lg:order-1 lg:w-[45%] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4 list-none p-0 m-0">
          {items.map((item) => {
            const hasPin = ids.has(item.id);
            const active = item.id === sel.selectedId || item.id === sel.hoverId;
            return (
              <li
                key={item.id}
                id={`card-${item.id}`}
                className={`flex flex-col rounded-2xl transition ${active ? "ring-2 ring-gold" : ""}`}
                onMouseEnter={() => hasPin && dispatch({ type: "hover", id: item.id })}
                onMouseLeave={() => hasPin && dispatch({ type: "hover", id: null })}
                onFocus={() => hasPin && dispatch({ type: "hover", id: item.id })}
                onBlur={() => hasPin && dispatch({ type: "hover", id: null })}
              >
                <div className="flex-1">{item.card}</div>
                {hasPin ? (
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "card", id: item.id });
                      box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }}
                    aria-pressed={item.id === sel.selectedId}
                    className="mt-2 text-xs font-semibold text-brand hover:underline self-start"
                  >
                    Show on map
                  </button>
                ) : (
                  <span className="mt-2 text-xs text-brand-muted">No map location for this listing</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
