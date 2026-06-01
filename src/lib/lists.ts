// "Lister" mode: fill-in-the-table challenges. Name every item in a list (top-N
// by a metric, a themed set, or the geographic extremes). Hints help; a single
// input fills whichever row your guess matches.

import { fjell, elver, innsjoer, fjorder, oyer, fossefall, isbreer, tunneler, kommuner, fylker, Place, fmtMetric, fmtInt } from "./data";

export interface ListRow {
  answers: string[]; // accepted names for this slot
  hint: string; // clue shown on the row
  reveal: string; // shown once found
}

export interface ListDef {
  key: string;
  title: string;
  blurb: string;
  rows: ListRow[];
}

const byMetricDesc = (list: Place[]) => [...list].filter((p) => p.metric != null).sort((a, b) => b.metric! - a.metric!);

function topRows(list: Place[], n: number): ListRow[] {
  return byMetricDesc(list)
    .slice(0, n)
    .map((p) => ({ answers: [p.name], hint: p.county ?? "Norge", reveal: `${p.name} · ${fmtMetric(p)}` }));
}

function thresholdRows(list: Place[], min: number): ListRow[] {
  return byMetricDesc(list)
    .filter((p) => (p.metric ?? 0) >= min)
    .map((p) => ({ answers: [p.name], hint: p.county ?? "Norge", reveal: `${p.name} · ${fmtMetric(p)}` }));
}

const EXTREMES: ListRow[] = [
  { hint: "Høyeste fjell", answers: ["Galdhøpiggen"], reveal: "Galdhøpiggen · 2469 moh" },
  { hint: "Lengste elv", answers: ["Glomma", "Glåma"], reveal: "Glomma · 604 km" },
  { hint: "Største innsjø", answers: ["Mjøsa"], reveal: "Mjøsa · 369 km²" },
  { hint: "Dypeste innsjø", answers: ["Hornindalsvatnet", "Hornindalsvatnet"], reveal: "Hornindalsvatnet · 514 m dypt" },
  { hint: "Største øy (m/ Svalbard)", answers: ["Spitsbergen"], reveal: "Spitsbergen · 37 673 km²" },
  { hint: "Lengste fjord", answers: ["Sognefjorden", "Sognefjord"], reveal: "Sognefjorden · 205 km" },
  { hint: "Høyeste fossefall", answers: ["Vinnufossen", "Balåifossen"], reveal: "Vinnufossen · 860 m" },
  { hint: "Største isbre", answers: ["Austfonna"], reveal: "Austfonna · ~7 800 km² (Svalbard)" },
  { hint: "Største isbre på fastlandet", answers: ["Jostedalsbreen"], reveal: "Jostedalsbreen · 487 km²" },
  { hint: "Lengste vegtunnel", answers: ["Lærdalstunnelen"], reveal: "Lærdalstunnelen · 24,5 km" },
  { hint: "Lengste bru", answers: ["Nordhordlandsbrua", "Nordhordlandsbroen"], reveal: "Nordhordlandsbrua · 1 614 m" },
  { hint: "Mest folkerike kommune", answers: ["Oslo"], reveal: "Oslo · 729 000 innb." },
  { hint: "Største kommune i areal", answers: ["Kautokeino", "Guovdageaidnu"], reveal: "Kautokeino · 9 700 km²" },
  { hint: "Største fylke i areal", answers: ["Finnmark"], reveal: "Finnmark · ~48 600 km²" },
];

// Compass / altitude extreme points (Wikipedia: Extreme points of Norway).
const YTTERPUNKTER: ListRow[] = [
  { hint: "Nordligste punkt (fastlandet)", answers: ["Kinnarodden", "Nordkinn"], reveal: "Kinnarodden (Nordkinn) · Lebesby" },
  { hint: "Nordligste punkt (Magerøya)", answers: ["Knivskjellodden", "Nordkapp"], reveal: "Knivskjellodden · v/ Nordkapp" },
  { hint: "Sørligste punkt (fastlandet)", answers: ["Lindesnes"], reveal: "Lindesnes" },
  { hint: "Østligste punkt (fastlandet)", answers: ["Kibergsneset", "Kiberg", "Vardø"], reveal: "Kibergsneset · Vardø" },
  { hint: "Vestligste punkt (fastlandet)", answers: ["Vardetangen", "Austrheim"], reveal: "Vardetangen · Austrheim" },
  { hint: "Nordligste punkt (kongeriket)", answers: ["Rossøya"], reveal: "Rossøya · Svalbard" },
  { hint: "Østligste punkt (kongeriket)", answers: ["Kræmerpynten", "Kvitøya"], reveal: "Kræmerpynten · Kvitøya" },
  { hint: "Vestligste punkt (kongeriket)", answers: ["Jan Mayen", "Hoybergodden"], reveal: "Jan Mayen" },
  { hint: "Høyeste punkt", answers: ["Galdhøpiggen"], reveal: "Galdhøpiggen · 2469 moh" },
];

