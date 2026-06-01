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
  isbreer,
  tunneler,
  klubber,
  aviser,
  countyNames,
  fmtMetric,
  fmtInt,
} from "./data";
import { difficultyToRating } from "./elo";
import { fylkePathByNumber, kommunePathByNumber, projectPin } from "./geo";
import { normalize } from "./match";

// Geocode a town name to a lat/lon via the matching municipality (its centre or
// administrative seat) — used to pin football clubs / newspapers on the map.
const stedLatLon = new Map<string, { lat: number; lon: number }>();
for (const k of kommuner) {
  if (k.lat != null && k.lon != null) {
    const ll = { lat: k.lat, lon: k.lon };
    stedLatLon.set(normalize(k.name), ll);
    if (k.admin) stedLatLon.set(normalize(k.admin), ll);
  }
}
const geocodeSted = (sted?: string) => (sted ? stedLatLon.get(normalize(sted)) : undefined);

export type Category =
  | "fylker"
  | "kommuner"
  | "fjell"
  | "elver"
  | "innsjoer"
  | "fjorder"
  | "oyer"
  | "fossefall"
  | "isbreer"
  | "tunneler"
  | "fotball"
  | "aviser"
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
  { key: "isbreer", label: "Isbreer", icon: "Snowflake", hint: "Største isbreer" },
  { key: "tunneler", label: "Tunneler", icon: "Route", hint: "Lengste tunneler" },
  { key: "fotball", label: "Fotballklubber", icon: "Trophy", hint: "Klubber, byer & divisjoner" },
  { key: "aviser", label: "Aviser", icon: "Newspaper", hint: "Norske aviser & byene" },
  { key: "befolkning", label: "Befolkning", icon: "Users", hint: "Innbyggertall" },
  { key: "nummer", label: "Kommunenr.", icon: "Hash", hint: "Kommunenummer" },
];

export type Prompt =
  | { kind: "text"; text: string }
  | { kind: "image"; text: string; src: string; alt: string; variant: "coa" | "photo" }
  | { kind: "map"; text: string; region?: string; pin?: { x: number; y: number } };

export interface Round {
  uid: string;
  genKey: string;
  cat: Category;
  subject: Place; // focal place (for reveal media/stats)
  prompt: Prompt;
  choices: string[];
  choiceInfo?: (string | undefined)[]; // per-option fact shown on reveal (e.g. innbyggertall)
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
  isbre: { art: "Hvilken", noun: "isbre", sup: "størst" },
  tunnel: { art: "Hvilken", noun: "tunnel", sup: "lengst" },
  klubb: { art: "Hvilken", noun: "klubb" },
  avis: { art: "Hvilken", noun: "avis" },
};

