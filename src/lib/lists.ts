// "Lister" mode: fill-in-the-table challenges. Name every item in a list (top-N
// by a metric, a themed set, or the geographic extremes). Hints help; a single
// input fills whichever row your guess matches.

import { fjell, elver, innsjoer, oyer, fossefall, kommuner, fylker, Place, fmtMetric, fmtInt } from "./data";

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
  { hint: "Mest folkerike kommune", answers: ["Oslo"], reveal: "Oslo · 729 000 innb." },
  { hint: "Største kommune i areal", answers: ["Kautokeino", "Guovdageaidnu"], reveal: "Kautokeino · 9 700 km²" },
];

const fylkeRows: ListRow[] = [...fylker]
  .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
  .map((f) => ({ answers: [f.name], hint: f.admin ? `Sentrum: ${f.admin}` : "Fylke", reveal: `${f.name} · ${fmtInt(f.population)} innb.` }));

export const LISTS: ListDef[] = [
  { key: "ekstremer", title: "Geografiske ekstremer", blurb: "Norges aller største, lengste og høyeste", rows: EXTREMES },
  { key: "fjell10", title: "Topp 10 høyeste fjell", blurb: "Norges takterrasse", rows: topRows(fjell, 10) },
  { key: "fjell2300", title: "Fjell over 2300 moh", blurb: "De aller høyeste toppene", rows: thresholdRows(fjell, 2300) },
  { key: "elver10", title: "Topp 10 lengste elver", blurb: "De lengste vassdragene", rows: topRows(elver, 10) },
  { key: "innsjoer10", title: "Topp 10 største innsjøer", blurb: "De største vannene", rows: topRows(innsjoer, 10) },
  { key: "oyer10", title: "Topp 10 største øyer", blurb: "Fra Svalbard til kysten", rows: topRows(oyer, 10) },
  { key: "foss10", title: "Topp 10 høyeste fossefall", blurb: "De villeste fossene", rows: topRows(fossefall, 10) },
  { key: "fylker", title: "Alle 15 fylker", blurb: "Kan du nevne dem alle?", rows: fylkeRows },
  { key: "kommuner10", title: "Topp 10 mest folkerike kommuner", blurb: "De største byene", rows: topRows(kommuner, 10) },
];
