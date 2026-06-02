// "Lister" mode: fill-in-the-table challenges. Name every item in a list (top-N
// by a metric, a themed set, or the geographic extremes). Hints help; a single
// input fills whichever row your guess matches.

import { fjell, elver, innsjoer, fjorder, oyer, fossefall, isbreer, tunneler, kommuner, fylker, lufthavner, byer, baner, stasjoner, Place, fmtMetric, fmtInt } from "./data";
import { CATEGORIES, type Category } from "./questions";
import fotball from "@/data/fotballklubber.json";
import aviser from "@/data/aviser.json";

export interface ListRow {
  answers: string[]; // accepted inputs for this slot
  hint: string; // clue shown on the row
  reveal: string; // shown once found
  prompt?: string; // "fill-in" lists: the always-visible label you answer for
}

export interface ListDef {
  key: string;
  title: string;
  blurb: string;
  rows: ListRow[];
  fill?: boolean; // "fill-in" list: prompts are shown, you type each item's value
  placeholder?: string; // input hint for fill-in lists
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

const byPop = (a: Place, b: Place) => (b.population ?? 0) - (a.population ?? 0);

// County capitals (administrative centres).
const fylkesentreRows: ListRow[] = [...fylker]
  .sort(byPop)
  .filter((f) => f.admin)
  .map((f) => ({ answers: [f.admin!], hint: f.name, reveal: `${f.admin} (${f.name})` }));

const bigKommunerRows: ListRow[] = [...kommuner]
  .filter((k) => (k.population ?? 0) >= 50000)
  .sort(byPop)
  .map((k) => ({ answers: [k.name], hint: k.county ?? "", reveal: `${k.name} · ${fmtInt(k.population)} innb.` }));

// The endurance challenge: every municipality, grouped by number (i.e. by fylke).
const allKommunerRows: ListRow[] = [...kommuner]
  .sort((a, b) => (a.number ?? "").localeCompare(b.number ?? ""))
  .map((k) => ({ answers: [k.name], hint: k.county ?? "Norge", reveal: k.number ? `${k.name} · ${k.number}` : k.name }));

// One "name the municipalities in <county>" list per fylke.
const perFylkeLists: ListDef[] = [...fylker].sort(byPop).map((f) => ({
  key: "kom-" + f.number,
  title: `Kommuner: ${f.name}`,
  blurb: `Alle kommunene i ${f.name}`,
  rows: kommuner
    .filter((k) => k.county === f.name)
    .sort(byPop)
    .map((k) => ({ answers: [k.name], hint: `${fmtInt(k.population)} innb.`, reveal: k.number ? `${k.name} · ${k.number}` : k.name })),
}));

// ---- Football clubs + newspapers ------------------------------------------
type Club = { name: string; sted: string };
const clubRows = (clubs: Club[]): ListRow[] => clubs.map((c) => ({ answers: [c.name], hint: c.sted, reveal: `${c.name} (${c.sted})` }));
const fotballLists: ListDef[] = Object.entries(fotball as Record<string, Club[]>).map(([div, clubs]) => ({
  key: "fk-" + div.replace(/[^a-z0-9]+/gi, ""),
  title: `Fotball: ${div}`,
  blurb: `Klubbene i ${div}`,
  rows: clubRows(clubs),
}));

type Paper = { name: string; sted: string };
const papers = aviser as Paper[];
const paperRows = (ps: Paper[]): ListRow[] => ps.map((p) => ({ answers: [p.name], hint: p.sted, reveal: `${p.name} · ${p.sted}` }));
const aviserLists: ListDef[] = [
  { key: "aviser-riks", title: "Riksdekkende aviser", blurb: "De nasjonale avisene", rows: paperRows(papers.filter((p) => /riks/i.test(p.sted))) },
  { key: "aviser-lokal", title: "Lokale & regionale aviser", blurb: "Avisene rundt om i landet", rows: paperRows(papers.filter((p) => !/riks/i.test(p.sted))) },
];

// ---- Dynamic "fill-in" lists: see every item (A–Å), type its unique value ---
const nbName = (a: Place, b: Place) => a.name.localeCompare(b.name, "nb");
// Accept a number with or without its leading zero (e.g. 0301 / 301).
const numAnswers = (n: string) => (/^0\d/.test(n) ? [n, n.replace(/^0+/, "")] : [n]);

const kommunenummerRows: ListRow[] = [...kommuner]
  .filter((k) => k.number)
  .sort(nbName)
  .map((k) => ({ prompt: k.name, answers: numAnswers(k.number!), hint: k.county ?? "Norge", reveal: k.number! }));

const fylkesnummerRows: ListRow[] = [...fylker]
  .filter((f) => f.number)
  .sort(nbName)
  .map((f) => ({ prompt: f.name, answers: numAnswers(f.number!), hint: f.admin ? `Sentrum: ${f.admin}` : "Fylke", reveal: f.number! }));

const lufthavnkodeRows: ListRow[] = [...lufthavner]
  .filter((l) => l.tag)
  .sort(nbName)
  .map((l) => ({ prompt: l.name, answers: [l.tag!], hint: l.county ?? "Norge", reveal: l.tag! }));

// Name-the-items boards for categories that lacked a curated list.
const byerRows: ListRow[] = [...byer]
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  .map((b) => ({ answers: [b.name], hint: b.county ?? "Norge", reveal: `${b.name} · ${fmtInt(b.population)} innb.` }));

const banerRows: ListRow[] = [...baner]
  .sort((a, b) => (b.length ?? 0) - (a.length ?? 0))
  .map((b) => ({ answers: [b.name], hint: b.length ? `${b.length} km` : "Jernbane", reveal: b.length ? `${b.name} · ${b.length} km` : b.name }));

const stasjonRows: ListRow[] = [...stasjoner]
  .sort(nbName)
  .map((s) => ({ answers: [s.name], hint: s.tag ?? s.county ?? "Stasjon", reveal: s.tag ? `${s.name} · ${s.tag}` : s.name }));

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
  ...fotballLists,
  ...aviserLists,
  { key: "fylker", title: "Alle 15 fylker", blurb: "Kan du nevne dem alle?", rows: fylkeRows },
  { key: "fylkesentre", title: "Fylkenes administrasjonssentre", blurb: "Hovedstedene i hvert fylke", rows: fylkesentreRows },
  { key: "kommuner10", title: "Topp 10 mest folkerike kommuner", blurb: "De største byene", rows: topRows(kommuner, 10) },
  { key: "kommuner50k", title: "Kommuner over 50 000 innbyggere", blurb: "De største bykommunene", rows: bigKommunerRows },
  { key: "kommuner-alle", title: "Alle 357 kommuner", blurb: "Den ultimate utfordringen", rows: allKommunerRows },
  { key: "kommunenummer", title: "Kommunenummer", blurb: "Skriv nummeret til hver kommune", fill: true, placeholder: "Skriv kommunenummer…", rows: kommunenummerRows },
  { key: "fylkesnummer", title: "Fylkesnummer", blurb: "Skriv nummeret til hvert fylke", fill: true, placeholder: "Skriv fylkesnummer…", rows: fylkesnummerRows },
  { key: "lufthavnkoder", title: "Lufthavnkoder (IATA)", blurb: "Skriv IATA-koden til hver lufthavn", fill: true, placeholder: "Skriv IATA-kode…", rows: lufthavnkodeRows },
  { key: "byer", title: "Norges byer", blurb: "Byene etter folketall", rows: byerRows },
  { key: "baner", title: "Jernbanelinjer", blurb: "Banene i Norge", rows: banerRows },
  { key: "stasjoner", title: "Jernbanestasjoner", blurb: "Stasjonene i Norge", rows: stasjonRows },
  ...perFylkeLists,
];

