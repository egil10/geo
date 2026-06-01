# Quiz Site Blueprint

A deep, portable spec for building a quiz website with the same look, feel,
architecture, and polish as **artguessr** (a "guess the painter" art quiz).
Drop this file into a fresh repo and hand it to a coding agent: it captures the
design system, UX rules, data architecture, performance playbook, every pitfall
we hit (with the fix), the deployment + custom-domain process, and the owner's
working preferences — so building the next quiz site is mostly assembly.

> **How to use this doc.** Keep the **design system** (§3) and **architecture**
> (§5–§9) verbatim. Swap only the **data model** + **game modes** (§5) for your
> topic. The personality lives in §3–§4; the speed lives in §7; the
> don't-repeat-our-mistakes lives in §10. Read §11 (preferences) before making
> any judgment call.

---

## Table of contents

1. What this is
2. Tech stack & file map
3. Design system (copy verbatim)
4. UX patterns that make it feel good
5. Data model & pipeline
6. Progressive loading & caching
7. Image performance playbook
8. The Elo rating system
9. State management & persistence patterns
10. Header / layout system
11. Pitfalls & hard-won lessons (read this!)
12. Deployment & custom domains (Squarespace → Vercel)
13. Owner's working style & preferences
14. Re-skinning checklist for a new topic
15. Quick-reference cheatsheet

---

## 1. What this is

An **endless multiple-choice quiz**. One question at a time: a prompt (here, a
painting image) plus four answer pills. Pick one → instant reveal
(correct/not quite) with context → next. No score screen, no "game over" — you
keep going. A searchable **gallery** browses the full dataset, and a per-device
**Elo rating** tracks skill over time.

The feelings to preserve, in priority order:

1. **Instant.** You never wait. Data is seeded + cached; images blur-up from a
   tiny placeholder and the next few preload. Advancing is immediate.
2. **Calm & gallery-like.** Frosted translucent glass floating over a warm-paper
   gradient. No hard chrome, no solid toolbars, generous radii.
3. **Keyboard-first.** `1`–`4` to answer, `Enter`/`Space`/`→` for next.
4. **No layout jump.** The reveal panel is fixed-height; answering never shifts
   the page.
5. **Clean header.** Controls never squish or reflow when state changes (this
   took several iterations — see §10).

---

## 2. Tech stack & file map

- **Next.js 16 (App Router)** + **React 19**. Every component is `"use client"` —
  it's a statically-served client app, not an SSR/data-fetching app.
- **TypeScript**, strict.
- **Tailwind CSS** + a small custom token/component layer (§3).
- **lucide-react** for icons. **No emojis in the UI, ever** (see §11).
- **next/font/google** for one display face (the wordmark only).
- **No backend, no database.** Data is static JSON in `public/`. Per-user state
  (Elo, prefs, reports) lives in `localStorage`.
- **Deploys to Vercel**, fully static. Pushing `main` auto-deploys.

```
src/
  app/
    layout.tsx        # root html/body, metadata, viewport, display font wiring
    globals.css       # design tokens + component classes (the design system)
    icon.svg          # favicon (App Router auto-serves app/icon.svg)
    page.tsx          # quiz route — owns category/mode state, renders <Quiz>
    gallery/page.tsx  # searchable grid + scrollable filter strip + detail modal
  components/
    Quiz.tsx          # the game: reducer state machine, reveal panels, streaks, Elo wiring
    EloBadge.tsx      # rating badge (dynamic icon) + history line chart panel
    Wordmark.tsx      # the "artguessr" brand mark (hard-reload link)
    CategoryPicker.tsx / ModePicker.tsx   # full-screen frosted choosers
    ReportsModal.tsx  # queue of user-flagged items
  lib/
    paintings.ts      # types, category/mode defs, choice builder, seeded RNG, image helpers
    usePaintings.ts   # progressive fetch + in-memory cache of the dataset
    elo.ts            # pure Elo maths + localStorage persistence + status classifier
    reports.ts        # localStorage-backed "report this item" queue
  scripts/
    fetch-paintings.mjs   # Wikidata SPARQL → public/paintings.json
    derive-popular.mjs    # full set → public/paintings-popular.json (the seed)
public/
  paintings.json          # full dataset (~2.75 MB), sorted by fame (most notable first)
  paintings-popular.json  # ~300 popular paintings (~83 KB) for instant first paint
next.config.mjs           # immutable cache headers for the data files; image remotePatterns
CLAUDE.md                 # agent working agreements (always push, validation, etc.)
```

