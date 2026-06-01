// Per-device Elo rating: each question is a "match" vs an opponent whose rating
// is the item's difficulty (obscure items rate higher). Standard logistic Elo.

const KEY = "norgequiz.elo.v1";
export const START_RATING = 800;

export interface EloState {
  rating: number;
  peak: number;
  low: number;
  games: number;
  wins: number;
  history: number[]; // last N ratings (after each answer)
  perCat: Record<string, { games: number; wins: number }>;
  updatedAt: number;
}

function def(): EloState {
  return {
    rating: START_RATING,
    peak: START_RATING,
    low: START_RATING,
    games: 0,
    wins: 0,
    history: [START_RATING],
    perCat: {},
    updatedAt: Date.now(),
  };
}

export function loadElo(): EloState {
  if (typeof window === "undefined") return def();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw) return def();
    const s = { ...def(), ...raw, perCat: { ...raw.perCat } };
    // Reconcile peak/low against history so a tampered blob can't lie.
    const hist = Array.isArray(s.history) && s.history.length ? s.history : [s.rating];
    s.peak = Math.max(s.peak, ...hist, s.rating);
    s.low = Math.min(s.low, ...hist, s.rating);
    return s;
  } catch {
    return def();
  }
}

export function saveElo(s: EloState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota — ignore */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function kFactor(games: number): number {
  return games < 30 ? 40 : games < 100 ? 24 : 16;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

// Map a 0..1 prominence to an opponent rating: famous → easy, obscure → hard.
export function difficultyToRating(prominence: number): number {
  const obscurity = 1 - clamp(prominence, 0, 1);
  return Math.round(650 + (2050 - 650) * obscurity);
}

export interface EloUpdate {
  state: EloState;
  delta: number;
}

export function applyResult(prev: EloState, won: boolean, opponent: number, cat: string): EloUpdate {
  const k = kFactor(prev.games);
  const exp = expectedScore(prev.rating, opponent);
  const delta = Math.round(k * ((won ? 1 : 0) - exp));
  const rating = clamp(prev.rating + delta, 100, 4000);
  const history = [...prev.history, rating].slice(-250);
  const pc = prev.perCat[cat] ?? { games: 0, wins: 0 };
  const state: EloState = {
    rating,
    peak: Math.max(prev.peak, rating),
    low: Math.min(prev.low, rating),
    games: prev.games + 1,
    wins: prev.wins + (won ? 1 : 0),
    history,
    perCat: { ...prev.perCat, [cat]: { games: pc.games + 1, wins: pc.wins + (won ? 1 : 0) } },
    updatedAt: Date.now(),
  };
  return { state, delta };
}

// ---- Rank tiers (playful, ascending) -------------------------------------
export interface Tier {
  floor: number;
  name: string;
}
export const TIERS: Tier[] = [
  { floor: 0, name: "Turist" },
  { floor: 700, name: "Bygdefarer" },
  { floor: 850, name: "Lokalkjent" },
  { floor: 1000, name: "Kartleser" },
  { floor: 1150, name: "Stedsnavnkjenner" },
  { floor: 1300, name: "Geografinerd" },
  { floor: 1450, name: "Fjellvettmester" },
  { floor: 1600, name: "Atlasmester" },
  { floor: 1750, name: "Norgesmester" },
];

export interface TierInfo {
  index: number;
  name: string;
  floor: number;
  ceil: number;
  progress: number; // 0..1 within this tier
  next?: string;
}

export function tierFor(rating: number): TierInfo {
  let i = 0;
  for (let j = 0; j < TIERS.length; j++) if (rating >= TIERS[j].floor) i = j;
  const floor = TIERS[i].floor;
  const ceil = i + 1 < TIERS.length ? TIERS[i + 1].floor : floor + 250;
  const progress = clamp((rating - floor) / (ceil - floor), 0, 1);
  return { index: i, name: TIERS[i].name, floor, ceil, progress, next: TIERS[i + 1]?.name };
}

export type EloIcon = "trophy" | "anchor" | "up" | "down" | "steady";
export function eloStatus(s: EloState): EloIcon {
  if (s.games >= 5 && s.rating >= s.peak) return "trophy";
  if (s.games >= 5 && s.rating <= s.low) return "anchor";
  const h = s.history;
  if (h.length >= 3) {
    const recent = h.slice(-4);
    const net = recent[recent.length - 1] - recent[0];
    if (net > 4) return "up";
    if (net < -4) return "down";
  }
  return "steady";
}

export function accuracy(s: EloState): number {
  return s.games ? Math.round((s.wins / s.games) * 100) : 0;
}