// Which categories each board belongs to. Picking a filter in Lister narrows
// the board pills to the relevant ones. Boards absent here are "general"
// (cross-category, e.g. the extremes) and show only when no filter is active.
const LIST_CATS: Record<string, Category[]> = {
  fjell10: ["fjell"],
  fjell2300: ["fjell"],
  elver10: ["elver"],
  innsjoer10: ["innsjoer"],
  fjorder10: ["fjorder"],
  oyer10: ["oyer"],
  isbreer10: ["isbreer"],
  foss10: ["fossefall"],
  tunneler10: ["tunneler"],
  byer: ["byer", "befolkning"],
  baner: ["baner"],
  stasjoner: ["stasjoner"],
  lufthavnkoder: ["lufthavner"],
  fylker: ["fylker"],
  fylkesentre: ["fylker"],
  fylkesnummer: ["fylker", "nummer"],
  kommuner10: ["kommuner", "befolkning"],
  kommuner50k: ["kommuner", "befolkning"],
  "kommuner-alle": ["kommuner"],
  kommunenummer: ["kommuner", "nummer"],
};
fotballLists.forEach((l) => (LIST_CATS[l.key] = ["fotball"]));
aviserLists.forEach((l) => (LIST_CATS[l.key] = ["aviser"]));
perFylkeLists.forEach((l) => (LIST_CATS[l.key] = ["kommuner"]));

// Boards to offer for the current category filter. No filter (or everything
// selected) offers every board, including the general/extreme ones. A filter
// that matches no board (e.g. våpen, which can't be typed) falls back to all.
export function listsForSelection(selected: Set<Category>): ListDef[] {
  if (selected.size === 0 || selected.size === CATEGORIES.length) return LISTS;
  const matched = LISTS.filter((l) => (LIST_CATS[l.key] ?? []).some((c) => selected.has(c)));
  return matched.length ? matched : LISTS;
}

// Each quiz category maps to a default Lister board, so picking a category in
// Lister mode loads the matching board. (vapen is omitted — a coat of arms
// can't be typed; stasjoner uses name-recall.)
export const CATEGORY_TO_LIST: Partial<Record<Category, string>> = {
  fylker: "fylker",
  kommuner: "kommuner-alle",
  nummer: "kommunenummer",
  befolkning: "kommuner10",
  byer: "byer",
  fjell: "fjell10",
  elver: "elver10",
  innsjoer: "innsjoer10",
  fjorder: "fjorder10",
  oyer: "oyer10",
  fossefall: "foss10",
  isbreer: "isbreer10",
  tunneler: "tunneler10",
  lufthavner: "lufthavnkoder",
  baner: "baner",
  stasjoner: "stasjoner",
  fotball: fotballLists.find((l) => /eliteserien/i.test(l.title))?.key ?? fotballLists[0]?.key,
  aviser: aviserLists[0]?.key,
};
