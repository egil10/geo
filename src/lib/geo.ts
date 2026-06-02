// Projected Norway map data for "which region is highlighted / pinned?" rounds.
import geo from "@/data/geo.json";

interface Region {
  name: string;
  number: string;
  d: string;
}
interface Geo {
  viewBox: string;
  proj: { cos: number; scale: number; ox: number; oy: number };
  fylker: Region[];
  kommuner: Region[];
}
const g = geo as Geo;

export const GEO_VIEWBOX = g.viewBox;
export const fylkerBase: string[] = g.fylker.map((f) => f.d).filter(Boolean);
export const fylkePathByNumber = new Map(g.fylker.filter((f) => f.d).map((f) => [f.number, f.d]));
export const kommunePathByNumber = new Map(g.kommuner.filter((k) => k.d).map((k) => [k.number, k.d]));

// Project a lat/lon to the same SVG space as the region paths (for pins).
export function projectPin(lat: number, lon: number): { x: number; y: number } {
  const { cos, scale, ox, oy } = g.proj;
  return { x: Math.round((lon * cos * scale + ox) * 10) / 10, y: Math.round((-lat * scale + oy) * 10) / 10 };
}

// The map only covers mainland Norway, so points far north/offshore (Svalbard,
// Jan Mayen, Bouvetøya, Antarctic) project off-canvas. Callers use this to skip
// map rounds for such subjects (they'd otherwise show an empty map).
const [, , vbW, vbH] = GEO_VIEWBOX.split(/\s+/).map(Number);
export function onMainland(lat: number, lon: number): boolean {
  const { x, y } = projectPin(lat, lon);
  return x >= 0 && x <= vbW && y >= 0 && y <= vbH;
}