// Plausible distractors of the same kind, biased to similar prominence.
function nameDistractors(pool: Place[], subject: Place, n: number): Place[] {
  const cands = pool.filter((p) => p.id !== subject.id && p.name !== subject.name);
  cands.sort(
    (a, b) => Math.abs(a.prominence - subject.prominence) - Math.abs(b.prominence - subject.prominence),
  );
  // Draw from a wide band (not just the 18 nearest) so the same subject does
  // not keep producing the same bundle of distractors.
  const near = cands.slice(0, Math.max(n * 14, 48));
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

// Build the per-option fact array aligned to the (already shuffled) choices, so
// the reveal can show every option's real value — the player learns the wrong
// ones too.
const fylkePopByName = new Map<string, number | undefined>(fylker.map((f) => [f.name, f.population]));
function infoFor(places: Place[], fmt: (p: Place) => string | undefined, choices: string[]): (string | undefined)[] {
  const m = new Map<string, string | undefined>(places.map((p) => [p.name, fmt(p)]));
  return choices.map((c) => m.get(c));
}
const popInfo = (p: Place) => (p.population != null ? `${fmtInt(p.population)} innb.` : undefined);
const countyInfo = (p: Place) => p.county;
const metricInfo = (p: Place) => (p.metric != null ? fmtMetric(p) : undefined);

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
        choiceInfo: choices.map((c) => {
          const p = fylkePopByName.get(c);
          return p != null ? `${fmtInt(p)} innb.` : undefined;
        }),
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
        choiceInfo: infoFor([k, ...d], countyInfo, choices),
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
        choiceInfo: infoFor([f, ...d], popInfo, choices),
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
        choiceInfo: infoFor([correct, ...distract], countyInfo, choices),
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
        choiceInfo: infoFor([k, ...d], countyInfo, choices),
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
        choiceInfo: infoFor(four, popInfo, choices),
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
        choiceInfo: infoFor(four, popInfo, choices),
        answerIndex,
        answerKey: winner.name,
        explanation: `${winner.name} har flest med ${fmtInt(winner.population)} innbyggere.`,
        difficulty: difficultyToRating(winner.prominence) + 40,
      };
    },
  },
  // 11. Football club → home town
  {
    key: "klubb-sted",
    cats: ["fotball"],
    pool: klubber,
    build: (c) => {
      if (!c.county) return null;
      const steder = [...new Set(klubber.filter((x) => x.county && x.county !== c.county).map((x) => x.county!))];
      if (steder.length < 3) return null;
      const { choices, answerIndex } = assemble(c.county, sampleN(steder, 3));
      return {
        uid: uid("klubb-sted"),
        genKey: "klubb-sted",
        cat: "fotball",
        subject: c,
        prompt: { kind: "text", text: `Hvor kommer ${c.name} fra?` },
        choices,
        answerIndex,
        answerKey: c.county,
        explanation: `${c.name} kommer fra ${c.county} og spiller i ${c.tag}.`,
        difficulty: difficultyToRating(c.prominence),
      };
    },
  },
  // 12. Which club plays in this division?
  {
    key: "divisjon-klubb",
    cats: ["fotball"],
    pool: klubber,
    build: (c) => {
      if (!c.tag) return null;
      // Keep all options within the same gender's league system.
      const women = /kvinner/i.test(c.tag);
      const sameGender = (x: Place) => /kvinner/i.test(x.tag ?? "") === women;
      const inside = klubber.filter((x) => x.tag === c.tag);
      const outside = klubber.filter((x) => x.tag !== c.tag && sameGender(x));
      if (inside.length < 1 || outside.length < 3) return null;
      const correct = pick(inside);
      const distract = nameDistractors(outside, correct, 3);
      if (distract.length < 3) return null;
      const { choices, answerIndex } = assemble(correct.name, distract.map((x) => x.name));
      return {
        uid: uid("divisjon-klubb"),
        genKey: "divisjon-klubb",
        cat: "fotball",
        subject: correct,
        prompt: { kind: "text", text: `Hvilken av disse klubbene spiller i ${c.tag}?` },
        choices,
        choiceInfo: infoFor([correct, ...distract], (p) => p.tag, choices),
        answerIndex,
        answerKey: correct.name,
        explanation: `${correct.name} (${correct.county}) spiller i ${c.tag}.`,
        difficulty: difficultyToRating(correct.prominence) + 80,
      };
    },
  },
  // 13. Newspaper → where it is published
  {
    key: "avis-sted",
    cats: ["aviser"],
    pool: aviser.filter((p) => p.county && !/riks/i.test(p.county)),
    build: (p) => {
      if (!p.county || /riks/i.test(p.county)) return null;
      const steder = [...new Set(aviser.filter((x) => x.county && !/riks/i.test(x.county) && x.county !== p.county).map((x) => x.county!))];
      if (steder.length < 3) return null;
      const { choices, answerIndex } = assemble(p.county, sampleN(steder, 3));
      return {
        uid: uid("avis-sted"),
        genKey: "avis-sted",
        cat: "aviser",
        subject: p,
        prompt: { kind: "text", text: `Hvor gis avisa ${p.name} ut?` },
        choices,
        answerIndex,
        answerKey: p.county,
        explanation: `${p.name} gis ut i ${p.county}.`,
        difficulty: difficultyToRating(p.prominence) + 40,
      };
    },
  },
  // 14. Map: which fylke is highlighted?
  {
    key: "fylke-kart",
    cats: ["fylker"],
    pool: fylker.filter((f) => f.number && fylkePathByNumber.has(f.number)),
    build: (f) => {
      const region = f.number ? fylkePathByNumber.get(f.number) : undefined;
      if (!region) return null;
      const d = sampleN(fylker.filter((x) => x.id !== f.id), 3);
      const { choices, answerIndex } = assemble(f.name, d.map((x) => x.name));
      return {
        uid: uid("fylke-kart"),
        genKey: "fylke-kart",
        cat: "fylker",
        subject: f,
        prompt: { kind: "map", text: "Hvilket fylke er markert på kartet?", region },
        choices,
        choiceInfo: infoFor([f, ...d], popInfo, choices),
        answerIndex,
        answerKey: f.name,
        explanation: `Det markerte fylket er ${f.name}.`,
        difficulty: difficultyToRating(f.prominence),
      };
    },
  },
  // 15. Map: which kommune is highlighted?
  {
    key: "kommune-kart",
    cats: ["kommuner"],
    pool: kommuner.filter((k) => k.number && kommunePathByNumber.has(k.number)),
    build: (k) => {
      const region = k.number ? kommunePathByNumber.get(k.number) : undefined;
      if (!region) return null;
      const d = nameDistractors(kommuner, k, 3);
      if (d.length < 3) return null;
      const { choices, answerIndex } = assemble(k.name, d.map((x) => x.name));
      return {
        uid: uid("kommune-kart"),
        genKey: "kommune-kart",
        cat: "kommuner",
        subject: k,
        prompt: { kind: "map", text: "Hvilken kommune er markert på kartet?", region },
        choices,
        choiceInfo: infoFor([k, ...d], countyInfo, choices),
        answerIndex,
        answerKey: k.name,
        explanation: `Den markerte kommunen er ${k.name} (${k.county}).`,
        difficulty: difficultyToRating(k.prominence) + 70,
      };
    },
  },
  // 16. Map pin: which club is based here?
  {
    key: "klubb-kart",
    cats: ["fotball"],
    pool: klubber.filter((c) => geocodeSted(c.county)),
    build: (c) => {
      const ll = geocodeSted(c.county);
      if (!ll) return null;
      const others = klubber.filter((x) => geocodeSted(x.county) && normalize(x.county ?? "") !== normalize(c.county ?? ""));
      const d = nameDistractors(others, c, 3);
      if (d.length < 3) return null;
      const { choices, answerIndex } = assemble(c.name, d.map((x) => x.name));
      return {
        uid: uid("klubb-kart"),
        genKey: "klubb-kart",
        cat: "fotball",
        subject: c,
        prompt: { kind: "map", text: "Hvilken av disse klubbene holder til der pinnen står?", pin: projectPin(ll.lat, ll.lon) },
        choices,
        choiceInfo: infoFor([c, ...d], (p) => p.county, choices),
        answerIndex,
        answerKey: c.name,
        explanation: `${c.name} kommer fra ${c.county} (${c.tag}).`,
        difficulty: difficultyToRating(c.prominence) + 50,
      };
    },
  },
  // 17. Map pin: which newspaper is published here?
  {
    key: "avis-kart",
    cats: ["aviser"],
    pool: aviser.filter((p) => !/riks/i.test(p.county ?? "") && geocodeSted(p.county)),
    build: (p) => {
      const ll = geocodeSted(p.county);
      if (!ll) return null;
      const others = aviser.filter((x) => !/riks/i.test(x.county ?? "") && geocodeSted(x.county) && normalize(x.county ?? "") !== normalize(p.county ?? ""));
      const d = nameDistractors(others, p, 3);
      if (d.length < 3) return null;
      const { choices, answerIndex } = assemble(p.name, d.map((x) => x.name));
      return {
        uid: uid("avis-kart"),
        genKey: "avis-kart",
        cat: "aviser",
        subject: p,
        prompt: { kind: "map", text: "Hvilken av disse avisene gis ut der pinnen står?", pin: projectPin(ll.lat, ll.lon) },
        choices,
        choiceInfo: infoFor([p, ...d], (x) => x.county, choices),
        answerIndex,
        answerKey: p.name,
        explanation: `${p.name} gis ut i ${p.county}.`,
        difficulty: difficultyToRating(p.prominence) + 50,
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
  { kind: "isbre", list: isbreer, cat: "isbreer" },
  { kind: "tunnel", list: tunneler, cat: "tunneler" },
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
        choiceInfo: infoFor([p, ...d], metricInfo, choices),
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
        choiceInfo: infoFor(four, metricInfo, choices),
        answerIndex,
        answerKey: winner.name,
        explanation: `${winner.name} er ${meta.sup} med ${fmtMetric(winner)}.`,
        difficulty: difficultyToRating(avg),
      };
    },
  });
  // Map pin → name (only kinds that carry coordinates).
  const pinPool = list.filter((p) => p.lat != null && p.lon != null);
  if (pinPool.length >= 6) {
    GENERATORS.push({
      key: `${cat}-kart`,
      cats: [cat],
      pool: pinPool,
      build: (p) => {
        if (p.lat == null || p.lon == null) return null;
        const dd = nameDistractors(list, p, 3);
        if (dd.length < 3) return null;
        const { choices, answerIndex } = assemble(p.name, dd.map((x) => x.name));
        return {
          uid: uid(`${cat}-kart`),
          genKey: `${cat}-kart`,
          cat,
          subject: p,
          prompt: { kind: "map", text: `${meta.art} ${meta.noun} er markert på kartet?`, pin: projectPin(p.lat, p.lon) },
          choices,
          choiceInfo: infoFor([p, ...dd], metricInfo, choices),
          answerIndex,
          answerKey: p.name,
          explanation: `Det markerte punktet er ${p.name}${p.county ? ` i ${p.county}` : ""} – ${fmtMetric(p)}.`,
          difficulty: difficultyToRating(p.prominence) + 30,
        };
      },
    });
  }
}

