// Question engine: turns the dataset into an endless stream of 4-option rounds.
// Generators cover relational facts, coat-of-arms symbols, photo identification,
// rankings, population and municipality numbers. A recency-aware picker keeps it
// varied. Difficulty (Elo opponent) derives from item prominence.

import {
  Place,
  Kind,
  kommuner,
  fylker,
  fjell,
  elver,
  innsjoer,
  fjorder,
  oyer,
  fossefall,
  countyNames,
  fmtMetric,
  fmtInt,
} from "./data";
import { difficultyToRating } from "./elo";

export type Category =
  | "fylker"
  | "kommuner"
  | "fjell"
  | "elver"
  | "innsjoer"
  | "fjorder"
  | "oyer"
  | "fossefall"
  | "vapen"
  | "befolkning"
  | "nummer";

export interface CategoryMeta {
  key: Category;
  label: string;
  icon: string; // lucide icon name (resolved in UI)
  hint: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: "fylker", label: "Fylker", icon: "Map", hint: "15 fylker, sentre & våpen" },
  { key: "kommuner", label: "Kommuner", icon: "Building2", hint: "357 kommuner & sentre" },
  { key: "vapen", label: "Våpenskjold", icon: "Shield", hint: "Kommune- & fylkesvåpen" },
  { key: "fjell", label: "Fjell", icon: "Mountain", hint: "Høyeste topper" },
  { key: "elver", label: "Elver", icon: "Waves", hint: "Lengste vassdrag" },
  { key: "innsjoer", label: "Innsjøer", icon: "Droplet", hint: "Største vann" },
  { key: "fjorder", label: "Fjorder", icon: "Ship", hint: "Kjente fjorder" },
  { key: "oyer", label: "Øyer", icon: "Sailboat", hint: "Største øyer" },
  { key: "fossefall", label: "Fossefall", icon: "ArrowDownWideNarrow", hint: "Høyeste fosser" },
  { key: "befolkning", label: "Befolkning", icon: "Users", hint: "Innbyggertall" },
  { key: "nummer", label: "Kommunenr.", icon: "Hash", hint: "Kommunenummer" },
];

export type Prompt =
  | { kind: "text"; text: string }
  | { kind: "image"; text: string; src: string; alt: string; variant: "coa" | "photo" };

export interface Round {
  uid: string;
  genKey: string;
  cat: Category;
  subject: Place; // focal place (for reveal media/stats)
  prompt: Prompt;
  choices: string[];
  answerIndex: number;
  answerKey: string;
  explanation: string;
  difficulty: number;
}

// ---- RNG helpers ----------------------------------------------------------
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleN<T>(a: T[], n: number): T[] {
  return shuffle([...a]).slice(0, n);
}

// ---- Kind metadata --------------------------------------------------------
const KMETA: Record<Kind, { art: string; noun: string; sup?: string }> = {
  kommune: { art: "Hvilken", noun: "kommune" },
  fylke: { art: "Hvilket", noun: "fylke" },
  fjell: { art: "Hvilket", noun: "fjell", sup: "høyest" },
  elv: { art: "Hvilken", noun: "elv", sup: "lengst" },
  innsjo: { art: "Hvilken", noun: "innsjø", sup: "størst" },
  fjord: { art: "Hvilken", noun: "fjord", sup: "lengst" },
  oy: { art: "Hvilken", noun: "øy", sup: "størst" },
  foss: { art: "Hvilken", noun: "foss", sup: "høyest" },
};