---

## 3. Design system (copy verbatim)

The entire visual identity is ~170 lines of CSS + a handful of Tailwind tokens.
Reproduce both and you have the look.

### 3.1 Tailwind tokens (`tailwind.config.ts`)

```ts
theme: {
  extend: {
    fontFamily: {
      sans: ["ui-sans-serif","-apple-system","BlinkMacSystemFont","Inter","SF Pro Text","Segoe UI","sans-serif"],
      display: ["var(--font-display)", "ui-sans-serif", "sans-serif"], // the wordmark face
    },
    colors: {
      ink:    { DEFAULT: "#0a0a0a", soft: "#1c1c1e", muted: "#6b7280" },
      canvas: { DEFAULT: "#fafaf7", warm: "#f3efe7" },
    },
    backdropBlur: { xs: "2px" },
    animation: {
      "fade-in": "fadeIn 220ms ease-out both",
      "fade-up": "fadeUp 260ms cubic-bezier(.2,.7,.2,1) both",
      "pop":     "pop 260ms cubic-bezier(.2,.9,.3,1.2) both",
    },
    keyframes: {
      fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      fadeUp: { "0%": { opacity:"0", transform:"translateY(6px)" }, "100%": { opacity:"1", transform:"translateY(0)" } },
      pop:    { "0%": { transform:"scale(.98)", opacity:"0" }, "100%": { transform:"scale(1)", opacity:"1" } },
    },
  },
}
```

### 3.2 The display font (wordmark)

Loaded via `next/font/google` in `layout.tsx`, exposed as a CSS variable, and
used **only** for the brand wordmark — body stays on the system sans stack.

```tsx
import { Syne } from "next/font/google";
const display = Syne({ subsets: ["latin"], variable: "--font-display", display: "swap" });
// <body className={`min-h-dvh antialiased font-sans ${display.variable}`}>
```

Syne is a deliberately artsy/geometric/modern face — fits a gallery brand. The
owner's taste is **"artsy, minimal, modern"** display type; Syne, Fraunces,
Instrument Serif, Space Grotesk are all on-brand candidates.

### 3.3 Tokens + component classes (`globals.css`)

```css
@tailwind base; @tailwind components; @tailwind utilities;

:root {
  --canvas: #fafaf7;        --canvas-warm: #f3efe7;
  --ink: #0a0a0a;           --ink-soft: #1c1c1e;   --ink-muted: #6b7280;
  --hairline: rgba(10,10,10,0.08);
  --glass-bg: rgba(255,255,255,0.55);
  --glass-bg-strong: rgba(255,255,255,0.78);
  --glass-stroke: rgba(255,255,255,0.7);
  --accent: #0a0a0a;        --good: #16a34a;       --bad: #dc2626;
}

/* The signature backdrop: warm + cool radial glows over near-white paper. */
html, body {
  background:
    radial-gradient(1200px 600px at 80% -10%, #ffeed8 0%, transparent 60%),
    radial-gradient(900px 500px at 10% 100%, #e7eaff 0%, transparent 55%),
    var(--canvas);
  background-attachment: fixed;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01", "cv11";
}
* { -webkit-tap-highlight-color: transparent; }
button { font: inherit; }

@layer components {
  /* Translucent floating surfaces. `glass` for pills/cards, `glass-strong` for
     the main content card, `frost` for modals (near-opaque so text reads). */
  .glass {
    background: var(--glass-bg);
    backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
    border: 1px solid var(--glass-stroke);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 1px 2px rgba(10,10,10,.04), 0 12px 32px -12px rgba(10,10,10,.18);
  }
  .glass-strong {
    background: var(--glass-bg-strong);
    backdrop-filter: saturate(180%) blur(24px); -webkit-backdrop-filter: saturate(180%) blur(24px);
    border: 1px solid var(--glass-stroke);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 1px 2px rgba(10,10,10,.05), 0 16px 40px -16px rgba(10,10,10,.2);
  }
  .frost {
    background: rgba(252,251,247,.94);
    backdrop-filter: saturate(180%) blur(32px); -webkit-backdrop-filter: saturate(180%) blur(32px);
    border: 1px solid rgba(255,255,255,.85);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 1px 2px rgba(10,10,10,.04), 0 28px 80px -24px rgba(10,10,10,.35);
  }
  .frost-backdrop {
    background: rgba(20,20,25,.32);
    backdrop-filter: saturate(150%) blur(18px); -webkit-backdrop-filter: saturate(150%) blur(18px);
  }
  /* Pills are the universal control. One base, three fills. */
  .pill       { @apply inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium select-none transition; }
  .pill-ghost { @apply pill text-ink/80 hover:text-ink hover:bg-black/[0.04]; }
  .pill-solid { @apply pill bg-black text-white hover:bg-black/85; }
  .pill-glass { @apply pill glass text-ink/90 hover:text-ink; }
  .focus-ring { @apply outline-none focus-visible:ring-2 focus-visible:ring-black/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas; }
}

/* Thin floating-capsule scrollbars (replaces chunky Windows default). */
*::-webkit-scrollbar { width: 12px; height: 12px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: rgba(10,10,10,.16); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
*::-webkit-scrollbar-thumb:hover { background-color: rgba(10,10,10,.32); background-clip: padding-box; }
* { scrollbar-width: thin; scrollbar-color: rgba(10,10,10,.18) transparent; }
/* Hide scrollbar entirely on horizontal control/filter strips. */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Celebration (streak milestones) */
@keyframes confettiFall { 0% { transform: translateY(-12vh) rotate(0); opacity:0 } 8% { opacity:1 } 100% { transform: translateY(108vh) rotate(720deg); opacity:0 } }
@keyframes diplomaPop { 0% { transform: scale(.82) translateY(12px); opacity:0 } 55% { transform: scale(1.04) translateY(0); opacity:1 } 100% { transform: scale(1) translateY(0); opacity:1 } }
.animate-diploma { animation: diplomaPop 440ms cubic-bezier(.2,.8,.3,1.1) both; }
@media (prefers-reduced-motion: reduce) { .animate-diploma { animation: none; } }
```

