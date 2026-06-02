// Produces src/data/stavkirker.json — the 28 preserved Norwegian stave churches.
//
// Source: Wikipedia "Liste over stavkirker i Norge" is the canonical list of the
// 28 surviving medieval stave churches (plus Fantoft as a labeled reconstruction).
// Wikidata Q746310 (stave church) supplies coordinates, images, county, municipality,
// and approximate inception year for each church.
//
// Run: node scripts/curate-stavkirker.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "stavkirker.json");
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
      console.warn(`  retry ${attempt} after error: ${err.message} (waiting ${wait}ms)`);
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

// The 28 preserved stave churches per Wikipedia "Liste over stavkirker i Norge",
// keyed by their Wikidata label (nb/nn/no). Fantoft is a labeled reconstruction.
// Each entry carries the Wikipedia-authoritative metadata to fill gaps.
const CANONICAL = [
  // Innlandet
  { name: "Garmo stavkirke",    county: "Innlandet",        municipality: "Lillehammer",    year: 1157, reconstructed: false },
  { name: "Hedalen stavkirke",  county: "Innlandet",        municipality: "Sør-Aurdal",     year: 1150, reconstructed: false },
  { name: "Hegge stavkirke",    county: "Innlandet",        municipality: "Øystre Slidre",  year: 1216, reconstructed: false },
  { name: "Høre stavkirke",     county: "Innlandet",        municipality: "Vang",           year: 1180, reconstructed: false },
  { name: "Lom stavkirke",      county: "Innlandet",        municipality: "Lom",            year: 1150, reconstructed: false },
  { name: "Lomen stavkirke",    county: "Innlandet",        municipality: "Vestre Slidre",  year: 1179, reconstructed: false },
  { name: "Reinli stavkirke",   county: "Innlandet",        municipality: "Sør-Aurdal",     year: 1326, reconstructed: false },
  { name: "Ringebu stavkirke",  county: "Innlandet",        municipality: "Ringebu",        year: 1220, reconstructed: false },
  { name: "Øye stavkirke",      county: "Innlandet",        municipality: "Vang",           year: 1200, reconstructed: false },
  // Møre og Romsdal
  { name: "Grip stavkirke",     county: "Møre og Romsdal",  municipality: "Kristiansund",   year: 1460, reconstructed: false },
  { name: "Kvernes stavkirke",  county: "Møre og Romsdal",  municipality: "Averøy",         year: 1633, reconstructed: false },
  { name: "Rødven stavkirke",   county: "Møre og Romsdal",  municipality: "Rauma",          year: 1200, reconstructed: false },
  // Telemark
  { name: "Eidsborg stavkirke", county: "Telemark",         municipality: "Tokke",          year: 1200, reconstructed: false },
  { name: "Heddal stavkirke",   county: "Telemark",         municipality: "Notodden",       year: 1200, reconstructed: false },
  // Trøndelag
  { name: "Haltdalen stavkirke",county: "Trøndelag",        municipality: "Trondheim",      year: 1170, reconstructed: false },
  // Vestfold
  { name: "Høyjord stavkirke",  county: "Vestfold",         municipality: "Sandefjord",     year: 1275, reconstructed: false },
  // Vestland
  { name: "Borgund stavkirke",  county: "Vestland",         municipality: "Lærdal",         year: 1150, reconstructed: false },
  { name: "Hopperstad stavkirke",county: "Vestland",        municipality: "Vik",            year: 1130, reconstructed: false },
  { name: "Kaupanger stavkirke",county: "Vestland",         municipality: "Sogndal",        year: 1190, reconstructed: false },
  { name: "Undredal stavkirke", county: "Vestland",         municipality: "Aurland",        year: 1147, reconstructed: false },
  { name: "Urnes stavkirke",    county: "Vestland",         municipality: "Luster",         year: 1130, reconstructed: false },
  { name: "Røldal stavkirke",   county: "Vestland",         municipality: "Ullensvang",     year: 1200, reconstructed: false },
  // Buskerud
  { name: "Flesberg stavkirke", county: "Numedal / Buskerud", municipality: "Flesberg",     year: 1111, reconstructed: false },
  { name: "Gol stavkirke",      county: "Oslo",             municipality: "Oslo",           year: 1216, reconstructed: false },
  { name: "Nore stavkirke",     county: "Numedal / Buskerud", municipality: "Nore og Uvdal",year: 1166, reconstructed: false },
  { name: "Rollag stavkirke",   county: "Numedal / Buskerud", municipality: "Rollag",       year: 1482, reconstructed: false },
  { name: "Torpo stavkirke",    county: "Hallingdal / Buskerud", municipality: "Ål",        year: 1192, reconstructed: false },
  { name: "Uvdal stavkirke",    county: "Numedal / Buskerud", municipality: "Nore og Uvdal",year: 1168, reconstructed: false },
  // Reconstructed (labeled)
  { name: "Fantoft stavkirke",  county: "Vestland",         municipality: "Bergen",         year: 1997, reconstructed: true },
];

