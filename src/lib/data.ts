// Unified geography dataset: merges authoritative SSB admin data (municipality
// numbers + county) with Wikidata's rich visuals/stats, applies a curated
// blocklist of unit-error outliers, and derives a 0..1 "prominence" per item
// (used for question difficulty + plausible distractor selection).

import kommunerWd from "@/data/kommuner.json";
import fylkerWd from "@/data/fylker.json";
import ssbKommunerJson from "@/data/ssb-kommuner.json";
import ssbFylkerJson from "@/data/ssb-fylker.json";
import fjellJson from "@/data/fjell.json";
import elverJson from "@/data/elver.json";
import innsjoerJson from "@/data/innsjoer.json";
import fjorderJson from "@/data/fjorder.json";
import oyerJson from "@/data/oyer.json";
import fossefallJson from "@/data/fossefall.json";
import isbreerJson from "@/data/isbreer.json";
import tunnelerJson from "@/data/tunneler.json";

export type Kind = "kommune" | "fylke" | "fjell" | "elv" | "innsjo" | "fjord" | "oy" | "foss" | "isbre" | "tunnel";

export interface Place {
  id: string;
  name: string;
  kind: Kind;
  county?: string;
  countyNumber?: string;
  number?: string; // kommune-/fylkesnummer
  admin?: string; // administrasjonssenter
  population?: number;
  area?: number;
  elevation?: number;
  length?: number;
  height?: number;
  metric?: number; // the ranking value for this kind
  metricUnit?: string;
  coa?: string; // coat of arms (symbol)
  photo?: string; // representative photo
  lat?: number;
  lon?: number;
  prominence: number; // 0 (obscure) .. 1 (famous)
}

interface RawKommune {
  id: string;
  name: string;
  numbers?: string[];
  population?: number;
  area?: number;
  coa?: string;
  photo?: string;
  lat?: number;
  lon?: number;
  county?: string;
  admin?: string;
}
interface RawFylke {
  id: string;
  name: string;
  population?: number;
  area?: number;
  coa?: string;
  photo?: string;
  admin?: string;
}
interface RawFeature {
  id: string;
  name: string;
  photo?: string;
  lat?: number;
  lon?: number;
  county?: string;
  elevation?: number;
  length?: number;
  area?: number;
  height?: number;
}

// Curated unit-error outliers (verified against coordinates/known facts).
const BLOCKLIST = new Set([
  "Q11223614", // Borrevannet "210 km²" (really ~1.8)
  "Q19384217", // Nærevannet "82.9 km²" (~0.7)
  "Q16467321", // Kvamsøy "8300 km²" (~3)
  "Q6980145", // Ostøya "2388 km²" (~0.6)
  "Q6513906", // Karlsøya "792 km²" (~7)
  "Q20113109", // Sævareidelva "250 km" (a few km)
]);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function assignProminence(list: Place[]) {
  const withVal = list.filter((p) => p.metric != null);
  const sorted = [...withVal].sort((a, b) => (b.metric as number) - (a.metric as number));
  const n = sorted.length;
  sorted.forEach((p, i) => {
    p.prominence = n <= 1 ? 0.5 : 1 - i / (n - 1);
  });
  for (const p of list) if (p.metric == null) p.prominence = 0;
}