// Plausible distractors of the same kind, biased to similar prominence.
function nameDistractors(pool: Place[], subject: Place, n: number): Place[] {
  const cands = pool.filter((p) => p.id !== subject.id && p.name !== subject.name);
  cands.sort(
    (a, b) => Math.abs(a.prominence - subject.prominence) - Math.abs(b.prominence - subject.prominence),
  );
  const near = cands.slice(0, Math.max(n * 6, 18));
  // dedupe by name
  const seen = new Set<string>([subject.name]);
  const out: Place[] = [];
  for (const c of shuffle(near)) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function assemble(correct: string, distractors: string[]): { choices: string[]; answerIndex: number } {
  const choices = shuffle([correct, ...distractors]);
  return { choices, answerIndex: choices.indexOf(correct) };
}

// Pick up to n items with distinct names (two real features can share a name).
function distinctByName(items: Place[], n: number): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of items) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
    if (out.length === n) break;
  }
  return out;
}

// Four comparable-magnitude, distinctly-named items for a ranking question with
// a single clear winner (top metric strictly greater than the rest).
function rankingFour(kindList: Place[]): Place[] | null {
  const sorted = [...kindList].filter((p) => p.metric != null).sort((a, b) => b.metric! - a.metric!);
  if (sorted.length < 4) return null;
  for (let tries = 0; tries < 8; tries++) {
    const win = Math.min(12, sorted.length);
    const start = Math.floor(Math.random() * (sorted.length - 3));
    const window = sorted.slice(start, Math.min(sorted.length, start + Math.max(win, 4)));
    const four = distinctByName(shuffle([...window]), 4);
    if (four.length < 4) continue;
    const vals = four.map((p) => p.metric!).sort((a, b) => b - a);
    if (vals[0] !== vals[1]) return four; // clear winner
  }
  // Fallback: four distinct-named items from anywhere in the list.
  const any = distinctByName(shuffle([...sorted]), 4);
  if (any.length < 4) return null;
  const vals = any.map((p) => p.metric!).sort((a, b) => b - a);
  return vals[0] !== vals[1] ? any : null;
}

let counter = 0;
const uid = (key: string) => `${key}:${counter++}`;

interface Generator {
  key: string;
  cats: Category[];
  pool: Place[];
  build: (subject: Place) => Round | null;
}

const coaKommuner = kommuner.filter((k) => k.coa);
const photoOf = (list: Place[]) => list.filter((p) => p.photo);