async function main() {
  // Fetch all Norwegian stave churches from Wikidata (Q746310).
  // Multiple rows per item are possible (multiple images), so we deduplicate.
  const rows = await sparql(`
    SELECT DISTINCT ?item ?itemLabel ?image ?lat ?lon ?countyLabel ?muniLabel ?inception WHERE {
      ?item wdt:P31 wd:Q746310 .
      ?item wdt:P17 wd:Q20 .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item p:P625 ?cs . ?cs psv:P625 ?cn .
                 ?cn wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
      OPTIONAL { ?item wdt:P131 ?muni . ?muni wdt:P31 wd:Q755707 . }
      OPTIONAL { ?item wdt:P131+ ?county . ?county wdt:P31 wd:Q192299 .
                 FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
      OPTIONAL { ?item wdt:P571 ?inception }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,no,en". }
    } LIMIT 500`);

  // Deduplicate: one entry per QID, picking first image found.
  const wdMap = new Map();
  for (const b of rows) {
    const id = qid(b, "item");
    if (!id) continue;
    const label = val(b, "itemLabel");
    if (!label || /^Q\d+$/.test(label)) continue;
    if (!wdMap.has(id)) {
      wdMap.set(id, {
        label,
        img: val(b, "image"),
        lat: num(b, "lat"),
        lon: num(b, "lon"),
        county: val(b, "countyLabel"),
        muni: val(b, "muniLabel"),
        inc: val(b, "inception"),
      });
    } else {
      const e = wdMap.get(id);
      if (!e.img && val(b, "image")) e.img = val(b, "image");
      if (!e.county && val(b, "countyLabel")) e.county = val(b, "countyLabel");
      if (!e.muni && val(b, "muniLabel")) e.muni = val(b, "muniLabel");
    }
  }

  // Index Wikidata entries by normalised label for matching.
  const norm = (s) => (s || "").toLowerCase().normalize("NFC").trim();
  const wdByLabel = new Map();
  for (const [, e] of wdMap) {
    const k = norm(e.label);
    if (!wdByLabel.has(k)) wdByLabel.set(k, e);
    else {
      // Prefer the entry with more data
      const existing = wdByLabel.get(k);
      if (!existing.img && e.img) existing.img = e.img;
      if (!existing.lat && e.lat) { existing.lat = e.lat; existing.lon = e.lon; }
    }
  }

  // Build output array from the canonical Wikipedia list.
  const result = [];
  for (const canon of CANONICAL) {
    const wd = wdByLabel.get(norm(canon.name));

    // County: prefer Wikidata (current fylke names), fall back to canonical.
    // Clean up "Oslo kommune" -> "Oslo".
    const rawCounty = wd?.county || canon.county;
    const county = rawCounty ? rawCounty.replace(/\s*kommune$/, "") : undefined;

    // Municipality: prefer Wikidata, fallback to canonical.
    const municipality = wd?.muni || canon.municipality;

    // Year: prefer Wikipedia canonical (more precise description), fallback Wikidata inception.
    let year = canon.year;
    if (!year && wd?.inc) {
      const y = parseInt(wd.inc.slice(0, 4), 10);
      if (y > 800 && y < 2100) year = y;
    }

    const entry = {
      id: slug(canon.name),
      name: canon.name,
      county,
      municipality,
      year: year || undefined,
    };
    if (canon.reconstructed) entry.reconstructed = true;
    if (wd?.img) entry.photo = imgUrl(wd.img, 1024);
    if (wd?.lat != null) { entry.lat = wd.lat; entry.lon = wd.lon; }

    result.push(entry);
  }

  await writeFile(OUT, JSON.stringify(result, null, 2));

  // Field-coverage report
  const n = result.length;
  const withPhoto  = result.filter((x) => x.photo).length;
  const withCoords = result.filter((x) => x.lat != null).length;
  const withCounty = result.filter((x) => x.county).length;
  const withYear   = result.filter((x) => x.year != null).length;
  const noCoords   = result.filter((x) => x.lat == null).map((x) => x.name);

  console.log(`stavkirker: ${n} churches written to ${OUT}`);
  console.log(`Field coverage: photo ${withPhoto}/${n}, coords ${withCoords}/${n}, county ${withCounty}/${n}, year ${withYear}/${n}`);
  if (noCoords.length) console.log(`Missing coords: ${noCoords.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
