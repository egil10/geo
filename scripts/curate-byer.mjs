// Expands byer.json to cover all 108 Norwegian cities with official bystatus.
//
// Sources:
//   - Canonical list: Wikipedia "Liste over norske byer" (108 cities)
//   - Enrichment: Wikidata wbgetentities (P625 coords, P1082 population,
//     P18 image, P131 county)
//
// Run:  node scripts/curate-byer.mjs
//
// Idempotent: re-running only adds/backfills; never removes existing entries
// or changes existing ids.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "byer.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const norm = (s) =>
  (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

const slug = (s) =>
  norm(s)
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function apiFetch(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Canonical list of 108 Norwegian cities with bystatus.
// Source: Wikipedia "Liste over norske byer" (2024).
// Format: [name, county, wikidataQID | null]
// QIDs are for the settlement/town item, not the municipality item.
// null = no distinct settlement QID found; script will use a slug-based id.
// ---------------------------------------------------------------------------
const CANONICAL_CITIES = [
  // Traditional cities (bystatus before 1996)
  ["Arendal",        "Agder",           "Q2699921"],  // already in data
  ["Bergen",         "Vestland",        "Q26793"],    // already in data
  ["Bodø",           "Nordland",        "Q39383"],    // already in data
  ["Brevik",         "Telemark",        "Q2295"],     // already in data
  ["Brønnøysund",    "Nordland",        "Q995929"],   // already in data
  ["Drammen",        "Buskerud",        "Q15138612"], // already in data
  ["Drøbak",         "Akershus",        "Q995477"],   // already in data
  ["Egersund",       "Rogaland",        "Q1020025"],  // already in data
  ["Farsund",        "Agder",           "Q1808857"],  // MISSING
  ["Flekkefjord",    "Agder",           "Q10496636"], // MISSING
  ["Florø",          "Vestland",        "Q1020010"],  // already in data
  ["Fredrikstad",    "Østfold",         "Q10498783"], // already in data
  ["Gjøvik",         "Innlandet",       "Q5420717"],  // already in data
  ["Grimstad",       "Agder",           "Q12715142"], // already in data
  ["Halden",         "Østfold",         "Q11494262"], // MISSING
  ["Hamar",          "Innlandet",       "Q3738335"],  // already in data
  ["Hammerfest",     "Finnmark",        "Q721374"],   // already in data
  ["Harstad",        "Troms",           "Q1034159"],  // already in data
  ["Haugesund",      "Rogaland",        "Q10518562"], // already in data
  ["Holmestrand",    "Vestfold",        "Q2088337"],  // already in data (missing photo)
  ["Horten",         "Vestfold",        "Q12715526"], // already in data
  ["Hønefoss",       "Buskerud",        "Q865925"],   // already in data
  ["Kongsberg",      "Buskerud",        "Q3916095"],  // MISSING
  ["Kongsvinger",    "Innlandet",       "Q12912940"], // already in data (missing photo)
  ["Kopervik",       "Rogaland",        "Q2109119"],  // MISSING
  ["Kragerø",        "Telemark",        "Q2188116"],  // MISSING
  ["Kristiansand",   "Agder",           "Q26772254"], // already in data
  ["Kristiansund",   "Møre og Romsdal", "Q3362082"],  // already in data
  ["Langesund",      "Telemark",        "Q1805211"],  // MISSING
  ["Larvik",         "Vestfold",        "Q2284798"],  // already in data
  ["Levanger",       "Trøndelag",       "Q6534878"],  // already in data
  ["Lillehammer",    "Innlandet",       "Q3745117"],  // already in data
  ["Lillesand",      "Agder",           "Q10561843"], // already in data
  ["Mandal",         "Agder",           "Q12716720"], // MISSING
  ["Mo i Rana",      "Nordland",        "Q59169"],    // already in data
  ["Molde",          "Møre og Romsdal", "Q10587563"], // already in data
  ["Mosjøen",        "Nordland",        "Q851998"],   // MISSING
  ["Moss",           "Akershus",        "Q13418001"], // already in data (note: county may be Østfold in old data)
  ["Namsos",         "Trøndelag",       "Q6962086"],  // already in data
  ["Narvik",         "Nordland",        "Q59101"],    // already in data
  ["Notodden",       "Telemark",        "Q1865470"],  // already in data
  ["Oslo",           "Oslo",            "Q585"],      // already in data
  ["Porsgrunn",      "Telemark",        "Q10637941"], // already in data
  ["Risør",          "Agder",           "Q2692673"],  // MISSING
  ["Røros",          "Trøndelag",       "Q10428572"], // already in data
  ["Sandefjord",     "Vestfold",        "Q13100072"], // already in data
  ["Sandnes",        "Rogaland",        "Q14955813"], // already in data
  ["Sarpsborg",      "Østfold",         "Q10661956"], // already in data
  ["Skien",          "Telemark",        "Q12375138"], // already in data
  ["Skudeneshavn",   "Rogaland",        "Q1900046"],  // MISSING
  ["Stathelle",      "Telemark",        "Q2715446"],  // MISSING
  ["Stavanger",      "Rogaland",        "Q26772333"], // already in data
  ["Stavern",        "Vestfold",        "Q1541556"],  // already in data
  ["Steinkjer",      "Trøndelag",       "Q7606901"],  // already in data
  ["Svelvik",        "Buskerud",        "Q12004287"], // already in data (county was Akershus, now Buskerud per Wikipedia)
  ["Svolvær",        "Nordland",        "Q145948"],   // already in data
  ["Tromsø",         "Troms",           "Q42328401"], // already in data
  ["Trondheim",      "Trøndelag",       "Q25804"],    // already in data
  ["Tvedestrand",    "Agder",           "Q2042136"],  // already in data
  ["Tønsberg",       "Vestfold",        "Q10853792"], // already in data
  ["Vadsø",          "Finnmark",        "Q7908355"],  // already in data
  ["Vardø",          "Finnmark",        "Q7915572"],  // already in data
  ["Ålesund",        "Møre og Romsdal", "Q42900680"], // already in data
  ["Åsgårdstrand",   "Vestfold",        "Q271269"],   // already in data

  // Post-1996 cities (bystatus by municipal council resolution)
  ["Alta",           "Finnmark",        "Q3366952"],  // already in data
  ["Askim",          "Østfold",         "Q755703"],   // already in data
  ["Bardufoss",      "Troms",           "Q676358"],   // MISSING
  ["Brekstad",       "Trøndelag",       "Q2449403"],  // already in data
  ["Brumunddal",     "Innlandet",       "Q992492"],   // MISSING
  ["Bryne",          "Rogaland",        "Q2332350"],  // MISSING
  ["Elverum",        "Innlandet",       "Q11967272"], // already in data
  ["Fagernes",       "Innlandet",       "Q2832251"],  // already in data
  ["Fauske",         "Nordland",        "Q4952910"],  // MISSING
  ["Finnsnes",       "Troms",           "Q1015949"],  // MISSING
  ["Fosnavåg",       "Møre og Romsdal", "Q1439388"],  // already in data (as Fosnavåg)
  ["Førde",          "Vestland",        "Q1780577"],  // already in data
  ["Hokksund",       "Buskerud",        "Q1310876"],  // already in data
  ["Honningsvåg",    "Finnmark",        "Q493472"],   // already in data
  ["Jessheim",       "Akershus",        "Q990999"],   // already in data
  ["Jørpeland",      "Rogaland",        "Q1851053"],  // already in data
  ["Kirkenes",       "Finnmark",        "Q209423"],   // already in data
  ["Kolvereid",      "Trøndelag",       "Q3230544"],  // already in data
  ["Leknes",         "Nordland",        "Q1993766"],  // MISSING
  ["Lillestrøm",     "Akershus",        "Q934871"],   // MISSING
  ["Lyngdal",        "Agder",           "Q2690169"],  // MISSING
  ["Moelv",          "Innlandet",       "Q1863851"],  // MISSING
  ["Mysen",          "Østfold",         "Q2719327"],  // MISSING
  ["Måløy",          "Vestland",        "Q980129"],   // already in data
  ["Odda",           "Vestland",        "Q6982219"],  // already in data (Q6982219)
  ["Orkanger",       "Trøndelag",       "Q6516399"],  // already in data
  ["Otta",           "Innlandet",       "Q980616"],   // already in data
  ["Raufoss",        "Innlandet",       "Q2632394"],  // MISSING
  ["Rjukan",         "Telemark",        "Q991201"],   // already in data
  ["Rørvik",         "Trøndelag",       "Q247062"],   // MISSING
  ["Sandnessjøen",   "Nordland",        "Q1004686"],  // already in data
  ["Sandvika",       "Akershus",        "Q651744"],   // already in data
  ["Sauda",          "Rogaland",        "Q6728725"],  // MISSING
  ["Ski",            "Akershus",        "Q1770672"],  // MISSING
  ["Sortland",       "Nordland",        "Q1821203"],  // MISSING
  ["Stjørdalshalsen","Trøndelag",       "Q2619068"],  // MISSING
  ["Stokmarknes",    "Nordland",        "Q288577"],   // already in data
  ["Stord",          "Vestland",        null],         // MISSING – no distinct settlement QID
  ["Tynset",         "Innlandet",       "Q12008032"], // MISSING
  ["Ulsteinvik",     "Møre og Romsdal", "Q1812809"],  // MISSING
  ["Verdalsøra",     "Trøndelag",       "Q2130145"],  // MISSING
  ["Vinstra",        "Innlandet",       "Q1016362"],  // already in data
  ["Åkrehamn",       "Rogaland",        "Q2648207"],  // MISSING
  ["Åndalsnes",      "Møre og Romsdal", "Q271083"],   // already in data
];

// Name aliases: some cities appear in existing data under a variant name.
// Maps canonical name → name as it appears in existing data.
const NAME_ALIASES = {
  "fosnavåg": "fosnavåg", // Fosnavåg already present as "Fosnavåg"
};

// ---------------------------------------------------------------------------
// Fetch enrichment data from Wikidata for a given QID
// ---------------------------------------------------------------------------
async function enrichFromWikidata(qid) {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities` +
    `&ids=${qid}&props=claims&format=json`;
  const data = await apiFetch(url);
  const entity = data?.entities?.[qid];
  if (!entity) return {};
  const claims = entity.claims || {};

  // P625 — coordinates
  let lat, lon;
  const coordVal = claims.P625?.[0]?.mainsnak?.datavalue?.value;
  if (coordVal) {
    lat = Math.round(coordVal.latitude * 1e5) / 1e5;
    lon = Math.round(coordVal.longitude * 1e5) / 1e5;
  }

  // P1082 — population (preferred rank first, then any)
  let population;
  const popClaims = claims.P1082 || [];
  const popClaim =
    popClaims.find((c) => c.rank === "preferred") || popClaims[0];
  if (popClaim) {
    const raw = popClaim.mainsnak?.datavalue?.value?.amount;
    if (raw != null) population = Math.round(Math.abs(Number(raw)));
  }

  // P18 — image
  let photo;
  const imgVal = claims.P18?.[0]?.mainsnak?.datavalue?.value;
  if (imgVal) {
    const encoded = encodeURIComponent(imgVal.replace(/ /g, "_"));
    photo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1024`;
  }

  return { lat, lon, population, photo };
}

// ---------------------------------------------------------------------------
// Backfill a single existing entry that is missing county or photo.
// Only works when the entry id is a Wikidata Q-id.
// ---------------------------------------------------------------------------
async function backfillEntry(entry) {
  const needsCounty = !entry.county;
  const needsPhoto = !entry.photo;
  if (!needsCounty && !needsPhoto) return entry;
  if (!entry.id || !entry.id.startsWith("Q")) return entry;

  const info = await enrichFromWikidata(entry.id);
  const updated = { ...entry };
  if (needsPhoto && info.photo) updated.photo = info.photo;
  // County backfill: look up canonical county from the CANONICAL_CITIES table
  if (needsCounty) {
    const found = CANONICAL_CITIES.find((c) => norm(c[0]) === norm(entry.name));
    if (found) updated.county = found[1];
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const existing = JSON.parse(await readFile(FILE, "utf8"));
  const beforeCount = existing.length;

  // Index existing entries by normalised name (first occurrence wins)
  const byName = new Map();
  for (const e of existing) {
    const k = norm(e.name);
    if (!byName.has(k)) byName.set(k, e);
  }

  // Collect all used ids
  const usedIds = new Set(existing.map((e) => e.id));

  // Id generator for cities with no Wikidata QID
  const uniqueId = (name) => {
    const base = `by-${slug(name)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  // Identify cities from the canonical list that are missing from byer.json.
  // Check both the canonical name and any known alias.
  const missing = CANONICAL_CITIES.filter(([name]) => {
    if (byName.has(norm(name))) return false;
    const alias = NAME_ALIASES[norm(name)];
    if (alias && byName.has(norm(alias))) return false;
    return true;
  });

  console.log(`Canonical list: ${CANONICAL_CITIES.length} cities`);
  console.log(`Existing byer.json: ${beforeCount} entries`);
  console.log(`Missing (to add): ${missing.length}`);

  // Enrich and add missing cities
  const added = [];
  for (const [name, county, qid] of missing) {
    process.stdout.write(`  Adding: ${name}…`);
    let info = {};
    let id;
    if (qid) {
      // Guard: skip if this QID is already used by a different entry
      if (usedIds.has(qid)) {
        id = uniqueId(name);
        console.log(` [QID ${qid} already used — assigned ${id}]`);
      } else {
        id = qid;
        usedIds.add(qid);
      }
      await sleep(250);
      info = await enrichFromWikidata(qid);
    } else {
      id = uniqueId(name);
    }

    const entry = { id, name, county };
    if (info.lat != null) entry.lat = info.lat;
    if (info.lon != null) entry.lon = info.lon;
    if (info.population != null) entry.population = info.population;
    if (info.photo) entry.photo = info.photo;
    added.push(entry);

    const flags = [
      info.photo ? "photo" : "no-photo",
      info.lat != null ? "coords" : "no-coords",
      info.population != null ? `pop=${info.population}` : "no-pop",
    ].join(", ");
    console.log(` [${flags}]`);
  }

  // Backfill existing entries missing county or photo
  console.log("\nBackfilling existing entries missing county/photo…");
  const backfilled = [];
  const updatedExisting = [];
  for (const entry of existing) {
    if (!entry.county || !entry.photo) {
      process.stdout.write(`  Backfilling: ${entry.name}…`);
      await sleep(200);
      const updated = await backfillEntry(entry);
      const changed = [];
      if (!entry.county && updated.county) changed.push("county");
      if (!entry.photo && updated.photo) changed.push("photo");
      if (changed.length) {
        backfilled.push(`${entry.name} (+${changed.join(",")})`);
        console.log(` added ${changed.join(",")}`);
      } else {
        console.log(" no new data");
      }
      updatedExisting.push(updated);
    } else {
      updatedExisting.push(entry);
    }
  }

  // Merge
  const merged = [...updatedExisting, ...added];

  // Verify no duplicate ids
  const idCounts = new Map();
  for (const e of merged) {
    idCounts.set(e.id, (idCounts.get(e.id) || 0) + 1);
  }
  const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1);
  if (dupIds.length > 0) {
    console.error(
      "\nDUPLICATE IDS DETECTED:",
      dupIds.map(([id, c]) => `${id} (×${c})`).join(", ")
    );
    process.exit(1);
  }

  // Verify JSON parses cleanly
  const json = JSON.stringify(merged);
  JSON.parse(json);

  await writeFile(FILE, json);

  // Report
  console.log("\n=== Summary ===");
  console.log(`Before: ${beforeCount} entries`);
  console.log(`After:  ${merged.length} entries (+${added.length} new)`);
  console.log(
    `Backfilled: ${backfilled.length} existing entries`
  );
  if (backfilled.length) {
    for (const b of backfilled) console.log(`  - ${b}`);
  }

  if (added.length > 0) {
    const withPhoto  = added.filter((e) => e.photo).length;
    const withCoords = added.filter((e) => e.lat != null).length;
    const withPop    = added.filter((e) => e.population != null).length;
    const withCounty = added.filter((e) => e.county).length;
    const pct = (n) => `${Math.round((100 * n) / added.length)}%`;
    console.log(`\nNew entries coverage (${added.length} cities):`);
    console.log(`  county:     ${withCounty}/${added.length} (${pct(withCounty)})`);
    console.log(`  lat/lon:    ${withCoords}/${added.length} (${pct(withCoords)})`);
    console.log(`  population: ${withPop}/${added.length}  (${pct(withPop)})`);
    console.log(`  photo:      ${withPhoto}/${added.length}  (${pct(withPhoto)})`);
  }

  console.log(`\nDuplicate id check: PASSED (0 duplicates)`);

  const caveats = [];
  if (added.some((e) => e.lat == null))
    caveats.push("Some new cities lack coordinates — verify via Wikidata P625");
  if (added.some((e) => !e.photo))
    caveats.push("Some new cities lack a photo — add via Wikidata P18");
  if (caveats.length) {
    console.log("\nCaveats:");
    for (const c of caveats) console.log("  -", c);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
