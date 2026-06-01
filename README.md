# norgesquiz

**Norges ultimate geografiquiz** — an endless, four-option quiz built to make you _beast_ at
Norwegian geography. Fylker, kommuner, fjell, elver, innsjøer, fjorder, øyer, fossefall,
kommunevåpen og kommunenummer — with a per-device **Elo** rating, rank tiers, streaks and a
clean, minimal 2026 UI (light + dark).

<p align="center"><em>Hvilket fylke ligger Ulvik i? · Hvilken øy er størst? · Hvilken kommune har dette våpenet?</em></p>

## Features

- **Endless 4-choice quiz** — one question at a time, instant reveal with a fact, keep going.
- **11 categories** you can mix freely: Fylker · Kommuner · Våpenskjold · Fjell · Elver ·
  Innsjøer · Fjorder · Øyer · Fossefall · Befolkning · Kommunenummer.
- **~13 question types** — relational (kommune→fylke), coat-of-arms identification, photo
  identification, rankings (høyest/lengst/størst), population, and municipality numbers.
- **Elo rating** (starts 800) — harder/obscurer items are worth more. Rank tiers from _Turist_
  to _Norgesmester_, a tier-progress bar, streaks, a confetti tier-up, and a history chart +
  per-category accuracy breakdown.
- **Images** — coats of arms (symbols) and real photos/locator maps from Wikimedia Commons,
  with blur-up placeholders and look-ahead preloading so it never feels slow.
- **Keyboard-first** — `1`–`4` to answer, `Enter`/`Space`/`→` for next.
- **Light & dark**, optional auto-advance, all device-local (no backend, no accounts).

## Data

Everything is sourced and merged from authoritative open data:

- **Statistics Norway (SSB) KLASS API** — the authoritative list of the **15 fylker** and
  **357 kommuner** (2024 reform), with official **kommunenummer** and the kommune→fylke mapping.
- **Wikidata (SPARQL)** — population, area, coats of arms (P94), photos (P18), coordinates,
  administrative centres, plus the natural features (mountains, rivers, lakes, fjords, islands,
  waterfalls) with their measurements.

Municipalities are joined SSB↔Wikidata **by municipality number** (bulletproof — no fragile name
matching), so every kommune has an authoritative county + number _and_ rich visuals. A curated
blocklist removes a handful of Wikidata unit-error outliers (e.g. a lake mis-stated as 210 km²),
and sanity caps guard the ranking questions.

```
scripts/fetch-data.mjs     # Wikidata SPARQL -> src/data/*.json  (npm run fetch:data [category])
src/data/ssb-*.json        # authoritative SSB admin data
src/lib/data.ts            # merges + cleans + derives "prominence" (difficulty)
src/lib/questions.ts       # category/generator engine + recency-aware picker
scripts/test-engine.ts     # validates thousands of generated rounds (npx tsx)
```

## Tech

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS · lucide-react.
A fully static client app — data is bundled JSON, all state lives in `localStorage`.
Design system (frosted glass over warm paper, pill controls, generous radii) follows
`BLUEPRINT.md`.

## Develop

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # production build
npm run typecheck      # tsc --noEmit
npm run fetch:data     # re-pull all data from Wikidata (or: npm run fetch:data kommuner)
npx tsx scripts/test-engine.ts   # engine invariants
```

## Credits

Data: [Wikidata](https://www.wikidata.org) (CC0) and [SSB](https://www.ssb.no) (NLOD).
Images via [Wikimedia Commons](https://commons.wikimedia.org).
