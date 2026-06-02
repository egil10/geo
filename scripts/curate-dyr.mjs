// Builds src/data/dyr.json — wild mammals of Norway.
//
// Source: Norwegian Wikipedia "Liste over pattedyr i Norge" (wikitext via API)
// Images: Wikidata SPARQL (P225 taxon name → P18 image)
//
// Run: node scripts/curate-dyr.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "dyr.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const SPARQL = "https://query.wikidata.org/sparql";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- helpers -----------------------------------------------------------------

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFC")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function imgUrl(raw) {
  if (!raw) return undefined;
  const u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=1024`;
}

// --- Wikipedia wikitext fetch ------------------------------------------------

async function fetchWikitext(title) {
  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  return json.parse.wikitext["*"];
}

// --- Wikidata SPARQL for images -----------------------------------------------

async function fetchImages(latinNames, attempt = 1) {
  const values = latinNames.map((n) => `"${n}"`).join(" ");
  const query = `
    SELECT ?item ?latinName ?img WHERE {
      VALUES ?latinName { ${values} }
      ?item wdt:P225 ?latinName .
      OPTIONAL { ?item wdt:P18 ?img }
    }`;
  const url = `${SPARQL}?query=${encodeURIComponent(query)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
    const json = await res.json();
    // Build map: latin -> first image URL (prefer .jpg/.png over .svg)
    const map = new Map();
    for (const b of json.results.bindings) {
      const name = b.latinName.value;
      const raw = b.img?.value;
      if (!raw) continue;
      if (!map.has(name)) {
        map.set(name, raw);
      } else {
        // Prefer photo over illustration/svg
        const cur = map.get(name);
        const isPhoto = (u) => /\.(jpg|jpeg|png)/i.test(u);
        if (isPhoto(raw) && !isPhoto(cur)) map.set(name, raw);
      }
    }
    return map;
  } catch (err) {
    if (attempt <= 3) {
      const wait = 2000 * attempt;
      console.warn(`  SPARQL retry ${attempt}: ${err.message} (wait ${wait}ms)`);
      await sleep(wait);
      return fetchImages(latinNames, attempt + 1);
    }
    throw err;
  }
}

// --- Parse wikitext ----------------------------------------------------------
//
// The article structure:
//   == ORDER == section headers (e.g. "Insektetere", "Flaggermus")
//   ! FAMILY header rows inside wikitables
//   | Species rows: [[Norwegian name]] \n ''Latin name''
//   Bestand column: population/red-list note