// ---- Municipalities: SSB (authority) joined to Wikidata (visuals) by number -
const cleanName = (n: string) =>
  n
    .replace(/\s+kommune$/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

const wdByNumber = new Map<string, RawKommune>();
for (const k of kommunerWd as unknown as RawKommune[]) {
  for (const num of k.numbers ?? []) if (!wdByNumber.has(num)) wdByNumber.set(num, k);
}

export const kommuner: Place[] = (
  ssbKommunerJson as { number: string; name: string; countyNumber: string; county: string }[]
).map((s) => {
  const wd = wdByNumber.get(s.number);
  return {
    id: wd?.id ?? `ssb-${s.number}`,
    name: wd ? cleanName(wd.name) : s.name,
    kind: "kommune" as const,
    county: s.county, // authoritative
    countyNumber: s.countyNumber,
    number: s.number,
    admin: wd?.admin,
    population: wd?.population,
    area: wd?.area,
    coa: wd?.coa,
    photo: wd?.photo,
    lat: wd?.lat,
    lon: wd?.lon,
    metric: wd?.population,
    metricUnit: "innb.",
    prominence: 0,
  };
});

// Disambiguate duplicate municipality names (Herøy, Våler, Nes, ...) by county.
const nameCounts = new Map<string, number>();
for (const k of kommuner) nameCounts.set(k.name, (nameCounts.get(k.name) ?? 0) + 1);
for (const k of kommuner) if ((nameCounts.get(k.name) ?? 0) > 1) k.name = `${k.name} (${k.county})`;

assignProminence(kommuner);

// ---- Counties: SSB number joined to Wikidata ------------------------------
// cleanName strips " kommune" so the Oslo county (labelled "Oslo kommune" in
// Wikidata, since Oslo is both city and county) joins to SSB's "Oslo".
const fylkeWdByName = new Map<string, RawFylke>();
for (const f of fylkerWd as unknown as RawFylke[]) fylkeWdByName.set(norm(cleanName(f.name)), f);

export const fylker: Place[] = (ssbFylkerJson as { number: string; name: string }[]).map((s) => {
  const wd = fylkeWdByName.get(norm(s.name));
  return {
    id: wd?.id ?? `ssb-fylke-${s.number}`,
    name: s.name,
    kind: "fylke" as const,
    number: s.number,
    admin: wd?.admin,
    population: wd?.population,
    area: wd?.area,
    coa: wd?.coa,
    photo: wd?.photo,
    metric: wd?.population,
    metricUnit: "innb.",
    prominence: 0,
  };
});
assignProminence(fylker);

// ---- Natural features -----------------------------------------------------
function buildFeatures(json: unknown, kind: Kind, field: keyof RawFeature, unit: string): Place[] {
  const list = (json as RawFeature[])
    .filter((x) => !BLOCKLIST.has(x.id) && x.name && x[field] != null)
    .map((x) => ({
      id: x.id,
      name: x.name,
      kind,
      county: x.county,
      photo: x.photo,
      lat: x.lat,
      lon: x.lon,
      elevation: x.elevation,
      length: x.length,
      area: x.area,
      height: x.height,
      metric: x[field] as number,
      metricUnit: unit,
      prominence: 0,
    }));
  assignProminence(list);
  return list;
}

export const fjell = buildFeatures(fjellJson, "fjell", "elevation", "moh.");
export const elver = buildFeatures(elverJson, "elv", "length", "km");
export const innsjoer = buildFeatures(innsjoerJson, "innsjo", "area", "km²");
export const fjorder = buildFeatures(fjorderJson, "fjord", "length", "km");
export const oyer = buildFeatures(oyerJson, "oy", "area", "km²");
export const fossefall = buildFeatures(fossefallJson, "foss", "height", "m");
export const isbreer = buildFeatures(isbreerJson, "isbre", "area", "km²");
export const tunneler = buildFeatures(tunnelerJson, "tunnel", "length", "km");

export const byKind: Record<Kind, Place[]> = {
  kommune: kommuner,
  fylke: fylker,
  fjell,
  elv: elver,
  innsjo: innsjoer,
  fjord: fjorder,
  oy: oyer,
  foss: fossefall,
  isbre: isbreer,
  tunnel: tunneler,
};

export const countyNames: string[] = fylker.map((f) => f.name);

// ---- Display helpers ------------------------------------------------------
const nf = new Intl.NumberFormat("nb-NO");
export function fmtInt(n: number | undefined): string {
  return n == null ? "–" : nf.format(Math.round(n));
}
export function fmtMetric(p: Place): string {
  if (p.metric == null) return "";
  const unit = p.metricUnit ?? "";
  const v = p.metric;
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${nf.format(rounded)} ${unit}`.trim();
}

export const KIND_LABEL: Record<Kind, { one: string; many: string }> = {
  kommune: { one: "kommune", many: "kommuner" },
  fylke: { one: "fylke", many: "fylker" },
  fjell: { one: "fjell", many: "fjell" },
  elv: { one: "elv", many: "elver" },
  innsjo: { one: "innsjø", many: "innsjøer" },
  fjord: { one: "fjord", many: "fjorder" },
  oy: { one: "øy", many: "øyer" },
  foss: { one: "foss", many: "fossefall" },
  isbre: { one: "isbre", many: "isbreer" },
  tunnel: { one: "tunnel", many: "tunneler" },
};