### 3.4 Visual rules of thumb

- **Surfaces float; nothing is a solid bar.** Toolbars are a row of individual
  frosted pills over scrolling content (`sticky top-0 z-30`, no background band).
  Cards use `glass-strong` + large soft shadows + `rounded-[28px]`.
- **Radii are generous:** pills `rounded-full`; cards `rounded-[28px]`/`rounded-3xl`;
  inner chips `rounded-2xl`.
- **Color is restrained.** Almost everything is `ink` on `canvas`.
  `text-ink-muted` (#6b7280) for secondary text. Green (`--good`) / red (`--bad`)
  **only** for correct/incorrect. One amber accent for streaks/achievements.
- **Type:** system sans; tight headings (`font-bold leading-tight`); tiny uppercase
  labels (`text-[11px] font-semibold uppercase tracking-wider text-ink-muted`).
- **Numbers use `tabular-nums`** so scores/ratings don't jitter.
- **Motion is brief & soft:** `animate-pop` (entering cards), `animate-fade-up`
  (reveals), `animate-fade-in` (modal backdrops). Always honour
  `prefers-reduced-motion`.
- **Icons:** lucide, `size={13–16}`, `strokeWidth={2}` (≈2.2 when emphasised).
  **Never emojis.**
- **The wordmark** is a two-tone lowercase mark — `art` in `ink`, `guessr` in
  `ink-muted` — in the display font. It's a plain `<a href="/">` (full reload =
  hard reset). On wide screens it floats into the left gutter (`fixed`, `hidden
  xl:block`); below that it sits inline.

---

## 4. UX patterns that make it feel good

1. **Fixed-height reveal, no jump.** Desktop has a fixed-width side panel
   (`md:w-[300px]`) that swaps between an *idle* state (round #, mode, best
   streak) and a *reveal* state (correct/not + answer + context). The prompt
   card never resizes. Mobile shows the reveal as an overlay pinned to the
   bottom of the image.
2. **Keyboard-first.** A global `keydown`: digits `1`–`4` answer while idle;
   `Enter`/`Space`/`→` advance after answering. Ignore keys when focus is in an
   `INPUT`/`TEXTAREA`.
3. **Optional auto-advance.** A pill cycles Manual → 1s → 3s → 5s, persisted to
   `localStorage`. A timer fires "next" after the reveal.
4. **Image preloading + blur-up.** See §7 — this is the single biggest
   feel-good lever.
5. **Streaks + celebration.** Track current/best streak; a dot tracker fills
   toward a goal (10); crossing a multiple fires a confetti "diploma" modal.
6. **Review mode.** Wrong answers go into a capped queue; when "Review" is on,
   a probability each round re-surfaces a missed item.