const BRUER: ListRow[] = [
  { hint: "Vestland · 1 614 m", answers: ["Nordhordlandsbrua", "Nordhordlandsbroen"], reveal: "Nordhordlandsbrua · 1 614 m" },
  { hint: "Nordland · 1 533 m", answers: ["Hålogalandsbrua", "Hålogalandsbroen"], reveal: "Hålogalandsbrua · 1 533 m" },
  { hint: "Vestland · 1 380 m", answers: ["Hardangerbrua", "Hardangerbroen"], reveal: "Hardangerbrua · 1 380 m" },
  { hint: "Møre og Romsdal · 1 257 m", answers: ["Gjemnessundbrua", "Gjemnessundbroen"], reveal: "Gjemnessundbrua · 1 257 m" },
  { hint: "Nordland · 1 065 m", answers: ["Helgelandsbrua", "Helgelandsbroen"], reveal: "Helgelandsbrua · 1 065 m" },
  { hint: "Vestland · 1 057 m", answers: ["Askøybrua", "Askøybroen"], reveal: "Askøybrua · 1 057 m" },
  { hint: "Trøndelag · 1 010 m", answers: ["Skarnsundbrua", "Skarnsundbroen"], reveal: "Skarnsundbrua · 1 010 m" },
  { hint: "Møre og Romsdal · Atlanterhavsvegen", answers: ["Storseisundbrua", "Storseisundet"], reveal: "Storseisundbrua · 260 m" },
];

const EVEIER: ListRow[] = [
  { hint: "Svinesund–Kirkenes (~2 600 km)", answers: ["E6"], reveal: "E6 · landets lengste" },
  { hint: "Oslo–Ørje / Kristiansand", answers: ["E18"], reveal: "E18 · Oslo–Ørje & Oslo–Kristiansand" },
  { hint: "Kristiansand–Trondheim (kysten)", answers: ["E39"], reveal: "E39 · Kyststamvegen" },
  { hint: "Bergen–Oslo–Riksgrensen", answers: ["E16"], reveal: "E16 · Bergen–Gävle" },
  { hint: "Haugesund–Drammen (over Haukeli)", answers: ["E134"], reveal: "E134 · Haukelivegen" },
  { hint: "Å i Lofoten–Riksgrensen", answers: ["E10"], reveal: "E10 · Lofotens hovedveg" },
  { hint: "Ålesund–Dombås", answers: ["E136"], reveal: "E136 · Romsdalen" },
  { hint: "Stjørdal–Storlien", answers: ["E14"], reveal: "E14 · mot Sverige" },
];

const fylkeRows: ListRow[] = [...fylker]
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  .map((f) => ({ answers: [f.name], hint: f.admin ? `Sentrum: ${f.admin}` : "Fylke", reveal: `${f.name} · ${fmtInt(f.population)} innb.` }));

export const LISTS: ListDef[] = [
  { key: "ekstremer", title: "Geografiske ekstremer", blurb: "Norges aller største, lengste og høyeste", rows: EXTREMES },
  { key: "ytterpunkter", title: "Norges ytterpunkter", blurb: "Nord, sør, øst, vest – fastland & kongerike", rows: YTTERPUNKTER },
  { key: "fjell10", title: "Topp 10 høyeste fjell", blurb: "Norges takterrasse", rows: topRows(fjell, 10) },
  { key: "fjell2300", title: "Fjell over 2300 moh", blurb: "De aller høyeste toppene", rows: thresholdRows(fjell, 2300) },
  { key: "elver10", title: "Topp 10 lengste elver", blurb: "De lengste vassdragene", rows: topRows(elver, 10) },
  { key: "innsjoer10", title: "Topp 10 største innsjøer", blurb: "De største vannene", rows: topRows(innsjoer, 10) },
  { key: "fjorder10", title: "Topp 10 lengste fjorder", blurb: "Sognefjorden i tet", rows: topRows(fjorder, 10) },
  { key: "oyer10", title: "Topp 10 største øyer", blurb: "Fra Svalbard til kysten", rows: topRows(oyer, 10) },
  { key: "isbreer10", title: "Topp 10 største isbreer", blurb: "Fra Austfonna til Jostedalsbreen", rows: topRows(isbreer, 10) },
  { key: "foss10", title: "Topp 10 høyeste fossefall", blurb: "De villeste fossene", rows: topRows(fossefall, 10) },
  { key: "tunneler10", title: "Topp 10 lengste tunneler", blurb: "Verdens lengste vegtunnel ligger her", rows: topRows(tunneler, 10) },
  { key: "bruer", title: "Norges lengste bruer", blurb: "Hengebruer og kystbruer", rows: BRUER },
  { key: "eveier", title: "Europaveier i Norge", blurb: "Kjenner du E-veiene?", rows: EVEIER },
  { key: "fylker", title: "Alle 15 fylker", blurb: "Kan du nevne dem alle?", rows: fylkeRows },
  { key: "kommuner10", title: "Topp 10 mest folkerike kommuner", blurb: "De største byene", rows: topRows(kommuner, 10) },
];
