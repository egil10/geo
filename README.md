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
scripts/curate-*.mjs       # Wikipedia-curated merges — run AFTER fetch-data (fjell, fossefall,
                           # extra patches in isbreer/tunneler/Sognefjorden, …)
scripts/enrich-images.mjs  # Commons imageinfo -> src/data/img-meta.json (npm run enrich:images)
scripts/validate-data.mjs  # ship gate: ids, count floors, meta coverage, live URL samples (npm run validate)
src/data/ssb-*.json        # authoritative SSB admin data
src/lib/data.ts            # merges + cleans + derives "prominence" (difficulty)
src/lib/questions.ts       # category/generator engine + recency-aware picker
scripts/test-engine.ts     # validates thousands of generated rounds (npx tsx)
```

**Pipeline order matters:** `fetch:data` → `curate-fjell`/`curate-fossefall`/`curate-extra` →
`enrich:images` → `validate`. The curate scripts merge Wikipedia-only entries (2000 m peaks,
ranked waterfalls, Sognefjorden's length) that a bare re-fetch silently loses.

## Images — Wikimedia URL scheme (hard-won, verified 2026-06)

Image refs in the data are Commons `Special:FilePath/<name>?width=` URLs (canonical, stable),
but they are **never served to the browser**. Reasons, all measured:

- `Special:FilePath` costs **two redirect hops** per request, and the server snaps `width=` to
  hidden buckets that break srcset math (`width=320` actually serves 330 px, `1024` serves 1280 px).
- `upload.wikimedia.org` only **renders** thumbs at widths `{20, 40, 60, 120, 250, 330, 500, 960}` —
  any other width is HTTP 400 (previously-cached odd sizes may still 200, don't be fooled).
- Raster thumbs must be requested **below the original width**; SVGs render at any bucket as PNG
  (`…/<w>px-Name.svg.png`). `.tif` thumbs become `lossy-page1-<w>px-Name.tif.jpg`; over-long
  filenames thumb to `<w>px-thumbnail.jpg`. Don't derive these — `scripts/enrich-images.mjs`
  records the exact pattern from the API and verifies it byte-for-byte.
- A `?width=` param on an `upload.wikimedia.org` *original* URL is **silently ignored** — the
  full multi-MB file is served.
- Commons API titles must be NFC UTF-8; the API reports renames (`redirects`) and deletions
  (`missing`), which `enrich-images.mjs` applies back to the data (liveness pass).

`src/lib/images.ts` resolves every ref through `src/data/img-meta.json`
(`name -> [origW, origH, shardPath, flag]`) to a direct, zero-redirect thumb URL with true
srcset descriptors, clamped below the original size; unknown files fall back to `Special:FilePath`.
Expect 429s when testing in bursts — per-IP throttling, not breakage.

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
npm run enrich:images  # refresh img-meta.json + drop dead/renamed Commons refs
npm run validate       # dataset ship gate (run before committing data changes)
npx tsx scripts/test-engine.ts   # engine invariants
```

## Credits

Data: [Wikidata](https://www.wikidata.org) (CC0) and [SSB](https://www.ssb.no) (NLOD).
Images via [Wikimedia Commons](https://commons.wikimedia.org).