7. **Report flow.** Every item has a flag button that copies a markdown line to
   the clipboard and queues it in `localStorage` — a zero-backend way to collect
   data-quality feedback ("paste it back in chat").
8. **Per-device Elo (§8).** Top-right badge; the rating *change* shows inside
   the green/red answer feedback, not in the badge.
9. **HD / data-saver toggle (§7).** A flag-styled icon button, auto-defaulting
   to saver on slow connections.

---

## 5. Data model & pipeline

The dataset is a flat JSON array in `public/`, **sorted by notability** (most
famous first). That ordering is itself a signal — used both for the "Popular"
tag (top 300) and for Elo difficulty (§8). Each item is small and
self-describing:

```ts
type Painting = {
  id: string;            // stable source id (Wikidata Q-number)
  title: string;
  artist: string;        // the primary "answer" field
  year: string | null;
  image: string;         // Commons filename, resolved to a URL at render time
  cats: string[];        // category tags this item belongs to
  mv: string | null;     // extra facets usable as alternate answer modes
  loc: string | null;
  g: string | null;
};
```

The raw sitelink/fame count is **dropped** from the shipped file to save bytes —
the array index *is* the fame rank. Keep it that way; recover rank with a
`Map<id, index>` at runtime if you need it (we do, for Elo).

**Categories** are a typed list (`key`, `label`, `hint`, `group`), grouped for
the picker UI ("starts" / "movement" / "subject" / "origin"). Filtering is just
`items.filter(i => i.cats.includes(key))`.

**Game modes** turn different fields into the answer. Each mode is
`(item) => answerString | null`; items lacking that field are filtered out of
the pool for that mode. (painter / title / movement / country / decade.)

**Choice builder:** take the correct answer, pull 3 distinct distractors of the
same type from the pool, shuffle. Use a **seeded RNG** (mulberry32-style) so
generation is deterministic per seed — important for the weighted picker and
reproducibility.

**Smart question picker** (what stops it feeling repetitive): sample K
candidates and weight them by
- strong penalty if the *item* was shown recently,
- decaying penalty if the *answer* (artist) appeared recently,
- a `1/sqrt(frequency)` boost so under-represented answers surface more —
then pick proportionally. Keep recency windows for items and answers, scaled to
pool size. Top up a small look-ahead **queue** (~3 rounds) so images can preload.

