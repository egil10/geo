// Fetch extra categories from Wikidata: byer (cities), jernbanestasjoner
// (train stations), lufthavner (airports) and jernbanelinjer (railway lines).
// Writes src/data/{byer,jernbanestasjoner,lufthavner,jernbanelinjer}.json.
// Run: node scripts/fetch-extra.mjs
import { writeFile } from "node:fs/promises";

const WD = "https://query.wikidata.org/sparql";
const UA = "NorgesQuiz/1.0 (egilfure@gmail.com)";

async function sparql(query) {
  const url = `${WD}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
  if (!res.ok) throw new Error(`SPARQL ${res.status}`);
  return (await res.json()).results.bindings;
}

const qid = (r) => r.item.value.split("/").pop();
const photo = (r) => (r.image ? r.image.value.replace(/^http:/, "https:") + "?width=1024" : undefined);
const num = (r, k) => (r[k] ? Number(r[k].value) : undefined);
const cleanCounty = (s) => (s ? s.replace(/\s+kommune$/i, "").trim() : undefined);
const round5 = (v) => (v == null ? undefined : Math.round(v * 1e5) / 1e5);

// Keep the highest-population / first row per item (queries can return dupes).
function dedupe(rows) {
  const by = new Map();
  for (const r of rows) {
    const id = qid(r);
    const prev = by.get(id);
    if (!prev || (num(r, "pop") ?? 0) > (num(prev, "pop") ?? 0)) by.set(id, r);
  }
  return [...by.values()];
}

async function byer() {
  const rows = await sparql(`SELECT ?item ?itemLabel ?pop ?lat ?lon ?image (SAMPLE(?fl) AS ?fylke) WHERE {
    VALUES ?cls { wd:Q3957 wd:Q515 wd:Q5119 wd:Q1549591 wd:Q1361049 }
    ?item wdt:P31 ?cls ; wdt:P17 wd:Q20 .
    OPTIONAL { ?item wdt:P1082 ?pop }
    OPTIONAL { ?item p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] }
    OPTIONAL { ?item wdt:P131* ?fy. ?fy wdt:P31 wd:Q192299. ?fy rdfs:label ?fl. FILTER(LANG(?fl)="nb") }
    OPTIONAL { ?item wdt:P18 ?image }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en" }
  } GROUP BY ?item ?itemLabel ?pop ?lat ?lon ?image ORDER BY DESC(?pop)`);
  return dedupe(rows)
    .filter((r) => r.lat && r.itemLabel)
    .map((r) => ({
      id: qid(r),
      name: r.itemLabel.value,
      population: num(r, "pop"),
      lat: round5(num(r, "lat")),
      lon: round5(num(r, "lon")),
      county: cleanCounty(r.fylke?.value) || (r.itemLabel.value === "Oslo" ? "Oslo" : undefined),
      photo: photo(r),
    }));
}

async function stasjoner() {
  const rows = await sparql(`SELECT ?item ?itemLabel ?lat ?lon ?image (SAMPLE(?ll) AS ?line) (SAMPLE(?fl) AS ?fylke) WHERE {
    ?item wdt:P31 wd:Q55488 ; wdt:P17 wd:Q20 .
    OPTIONAL { ?item p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] }
    OPTIONAL { ?item wdt:P18 ?image }
    OPTIONAL { ?item wdt:P81 ?l. ?l rdfs:label ?ll. FILTER(LANG(?ll)="nb") }
    OPTIONAL { ?item wdt:P131* ?fy. ?fy wdt:P31 wd:Q192299. ?fy rdfs:label ?fl. FILTER(LANG(?fl)="nb") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en" }
  } GROUP BY ?item ?itemLabel ?lat ?lon ?image`);
  return dedupe(rows)
    .filter((r) => r.lat && r.image && r.itemLabel) // images = the notable stations
    .map((r) => ({
      id: qid(r),
      name: r.itemLabel.value,
      lat: round5(num(r, "lat")),
      lon: round5(num(r, "lon")),
      county: cleanCounty(r.fylke?.value),
      line: r.line?.value,
      photo: photo(r),
    }));
}

async function lufthavner() {
  const rows = await sparql(`SELECT ?item ?itemLabel ?lat ?lon ?image ?iata (SAMPLE(?fl) AS ?fylke) WHERE {
    ?item wdt:P31/wdt:P279* wd:Q1248784 ; wdt:P17 wd:Q20 .
    OPTIONAL { ?item p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] }
    OPTIONAL { ?item wdt:P18 ?image }
    OPTIONAL { ?item wdt:P238 ?iata }
    OPTIONAL { ?item wdt:P131* ?fy. ?fy wdt:P31 wd:Q192299. ?fy rdfs:label ?fl. FILTER(LANG(?fl)="nb") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en" }
  } GROUP BY ?item ?itemLabel ?lat ?lon ?image ?iata`);
  return dedupe(rows)
    .filter((r) => r.lat && r.itemLabel && (r.iata || r.image)) // real airports
    .map((r) => ({
      id: qid(r),
      name: r.itemLabel.value,
      lat: round5(num(r, "lat")),
      lon: round5(num(r, "lon")),
      county: cleanCounty(r.fylke?.value),
      iata: r.iata?.value,
      photo: photo(r),
    }));
}

async function linjer() {
  const rows = await sparql(`SELECT ?item ?itemLabel ?len ?image WHERE {
    ?item wdt:P31/wdt:P279* wd:Q728937 ; wdt:P17 wd:Q20 .
    ?item wdt:P2043 ?len .
    OPTIONAL { ?item wdt:P18 ?image }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en" }
  } ORDER BY DESC(?len)`);
  return dedupe(rows)
    .filter((r) => r.itemLabel && !/railway line|line$/i.test(r.itemLabel.value)) // prefer Norwegian "…banen"
    .map((r) => ({ id: qid(r), name: r.itemLabel.value, length: Math.round(num(r, "len")), photo: photo(r) }));
}

async function main() {
  const jobs = [
    ["byer", byer],
    ["jernbanestasjoner", stasjoner],
    ["lufthavner", lufthavner],
    ["jernbanelinjer", linjer],
  ];
  for (const [name, fn] of jobs) {
    const data = await fn();
    await writeFile(`src/data/${name}.json`, JSON.stringify(data, null, 0));
    console.log(`${name}: ${data.length} (coords ${data.filter((d) => d.lat != null).length}, photo ${data.filter((d) => d.photo).length}, county ${data.filter((d) => d.county).length})`);
  }
}
main();
