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
import fotballJson from "@/data/fotballklubber.json";
import aviserJson from "@/data/aviser.json";
import byerJson from "@/data/byer.json";
import stasjonerJson from "@/data/jernbanestasjoner.json";
import lufthavnerJson from "@/data/lufthavner.json";
import banerJson from "@/data/jernbanelinjer.json";

export type Kind =
  | "kommune" | "fylke" | "fjell" | "elv" | "innsjo" | "fjord" | "oy" | "foss" | "isbre" | "tunnel" | "klubb" | "avis"
  | "by" | "stasjon" | "lufthavn" | "bane";

export interface Place {
  id: string;
  name: string;
  kind: Kind;
  county?: string;
  countyNumber?: string;
  number?: string; // kommune-/fylkesnummer
  admin?: string; // administrasjonssenter
  tag?: string; // free label (football division, newspaper type, …)
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

// ---- Football clubs + newspapers (non-geographic, location = home town) ----
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
// `tag` carries a gender-explicit division label so a "Brann" in the men's
// Eliteserien is never confused with a "Brann" in the women's Toppserien.
const DIV_INFO: Record<string, { label: string; prom: number }> = {
  Eliteserien: { label: "Eliteserien (herrer)", prom: 1 },
  "OBOS-ligaen": { label: "OBOS-ligaen (herrer)", prom: 0.7 },
  "2. divisjon menn": { label: "2. divisjon (herrer)", prom: 0.35 },
  Toppserien: { label: "Toppserien (kvinner)", prom: 0.85 },
  "1. divisjon kvinner": { label: "1. divisjon (kvinner)", prom: 0.5 },
};
export const klubber: Place[] = Object.entries(fotballJson as Record<string, { name: string; sted: string }[]>).flatMap(([div, clubs]) => {
  const info = DIV_INFO[div] ?? { label: div, prom: 0.4 };
  return clubs.map((c) => ({
    id: `klubb-${slugify(c.name)}-${slugify(div)}`,
    name: c.name,
    kind: "klubb" as const,
    county: c.sted,
    tag: info.label,
    prominence: info.prom,
  }));
});
export const aviser: Place[] = (aviserJson as { name: string; sted: string }[]).map((p) => {
  const riks = /riks/i.test(p.sted);
  return {
    id: `avis-${slugify(p.name)}`,
    name: p.name,
    kind: "avis" as const,
    county: p.sted,
    tag: riks ? "Riksdekkende" : "Lokalavis",
    prominence: riks ? 1 : 0.5,
  };
});

// ---- Cities, train stations, airports, railway lines (Wikidata) -----------
interface RawByer { id: string; name: string; population?: number; lat?: number; lon?: number; county?: string; photo?: string }
interface RawStasjon { id: string; name: string; lat?: number; lon?: number; county?: string; line?: string; photo?: string }
interface RawLuft { id: string; name: string; lat?: number; lon?: number; county?: string; iata?: string; photo?: string }
interface RawBane { id: string; name: string; length?: number; photo?: string }

export const byer: Place[] = (byerJson as RawByer[])
  .filter((b) => b.name)
  .map((b) => ({
    id: b.id, name: b.name, kind: "by" as const,
    county: b.county, photo: b.photo, lat: b.lat, lon: b.lon,
    population: b.population, metric: b.population, metricUnit: "innb.",
    prominence: 0,
  }));
assignProminence(byer);

const stripStation = (n: string) => n.replace(/\s+(stasjon|stoppested|holdeplass)$/i, "").trim();
export const stasjoner: Place[] = (stasjonerJson as RawStasjon[])
  .filter((s) => s.name && s.lat != null)
  .map((s) => ({
    id: s.id, name: stripStation(s.name), kind: "stasjon" as const,
    county: s.county, photo: s.photo, lat: s.lat, lon: s.lon,
    tag: s.line, prominence: 0.4,
  }));

export const lufthavner: Place[] = (lufthavnerJson as RawLuft[])
  .filter((a) => a.name && a.lat != null)
  .map((a) => ({
    id: a.id, name: a.name, kind: "lufthavn" as const,
    county: a.county, photo: a.photo, lat: a.lat, lon: a.lon,
    tag: a.iata, prominence: a.iata ? 0.7 : 0.45,
  }));

export const baner: Place[] = (banerJson as RawBane[])
  .filter((l) => l.name && l.length != null)
  .map((l) => ({
    id: l.id, name: l.name, kind: "bane" as const,
    photo: l.photo, length: l.length, metric: l.length, metricUnit: "km",
    prominence: 0,
  }));
assignProminence(baner);

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
  klubb: klubber,
  avis: aviser,
  by: byer,
  stasjon: stasjoner,
  lufthavn: lufthavner,
  bane: baner,
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
  klubb: { one: "klubb", many: "klubber" },
  avis: { one: "avis", many: "aviser" },
  by: { one: "by", many: "byer" },
  stasjon: { one: "stasjon", many: "stasjoner" },
  lufthavn: { one: "lufthavn", many: "lufthavner" },
  bane: { one: "bane", many: "baner" },
};
