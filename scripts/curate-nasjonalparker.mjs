// Fetches all Norwegian national parks from Wikidata SPARQL and writes
// src/data/nasjonalparker.json. Cross-checked against Wikipedia
// "Liste over nasjonalparker i Norge".
//
// Run: node scripts/curate-nasjonalparker.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "src", "data", "nasjonalparker.json");
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

// Match the imgUrl helper used in fetch-data.mjs.
function imgUrl(raw, width = 1024) {
  if (!raw) return undefined;
  let u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=${width}`;
}

// Wikidata sometimes stores area in m² (huge values) instead of km². Anything
// above 50 000 is almost certainly m² — convert it.
function normaliseArea(raw) {
  if (raw == null) return undefined;
  const v = Number(raw);
  if (isNaN(v)) return undefined;
  return v > 50000 ? Math.round(v / 1000) / 1000 : Math.round(v * 100) / 100;
}

function normCounty(c) {
  if (!c) return c;
  return c.replace(/\s*kommune$/, "");
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Svalbard parks have no Norwegian fylke in Wikidata — detect by lat > 74.
function isSvalbard(lat) {
  return lat != null && lat > 74;
}

async function fetchParks() {
  const rows = await sparql(`
    SELECT ?park ?parkLabel ?area ?inception ?photo ?lat ?lon ?countyLabel WHERE {
      ?park wdt:P31 wd:Q46169 ; wdt:P17 wd:Q20 .
      OPTIONAL { ?park wdt:P2046 ?area }
      OPTIONAL { ?park wdt:P571 ?inception }
      OPTIONAL { ?park wdt:P18 ?photo }
      OPTIONAL { ?park p:P625 ?coordStmt . ?coordStmt psv:P625 ?coordNode .
                 ?coordNode wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
      OPTIONAL { ?park wdt:P131* ?county . ?county wdt:P31 wd:Q192299 .
                 FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,no,en". }
    }`);

  const map = new Map();
  for (const b of rows) {
    const id = qid(b, "park");
    const name = val(b, "parkLabel");
    if (!name || /^Q\d+$/.test(name)) continue;

    const rawArea = val(b, "area");
    const area = normaliseArea(rawArea);
    const photo = imgUrl(val(b, "photo"));
    const lat = num(b, "lat");
    const lon = num(b, "lon");
    const county = normCounty(val(b, "countyLabel"));
    const inceptionRaw = val(b, "inception");
    const established = inceptionRaw ? Number(inceptionRaw.slice(0, 4)) : undefined;

    if (!map.has(id)) {
      map.set(id, { _qid: id, name, area, established, lat, lon, photo, county });
    } else {
      const e = map.get(id);
      // Keep smallest sane area value (avoids m² duplicates that Wikidata carries).
      if (area != null && (e.area == null || area < e.area)) e.area = area;
      // Prefer earlier established date (original founding over expansions).
      if (established != null && (e.established == null || established < e.established))
        e.established = established;
      if (!e.photo && photo) e.photo = photo;
      if (!e.county && county) e.county = county;
    }
  }

  return [...map.values()]
    .filter((p) => p.name)
    .map((p) => {
      const county = p.county || (isSvalbard(p.lat) ? "Svalbard" : undefined);
      return {
        id: `nasjonalpark-${slug(p.name)}`,
        name: p.name,
        county,
        area: p.area,
        established: p.established,
        lat: p.lat,
        lon: p.lon,
        photo: p.photo,
      };
    })
    .sort((a, b) => (a.established ?? 9999) - (b.established ?? 9999) || a.name.localeCompare(b.name, "nb"));
}

async function main() {
  await mkdir(join(__dirname, "..", "src", "data"), { recursive: true });
  process.stdout.write("Fetching nasjonalparker from Wikidata... ");
  const parks = await fetchParks();
  await writeFile(OUT_FILE, JSON.stringify(parks, null, 2));

  const withPhoto = parks.filter((p) => p.photo).length;
  const withCoords = parks.filter((p) => p.lat != null && p.lon != null).length;
  const withCounty = parks.filter((p) => p.county).length;
  const withArea = parks.filter((p) => p.area != null).length;
  const withYear = parks.filter((p) => p.established != null).length;

  console.log(`${parks.length} parks written to src/data/nasjonalparker.json`);
  console.log(`  photo: ${withPhoto}/${parks.length}  coords: ${withCoords}/${parks.length}  county: ${withCounty}/${parks.length}  area: ${withArea}/${parks.length}  established: ${withYear}/${parks.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
