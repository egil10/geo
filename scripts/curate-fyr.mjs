// Fetches Norwegian lighthouses (fyrstasjoner) from Wikidata SPARQL and cross-checks
// against the Wikipedia list "Norske fyr". Writes src/data/fyr.json.
//
// Source: Wikidata (instance of lighthouse / subclass, located in Norway P17 Q20),
// with coordinates P625, image P18, county via P131*, municipality via P131, and
// inception P571. Wikipedia "Norske fyr" is fetched for cross-reference only.
//
// Run: node scripts/curate-fyr.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "fyr.json");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const WIKI_PAGE = "Norske fyr";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, attempt = 1) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()).results.bindings;
  } catch (err) {
    if (attempt <= 4) {
      console.warn(`  retry ${attempt}: ${err.message} (waiting ${2000 * attempt}ms)`);
      await sleep(2000 * attempt);
      return sparql(query, attempt + 1);
    }
    throw err;
  }
}

const norm = (s) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

const slug = (s) =>
  "fyr-" +
  norm(s)
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Normalise a Wikimedia Commons URL to a sized HTTPS thumbnail.
const img = (u) =>
  u ? u.replace(/^http:/, "https:").replace(/(\?.*)?$/, "?width=1024") : undefined;

// ---- Wikidata ----------------------------------------------------------------

const QUERY = `
SELECT ?x ?xLabel ?lat ?lon ?photo ?countyLabel ?municLabel ?inception WHERE {
  ?x wdt:P31/wdt:P279* wd:Q39715 ; wdt:P17 wd:Q20 .
  OPTIONAL { ?x p:P625 ?coordStmt . ?coordStmt psv:P625 ?coordNode .
             ?coordNode wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
  OPTIONAL { ?x wdt:P18 ?photo }
  OPTIONAL { ?x wdt:P131 ?munic . ?munic wdt:P31 wd:Q755707 . }
  OPTIONAL { ?x wdt:P131* ?county . ?county wdt:P31 wd:Q192299 .
             FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
  OPTIONAL { ?x wdt:P571 ?inception }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,no,en". }
}
`;

// ---- Wikipedia cross-check (informational only) ----------------------------

async function wikiNames() {
  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(WIKI_PAGE)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const wt = (await res.json()).parse?.wikitext?.["*"] ?? "";
  const names = new Set();
  for (const m of wt.matchAll(/\[\[([^|:\]]+)\]\]/g)) {
    const t = m[1].trim();
    if (/fyr/i.test(t) && !t.startsWith("Fil:") && !t.startsWith("File:") && t !== "Fyr" && t !== "fyr" && t !== "fyrlykt") {
      names.add(t);
    }
  }
  return names;
}

// ---- Main -------------------------------------------------------------------

async function main() {
  process.stdout.write("Fetching Wikidata lighthouses... ");
  const rows = await sparql(QUERY);
  console.log(`${rows.length} rows`);

  // Merge multiple rows per QID (county/municipality join expansion).
  const map = new Map();
  for (const b of rows) {
    const qid = b.x.value.split("/").pop();
    const name = b.xLabel?.value;
    if (!name || /^Q\d+$/.test(name)) continue;
    if (!map.has(qid)) {
      map.set(qid, {
        qid,
        name,
        lat: b.lat ? Number(b.lat.value) : undefined,
        lon: b.lon ? Number(b.lon.value) : undefined,
        photo: b.photo?.value,
        county: b.countyLabel?.value?.replace(/\s*kommune$/, ""),
        municipality: b.municLabel?.value,
        inception: b.inception ? parseInt(b.inception.value) : undefined,
      });
    } else {
      const e = map.get(qid);
      if (!e.county && b.countyLabel?.value) e.county = b.countyLabel.value.replace(/\s*kommune$/, "");
      if (!e.municipality && b.municLabel?.value) e.municipality = b.municLabel.value;
      if (!e.photo && b.photo?.value) e.photo = b.photo.value;
      if (e.lat == null && b.lat) {
        e.lat = Number(b.lat.value);
        e.lon = Number(b.lon.value);
      }
      if (e.inception == null && b.inception) e.inception = parseInt(b.inception.value);
    }
  }

  // Dedupe by normalised name — keep the entry with the most fields populated.
  const byName = new Map();
  const score = (i) => (i.lat != null ? 4 : 0) + (i.photo ? 2 : 0) + (i.county ? 1 : 0);
  for (const item of map.values()) {
    const key = norm(item.name);
    if (!byName.has(key) || score(item) > score(byName.get(key))) byName.set(key, item);
  }

  // Build output: require coords; assign unique slugs; omit fields that are absent.
  const usedSlugs = new Set();
  const result = [...byName.values()]
    .filter((i) => i.lat != null && i.lon != null)
    .map((i) => {
      const base = slug(i.name);
      let id = base, n = 2;
      while (usedSlugs.has(id)) id = `${base}-${n++}`;
      usedSlugs.add(id);
      const entry = { id, name: i.name };
      if (i.county) entry.county = i.county;
      if (i.municipality) entry.municipality = i.municipality;
      if (i.inception && i.inception > 1600 && i.inception < 2024) entry.established = i.inception;
      entry.lat = Math.round(i.lat * 1_000_000) / 1_000_000;
      entry.lon = Math.round(i.lon * 1_000_000) / 1_000_000;
      if (i.photo) entry.photo = img(i.photo);
      return entry;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));

  await writeFile(OUT, JSON.stringify(result, null, 2));

  // Cross-check against Wikipedia list.
  process.stdout.write("Cross-checking Wikipedia... ");
  const wn = await wikiNames();
  const wdNorms = new Set(result.map((r) => norm(r.name)));
  const missing = [...wn].filter((n) => !wdNorms.has(norm(n)));
  console.log(`${wn.size} names found`);
  if (missing.length) console.log(`  Wikipedia names not in output (no coords or different label): ${missing.join(", ")}`);

  // Coverage report.
  const withPhoto = result.filter((r) => r.photo).length;
  const withCounty = result.filter((r) => r.county).length;
  const withEstablished = result.filter((r) => r.established).length;
  const withMunic = result.filter((r) => r.municipality).length;
  console.log(`\nfyr.json: ${result.length} entries`);
  console.log(`  lat/lon:     ${result.length}/${result.length} (100%)`);
  console.log(`  photo:       ${withPhoto}/${result.length} (${Math.round(100 * withPhoto / result.length)}%)`);
  console.log(`  county:      ${withCounty}/${result.length} (${Math.round(100 * withCounty / result.length)}%)`);
  console.log(`  municipality:${withMunic}/${result.length} (${Math.round(100 * withMunic / result.length)}%)`);
  console.log(`  established: ${withEstablished}/${result.length} (${Math.round(100 * withEstablished / result.length)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