const GENERATORS: Generator[] = [
  // 1. Municipality → county
  {
    key: "kommune-fylke",
    cats: ["kommuner", "fylker"],
    pool: kommuner,
    build: (k) => {
      if (!k.county) return null;
      const distract = sampleN(countyNames.filter((c) => c !== k.county), 3);
      const { choices, answerIndex } = assemble(k.county, distract);
      return {
        uid: uid("kommune-fylke"),
        genKey: "kommune-fylke",
        cat: "fylker",
        subject: k,
        prompt: { kind: "text", text: `Hvilket fylke ligger ${k.name} i?` },
        choices,
        answerIndex,
        answerKey: k.county,
        explanation: `${k.name} ligger i ${k.county}${k.population ? ` og har ${fmtInt(k.population)} innbyggere` : ""}.`,
        difficulty: difficultyToRating(k.prominence),
      };
    },
  },
  // 2. Coat of arms → municipality
  {
    key: "kommune-vapen",
    cats: ["vapen", "kommuner"],
    pool: coaKommuner,
    build: (k) => {
      if (!k.coa) return null;
      const d = nameDistractors(coaKommuner, k, 3);
      if (d.length < 3) return null;
      const { choices, answerIndex } = assemble(k.name, d.map((x) => x.name));
      return {
        uid: uid("kommune-vapen"),
        genKey: "kommune-vapen",
        cat: "vapen",
        subject: k,
        prompt: { kind: "image", text: "Hvilken kommune har dette våpenet?", src: k.coa, alt: "Kommunevåpen", variant: "coa" },
        choices,
        answerIndex,
        answerKey: k.name,
        explanation: `Dette er kommunevåpenet til ${k.name} (${k.county}).`,
        difficulty: difficultyToRating(k.prominence) + 60,
      };
    },
  },
  // 3. Coat of arms → county
  {
    key: "fylke-vapen",
    cats: ["vapen", "fylker"],
    pool: fylker.filter((f) => f.coa),
    build: (f) => {
      if (!f.coa) return null;
      const d = sampleN(fylker.filter((x) => x.id !== f.id), 3);
      const { choices, answerIndex } = assemble(f.name, d.map((x) => x.name));
      return {
        uid: uid("fylke-vapen"),
        genKey: "fylke-vapen",
        cat: "vapen",
        subject: f,
        prompt: { kind: "image", text: "Hvilket fylke har dette våpenet?", src: f.coa, alt: "Fylkesvåpen", variant: "coa" },
        choices,
        answerIndex,
        answerKey: f.name,
        explanation: `Dette er fylkesvåpenet til ${f.name}. Administrasjonssenter: ${f.admin ?? "–"}.`,
        difficulty: difficultyToRating(f.prominence),
      };
    },
  },
  // 4. County → administrative centre
  {
    key: "fylke-admin",
    cats: ["fylker"],
    pool: fylker.filter((f) => f.admin),
    build: (f) => {
      if (!f.admin) return null;
      const others = fylker.filter((x) => x.admin && x.admin !== f.admin).map((x) => x.admin!);
      const { choices, answerIndex } = assemble(f.admin, sampleN([...new Set(others)], 3));
      return {
        uid: uid("fylke-admin"),
        genKey: "fylke-admin",
        cat: "fylker",
        subject: f,
        prompt: { kind: "text", text: `Hva er administrasjonssenteret i ${f.name}?` },
        choices,
        answerIndex,
        answerKey: f.admin,
        explanation: `${f.admin} er administrasjonssenteret i ${f.name}.`,
        difficulty: difficultyToRating(f.prominence),
      };
    },
  },
  // 5. Municipality → administrative centre
  {
    key: "kommune-admin",
    cats: ["kommuner"],
    pool: kommuner.filter((k) => k.admin && k.admin !== k.name),
    build: (k) => {
      if (!k.admin) return null;
      const others = kommuner
        .filter((x) => x.admin && x.admin !== k.admin && x.county === k.county)
        .map((x) => x.admin!);
      const pool = others.length >= 3 ? others : kommuner.filter((x) => x.admin && x.admin !== k.admin).map((x) => x.admin!);
      const { choices, answerIndex } = assemble(k.admin, sampleN([...new Set(pool)], 3));
      return {
        uid: uid("kommune-admin"),
        genKey: "kommune-admin",
        cat: "kommuner",
        subject: k,
        prompt: { kind: "text", text: `Hva er administrasjonssenteret i ${k.name}?` },
        choices,
        answerIndex,
        answerKey: k.admin,
        explanation: `${k.admin} er administrasjonssenteret i ${k.name} (${k.county}).`,
        difficulty: difficultyToRating(k.prominence) + 120,
      };
    },
  },
  // 6. Which municipality is in this county?
  {
    key: "fylke-kommune",
    cats: ["fylker", "kommuner"],
    pool: fylker,
    build: (f) => {
      const inside = kommuner.filter((k) => k.county === f.name);
      const outside = kommuner.filter((k) => k.county !== f.name);
      if (inside.length < 1 || outside.length < 3) return null;
      const correct = pick(inside);
      const distract = sampleN(outside, 3);
      const { choices, answerIndex } = assemble(correct.name, distract.map((x) => x.name));
      return {
        uid: uid("fylke-kommune"),
        genKey: "fylke-kommune",
        cat: "fylker",
        subject: correct,
        prompt: { kind: "text", text: `Hvilken av disse kommunene ligger i ${f.name}?` },
        choices,
        answerIndex,
        answerKey: correct.name,
        explanation: `${correct.name} ligger i ${f.name}.`,
        difficulty: difficultyToRating(f.prominence) + 60,
      };
    },
  },
  // 7. Municipality number → municipality
  {
    key: "nummer-kommune",
    cats: ["nummer"],
    pool: kommuner.filter((k) => k.number),
    build: (k) => {
      if (!k.number) return null;
      const d = nameDistractors(kommuner, k, 3);
      const { choices, answerIndex } = assemble(k.name, d.map((x) => x.name));
      return {
        uid: uid("nummer-kommune"),
        genKey: "nummer-kommune",
        cat: "nummer",
        subject: k,
        prompt: { kind: "text", text: `Hvilken kommune har kommunenummer ${k.number}?` },
        choices,
        answerIndex,
        answerKey: k.name,
        explanation: `Kommunenummer ${k.number} tilhører ${k.name} (${k.county}).`,
        difficulty: difficultyToRating(k.prominence) + 80,
      };
    },
  },
  // 8. Municipality → its number
  {
    key: "kommune-nummer",
    cats: ["nummer"],
    pool: kommuner.filter((k) => k.number),
    build: (k) => {
      if (!k.number) return null;
      const others = kommuner.filter((x) => x.number && x.number !== k.number).map((x) => x.number!);
      const { choices, answerIndex } = assemble(k.number, sampleN([...new Set(others)], 3));
      return {
        uid: uid("kommune-nummer"),
        genKey: "kommune-nummer",
        cat: "nummer",
        subject: k,
        prompt: { kind: "text", text: `Hvilket kommunenummer har ${k.name}?` },
        choices,
        answerIndex,
        answerKey: k.number,
        explanation: `${k.name} har kommunenummer ${k.number}. De to første sifrene (${k.countyNumber}) viser fylket ${k.county}.`,
        difficulty: difficultyToRating(k.prominence) + 80,
      };
    },
  },
  // 9. Biggest population (municipalities)
  {
    key: "pop-kommune",
    cats: ["befolkning"],
    pool: kommuner.filter((k) => k.population != null),
    build: () => {
      const four = rankingFour(kommuner.filter((k) => k.population != null));
      if (!four) return null;
      const winner = four.reduce((a, b) => (a.metric! >= b.metric! ? a : b));
      const { choices, answerIndex } = assemble(winner.name, four.filter((x) => x !== winner).map((x) => x.name));
      const avg = four.reduce((s, p) => s + p.prominence, 0) / four.length;
      return {
        uid: uid("pop-kommune"),
        genKey: "pop-kommune",
        cat: "befolkning",
        subject: winner,
        prompt: { kind: "text", text: "Hvilken kommune har flest innbyggere?" },
        choices,
        answerIndex,
        answerKey: winner.name,
        explanation: `${winner.name} har flest med ${fmtInt(winner.population)} innbyggere.`,
        difficulty: difficultyToRating(avg),
      };
    },
  },
  // 10. Biggest population (counties)
  {
    key: "pop-fylke",
    cats: ["befolkning", "fylker"],
    pool: fylker.filter((f) => f.population != null),
    build: () => {
      const four = sampleN(fylker.filter((f) => f.population != null), 4);
      if (four.length < 4) return null;
      const winner = four.reduce((a, b) => (a.metric! >= b.metric! ? a : b));
      const { choices, answerIndex } = assemble(winner.name, four.filter((x) => x !== winner).map((x) => x.name));
      return {
        uid: uid("pop-fylke"),
        genKey: "pop-fylke",
        cat: "befolkning",
        subject: winner,
        prompt: { kind: "text", text: "Hvilket fylke har flest innbyggere?" },
        choices,
        answerIndex,
        answerKey: winner.name,
        explanation: `${winner.name} har flest med ${fmtInt(winner.population)} innbyggere.`,
        difficulty: difficultyToRating(winner.prominence) + 40,
      };
    },
  },
];