function parseWikitext(wt) {
  const species = [];

  // Extract order from section headers
  let currentOrder = "";
  let currentFamily = "";

  // Map section header text → Norwegian order name
  const ORDER_MAP = {
    Insektetere: "Insektetere",
    Flaggermus: "Flaggermus",
    Klovdyr: "Klovdyr",
    Hvaler: "Hvaler",
    Rovpattedyr: "Rovpattedyr",
    Seler: "Seler",
    Haredyr: "Haredyr",
    Gnagere: "Gnagere",
  };

  // We process line by line
  const lines = wt.split("\n");
  let inTable = false;
  // Each wikitable row is separated by "|-"
  // Data rows start with "| [[Name]]"
  // Family header rows start with "! [[FamilyName]]"
  // We collect multi-line cells by accumulating until next | or |-

  let rowCells = [];
  let collectingRow = false;

  function finishRow() {
    if (!collectingRow || rowCells.length === 0) return;
    collectingRow = false;
    // rowCells[0] = Norwegian name + Latin, rowCells[3] = Bestand (index 3)
    const cell0 = rowCells[0] || "";
    // Skip family header rows (start with !)
    if (cell0.trim().startsWith("!")) {
      rowCells = [];
      return;
    }
    // Extract Norwegian name from [[link]] or plain text
    const nameMatch = cell0.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    if (!nameMatch) { rowCells = []; return; }
    const norName = nameMatch[1].trim();

    // Extract Latin name from ''...''
    const latinMatch = cell0.match(/''+([A-Z][a-z]+ [a-z]+(?:\s+[a-z]+)?)''+/);
    if (!latinMatch) { rowCells = []; return; }
    const latin = latinMatch[1].trim();

    // Status: cell index 3 (Bestand), strip wikilinks
    const bestand = (rowCells[3] || "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/[<][^>]+>/g, "").replace(/\s+/g, " ").trim();
    // Abbreviate status
    let status = undefined;
    if (bestand) {
      if (/Kritisk truet/i.test(bestand)) status = "Rødlistet: Kritisk truet";
      else if (/Sterkt truet/i.test(bestand)) status = "Rødlistet: Sterkt truet";
      else if (/Sårbar/i.test(bestand)) status = "Rødlistet: Sårbar";
      else if (/Hensynskrevende/i.test(bestand)) status = "Rødlistet: Hensynskrevende";
      else if (/Nær truet/i.test(bestand)) status = "Rødlistet: Nær truet";
      else if (/rødeliste/i.test(bestand) && /manglende data/i.test(bestand)) status = "Rødlistet: Manglende data";
      else if (/Tallrik/i.test(bestand)) status = "Tallrik";
      else if (/Vanlig/i.test(bestand)) status = "Vanlig";
      else if (/Sjelden/i.test(bestand)) status = "Sjelden";
      else if (/Utryddet/i.test(bestand)) status = "Utryddet i Norge";
      else if (/Svartelistet/i.test(bestand)) status = "Svartelistet";
    }

    species.push({
      name: norName,
      latin,
      family: currentFamily,
      order: currentOrder,
      status,
    });
    rowCells = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section headers == ORDER ==
    const orderMatch = line.match(/^==\s*\[\[?([^\]|=]+?)(?:\s*\(dyr\))?\]?\]?\s*\(([^)]+)\)\s*==/);
    if (orderMatch) {
      finishRow();
      const raw = orderMatch[1].trim();
      currentOrder = ORDER_MAP[raw] || raw;
      inTable = false;
      rowCells = [];
      continue;
    }
    // Also match simpler === Seler === subsection
    const subMatch = line.match(/^===?\s*\[\[?([^\]=]+)\]?\]?\s*\([^)]+\)\s*===?/);
    if (subMatch) {
      finishRow();
      const raw = subMatch[1].trim();
      if (ORDER_MAP[raw]) currentOrder = ORDER_MAP[raw];
      continue;
    }

    // Table start/end
    if (line.startsWith("{|")) { inTable = true; continue; }
    if (line.startsWith("|}")) { finishRow(); inTable = false; rowCells = []; collectingRow = false; continue; }
    if (!inTable) continue;

    // Family header row  "! [[FamilyName]] \n (ScientificName)"
    if (line.startsWith("!")) {
      finishRow();
      const famMatch = line.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
      if (famMatch) currentFamily = famMatch[1].trim();
      // Skip sub-headers that are just column labels (Utbredelse etc.)
      continue;
    }

    // Row separator
    if (line.startsWith("|-")) {
      finishRow();
      collectingRow = false;
      rowCells = [];
      continue;
    }

    // Data cell line starting with "|"
    if (line.startsWith("|") && !line.startsWith("|}")) {
      // Could be "| cell1 || cell2 || ..." on one line, or multi-line
      // Multi-cell on one line? Split on " || "
      const rest = line.slice(1); // remove leading |
      if (rest.includes("||")) {
        finishRow();
        rowCells = rest.split("||").map((c) => c.trim());
        collectingRow = true;
        finishRow(); // immediately commit (single-line row)
      } else {
        // This is the first cell of a new row (multi-line)
        finishRow();
        rowCells = [rest.trim()];
        collectingRow = true;
      }
      continue;
    }

    // Continuation of current cell (append to last cell)
    if (collectingRow && rowCells.length > 0) {
      rowCells[rowCells.length - 1] += " " + line.trim();
    }
  }
  finishRow();

  return species;
}

// --- Main --------------------------------------------------------------------

async function main() {
  console.log("Fetching Wikipedia wikitext...");
  const wt = await fetchWikitext("Liste over pattedyr i Norge");
  await sleep(500);

  console.log("Parsing species...");
  const parsed = parseWikitext(wt);
  // Dedupe by latin name (some rows appear twice due to parse quirks)
  const seen = new Set();
  const unique = parsed.filter((s) => {
    if (seen.has(s.latin)) return false;
    seen.add(s.latin);
    return true;
  });
  console.log(`  Found ${unique.length} species`);

  // Batch SPARQL image queries (max ~20 per request)
  const BATCH = 20;
  const latinNames = unique.map((s) => s.latin);
  const imgMap = new Map();
  for (let i = 0; i < latinNames.length; i += BATCH) {
    const batch = latinNames.slice(i, i + BATCH);
    console.log(`  Fetching images batch ${Math.floor(i / BATCH) + 1}...`);
    const batchMap = await fetchImages(batch);
    for (const [k, v] of batchMap) imgMap.set(k, v);
    await sleep(1200);
  }

  // Build final records
  const data = unique.map((s) => {
    const raw = imgMap.get(s.latin);
    const entry = {
      id: `dyr-${slug(s.name)}`,
      name: s.name,
      latin: s.latin,
      family: s.family,
      order: s.order,
    };
    if (s.status) entry.status = s.status;
    if (raw) entry.photo = imgUrl(raw);
    return entry;
  });

  // Stats
  const byOrder = {};
  for (const d of data) byOrder[d.order] = (byOrder[d.order] || 0) + 1;
  const withPhoto = data.filter((d) => d.photo).length;
  console.log(`\nTotal: ${data.length} species`);
  console.log("By order:", JSON.stringify(byOrder, null, 2));
  console.log(`Photos: ${withPhoto}/${data.length}`);

  await writeFile(OUT, JSON.stringify(data, null, 2));
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
