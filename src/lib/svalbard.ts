// Svalbard inset: a self-contained mini-map (its own viewBox + projection) so
// Svalbard subjects — which fall off the mainland map — can still be shown.
import svalbard from "@/data/geo-svalbard.json";

const s = svalbard as { viewBox: string; proj: { cos: number; scale: number; ox: number; oy: number }; outline: string[] };

export const SVALBARD_VIEWBOX = s.viewBox;
export const svalbardOutline = s.outline;
const [, , vbW, vbH] = s.viewBox.split(/\s+/).map(Number);

export function projectSvalbard(lat: number, lon: number): { x: number; y: number } {
  const { cos, scale, ox, oy } = s.proj;
  return { x: Math.round((lon * cos * scale + ox) * 10) / 10, y: Math.round((-lat * scale + oy) * 10) / 10 };
}

export function onSvalbard(lat: number, lon: number): boolean {
  const { x, y } = projectSvalbard(lat, lon);
  return x >= 0 && x <= vbW && y >= 0 && y <= vbH;
}