// Photo-identification + ranking generators for each natural-feature kind.
const FEATURE_KINDS: { kind: Kind; list: Place[]; cat: Category }[] = [
  { kind: "fjell", list: fjell, cat: "fjell" },
  { kind: "elv", list: elver, cat: "elver" },
  { kind: "innsjo", list: innsjoer, cat: "innsjoer" },
  { kind: "fjord", list: fjorder, cat: "fjorder" },
  { kind: "oy", list: oyer, cat: "oyer" },
  { kind: "foss", list: fossefall, cat: "fossefall" },
];

for (const { kind, list, cat } of FEATURE_KINDS) {
  const meta = KMETA[kind];
  // Photo → name
  GENERATORS.push({
    key: `${cat}-foto`,
    cats: [cat],
    pool: photoOf(list),
    build: (p) => {
      if (!p.photo) return null;
      const d = nameDistractors(list, p, 3);
      if (d.length < 3) return null;
      const { choices, answerIndex } = assemble(p.name, d.map((x) => x.name));
      return {
        uid: uid(`${cat}-foto`),
        genKey: `${cat}-foto`,
        cat,
        subject: p,
        prompt: { kind: "image", text: `${meta.art} ${meta.noun} er dette?`, src: p.photo, alt: meta.noun, variant: "photo" },
        choices,
        answerIndex,
        answerKey: p.name,
        explanation: `Dette er ${p.name}${p.county ? ` i ${p.county}` : ""} – ${fmtMetric(p)}.`,
        difficulty: difficultyToRating(p.prominence) + 40,
      };
    },
  });
  // Ranking (highest / longest / largest)
  GENERATORS.push({
    key: `${cat}-rank`,
    cats: [cat],
    pool: list,
    build: () => {
      const four = rankingFour(list);
      if (!four) return null;
      const winner = four.reduce((a, b) => (a.metric! >= b.metric! ? a : b));
      const { choices, answerIndex } = assemble(winner.name, four.filter((x) => x !== winner).map((x) => x.name));
      const avg = four.reduce((s, p) => s + p.prominence, 0) / four.length;
      return {
        uid: uid(`${cat}-rank`),
        genKey: `${cat}-rank`,
        cat,
        subject: winner,
        prompt: { kind: "text", text: `${meta.art} ${meta.noun} er ${meta.sup}?` },
        choices,
        answerIndex,
        answerKey: winner.name,
        explanation: `${winner.name} er ${meta.sup} med ${fmtMetric(winner)}.`,
        difficulty: difficultyToRating(avg),
      };
    },
  });
}

