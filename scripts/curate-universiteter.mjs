// Produces src/data/universiteter.json — the 32 Norwegian state-accredited
// universities, vitenskapelige høyskoler, and høyskoler.
//
// Canonical set: the 11 universiteter, 9 vitenskapelige høyskoler, and
// 12 høyskoler listed in the task specification (the authoritative Norwegian
// higher-education classification). Private "akkrediterte studietilbud" are excluded.
//
// Sources: Wikidata SPARQL (P625 coords, P18 image, P571 inception, P131 county).
// Fall-back data is baked in for the few institutions that Wikidata geo-misses.
//
// Run: node scripts/curate-universiteter.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "universiteter.json");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, attempt = 1) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.results.bindings;
  } catch (err) {
    if (attempt <= 4) {
      const wait = 2000 * attempt;
      console.warn(`  retry ${attempt} after ${err.message} (${wait}ms)`);
      await sleep(wait);
      return sparql(query, attempt + 1);
    }
    throw err;
  }
}

const val = (b, k) => (b[k] ? b[k].value : undefined);
const num = (b, k) => (b[k] ? Number(b[k].value) : undefined);
const qid = (b, k) => (b[k] ? b[k].value.split("/").pop() : undefined);

function imgUrl(raw, width = 1024) {
  if (!raw) return undefined;
  let u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=${width}`;
}

const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// Canonical list (32 institutions in authoritative order).
// `wdLabel` is the Wikidata nb/nn/no label used for fuzzy matching.
// `fallback` carries manually verified coords for institutions that Wikidata
// may return without geo data.
// ---------------------------------------------------------------------------
const CANONICAL = [
  // ── Universiteter (11) ────────────────────────────────────────────────────
  {
    name: "Norges teknisk-naturvitenskapelige universitet",
    short: "NTNU",
    type: "Universitet",
    city: "Trondheim",
    county: "Trøndelag",
    established: 1996,
    wdLabel: "Norges teknisk-naturvitenskapelige universitet",
    fallback: { lat: 63.4158, lon: 10.4066 },
  },
  {
    name: "Norges miljø- og biovitenskapelige universitet",
    short: "NMBU",
    type: "Universitet",
    city: "Ås",
    county: "Akershus",
    established: 2014,
    wdLabel: "Norges miljø- og biovitenskapelige universitet",
    fallback: { lat: 59.6657, lon: 10.7664 },
  },
  {
    name: "Universitetet i Bergen",
    short: "UiB",
    type: "Universitet",
    city: "Bergen",
    county: "Vestland",
    established: 1946,
    wdLabel: "Universitetet i Bergen",
    fallback: { lat: 60.3872, lon: 5.3244 },
  },
  {
    name: "Universitetet i Oslo",
    short: "UiO",
    type: "Universitet",
    city: "Oslo",
    county: "Oslo",
    established: 1811,
    wdLabel: "Universitetet i Oslo",
    fallback: { lat: 59.9396, lon: 10.7219 },
  },
  {
    name: "Universitetet i Stavanger",
    short: "UiS",
    type: "Universitet",
    city: "Stavanger",
    county: "Rogaland",
    established: 2005,
    wdLabel: "Universitetet i Stavanger",
    fallback: { lat: 58.9699, lon: 5.7330 },
  },
  {
    name: "UiT Norges arktiske universitet",
    short: "UiT",
    type: "Universitet",
    city: "Tromsø",
    county: "Troms",
    established: 1968,
    wdLabel: "UiT Norges arktiske universitet",
    fallback: { lat: 69.6828, lon: 18.9715 },
  },
  {
    name: "Universitetet i Agder",
    short: "UiA",
    type: "Universitet",
    city: "Kristiansand",
    county: "Agder",
    established: 2007,
    wdLabel: "Universitetet i Agder",
    fallback: { lat: 58.1631, lon: 8.0033 },
  },
  {
    name: "Nord universitet",
    short: "Nord",
    type: "Universitet",
    city: "Bodø",
    county: "Nordland",
    established: 2016,
    wdLabel: "Nord universitet",
    fallback: { lat: 67.2836, lon: 14.3730 },
  },
  {
    name: "OsloMet",
    short: "OsloMet",
    type: "Universitet",
    city: "Oslo",
    county: "Oslo",
    established: 2018,
    wdLabel: "OsloMet – storbyuniversitetet",
    fallback: { lat: 59.9211, lon: 10.7328 },
  },
  {
    name: "Universitetet i Sørøst-Norge",
    short: "USN",
    type: "Universitet",
    city: "Notodden",
    county: "Telemark",
    established: 2018,
    wdLabel: "Universitetet i Sørøst-Norge",
    fallback: { lat: 59.5604, lon: 9.2591 },
  },
  {
    name: "Universitetet i Innlandet",
    short: "INN",
    type: "Universitet",
    city: "Lillehammer",
    county: "Innlandet",
    established: 2020,
    wdLabel: "Innlandet University of Applied Sciences",
    fallback: { lat: 61.1259, lon: 10.4669 },
  },

  // ── Vitenskapelige høyskoler (9) ───────────────────────────────────────────
  {
    name: "Arkitektur- og designhøgskolen i Oslo",
    short: "AHO",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1945,
    wdLabel: "Arkitektur- og designhøgskolen i Oslo",
    fallback: { lat: 59.9136, lon: 10.7204 },
  },
  {
    name: "MF vitenskapelig høyskole",
    short: "MF",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1908,
    wdLabel: "MF vitenskapelig høyskole",
    fallback: { lat: 59.9271, lon: 10.7282 },
  },
  {
    name: "Handelshøyskolen BI",
    short: "BI",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1943,
    wdLabel: "Handelshøyskolen BI",
    fallback: { lat: 59.9220, lon: 10.6181 },
  },
  {
    name: "Kunsthøgskolen i Oslo",
    short: "KHiO",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1996,
    wdLabel: "Kunsthøgskolen i Oslo",
    fallback: { lat: 59.9119, lon: 10.7672 },
  },
  {
    name: "Norges Handelshøyskole",
    short: "NHH",
    type: "Vitenskapelig høyskole",
    city: "Bergen",
    county: "Vestland",
    established: 1936,
    wdLabel: "Norges Handelshøyskole",
    fallback: { lat: 60.3833, lon: 5.3345 },
  },
  {
    name: "Norges idrettshøgskole",
    short: "NIH",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1968,
    wdLabel: "Norges idrettshøgskole",
    fallback: { lat: 59.9713, lon: 10.7237 },
  },
  {
    name: "Norges musikkhøgskole",
    short: "NMH",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1973,
    wdLabel: "Norges musikkhøgskole",
    fallback: { lat: 59.9267, lon: 10.7226 },
  },
  {
    name: "Høgskolen i Molde",
    short: "HiMolde",
    type: "Vitenskapelig høyskole",
    city: "Molde",
    county: "Møre og Romsdal",
    established: 1994,
    wdLabel: "Høgskolen i Molde",
    fallback: { lat: 62.7369, lon: 7.1576 },
  },
  {
    name: "VID vitenskapelige høgskole",
    short: "VID",
    type: "Vitenskapelig høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 2016,
    wdLabel: "VID vitenskapelige høgskole",
    fallback: { lat: 59.9264, lon: 10.7254 },
  },

  // ── Høyskoler (12) ────────────────────────────────────────────────────────
  {
    name: "Ansgar Høyskole",
    type: "Høyskole",
    city: "Kristiansand",
    county: "Agder",
    established: 1913,
    wdLabel: "Ansgar Høyskole",
    fallback: { lat: 58.1484, lon: 7.9956 },
  },
  {
    name: "Dronning Mauds Minne Høgskole",
    short: "DMMH",
    type: "Høyskole",
    city: "Trondheim",
    county: "Trøndelag",
    established: 1947,
    wdLabel: "Dronning Mauds Minne Høgskole",
    fallback: { lat: 63.4142, lon: 10.4225 },
  },
  {
    name: "Fjellhaug Internasjonale Høgskole",
    short: "FIH",
    type: "Høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1902,
    wdLabel: "Fjellhaug Internasjonale Høgskole",
    fallback: { lat: 59.9361, lon: 10.7819 },
  },
  {
    name: "Forsvarets høgskole",
    short: "FHS",
    type: "Høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1999,
    wdLabel: "Forsvarets høgskole",
    fallback: { lat: 59.9626, lon: 10.6996 },
  },
  {
    name: "Høgskulen i Volda",
    short: "HVO",
    type: "Høyskole",
    city: "Volda",
    county: "Møre og Romsdal",
    established: 1895,
    wdLabel: "Høgskulen i Volda",
    fallback: { lat: 62.1467, lon: 6.0757 },
  },
  {
    name: "Høgskolen i Østfold",
    short: "HiØ",
    type: "Høyskole",
    city: "Halden",
    county: "Østfold",
    established: 1994,
    wdLabel: "Høgskolen i Østfold",
    fallback: { lat: 59.1229, lon: 11.3561 },
  },
  {
    name: "Høyskolen Kristiania",
    short: "Kristiania",
    type: "Høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1914,
    wdLabel: "Høyskolen Kristiania",
    fallback: { lat: 59.9161, lon: 10.7517 },
  },
  {
    name: "Høgskulen på Vestlandet",
    short: "HVL",
    type: "Høyskole",
    city: "Bergen",
    county: "Vestland",
    established: 2017,
    wdLabel: "Høgskulen på Vestlandet",
    fallback: { lat: 60.3680, lon: 5.3391 },
  },
  {
    name: "Lovisenberg Diakonale Høgskole",
    short: "LDH",
    type: "Høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1868,
    wdLabel: "Lovisenberg Diakonale Høgskole",
    fallback: { lat: 59.9254, lon: 10.7391 },
  },
  {
    name: "NLA Høgskolen",
    short: "NLA",
    type: "Høyskole",
    city: "Bergen",
    county: "Vestland",
    established: 1968,
    wdLabel: "NLA Høgskolen",
    fallback: { lat: 60.3899, lon: 5.3262 },
  },
  {
    name: "Politihøgskolen",
    short: "PHS",
    type: "Høyskole",
    city: "Oslo",
    county: "Oslo",
    established: 1920,
    wdLabel: "Politihøgskolen",
    fallback: { lat: 59.9394, lon: 10.7722 },
  },
  {
    name: "Samisk høgskole",
    short: "Sámi",
    type: "Høyskole",
    city: "Kautokeino",
    county: "Troms",
    established: 1989,
    wdLabel: "Samisk høgskole",
    fallback: { lat: 68.9993, lon: 23.0401 },
  },
];

// ---------------------------------------------------------------------------
// Wikidata SPARQL fetch — query by explicit QIDs for all 32 institutions.
// Avoids the expensive wdt:P279* traversal that causes 504s.
// ---------------------------------------------------------------------------
// Wikidata QIDs for each institution (canonical order, same as CANONICAL array).
const QIDS = [
  "Q314536",   // NTNU — Norwegian University of Science and Technology
  "Q1725075",  // NMBU — Norwegian University of Life Sciences
  "Q204457",   // UiB — University of Bergen
  "Q486156",   // UiO — University of Oslo
  "Q498401",   // UiS — University of Stavanger
  "Q279724",   // UiT — University of Tromsø – The Arctic University of Norway
  "Q1470769",  // UiA — University of Agder
  "Q21079372", // Nord universitet
  "Q47249304", // OsloMet — Oslo Metropolitan University
  "Q20112014", // USN — University of South-Eastern Norway
  "Q27050380", // Universitetet i Innlandet — University of Inland Norway
  "Q4579140",  // AHO — Oslo School of Architecture and Design
  "Q6516648",  // MF vitenskapelig høyskole
  "Q604629",   // Handelshøyskolen BI — BI Norwegian Business School
  "Q1291884",  // Kunsthøgskolen i Oslo — Oslo National Academy of the Arts
  "Q520458",   // NHH — Norwegian School of Economics
  "Q1769401",  // Norges idrettshøgskole — Norwegian School of Sport Sciences
  "Q2001488",  // Norges musikkhøgskole — Norwegian Academy of Music
  "Q1465973",  // Høgskolen i Molde — Molde University College
  "Q25426111", // VID vitenskapelige høgskole — VID Specialized University
  "Q11958358", // Ansgar Høyskole
  "Q7270472",  // Dronning Mauds Minne Høgskole — Queen Maud University College
  "Q47778890", // Fjellhaug Internasjonale Høgskole
  "Q12362688", // Forsvarets høgskole
  "Q502577",   // Høgskulen i Volda — Volda University College
  "Q616752",   // Høgskolen i Østfold — Østfold University College
  "Q5028646",  // Høyskolen Kristiania — Kristiania University College
  "Q25434874", // Høgskulen på Vestlandet — Western Norway University of Applied Sciences
  "Q11986872", // Lovisenberg Diakonale Høgskole
  "Q11990541", // NLA Høgskolen — NLA University College
  "Q6514765",  // Politihøgskolen — Norwegian Police University College
  "Q4129920",  // Samisk høgskole — Sámi University of Applied Sciences
];

async function fetchWikidata() {
  const values = QIDS.map((q) => `wd:${q}`).join(" ");
  // Keep the query lean: no transitive P131+ traversal to avoid 504s.
  // County comes from the canonical table; we only pull coords, image, inception.
  const rows = await sparql(`
    SELECT DISTINCT ?item ?image ?lat ?lon ?inception WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL {
        ?item p:P625 ?cs .
        ?cs psv:P625 ?cn .
        ?cn wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
      }
      OPTIONAL { ?item wdt:P571 ?inception }
    } LIMIT 500`);

  // Deduplicate: one record per QID, picking first image + coords found.
  const wdMap = new Map();
  for (const b of rows) {
    const id = qid(b, "item");
    if (!id) continue;
    if (!wdMap.has(id)) {
      wdMap.set(id, {
        img: val(b, "image"),
        lat: num(b, "lat"),
        lon: num(b, "lon"),
        county: val(b, "countyLabel"),
        inc: val(b, "inception"),
      });
    } else {
      const e = wdMap.get(id);
      if (!e.img && val(b, "image")) e.img = val(b, "image");
      if (e.lat == null && num(b, "lat") != null) {
        e.lat = num(b, "lat");
        e.lon = num(b, "lon");
      }
      if (!e.county && val(b, "countyLabel")) e.county = val(b, "countyLabel");
    }
  }
  return wdMap; // keyed by QID
}

async function main() {
  process.stdout.write("Fetching Wikidata... ");
  const wdByLabel = await fetchWikidata(); // Map<QID, entry>
  console.log(`${wdByLabel.size} items returned`);

  const result = [];
  for (let i = 0; i < CANONICAL.length; i++) {
    const canon = CANONICAL[i];
    const wd = wdByLabel.get(QIDS[i]);

    // Coordinates: prefer Wikidata IF within Norway's bounding box
    // (lat 57-82, lon 4-32; includes Svalbard). Fall back to hardcoded otherwise.
    const inNorway = (lt, lg) =>
      lt != null && lg != null && lt >= 57 && lt <= 82 && lg >= 4 && lg <= 32;
    let lat, lon;
    if (wd?.lat != null && inNorway(wd.lat, wd.lon)) {
      lat = wd.lat; lon = wd.lon;
    } else {
      lat = canon.fallback?.lat; lon = canon.fallback?.lon;
    }

    // Established year: prefer canonical (more precise), then Wikidata.
    let established = canon.established;
    if (!established && wd?.inc) {
      const y = parseInt(wd.inc.slice(0, 4), 10);
      if (y > 1800 && y < 2100) established = y;
    }

    const entry = { id: `universiteter-${slug(canon.name)}` };
    entry.name = canon.name;
    if (canon.short) entry.short = canon.short;
    entry.type = canon.type;
    entry.city = canon.city;

    // County: prefer Wikidata (live canonical county names), fall back to canonical.
    const rawCounty = (wd?.county || canon.county || "").replace(/\s*fylke$/i, "").replace(/\s*kommune$/i, "").trim();
    entry.county = rawCounty || canon.county;

    if (established) entry.established = established;
    if (lat != null) { entry.lat = lat; entry.lon = lon; }
    if (wd?.img) entry.photo = imgUrl(wd.img, 1024);

    result.push(entry);
  }

  await writeFile(OUT, JSON.stringify(result, null, 2));

  // ── Coverage report ──────────────────────────────────────────────────────
  const n = result.length;
  const byType = {};
  for (const e of result) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  const withCoords = result.filter((x) => x.lat != null).length;
  const withPhoto  = result.filter((x) => x.photo).length;
  const withYear   = result.filter((x) => x.established != null).length;
  const noCoords   = result.filter((x) => x.lat == null).map((x) => x.name);
  const noPhoto    = result.filter((x) => !x.photo).map((x) => x.name);

  // Duplicate id check
  const idCounts = new Map();
  for (const e of result) idCounts.set(e.id, (idCounts.get(e.id) || 0) + 1);
  const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1).map(([id]) => id);

  console.log(`\nWrote ${n} entries to src/data/universiteter.json`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`Coverage: coords ${withCoords}/${n}, photo ${withPhoto}/${n}, established ${withYear}/${n}`);
  if (noCoords.length) console.log(`No coords (using fallback): ${noCoords.join(", ")}`);
  if (noPhoto.length)  console.log(`No photo: ${noPhoto.join(", ")}`);
  if (dupIds.length)   console.log(`DUPLICATE IDs: ${dupIds.join(", ")}`);
  else                 console.log("Unique IDs: OK (zero duplicates)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
