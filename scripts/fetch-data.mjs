// Fetches Norway geography data from Wikidata SPARQL and writes JSON to src/data.
// Run: node scripts/fetch-data.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data");
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

// Wikidata returns commons URLs like .../Special:FilePath/Name.svg
// Convert to a sized https thumbnail that renders crisply.
function imgUrl(raw, width = 320) {
  if (!raw) return undefined;
  let u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=${width}`;
}

const LABEL = `SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,no,en". }`;

// ---- Queries ----------------------------------------------------------------

async function municipalities() {
  const rows = await sparql(`
    SELECT ?m ?mLabel ?pop ?area ?coa ?photo ?lat ?lon ?countyLabel ?adminLabel ?knum WHERE {
      ?m wdt:P31 wd:Q755707 .
      FILTER NOT EXISTS { ?m wdt:P576 ?dissolved }
      OPTIONAL { ?m wdt:P1082 ?pop }
      OPTIONAL { ?m wdt:P2046 ?area }
      OPTIONAL { ?m wdt:P94 ?coa }
      OPTIONAL { ?m wdt:P2504 ?knum }
      OPTIONAL { ?m wdt:P18 ?photo }
      OPTIONAL { ?m p:P625 ?coordStmt . ?coordStmt psv:P625 ?coordNode .
                 ?coordNode wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
      OPTIONAL { ?m wdt:P131* ?county . ?county wdt:P31 wd:Q192299 .
                 FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
      OPTIONAL { ?m wdt:P36 ?admin }
      ${LABEL}
    }`);
  const pad4 = (n) => String(n).padStart(4, "0");
  const map = new Map();
  for (const b of rows) {
    const id = qid(b, "m");
    if (!map.has(id))
      map.set(id, {
        id,
        name: val(b, "mLabel"),
        numbers: new Set(val(b, "knum") ? [pad4(val(b, "knum"))] : []),
        population: num(b, "pop"),
        area: num(b, "area"),
        coa: imgUrl(val(b, "coa"), 320),
        photo: imgUrl(val(b, "photo"), 1024),
        lat: num(b, "lat"),
        lon: num(b, "lon"),
        county: normCounty(val(b, "countyLabel")),
        admin: val(b, "adminLabel"),
      });
    else {
      const e = map.get(id);
      if (val(b, "knum")) e.numbers.add(pad4(val(b, "knum")));
      if (!e.county && val(b, "countyLabel")) e.county = normCounty(val(b, "countyLabel"));
      if (!e.coa && val(b, "coa")) e.coa = imgUrl(val(b, "coa"), 320);
      if (!e.photo && val(b, "photo")) e.photo = imgUrl(val(b, "photo"), 1024);
      if (e.population == null && num(b, "pop") != null) e.population = num(b, "pop");
    }
  }
  return [...map.values()]
    .filter((m) => m.name && !/^Q\d+$/.test(m.name))
    .map((m) => ({ ...m, numbers: [...m.numbers].sort() }));
}

async function counties() {
  const rows = await sparql(`
    SELECT ?c ?cLabel ?pop ?area ?coa ?photo ?adminLabel ?iso WHERE {
      ?c wdt:P31 wd:Q192299 .
      FILTER NOT EXISTS { ?c wdt:P576 ?dissolved }
      OPTIONAL { ?c wdt:P1082 ?pop }
      OPTIONAL { ?c wdt:P2046 ?area }
      OPTIONAL { ?c wdt:P94 ?coa }
      OPTIONAL { ?c wdt:P18 ?photo }
      OPTIONAL { ?c wdt:P36 ?admin }
      OPTIONAL { ?c wdt:P300 ?iso }
      ${LABEL}
    }`);
  const map = new Map();
  for (const b of rows) {
    const id = qid(b, "c");
    if (!map.has(id))
      map.set(id, {
        id,
        name: val(b, "cLabel"),
        population: num(b, "pop"),
        area: num(b, "area"),
        coa: imgUrl(val(b, "coa"), 320),
        photo: imgUrl(val(b, "photo"), 1024),
        admin: val(b, "adminLabel"),
        iso: val(b, "iso"),
      });
    else {
      const e = map.get(id);
      if (!e.photo && val(b, "photo")) e.photo = imgUrl(val(b, "photo"), 1024);
    }
  }
  return [...map.values()].filter((c) => c.name && !/^Q\d+$/.test(c.name));
}

// Normalize county labels that come through awkwardly.
function normCounty(c) {
  if (!c) return c;
  return c.replace(/\s*kommune$/, ""); // "Oslo kommune" -> "Oslo"
}

// Generic "feature located in Norway with a measurable attribute".
// `max` guards against Wikidata unit errors (e.g. a 16503 km "river").
async function features({ type, attr, attrName, min, max, limit = 250 }) {
  const bounds = [];
  if (min != null) bounds.push(`?attr >= ${min}`);
  if (max != null) bounds.push(`?attr <= ${max}`);
  const filter = bounds.length ? `FILTER(${bounds.join(" && ")})` : "";
  const rows = await sparql(`
    SELECT ?x ?xLabel ?attr ?photo ?lat ?lon ?countyLabel WHERE {
      ?x wdt:P31 wd:${type} ; wdt:P17 wd:Q20 .
      ?x wdt:${attr} ?attr .
      ${filter}
      OPTIONAL { ?x wdt:P18 ?photo }
      OPTIONAL { ?x p:P625 ?coordStmt . ?coordStmt psv:P625 ?coordNode .
                 ?coordNode wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
      OPTIONAL { ?x wdt:P131* ?county . ?county wdt:P31 wd:Q192299 .
                 FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
      ${LABEL}
    }
    ORDER BY DESC(?attr)
    LIMIT ${limit}`);
  const map = new Map();
  for (const b of rows) {
    const id = qid(b, "x");
    const name = val(b, "xLabel");
    if (!name || /^Q\d+$/.test(name)) continue;
    if (!map.has(id))
      map.set(id, {
        id,
        name,
        [attrName]: num(b, "attr"),
        photo: imgUrl(val(b, "photo"), 1024),
        lat: num(b, "lat"),
        lon: num(b, "lon"),
        county: normCounty(val(b, "countyLabel")),
      });
    else {
      const e = map.get(id);
      if (!e.photo && val(b, "photo")) e.photo = imgUrl(val(b, "photo"), 1024);
      if (!e.county && val(b, "countyLabel")) e.county = normCounty(val(b, "countyLabel"));
    }
  }
  return [...map.values()];
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const tasks = [
    ["kommuner", municipalities],
    ["fylker", counties],
    ["fjell", () => features({ type: "Q8502", attr: "P2044", attrName: "elevation", min: 1000, max: 2470, limit: 500 })],
    ["elver", () => features({ type: "Q4022", attr: "P2043", attrName: "length", min: 10, max: 650, limit: 350 })],
    ["innsjoer", () => features({ type: "Q23397", attr: "P2046", attrName: "area", min: 1.5, max: 400, limit: 350 })],
    ["fjorder", () => features({ type: "Q45776", attr: "P2043", attrName: "length", min: 2, max: 220, limit: 300 })],
    ["oyer", () => features({ type: "Q23442", attr: "P2046", attrName: "area", min: 1.5, max: 40000, limit: 350 })],
    ["fossefall", () => features({ type: "Q34038", attr: "P2048", attrName: "height", min: 20, max: 900, limit: 250 })],
    // Glaciers + tunnels are NOT fetched here — Wikidata covers them badly
    // (Svalbard-only glaciers; wrong tunnel entity type). They are curated from
    // Wikipedia in scripts/curate-extra.mjs, which also patches in Sognefjorden.
  ];
  const only = process.argv.slice(2);
  const selected = only.length ? tasks.filter(([name]) => only.includes(name)) : tasks;
  const summary = {};
  for (const [name, fn] of selected) {
    process.stdout.write(`Fetching ${name}... `);
    try {
      const data = await fn();
      await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
      summary[name] = data.length;
      console.log(`${data.length} ✓`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      summary[name] = `ERROR: ${err.message}`;
    }
    await sleep(1200);
  }
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