// ---- Picker ---------------------------------------------------------------
export interface PickCtx {
  recentSubjects: Set<string>;
  recentAnswers: string[];
  lastGen: string | null;
}

export function activeGenerators(selected: Set<Category>): Generator[] {
  const gens = GENERATORS.filter((g) => g.cats.some((c) => selected.has(c)) && g.pool.length > 0);
  return gens.length ? gens : GENERATORS;
}

export function nextRound(gens: Generator[], ctx: PickCtx): Round {
  let best: Round | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const gen = pick(gens);
    if (!gen.pool.length) continue;
    const subject = pick(gen.pool);
    const r = gen.build(subject);
    if (!r) continue;
    let s = Math.random();
    if (ctx.recentSubjects.has(r.subject.id)) s -= 2;
    if (ctx.recentAnswers.includes(r.answerKey)) s -= 1;
    if (gen.key === ctx.lastGen) s -= 0.5;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  if (best) return best;
  // Fallback: brute force any valid round.
  for (let i = 0; i < 60; i++) {
    const gen = pick(gens);
    const r = gen.pool.length ? gen.build(pick(gen.pool)) : null;
    if (r) return r;
  }
  // Last resort (should never hit): trivial round.
  const k = kommuner[0];
  return {
    uid: uid("fallback"),
    genKey: "fallback",
    cat: "kommuner",
    subject: k,
    prompt: { kind: "text", text: `Hvilket fylke ligger ${k.name} i?` },
    choices: [k.county!, ...sampleN(countyNames.filter((c) => c !== k.county), 3)],
    answerIndex: 0,
    answerKey: k.county!,
    explanation: `${k.name} ligger i ${k.county}.`,
    difficulty: 800,
  };
}
