// Generates distrikter.json and landsdeler.json from Wikipedia "Distrikter i Norge".
// The main table is rowspan-heavy: Fylke and Landsdel columns repeat down groups
// and are only written on the first row -- this parser carries rowspanned values down.
// Run:  node scripts/curate-distrikter.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DISTRIKTER = join(__dirname, "..", "src", "data", "distrikter.json");
const OUT_LANDSDELER = join(__dirname, "..", "src", "data", "landsdeler.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const TITLE = "Distrikter i Norge";

const stripTags = (s) =>
  (s || "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#160;|&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Parse a number: handles Norwegian thousand separators (space/NBSP) and decimal comma.
const parseNum = (s) => {
  if (!s || !s.trim()) return null;
  const cleaned = s.replace(/ |\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

// Rowspan-aware parser for an HTML table with NC columns.
// Returns array of row arrays, each NC strings (stripped).
function parseTable(tableHtml, NC) {
  const rows = [];
  const trs = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const carry = {};

  for (const tr of trs) {
    const cells = [...tr.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((m) => ({
      attr: m[1],
      html: m[2],
    }));
    if (!cells.length) continue;

    const out = new Array(NC).fill("");
    let col = 0;
    let pc = 0;

    while (col < NC) {
      if (carry[col] && carry[col].rows > 0) {
        out[col] = carry[col].val;
        carry[col].rows--;
        col++;
        continue;
      }
      if (pc < cells.length) {
        const c = cells[pc++];
        const rs = parseInt((c.attr.match(/rowspan="?(\d+)/i) || [])[1] || "1", 10);
        const cs = parseInt((c.attr.match(/colspan="?(\d+)/i) || [])[1] || "1", 10);
        const val = stripTags(c.html);
        for (let k = 0; k < cs && col + k < NC; k++) {
          out[col + k] = val;
          if (rs > 1) carry[col + k] = { val, rows: rs - 1 };
        }
        col += cs;
      } else {
        col++;
      }
    }
    rows.push(out);
  }
  return rows;
}

// Extract top-level (non-nested) <table> elements from HTML.
function extractTables(html) {
  const tables = [];
  let depth = 0;
  let start = -1;
  const re = /<\/?table\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0 && start >= 0) {
        tables.push(html.slice(start, m.index + m[0].length));
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return tables;
}

function parseDistrikter(tables) {
  // Table index 1: Distrikter | Folketall | Areal km2 | Innb./km2 | Kommuner | Byer | Storste by | Fylker | Landsdel
  const t = tables[1];
  if (!t) throw new Error("Distrikter table (index 1) not found");

  // 9 columns: [0]Distrikt [1]Folketall [2]Areal [3]Density [4]Kommuner [5]Byer [6]StorstBy [7]Fylke [8]Landsdel
  const NC = 9;
  const rows = parseTable(t, NC);

  const distrikter = [];
  for (const row of rows) {
    const name = row[0];
    if (!name || /^distrikter$/i.test(name) || /^landsdel$/i.test(name)) continue;
    if (!name.trim()) continue;

    const population = parseNum(row[1]);
    const area = parseNum(row[2]);
    const kommuner = parseNum(row[4]);
    const largestCity = row[6] ? row[6].trim() : "";
    const county = row[7] ? row[7].trim() : "";
    const landsdel = row[8] ? row[8].trim() : "";

    if (!county && !landsdel) continue;

    const entry = {
      id: slug(name),
      name,
      ...(population != null ? { population: Math.round(population) } : {}),
      ...(area != null ? { area } : {}),
      ...(kommuner != null ? { kommuner: Math.round(kommuner) } : {}),
      ...(largestCity ? { largestCity } : {}),
      county,
      landsdel,
    };
    distrikter.push(entry);
  }
  return distrikter;
}

function parseLandsdeler(tables) {
  // Table index 2: Landsdeler | Folketall | Areal km2 | Innb./km2 | Kommuner | Distrikter | Byer | Storste by | Fylker
  const t = tables[2];
  if (!t) throw new Error("Landsdeler table (index 2) not found");

  // 9 columns: [0]Landsdel [1]Befolkning [2]Areal [3]Density [4]Kommuner [5]Distrikter [6]Byer [7]StorstBy [8]Fylker
  const NC = 9;
  const rows = parseTable(t, NC);

  const landsdeler = [];
  for (const row of rows) {
    const name = row[0];
    if (!name || /^landsdeler$/i.test(name) || /^norge$/i.test(name)) continue;
    if (!name.trim()) continue;

    const population = parseNum(row[1]);
    const area = parseNum(row[2]);
    const kommuner = parseNum(row[4]);
    const distrikter = parseNum(row[5]);
    const byer = parseNum(row[6]);
    const largestCity = row[7] ? row[7].trim() : "";
    const fylker = parseNum(row[8]);

    if (population == null) continue;

    landsdeler.push({
      id: slug(name),
      name,
      population: Math.round(population),
      area,
      kommuner: Math.round(kommuner),
      distrikter: Math.round(distrikter),
      byer: Math.round(byer),
      largestCity,
      fylker: Math.round(fylker),
    });
  }
  return landsdeler;
}

async function main() {
  const url =
    "https://no.wikipedia.org/w/api.php?action=parse&prop=text&format=json&page=" +
    encodeURIComponent(TITLE);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.json()).parse.text["*"];
  const tables = extractTables(html);

  const distrikter = parseDistrikter(tables);
  const landsdeler = parseLandsdeler(tables);

  await writeFile(OUT_DISTRIKTER, JSON.stringify(distrikter, null, 2));
  await writeFile(OUT_LANDSDELER, JSON.stringify(landsdeler, null, 2));

  console.log(`distrikter: ${distrikter.length} entries written`);
  console.log(`landsdeler: ${landsdeler.length} entries written`);

  const missingData = distrikter.filter((d) => d.population == null || d.area == null);
  if (missingData.length) {
    console.log(
      `Districts with missing population/area: ${missingData.map((d) => d.name).join(", ")}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
