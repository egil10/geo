// Projected SVG outlines for water features (built by scripts/build-water.mjs),
// keyed by the feature's Wikidata id. Rivers/fjords are stroke polylines; lakes
// are filled polygons. Coverage is partial — callers fall back to a pin.
import water from "@/data/geo-water.json";

const w = water as { rivers: Record<string, string>; lakes: Record<string, string>; fjords: Record<string, string> };

export const riverLine = (id: string): string | undefined => w.rivers[id];
export const lakeShape = (id: string): string | undefined => w.lakes[id];
export const fjordLine = (id: string): string | undefined => w.fjords[id];