**Pipeline (`scripts/`):**
- `fetch-paintings.mjs` queries Wikidata SPARQL, tiered by sitelink count, keeps
  ≤~25 per artist (so one painter can't dominate), sorts by fame, tags
  categories, marks the top 300 `popular`, writes `public/paintings.json`.
- `derive-popular.mjs` filters that to the `popular` items → `paintings-popular.json`
  (the instant-load seed). It's chained into `npm run fetch:paintings`.

For a new topic, replace `fetch-*.mjs` with whatever yields your `Item[]` sorted
by your notability metric, keep `derive-popular.mjs` (or adapt the seed filter),
and **bump `DATA_VERSION`** so caches refresh.

---

## 6. Progressive loading & caching

**The problem we hit:** the full dataset is 2.75 MB (~608 KB gzipped). Fetching
it on every load with `cache: "no-cache"` blocked the first paint *and* forced a
network round-trip even when cached.

**The fix (two parts):**

1. **Seed + stream.** The default quiz only needs the ~300 "popular" paintings.
   Ship them as `paintings-popular.json` (~18 KB gzipped). The hook loads the
   seed first (quiz playable almost instantly), then loads the full set in
   parallel and swaps it in seamlessly — the running game doesn't reset because
   the reducer keys off ids, not array identity.

2. **Immutable caching + version busting.** Files in `public/` default to
   `Cache-Control: public, max-age=0, must-revalidate` on Vercel — i.e. a
   revalidation round-trip every visit. Override it:

   ```js
   // next.config.mjs
   async headers() {
     const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
     return [
       { source: "/paintings.json", headers: immutable },
       { source: "/paintings-popular.json", headers: immutable },
     ];
   }
   ```

   and fetch with `cache: "force-cache"` against a **versioned URL**
   (`/paintings.json?v=3`). The bytes at a given URL never change → safe to cache
   forever; bumping `DATA_VERSION` makes a new URL that misses the cache. Repeat
   visits then skip the network entirely.

`usePaintings` shape (module-level cache so route changes don't refetch;
SSR-safe; seed is best-effort, full is authoritative):

```ts
let full = null, seed = null, inflightFull = null, inflightSeed = null;
// loadFull(): force-cache /paintings.json?v=…   → normalize → cache in `full`
// loadSeed(): force-cache /paintings-popular.json?v=…
export function usePaintings() {
  const [paintings, setPaintings] = useState(full);
  // on mount: if full cached → use it; else setPaintings(seed) then setPaintings(full)
}
```

---

## 7. Image performance playbook

Images are the heaviest, most-repeated asset. The goal: **never look at a blank
frame or spinner.** Four techniques, all in play:

1. **Responsive `srcset`/`sizes`.** Don't ship one oversized image to everyone.
   ```ts
   export const IMAGE_WIDTHS = [480, 768, 1024, 1280] as const;
   export function imageSrcSet(file, widths = IMAGE_WIDTHS) {
     return widths.map(w => `${imageUrl(file, w)} ${w}w`).join(", ");
   }
   export const QUIZ_IMAGE_SIZES = "(min-width: 768px) min(640px, 60vw), 100vw";
   ```
   Phones grab a small file, retina desktops a larger one.

2. **Look-ahead preloading that matches the displayed candidate.** Preload the
   next ~3 queued images with `new Image()` — **and set the same `srcset`/`sizes`
   on the preload object**, or the browser preloads a width the `<img>` never
   requests and the work is wasted (this was a real bug — we preloaded `1024`
   while the `<img>` rendered `1280`). Also warm the tiny blur-up placeholders.

3. **Blur-up placeholder.** Render a tiny (`width=64`, ~1–3 KB) version of the
   current image, blurred, behind the full one; the full image fades in over it
   on load. So a category switch (a cold fetch you can't preload, because the
   pick is fresh) shows the painting *blurry instantly* instead of blank. Keep
   the placeholder `object-contain` like the real image so letterbox bars stay
   warm paper, not filled with blur.

4. **`fetchPriority="high"`** on the hero (it's the LCP element). In React 19 the
   prop is camelCase `fetchPriority`.

**HD / data-saver toggle.** A single small fixed width (`640`, no `srcset`,
ignoring device pixel ratio) for "saver"; full responsive `srcset` for "high".
Centralise in one helper used by both the `<img>` and the preloader:

```ts
export function heroImageProps(file, quality) {
  if (quality === "saver") return { src: imageUrl(file, 640) };
  return { src: imageUrl(file, 1024), srcSet: imageSrcSet(file), sizes: QUIZ_IMAGE_SIZES };
}
```

**Auto-default to saver** from the (non-standard) Network Information API when
the user hasn't chosen: `navigator.connection?.saveData === true` or
`effectiveType ∈ {slow-2g, 2g, 3g}`. Persist the user's explicit choice.

**The blur-up "ready" gotcha (important).** See §11 — deriving the ready state
correctly is subtle because of cached images.

---

## 8. The Elo rating system

Each question is a "match": the player (starts **800**) vs the painting's
**difficulty**, derived from its fame rank (obscure = stronger opponent, worth
more). Standard logistic Elo:

```
expected = 1 / (1 + 10^((opponent - rating) / 400))
rating   = clamp(rating + K * ((won ? 1 : 0) - expected), 100, ∞)
opponentRating(rank, total) = lerp(700, 2000, rank / (total - 1))   // obscure → 2000
K(games) = games < 30 ? 40 : games < 100 ? 24 : 16                  // provisional → settled
```

State (`localStorage`, versioned key, behind `loadElo`/`saveElo` so a future
accounts/leaderboard phase is a clean swap):

```ts
type EloState = { rating; peak; low; games; wins; history: number[]; updatedAt };
```

- Track **both `peak` and `low`** (we added `low` late — needed for the badge
  icon). On load, reconcile `peak`/`low` against `history`+`rating` so an older
  blob can't claim a high/low the data contradicts.
- **`history`** is capped (last ~250 ratings) to bound storage; it powers the
  chart.

**Dynamic badge icon** (`eloStatus`), all lucide, no emoji:
`Trophy` (all-time high) · `Anchor` (all-time low) · `TrendingUp`/`TrendingDown`
(short-term trend over the last ~4 answers) · `Minus` (steady). High/low take
priority and require ≥5 games so it doesn't crown you instantly.

**The rating change (`+12` / `−8`) renders inside the green/red answer
feedback**, not in the badge — tie the number to the correctness cue. It shows
for the whole reveal and clears when you advance.

**History chart** (inline SVG, no chart lib): a line with a **rating y-axis** at
"nice" round gridline steps (`1/2/2.5/5 ×10ⁿ`, ~4 lines) and a **question-number
x-axis** with ticks only at round numbers (every 10, or every 100 for long
histories). Color the line green/red by net direction.

---

## 9. State management & persistence patterns

**Game state = `useReducer`, kept pure.** No `localStorage`/IO/timers in the
reducer — do side effects in `useEffect`. Sketch:

```ts
type Phase = "idle" | "answered";
type State = {
  current: Round | null;     // { item, choices[], target }
  queue: Round[];            // look-ahead for preloading
  recent: Set<string>;       // item recency window
  recentArtists: string[];   // answer recency window
  wrong: string[];           // review queue (capped)
  picked: string | null; phase: Phase;
  score; streak; best; total; seed;
};
type Action =
  | { type: "answer"; choice }
  | { type: "next";  pool; mode; artistFreq; review }
  | { type: "reset"; pool; mode; artistFreq; seed };
```

Score Elo in an **effect** keyed on the answered transition, guarded by a ref so
each round scores exactly once (`scoredRef = ${painting.id}:${total}`).

**localStorage pattern (reuse for every device-local feature):**

```ts
const KEY = "app.feature.v1";          // ALWAYS versioned
export function load(): T {
  if (typeof window === "undefined") return def();   // SSR-safe
  try { return { ...def(), ...JSON.parse(localStorage.getItem(KEY) || "null") }; }
  catch { return def(); }               // also: catch quota errors on save
}
```

**SSR hydration:** initialise `useState` with the default (so server and client
first render match), then `useEffect(() => setState(load()), [])` after mount.
Avoids hydration mismatch. Used for autoMode, review, Elo, and image quality.

**Derive transient UI state from identity, not booleans reset in effects.** See
§11 (the blur bug) — `const imgReady = loadedId === current.id` beats a
`setImgReady(false)` reset that runs a frame late.

---

## 10. Header / layout system

This took the most iteration. Rules that finally made it clean:

- **The header mirrors the cards below it.** The content row is
  `painting card (flex-1)` + `gap-3` + `side panel (md:w-[300px])`. The header is
  the same: left control group `flex-1`, right stat group `md:w-[300px]
  md:justify-between`, `gap-3`. So the two rows' division lines up.
- **`shrink-0` on every control/stat pill.** Flexbox's default is to shrink
  items when space is tight — that's what squished "Auto 3s" when a long category
  label changed width. `shrink-0` (+ `whitespace-nowrap` where needed) forbids
  deformation.
- **Fixed-width variable pills + font-step-down.** Category/Mode carry
  variable-length labels. Give them a fixed desktop width (`md:w-40`, `md:w-32`)
  and shrink the label one font step as it grows, truncating only as a last
  resort:
  ```ts
  function fitLabel(label) { const n = label.length; return n > 13 ? "text-[11px]" : n > 10 ? "text-[12px]" : "text-sm"; }
  ```
  Result: toggling category/mode never reflows the header.
- **Mobile: scroll, don't squish.** The left control group is
  `flex-1 min-w-0 overflow-x-auto no-scrollbar` so on phones the controls scroll
  horizontally at full size instead of truncating to nothing. (Add `-my-1 py-1`
  so the focus ring isn't clipped by the overflow box.)
- **Gutter-floated wordmark.** On `xl+` the wordmark is `fixed` in the left
  gutter (real estate that's otherwise empty); below `xl` it's inline. This
  declutters the toolbar on the widest screens.
- **Compact icon buttons for secondary actions.** Report flag and the HD/Lite
  toggle are 32px circular icon buttons (`grid h-8 w-8 place-items-center
  rounded-full border`), dark `bg-ink` when "active". Text pills for these
  overflow the row — keep them icon-only.
- **Watch the fixed-width budget.** A 300px right group fits ~4 small items.
  Adding a 5th means dropping one (we removed the standalone "Acc" pill — it's in
  the Elo panel) rather than letting the group overflow its aligned width.

---

## 11. Pitfalls & hard-won lessons (read this!)

Each of these cost real debugging time. Don't relearn them.

**Drag-to-scroll eats clicks (`setPointerCapture`).** A horizontally
draggable strip that called `el.setPointerCapture(e.pointerId)` on *pointerdown*
made the browser dispatch the subsequent `click` to the *capturing container*,
not the child button — so plain clicks on the pills silently did nothing.
**Fix:** don't capture on press. Capture **lazily**, only once movement crosses a
threshold (~4px), and use a `moved` flag to suppress the click that ends a real
drag. Mouse-only; let touch keep native scrolling.

**Blur-up placeholder showed sharp-then-blur and got stuck.** Two causes:
(1) `imgReady` was reset to `false` in a *post-paint* effect, so for a cached
image the sharp version flashed before the reset; (2) a cached/preloaded image
can already be `complete` before React attaches `onLoad`, so `imgReady` never
flipped back and the blur sat on top forever. **Fix:** derive readiness from
*which* id has loaded (`const imgReady = loadedId === current.id`) instead of a
reset boolean, and add a `ref` that checks `el.complete` on mount to catch cached
images:
```tsx
<img key={id} ref={el => { if (el?.complete) setLoadedId(id); }} onLoad={() => setLoadedId(id)} … />
```

**Wasted image preload (width mismatch).** The look-ahead preloaded `width=1024`
while the `<img>` rendered `width=1280` — different URLs, so every preload was
thrown away. **Fix:** preload and display through one `heroImageProps` helper so
the `src`/`srcSet`/`sizes` always match.

**lucide `Image` shadows the global `Image` constructor.** Importing
`{ Image }` from `lucide-react` breaks `new Image()` (used for preloading) in
that module. **Fix:** alias it — `import { Image as ImageIcon } from "lucide-react"`.

**`public/` files aren't cached by default on Vercel.** They ship
`max-age=0, must-revalidate`. Big static JSON revalidates every visit. **Fix:**
explicit `immutable` headers in `next.config.mjs` + a `?v=` versioned URL (§6).

**`next lint` was removed in Next 16.** The `lint` script errors ("Invalid
project directory"). Validate with `npx tsc --noEmit` + `npm run build` instead.
Don't waste time debugging the lint script.

**Flexbox squish on state change.** Covered in §10 — variable-width pills shrink
their neighbours. `shrink-0` everywhere + fixed widths for variable labels.

**Adding to a fixed-width group overflows it.** A `md:w-[300px]
md:justify-between` group with `shrink-0` items will visibly overflow if the
items sum past 300px (they can't shrink). Budget the items; drop or relocate
one rather than breaking the aligned width.

**Windows line-endings.** Git warns `LF will be replaced by CRLF` on commit.
Harmless; ignore. (Optionally add a `.gitattributes` with `* text=auto eol=lf`.)

**Show, don't assume, on "it's broken."** The owner reported the site "still
under construction" — but it was live; their machine had stale DNS. Verify the
public truth (`nslookup … 8.8.8.8`, `curl -sI https://domain`) before changing
anything, then point them at `ipconfig /flushdns` / incognito / mobile data.

---

## 12. Deployment & custom domains (Squarespace → Vercel)

**Hosting.** Connect the GitHub repo to a Vercel project once; thereafter
**pushing `main` auto-deploys**. Manual: `npx vercel --prod`. CLI domain ops:
`npx vercel link --yes --project <name>`, then `npx vercel domains add <domain>`
(single-arg form once the project is linked), `npx vercel domains inspect <domain>`.

**Custom domain bought at Squarespace, pointed at Vercel:**

1. In Vercel, add both apex and `www` to the project.
2. In Squarespace **DNS → DNS Settings**, *remove the parking records* or they
   fight Vercel: the default `A @` records (`198.x`), the `www` CNAME →
   `ext-sq.squarespace.com`, **and the `HTTPS @` record** (the `alpn=...` SVCB
   one — it interferes with cert issuance). Leave email TXT (`_dmarc`,
   `_domainkey`, SPF) and `_domainconnect` alone.
3. Add the Vercel records:

   | Type  | Name | Value |
   |-------|------|-------|
   | `A`     | `@`  | `76.76.21.21` |
   | `CNAME` | `www`| `cname.vercel-dns.com` |

   (Read the exact values back from `vercel domains add` — Vercel can hand out a
   project-specific apex A record.)
4. Don't change nameservers (keep Squarespace's) if you're using the A/CNAME
   method.
5. **HTTPS auto-issues after DNS verifies** — the TLS handshake will fail for a
   few minutes (up to ~30) in the meantime; that's normal, not a misconfig.

**The "still under construction" trap.** After correct DNS, the owner's browser
showed Squarespace's parking page — stale local DNS, not a real problem. Confirm
with `nslookup domain 8.8.8.8` (should be `76.76.21.21`) and
`curl -sI https://domain` (should be `server: Vercel`, your `<title>`); then
`ipconfig /flushdns`, hard-refresh, or test on mobile data.

---

## 13. Owner's working style & preferences

Bake these into any judgment call so you don't have to ask:

- **Always `git push` after committing.** Solo, continuously-deployed project —
  commit to `main` and push; pushing triggers the Vercel deploy. No PR ceremony
  unless asked. (Also in `CLAUDE.md`.)
- **Aesthetic: clean, minimal, modern, "super clean".** Glass + warm paper +
  pills. Generous whitespace and radii. Layout that *mirrors structure* (e.g.
  header aligned to the cards) delights them.
- **Icons: lucide only. NO EMOJIS in the UI.** Convey state with icon swaps +
  color, not emoji.
- **Fonts: artsy / minimal / modern** for brand type (Syne et al.).
- **Speed matters: "never wait."** Perceived performance (blur-up, seeds,
  preloading) is a feature they explicitly value.
- **They like gamification & data:** Elo, trends, streaks, diplomas,
  charts-over-time. Lean into tasteful stats.
- **Iterative & trusting: "try it."** Make a tasteful default choice and ship it
  rather than asking many questions; they'll react and refine. When you do make
  a removal/trade-off (e.g. dropping the Acc pill), state it plainly and offer to
  revert.
- **Per-device persistence is fine to start; design for accounts later.** Keep
  storage behind a thin `load/save` boundary.
- **Validate before claiming done:** `npx tsc --noEmit` + `npm run build`. Report
  honestly if something failed.
- **Commit messages:** imperative subject, a short bulleted body of what/why,
  trailer `Co-Authored-By: Claude …`.

---

## 14. Re-skinning checklist for a new topic

1. Write `scripts/fetch-*.mjs` to produce `public/data.json` as `Item[]`, sorted
   by your notability metric. Keep ids stable. Keep/adapt `derive-popular.mjs`
   for the instant-load seed. **Bump `DATA_VERSION`.**
2. Update the `Item` type + `CATEGORIES` + the `modeTarget(item, mode)` map for
   your facets. Everything downstream (pool filtering, choice building, Elo
   difficulty, picker) is generic.
3. Replace the prompt rendering (here an `<img>`) with whatever your question is —
   text, audio, a flag, a map. Keep the blur-up + responsive-image stack if it's
   images. The 4-pill answer UI stays.
4. Rename brand/metadata/wordmark/favicon. Keep the glass/pill CSS verbatim.
5. Wire the cache headers in `next.config.mjs` for your data file(s).
6. Add the custom domain per §12. `git push` to deploy.

The framework is topic-agnostic; the personality is §3–§4, the speed is §6–§7,
and the don't-trip-here is §11.

---

## 15. Quick-reference cheatsheet

| Need | Do this |
|------|---------|
| Validate a change | `npx tsc --noEmit` && `npm run build` (not `next lint`) |
| Refresh data | `npm run fetch:paintings`, then bump `DATA_VERSION` |
| New device-local pref | versioned `localStorage` key, SSR-safe `load()`, hydrate in mount effect |
| Cache a static asset hard | `immutable` header in `next.config` + `?v=` URL |
| Responsive image | `imageSrcSet()` + a `sizes`; preload with the *same* srcset/sizes |
| Never-blank image | 64px blur-up placeholder behind, fade real image in on load |
| Image ready state | derive from loaded id + `ref` `el.complete`; don't reset a bool in an effect |
| lucide image icon | `import { Image as ImageIcon }` (don't shadow `new Image()`) |
| Draggable + clickable strip | capture pointer lazily past a move threshold; `moved` flag suppresses click |
| Keep header from reflowing | `shrink-0` everywhere; fixed widths + `fitLabel` for variable pills |
| Header ↔ cards alignment | left `flex-1`, right `md:w-[300px] md:justify-between`, shared `gap-3` |
| Mobile overflow of controls | `overflow-x-auto no-scrollbar` (+ `-my-1 py-1`) |
| Deploy | `git push` (auto) or `npx vercel --prod` |
| Squarespace→Vercel DNS | delete parking A/`www`/`HTTPS` records; add `A @ 76.76.21.21` + `CNAME www cname.vercel-dns.com` |
| Diagnose "wrong site showing" | `nslookup domain 8.8.8.8`, `curl -sI https://domain`; then flush DNS |