// ---- Picker ---------------------------------------------------------------
export interface PickCtx {
  recentSubjects: Set<string>;
  recentAnswers: string[];
  lastGen: string | null;
}

// Generators whose answer is determinate without seeing the options, so they
// work in "Skriv" (type-the-answer) mode. Ranking / "which of these" do not.
const WRITABLE = new Set([
  "kommune-fylke",
  "kommune-vapen",
  "fylke-vapen",
  "fylke-admin",
  "kommune-admin",
  "nummer-kommune",
  "kommune-nummer",
  "fjell-foto",
  "elver-foto",
  "innsjoer-foto",
  "fjorder-foto",
  "oyer-foto",
  "fossefall-foto",
  "isbreer-foto",
  "tunneler-foto",
  "klubb-sted",
  "avis-sted",
  "fylke-kart",
  "kommune-kart",
  "fjell-kart",
  "elver-kart",
  "innsjoer-kart",
  "fjorder-kart",
  "oyer-kart",
  "fossefall-kart",
]);

export function activeGenerators(selected: Set<Category>, writableOnly = false): Generator[] {
  let gens = GENERATORS.filter((g) => g.cats.some((c) => selected.has(c)) && g.pool.length > 0);
  if (!gens.length) gens = GENERATORS.filter((g) => g.pool.length > 0);
  if (writableOnly) {
    const w = gens.filter((g) => WRITABLE.has(g.key));
    gens = w.length ? w : GENERATORS.filter((g) => WRITABLE.has(g.key) && g.pool.length > 0);
  }
  return gens;
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

// ---- "Sortér" mode: order four items by a metric ---------------------------
export interface OrderItem {
  id: string;
  name: string;
  value: number;
  county?: string;
}
export interface OrderRound {
  uid: string;
  cat: Category;
  prompt: string;
  unit: string;
  items: OrderItem[]; // shown scrambled
  correctIds: string[]; // high → low
  difficulty: number;
}

const ORDER_SOURCES: { cat: Category; list: Place[]; prompt: string; unit: string }[] = [
  { cat: "fjell", list: fjell, prompt: "Sorter fjellene fra høyest til lavest", unit: "moh." },
  { cat: "elver", list: elver, prompt: "Sorter elvene fra lengst til kortest", unit: "km" },
  { cat: "innsjoer", list: innsjoer, prompt: "Sorter innsjøene fra størst til minst", unit: "km²" },
  { cat: "fjorder", list: fjorder, prompt: "Sorter fjordene fra lengst til kortest", unit: "km" },
  { cat: "oyer", list: oyer, prompt: "Sorter øyene fra størst til minst", unit: "km²" },
  { cat: "fossefall", list: fossefall, prompt: "Sorter fossene fra høyest til lavest", unit: "m" },
  { cat: "isbreer", list: isbreer, prompt: "Sorter isbreene fra størst til minst", unit: "km²" },
  { cat: "tunneler", list: tunneler, prompt: "Sorter tunnelene fra lengst til kortest", unit: "km" },
  { cat: "befolkning", list: kommuner, prompt: "Sorter kommunene fra flest til færrest innbyggere", unit: "innb." },
];

export function nextOrderRound(selected: Set<Category>): OrderRound {
  const sources = ORDER_SOURCES.filter((s) => selected.size === 0 || selected.has(s.cat));
  const pool = sources.length ? sources : ORDER_SOURCES;
  for (let i = 0; i < 14; i++) {
    const src = pick(pool);
    const four = rankingFour(src.list);
    if (!four) continue;
    if (new Set(four.map((p) => p.metric)).size !== 4) continue; // need a unique order
    const ordered = [...four].sort((a, b) => b.metric! - a.metric!);
    const avg = four.reduce((s, p) => s + p.prominence, 0) / 4;
    return {
      uid: uid("order"),
      cat: src.cat,
      prompt: src.prompt,
      unit: src.unit,
      items: shuffle([...four]).map((p) => ({ id: p.id, name: p.name, value: p.metric!, county: p.county })),
      correctIds: ordered.map((p) => p.id),
      difficulty: difficultyToRating(avg) + 150,
    };
  }
  // Fallback: the highest mountains.
  const top = [...fjell].sort((a, b) => b.metric! - a.metric!).slice(0, 4);
  return {
    uid: uid("order"),
    cat: "fjell",
    prompt: ORDER_SOURCES[0].prompt,
    unit: "moh.",
    items: shuffle([...top]).map((p) => ({ id: p.id, name: p.name, value: p.metric!, county: p.county })),
    correctIds: top.map((p) => p.id),
    difficulty: 1100,
  };
}
