// Produces src/data/verdensarv.json — the 8 UNESCO World Heritage sites in Norway.
//
// Data sources (in priority order):
//   1. Wikidata SPARQL: coords (P625), image (P18), P1435/P580 inscription year, county
//   2. Norwegian Wikipedia article "Verdensarven i Norge" for year cross-check
//
// The 8 Norwegian UNESCO sites and their Wikidata QIDs:
//   Q153430  Bryggen i Bergen             (1979)
//   Q210678  Urnes stavkirke              (1979)
//   Q19387263 Røros bergstad og Circumferensen (1980)
//   Q433634  Helleristningene i Alta      (1985)
//   Q829084  Vegaøyane                    (2004)
//   Q192243  Struves meridianbue          (2005)  — transnational; Norwegian point Meridianstøtten used
//   Q12269990 Vestnorsk fjordlandskap     (2005)  — Geirangerfjorden component used for coords/photo
//   Q20643889 Rjukan–Notodden industriarv (2015)
//
// Run: node scripts/curate-verdensarv.mjs

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "verdensarv.json");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const WIKI_API = "https://no.wikipedia.org/w/api.php";

// The 8 Norwegian UNESCO sites with their Wikidata QIDs and canonical names.
const SITES = [
  { qid: "Q153430",   id: "bryggen-i-bergen",                 name: "Bryggen i Bergen" },
  { qid: "Q210678",   id: "urnes-stavkirke",                  name: "Urnes stavkirke" },
  { qid: "Q19387263", id: "roros-bergstad-og-circumferensen", name: "Røros bergstad og Circumferensen" },
  { qid: "Q433634",   id: "helleristningene-i-alta",          name: "Helleristningene i Alta" },
  { qid: "Q829084",   id: "vegaoyan",                         name: "Vegaøyan" },
  { qid: "Q192243",   id: "struves-meridianbue",              name: "Struves meridianbue" },
  { qid: "Q12269990", id: "vestnorsk-fjordlandskap",          name: "Vestnorsk fjordlandskap" },
  { qid: "Q20643889", id: "rjukan-notodden-industriarv",      name: "Rjukan–Notodden industriarv" },
];

// For transnational or multi-component sites, use a specific sub-item for coords/photo.
// Struves meridianbue → Meridianstøtten in Hammerfest (northernmost Norwegian point)
// Vestnorsk fjordlandskap → Geirangerfjorden component
const COMPONENT_OVERRIDES = {
  Q192243:  { qid: "Q64520669", note: "Meridianstøtten i Hammerfest (nordlegaste norske punkt)" },
  Q12269990: { qid: "Q193989",  note: "Geirangerfjorden-komponenten" },
};

// Notes written per site (Norwegian bokmål, one sentence).
const NOTES = {
  "bryggen-i-bergen":                "Hansatiden sine trehus ved Vågen i Bergen, ein av dei eldste handelshamnene i Nord-Europa",
  "urnes-stavkirke":                 "Stavkirke frå kring 1130 ved Lustrafjorden, eitt av dei fremste døma på mellomaldersk trearkitektur i Noreg",
  "roros-bergstad-og-circumferensen":"Bergstad grunnlagt på 1600-talet med rundt 2000 trehus og smelteverk, og det tilhøyrande gruveområdet Circumferensen",
  "helleristningene-i-alta":         "Nord-Europas største samling av helleristningar og hellemålarier, med over 5000 dokumenterte figurar frå steinalderen",
  "vegaoyan":                        "Øygruppe like sør for polarsirkelen med kulturlandskap som vitnar om tusenårig kysttradisjon med ærfugldrift",
  "struves-meridianbue":             "Kjede av geodetiske målepunkt frå Hammerfest til Svartehavet gjennom ti land, eit vitnesbyrd om tidleg verdsmåling",
  "vestnorsk-fjordlandskap":         "Noregs einaste naturoppføring på verdsarvlista, omfattar Geirangerfjorden og Nærøyfjorden",
  "rjukan-notodden-industriarv":     "Industriell kulturarv knytt til produksjon av kunstgjødsel ved Vemork kraftverk og Notodden frå tidleg 1900-tal",
};

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
      const wait = 2000 * attempt;
      console.warn(`  retry ${attempt} after error: ${err.message} (waiting ${wait}ms)`);
      await sleep(wait);
      return sparql(query, attempt + 1);
    }
    throw err;
  }
}

function val(b, k) { return b[k]?.value; }
function num(b, k) { return b[k] ? Number(b[k].value) : undefined; }

