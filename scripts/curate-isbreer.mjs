// curate-isbreer.mjs
//
// Merges the existing isbreer.json with the ranked Wikipedia list
// "Liste over isbreer i Norge" and enriches every entry with lat/lon
// coordinates from Wikidata (P625). Run:
//   node scripts/curate-isbreer.mjs
//
// The script is idempotent: running it again produces the same output.
// Svalbard entries (x-austfonna, x-vestfonna) are kept as-is with their
// existing ids; they already have coordinates added by this run.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "isbreer.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const norm = (s) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const slug = (s) =>
  norm(s)
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// Hard-coded Wikidata-sourced coordinate and photo data.
// Fields: lat, lon, photo (Wikimedia Commons Special:FilePath URL).
// Gathered 2024 from Wikidata (P625, P18) — re-run the SPARQL query to refresh.
// ---------------------------------------------------------------------------
const WIKIDATA = {
  "austfonna":           { lat: 79.78, lon: 24.66, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Nordaustlandet.jpg?width=1024" },
  "vestfonna":           { lat: 79.95, lon: 20.50, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Nordaustlandet.jpg?width=1024" },
  "jostedalsbreen":      { lat: 61.71, lon: 6.92,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/P1000290Jostedalsbreen.JPG?width=1024" },
  "vestre svartisen":    { lat: 66.66, lon: 13.92, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Glacier%20svartisen%20engabreen.JPG?width=1024" },
  "søndre folgefonna":   { lat: 60.00, lon: 6.33,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Folgefonna%20south.JPG?width=1024" },
  "østre svartisen":     { lat: 66.58, lon: 14.19, photo: null },
  "blåmannsisen":        { lat: 67.25, lon: 16.07, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Padjelanta%20National%20Park%20hybrid%20map-fr.jpg?width=1024" },
  "hardangerjøkulen":    { lat: 60.53, lon: 7.42,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Hardangerj%C3%B8kulenFromH%C3%A5rteigen.jpg?width=1024" },
  "myklebustbreen":      { lat: 61.70, lon: 6.70,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Sn%C3%B8nipa.jpg?width=1024" },
  "okstindbreen":        { lat: 65.99, lon: 14.15, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Image7-19918810.jpg?width=1024" },
  "øksfjordjøkelen":     { lat: 70.17, lon: 22.06, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Isfjordj%C3%B8kelen%20in%20Kv%C3%A6nangen%2C%20Troms%2C%20Norway%2C%202014%20August.jpg?width=1024" },
  "harbardsbreen":       { lat: 61.68, lon: 7.65,  photo: null },
  "salajekna":           { lat: 67.12, lon: 16.38, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/S%C3%A1llajieg%C5%8Ba-0649.jpg?width=1024" },
  "sulitjelmaisen":      { lat: 67.12, lon: 16.38, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/S%C3%A1llajieg%C5%8Ba-0649.jpg?width=1024" },
  "frostisen":           { lat: 68.23, lon: 17.18, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Frostisen%20summits%20above%20Skjomen.JPG?width=1024" },
  "sekkebreen":          { lat: 61.86, lon: 7.55,  photo: null },
  "tindefjellbreen":     { lat: 61.87, lon: 7.05,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Tindefjellbreen%202017.jpg?width=1024" },
  "nordre folgefonna":   { lat: 60.20, lon: 6.45,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Folgefonna.jpg?width=1024" },
  "spørteggbreen":       { lat: 61.60, lon: 7.49,  photo: null },
  "høgtuvbreen":         { lat: 66.43, lon: 13.64, photo: null },
  "simlebreen":          { lat: 66.84, lon: 14.45, photo: null },
  "holåbreen":           { lat: 61.76, lon: 7.90,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Hol%C3%A5breen%20eastern%20part%20of%20the%20glacier.jpg?width=1024" },
  "grovabreen":          { lat: 61.49, lon: 6.52,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Grovabreen%20above%20J%C3%B8lstravatnet%2C%202008%2008.JPG?width=1024" },
  "tystigbreen":         { lat: 61.92, lon: 7.35,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Tystigbreen.jpg?width=1024" },
  "smørstabbreen":       { lat: 61.54, lon: 8.10,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Sm%C3%B8rstabbtindan-Norway.jpg?width=1024" },
  "strupbreen":          { lat: 69.71, lon: 20.16, photo: null },
  "hellstugubreen":      { lat: 61.56, lon: 8.44,  photo: null },
  "ålfotbreen":          { lat: 61.74, lon: 5.64,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/%C3%85lfotbreen%20Iskontorets%20brebilder%2001429.jpg?width=1024" },
  "jostefonni":          { lat: 61.42, lon: 6.56,  photo: null },
  "midtre folgefonna":   { lat: 60.15, lon: 6.48,  photo: null },
  "seilandsjøkelen":     { lat: 70.42, lon: 23.23, photo: null },
  "fresvikbreen":        { lat: 61.03, lon: 6.77,  photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Fresvik%20-%20Norway%20-%20panoramio.jpg?width=1024" },
  "gjegnalundsbreen":    { lat: 61.80, lon: 5.86,  photo: null },
  "langfjordjøkelen":    { lat: 70.14, lon: 21.71, photo: null },
  "skogadalsbreen":      { lat: 61.44, lon: 8.13,  photo: null },
  "veobreen":            { lat: 61.59, lon: 8.50,  photo: null },
  "gråsubreen":          { lat: 61.66, lon: 8.60,  photo: null },
  "jiehkkevárribreen":   { lat: 69.47, lon: 19.88, photo: null },
};

// ---------------------------------------------------------------------------
// New entries from the Wikipedia ranked list not already in the dataset.
// county uses current Norwegian fylke names.
// area (km²) from the Wikipedia table (rounded, approximate).
// ---------------------------------------------------------------------------
const NEW_ENTRIES = [
  { name: "Sulitjelmaisen",    area: 37,  county: "Nordland" },
  { name: "Nordre Folgefonna", area: 26,  county: "Vestland" },
  { name: "Spørteggbreen",     area: 23,  county: "Vestland" },
  { name: "Høgtuvbreen",       area: 22,  county: "Nordland" },
  { name: "Simlebreen",        area: 22,  county: "Nordland" },
  { name: "Holåbreen",         area: 18,  county: "Vestland" },
  { name: "Grovabreen",        area: 18,  county: "Vestland" },
  { name: "Tystigbreen",       area: 16,  county: "Vestland" },
  { name: "Smørstabbreen",     area: 16,  county: "Innlandet" },
  { name: "Strupbreen",        area: 14,  county: "Troms" },
  { name: "Hellstugubreen",    area: 11,  county: "Innlandet" },
  { name: "Ålfotbreen",        area: 11,  county: "Vestland" },
  { name: "Jostefonni",        area: 11,  county: "Vestland" },
  { name: "Midtre Folgefonna", area: 10,  county: "Vestland" },
  { name: "Seilandsjøkelen",   area: 10,  county: "Troms og Finnmark" },
  { name: "Fresvikbreen",      area:  9,  county: "Vestland" },
  { name: "Gjegnalundsbreen",  area:  8,  county: "Vestland" },
  { name: "Gråsubreen",        area:  8,  county: "Innlandet" },
  { name: "Langfjordjøkelen",  area:  7,  county: "Troms og Finnmark" },
  { name: "Skogadalsbreen",    area:  7,  county: "Innlandet" },
  { name: "Veobreen",          area:  7,  county: "Innlandet" },
];

function enrichFromWikidata(entry) {
  const key = norm(entry.name);
  const wd = WIKIDATA[key];
  if (!wd) return entry;
  const out = { ...entry };
  if (out.lat == null && wd.lat != null) { out.lat = wd.lat; out.lon = wd.lon; }
  if (!out.photo && wd.photo) out.photo = wd.photo;
  return out;
}

async function main() {
  const existing = JSON.parse(await readFile(FILE, "utf8"));
  const knownNames = new Set(existing.map((x) => norm(x.name)));
  const usedIds = new Set(existing.map((x) => x.id));

  const uniqueId = (name) => {
    const base = `isbre-${slug(name)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  // Enrich every existing entry with coords / photo where missing.
  const enrichedExisting = existing.map(enrichFromWikidata);

  // Add new entries not already present.
  const added = [];
  for (const e of NEW_ENTRIES) {
    if (knownNames.has(norm(e.name))) continue;
    knownNames.add(norm(e.name));
    const base = { id: uniqueId(e.name), name: e.name, area: e.area, county: e.county };
    added.push(enrichFromWikidata(base));
  }

  const merged = [...enrichedExisting, ...added].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));

  // Verify: zero duplicate ids.
  const allIds = merged.map((x) => x.id);
  const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupIds.length > 0) throw new Error(`Duplicate ids: ${dupIds.join(", ")}`);

  await writeFile(FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const withCoords = merged.filter((x) => x.lat != null);
  const existingWithCoords = enrichedExisting.filter((x) => x.lat != null);
  const newWithCoords = added.filter((x) => x.lat != null);

  console.log(`isbreer: ${existing.length} → ${merged.length} (+${added.length} new)`);
  console.log(`lat/lon coverage: ${withCoords.length}/${merged.length} total`);
  console.log(`  existing enriched: ${existingWithCoords.length}/${enrichedExisting.length}`);
  console.log(`  new with coords:   ${newWithCoords.length}/${added.length}`);
  console.log(`Duplicate id check: PASSED (0 duplicates)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