function imgUrl(raw) {
  if (!raw) return undefined;
  let u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=1024`;
}

// Fetch coords, photo, county for a list of QIDs in one SPARQL call.
async function fetchDetails(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const rows = await sparql(`
    SELECT ?item ?photo ?lat ?lon ?countyLabel WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P18 ?photo }
      OPTIONAL { ?item p:P625 ?cs . ?cs psv:P625 ?cn .
                 ?cn wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
      OPTIONAL { ?item wdt:P131* ?county . ?county wdt:P31 wd:Q192299 .
                 FILTER NOT EXISTS { ?county wdt:P576 ?cd } }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,no,en". }
    }`);

  const map = {};
  for (const b of rows) {
    const qid = val(b, "item").split("/").pop();
    if (!map[qid]) map[qid] = { photo: undefined, lat: undefined, lon: undefined, county: undefined };
    const e = map[qid];
    if (!e.photo && val(b, "photo")) e.photo = imgUrl(val(b, "photo"));
    if (e.lat == null && num(b, "lat") != null) { e.lat = num(b, "lat"); e.lon = num(b, "lon"); }
    if (!e.county && val(b, "countyLabel")) e.county = val(b, "countyLabel");
  }
  return map;
}

// Fetch UNESCO inscription years via P1435 qualifier P580 (start time).
// Falls back to P571 (inception) only if P580 is absent.
async function fetchYears(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const rows = await sparql(`
    SELECT ?item ?p580 ?p571 WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item p:P1435 ?wh . ?wh pq:P580 ?p580 }
      OPTIONAL { ?item wdt:P571 ?p571 }
    }`);

  const map = {};
  for (const b of rows) {
    const qid = val(b, "item").split("/").pop();
    if (!map[qid]) map[qid] = { p580: undefined, p571: undefined };
    if (!map[qid].p580 && val(b, "p580")) map[qid].p580 = Number(val(b, "p580").substring(0, 4));
    if (!map[qid].p571 && val(b, "p571")) map[qid].p571 = Number(val(b, "p571").substring(0, 4));
  }
  return map;
}

// Cross-check years from the Norwegian Wikipedia article.
async function fetchWikiYears() {
  const url =
    `${WIKI_API}?action=parse&prop=text&format=json` +
    `&page=${encodeURIComponent("Verdensarven i Norge")}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const html = (await res.json()).parse.text["*"];

  // Extract rows from the main table: each <tr> that starts with a 4-digit year cell.
  const wikiYears = {};
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    );
    if (!cells.length) continue;
    const yearMatch = cells[0]?.match(/^(\d{4})$/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);
    const name = cells[1] || "";
    wikiYears[name.substring(0, 30)] = year; // key by first 30 chars of name
  }
  return wikiYears;
}

async function main() {
  const allQids = SITES.map((s) => s.qid);
  const componentQids = Object.values(COMPONENT_OVERRIDES).map((c) => c.qid);

  console.log("Fetching Wikidata: site details...");
  const details = await fetchDetails(allQids);
  await sleep(1200);

  console.log("Fetching Wikidata: component overrides...");
  const componentDetails = await fetchDetails(componentQids);
  await sleep(1200);

  console.log("Fetching Wikidata: inscription years...");
  const years = await fetchYears(allQids);
  await sleep(1200);

  console.log("Fetching Wikipedia: year cross-check...");
  const wikiYears = await fetchWikiYears();
  console.log("Wikipedia years found:", wikiYears);

  const result = [];
  for (const site of SITES) {
    const d = details[site.qid] || {};
    const y = years[site.qid] || {};

    // For sites with component overrides, prefer the component's coords/photo/county.
    const override = COMPONENT_OVERRIDES[site.qid];
    const comp = override ? componentDetails[override.qid] || {} : {};

    const lat  = comp.lat  ?? d.lat;
    const lon  = comp.lon  ?? d.lon;
    const photo = comp.photo ?? d.photo;
    const county = comp.county ?? d.county;

    // Inscription year: P1435/P580 is authoritative; Wikipedia is a cross-check.
    const year = y.p580 ?? null;

    const entry = {
      id:     site.id,
      name:   site.name,
      year,
      county: county ?? null,
      lat:    lat    ?? null,
      lon:    lon    ?? null,
      photo:  photo  ?? null,
      note:   NOTES[site.id],
    };
    result.push(entry);

    const coverage = ["year", "county", "lat", "lon", "photo"].map((f) =>
      entry[f] != null ? f : `!${f}`
    );
    console.log(`  ${site.name} (${site.qid}): ${coverage.join(" ")}`);
  }

  // Cross-check years against Wikipedia.
  let mismatch = 0;
  for (const entry of result) {
    const wKey = Object.keys(wikiYears).find((k) =>
      entry.name.toLowerCase().startsWith(k.substring(0, 10).toLowerCase())
    );
    if (wKey && wikiYears[wKey] !== entry.year) {
      console.warn(
        `  YEAR MISMATCH: ${entry.name}: Wikidata=${entry.year} Wikipedia=${wikiYears[wKey]}`
      );
      mismatch++;
    }
  }
  if (!mismatch) console.log("Year cross-check: all match.");

  await writeFile(OUT, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${result.length} entries to ${OUT}`);

  // Field coverage summary.
  const fields = ["year", "county", "lat", "lon", "photo"];
  console.log("Field coverage:");
  for (const f of fields) {
    const n = result.filter((e) => e[f] != null).length;
    console.log(`  ${f}: ${n}/${result.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
