// Generates src/data/veier.json — Norwegian europaveier + main riksveier.
//
// Sources:
//   • Wikipedia category "Kategori:Europaveier i Norge" — full europavei list
//   • Wikipedia "Liste over riksveier i Norge" — wikitext for riksveier
//   • Wikidata — Q-id, P18 (photo), P2043 (length)
//   • OSM Overpass — way geometry by ref tag (ref="E 6", ref="7", etc.)
//
// Geometry strategy:
//   Fetch all OSM highway ways with the road's ref tag within Norway bbox.
//   Bin way midpoints into a 0.2° grid, then sort cells with greedy
//   nearest-neighbor traversal from the southernmost cell. Project the
//   resulting points to SVG coordinates using the same linear projection
//   as src/data/geo.json. Apply RDP simplification (tol=0.6).
//
// Note: P3896 (Wikidata geoshape) is not populated for Norwegian roads;
// OSM Overpass is used as the geometry source instead.
//
// Run: node scripts/curate-veier.mjs
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "veier.json");
const GEO = join(__dirname, "..", "src", "data", "geo.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const OVERPASS = "https://overpass-api.de/api/interpreter";

// Norway bounding box (lat, lon)
const LAT_MIN = 57.5, LAT_MAX = 71.5;
const LON_MIN = 4.0,  LON_MAX = 31.5;

// Grid resolution for OSM geometry binning (degrees)
const GRID = 0.2;

// ── Riksveier to include (curated significant list) ───────────────────────────
const RIKSVEI_NUMS = [
  3, 4, 7, 9, 13, 15, 19, 22, 23, 25, 35, 36, 40, 41, 42,
  44, 47, 52, 55, 58, 70, 77, 80, 83, 85, 86, 88, 90, 92, 93, 94,
];

// ── Projection (matches build-maps.mjs) ──────────────────────────────────────
const round1 = (v) => Math.round(v * 10) / 10;

function makeProject(proj) {
  return (lon, lat) => [
    round1(lon * proj.cos * proj.scale + proj.ox),
    round1(-lat * proj.scale + proj.oy),
  ];
}

// ── RDP simplification (copied from build-maps.mjs) ──────────────────────────
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const tol2 = tol * tol;
  const segDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > -1) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ── OSM geometry via Overpass ─────────────────────────────────────────────────
// For europaveier: ref="E 6" (with space), "E 39", etc.
// For riksveier: ref="7", "52", etc. (plain number)
//
// Strategy: fetch all ways with the ref in Norway bbox, bin midpoints in a
// 0.2° grid, sort by greedy nearest-neighbor from southernmost cell, then
// project to SVG coords.
function osmEuropaveiRef(num) {
  // E6 → "E 6", E39 → "E 39", E134 → "E 134"
  return `E ${num}`;
}

function osmRiksveiRef(num) {
  return String(num);
}

async function fetchOsmGeometry(osmRef, isEurop, project) {
  // Build Overpass query
  let refFilter;
  if (isEurop) {
    // E-roads: ref may be "E 6" or "E 6;E 18" — use regex
    const escaped = osmRef.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&");
    refFilter = `[ref~"(^|;)${escaped}(;|$)"]`;
  } else {
    // Riksveier: exact ref match (plain number)
    refFilter = `[ref="${osmRef}"]`;
  }

  // Use highway filter: motorway, trunk, primary (riksveier can be trunk or primary)
  const q = `[out:json][timeout:120][bbox:${LAT_MIN},${LON_MIN},${LAT_MAX},${LON_MAX}]; way[highway]${refFilter}; out geom;`;
  const url = `${OVERPASS}?data=${encodeURIComponent(q)}`;

  let data;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.warn(`    Overpass HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    data = JSON.parse(text);
  } catch (e) {
    console.warn(`    Overpass error: ${e.message}`);
    return null;
  }

  const ways = data.elements ?? [];
  if (!ways.length) {
    console.log(`    no OSM ways found`);
    return null;
  }

  // Bin way midpoints into grid cells
  const cells = new Map();
  for (const way of ways) {
    if (!way.geometry) continue;
    const pts = way.geometry.filter(
      (p) => p.lon >= LON_MIN && p.lon <= LON_MAX && p.lat >= LAT_MIN && p.lat <= LAT_MAX
    );
    if (pts.length === 0) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    const k = `${Math.floor(mid.lat / GRID)}|${Math.floor(mid.lon / GRID)}`;
    if (!cells.has(k)) cells.set(k, { lat: mid.lat, lon: mid.lon });
  }

  if (cells.size < 2) {
    console.log(`    too few grid cells (${cells.size})`);
    return null;
  }

  // Greedy nearest-neighbor traversal starting from southernmost cell
  const pts = [...cells.values()];
  const remaining = new Set(pts.map((_, i) => i));
  const ordered = [];
  let cur = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].lat < pts[cur].lat) cur = i;

  while (remaining.size > 0) {
    remaining.delete(cur);
    ordered.push(pts[cur]);
    let best = -1, bestDist = Infinity;
    const cp = pts[cur];
    for (const i of remaining) {
      const dx = (pts[i].lon - cp.lon) * 0.42;
      const dy = pts[i].lat - cp.lat;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best === -1) break;
    cur = best;
  }

  // Project to SVG and simplify
  const projected = ordered.map(({ lat, lon }) => project(lon, lat));
  const simp = simplify(projected, 0.6);
  if (simp.length < 2) return null;

  const path = "M" + simp.map(([x, y]) => `${x} ${y}`).join("L");
  console.log(`    OSM: ${ways.length} ways → ${cells.size} cells → ${simp.length} pts, ${path.length} chars`);
  return path;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function fetchJson(url, label = "") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { console.warn(`  HTTP ${res.status} for ${label || url}`); return null; }
    return await res.json();
  } catch (e) {
    console.warn(`  fetch error for ${label || url}: ${e.message}`);
    return null;
  }
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Wikipedia helpers ─────────────────────────────────────────────────────────
async function fetchCategoryMembers(cmtitle) {
  const url = `https://no.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cmtitle)}&cmlimit=100&format=json`;
  const data = await fetchJson(url, cmtitle);
  return data?.query?.categorymembers ?? [];
}

async function fetchWikitext(page) {
  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(page)}`;
  const data = await fetchJson(url, page);
  return data?.parse?.wikitext?.["*"] ?? null;
}

// ── Wikidata helpers ──────────────────────────────────────────────────────────
// Get Q-id for a Norwegian Wikipedia page title
async function getQidForPage(title) {
  const url = `https://no.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&format=json`;
  const data = await fetchJson(url, title);
  if (!data?.query?.pages) return null;
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined) continue;
    const qid = page.pageprops?.wikibase_item;
    if (qid) return qid;
  }
  return null;
}

// Batch fetch photo + length from Wikidata SPARQL
// Note: P2043 unit varies — Q828224 = km, Q11573 = m. The SPARQL binding
// returns the raw numeric amount; we fetch the unit separately to convert.
async function batchWikidata(qids) {
  if (!qids.length) return new Map();
  const values = qids.map((q) => `wd:${q}`).join(" ");
  // Use p:P2043/psv:P2043 to get both amount and unit in one query
  const sparql = `
SELECT ?item ?photo ?lengthAmount ?lengthUnit WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item wdt:P18 ?photo }
  OPTIONAL {
    ?item p:P2043/psv:P2043 ?lenNode .
    ?lenNode wikibase:quantityAmount ?lengthAmount .
    ?lenNode wikibase:quantityUnit ?lengthUnit .
  }
}`.trim();
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  const data = await fetchJson(url, "batch SPARQL");
  const map = new Map();
  const KM_UNIT = "http://www.wikidata.org/entity/Q828224"; // kilometre
  const M_UNIT  = "http://www.wikidata.org/entity/Q11573";  // metre
  for (const row of data?.results?.bindings ?? []) {
    const qid = row.item?.value?.replace("http://www.wikidata.org/entity/", "");
    if (!qid) continue;
    const entry = map.get(qid) ?? {};
    if (row.photo?.value && !entry.photo) {
      const file = decodeURIComponent(
        row.photo.value.replace("http://commons.wikimedia.org/wiki/Special:FilePath/", "")
      );
      entry.photo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1024`;
    }
    if (row.lengthAmount?.value && !entry.length) {
      const raw = parseFloat(row.lengthAmount.value);
      const unit = row.lengthUnit?.value ?? "";
      if (!isNaN(raw) && raw > 0) {
        // Convert to whole km
        if (unit === M_UNIT) {
          entry.length = Math.round(raw / 1000);
        } else {
          // Q828224 (km) or unknown — treat as km
          entry.length = Math.round(raw);
        }
        if (entry.length < 1) delete entry.length; // ignore near-zero values
      }
    }
    map.set(qid, entry);
  }
  return map;
}

// ── Parse europavei number from Wikipedia page title ──────────────────────────
function parseEuropaveiNum(title) {
  let m = title.match(/^Europavei\s+(\d+)/i);
  if (m) return parseInt(m[1]);
  m = title.match(/^E(\d+)/i);
  if (m) return parseInt(m[1]);
  return null;
}

// ── Parse riksveier from wikitext ─────────────────────────────────────────────
// The list uses {{Riksvei|N}} templates inside {{rad vei|...}} rows
function parseRiksveierFromWikitext(wikitext) {
  const results = new Map();
  // Match {{rad vei|{{Riksvei|N}}|...}} — the first riksvei in each row is the route
  const rowRe = /\{\{rad vei\|([^}]*)\}\}/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(wikitext)) !== null) {
    // Extract first {{Riksvei|N}} from the row start
    const rowContent = rowMatch[1];
    const rvMatch = rowContent.match(/\{\{Riksvei\|(?:E\d+|(\d+))/i);
    if (rvMatch && rvMatch[1]) {
      const num = parseInt(rvMatch[1]);
      if (!isNaN(num) && !results.has(num)) {
        results.set(num, num);
      }
    }
  }
  return [...results.keys()];
}

// ── Hardcoded from/to endpoints ───────────────────────────────────────────────
const ENDPOINTS = {
  e6:   { from: "Svinesund", to: "Kirkenes" },
  e8:   { from: "Tromsø sentrum", to: "riksgrensen (Finland)" },
  e10:  { from: "Å i Lofoten", to: "riksgrensen (Sverige)" },
  e12:  { from: "Mo i Rana", to: "riksgrensen (Sverige)" },
  e14:  { from: "Stjørdal", to: "riksgrensen (Sverige)" },
  e16:  { from: "Sandvika", to: "riksgrensen (Sverige)" },
  e18:  { from: "Ørje", to: "Kristiansand" },
  e39:  { from: "Kristiansand", to: "Trondheim (ferge)" },
  e45:  { from: "Kautokeino", to: "riksgrensen (Sverige)" },
  e69:  { from: "Olderfjord", to: "Nordkapp" },
  e75:  { from: "Riksgrensen (Finland)", to: "Vardø" },
  e105: { from: "Riksgrensen (Russland)", to: "Kirkenes" },
  e134: { from: "Drammen", to: "Haugesund" },
  e136: { from: "Dombås", to: "Ålesund" },
  rv3:  { from: "Kolomoen", to: "Ulsberg" },
  rv4:  { from: "Oslo (Ring 3)", to: "Gjøvik" },
  rv7:  { from: "Hønefoss", to: "Hardangervidda (E134)" },
  rv9:  { from: "Kristiansand", to: "Haukeligrend" },
  rv13: { from: "Jøsendal", to: "Voss" },
  rv15: { from: "Otta", to: "Måløy" },
  rv19: { from: "Moss", to: "Horten (ferge)" },
  rv22: { from: "Lillestrøm", to: "Rakkestad" },
  rv23: { from: "Drammen", to: "Oslofjordtunnelen (E18)" },
  rv25: { from: "Hamar", to: "Lillehammer" },
  rv35: { from: "Hønefoss", to: "Gardermoen" },
  rv36: { from: "Seljord", to: "Porsgrunn" },
  rv40: { from: "Kongsberg", to: "Larvik" },
  rv41: { from: "Haukeli", to: "Kristiansand" },
  rv42: { from: "Lister (E39)", to: "Odda" },
  rv44: { from: "Stavanger", to: "Sandnes" },
  rv47: { from: "Haugesund", to: "Åkra" },
  rv52: { from: "Gol", to: "Lærdal (E16)" },
  rv55: { from: "Sogndal", to: "Lom" },
  rv58: { from: "Lærdal (E16)", to: "Florø" },
  rv70: { from: "Oppdal", to: "Kristiansund" },
  rv77: { from: "Grong", to: "riksgrensen (Sverige)" },
  rv80: { from: "Fauske", to: "Bodø" },
  rv83: { from: "Harstad", to: "Evenes" },
  rv85: { from: "Evenes", to: "Sortland" },
  rv86: { from: "Finnsnes", to: "Andselv" },
  rv88: { from: "Skibotn", to: "Nordreisa" },
  rv90: { from: "Karasjok", to: "riksgrensen (Finland)" },
  rv92: { from: "Karasjok", to: "riksgrensen (Finland)" },
  rv93: { from: "Alta", to: "Kautokeino" },
  rv94: { from: "Skaidi", to: "Hammerfest" },
};

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load projection
  const geoData = JSON.parse(await readFile(GEO, "utf8"));
  const project = makeProject(geoData.proj);
  console.log("Projection loaded:", JSON.stringify(geoData.proj));

  // ── Step 1: Fetch europaveier from Wikipedia category ─────────────────────
  console.log("\n[1] Fetching europaveier from Wikipedia category …");
  const categoryMembers = await fetchCategoryMembers("Kategori:Europaveier i Norge");

  // Deduplicate: prefer "Europavei N (Norge)" over "Europavei N" for Norway-specific Q-id
  const europaveiMap = new Map(); // num → {title, preferNorge}
  for (const m of categoryMembers) {
    const num = parseEuropaveiNum(m.title);
    if (num === null) continue;
    const isNorgeSpecific = /\(Norge\)/i.test(m.title);
    const existing = europaveiMap.get(num);
    if (!existing || isNorgeSpecific) {
      europaveiMap.set(num, { title: m.title, num, isNorgeSpecific });
    }
  }
  const europaveiList = [...europaveiMap.values()].sort((a, b) => a.num - b.num);
  console.log(`  Found ${europaveiList.length} unique europaveier: ${europaveiList.map((e) => `E${e.num}`).join(", ")}`);

  // ── Step 2: Riksveier — parse from Wikipedia list wikitext ────────────────
  console.log("\n[2] Fetching riksveier list from Wikipedia …");
  const riksveiWikitext = await fetchWikitext("Liste over riksveier i Norge");
  let riksveiNums = RIKSVEI_NUMS;
  if (riksveiWikitext) {
    const parsed = parseRiksveierFromWikitext(riksveiWikitext);
    // Intersect with our curated list; add any parsed ones that are in our set
    const parsedSet = new Set(parsed);
    const inBoth = RIKSVEI_NUMS.filter((n) => parsedSet.has(n));
    console.log(`  Parsed ${parsed.length} riksveier from wikitext; ${inBoth.length} match our curated list`);
    riksveiNums = RIKSVEI_NUMS; // always use the full curated list
  } else {
    console.warn("  Could not fetch riksveier wikitext — using hardcoded list");
  }
  console.log(`  Riksveier to process: Rv${riksveiNums.join(", Rv")}`);

  // ── Step 3: Get Q-ids for all roads ───────────────────────────────────────
  console.log("\n[3] Resolving Q-ids …");
  const allRoads = [];

  for (const e of europaveiList) {
    const qid = await getQidForPage(e.title);
    if (!qid) {
      // Try fallback: "Europavei N" (non-Norge-specific)
      const fallbackTitle = `Europavei ${e.num}`;
      const fallbackQid = fallbackTitle !== e.title ? await getQidForPage(fallbackTitle) : null;
      allRoads.push({
        id: `e${e.num}`,
        name: `E${e.num}`,
        type: "Europavei",
        num: e.num,
        qid: fallbackQid,
        osmRef: osmEuropaveiRef(e.num),
        isEurop: true,
      });
      console.log(`  E${e.num} → ${fallbackQid ?? "no Q-id"} (fallback)`);
    } else {
      allRoads.push({
        id: `e${e.num}`,
        name: `E${e.num}`,
        type: "Europavei",
        num: e.num,
        qid,
        osmRef: osmEuropaveiRef(e.num),
        isEurop: true,
      });
      console.log(`  E${e.num} → ${qid}`);
    }
    await delay(100);
  }

  for (const num of riksveiNums) {
    const title = `Riksvei ${num}`;
    const qid = await getQidForPage(title);
    allRoads.push({
      id: `rv${num}`,
      name: `Riksvei ${num}`,
      type: "Riksvei",
      num,
      qid: qid ?? null,
      osmRef: osmRiksveiRef(num),
      isEurop: false,
    });
    console.log(`  Rv${num} → ${qid ?? "no Q-id"}`);
    await delay(100);
  }

  // ── Step 4: Batch fetch photo + length from Wikidata ─────────────────────
  console.log("\n[4] Batch fetching photo + length from Wikidata …");
  const qids = allRoads.map((r) => r.qid).filter(Boolean);
  const wdMap = await batchWikidata(qids);
  console.log(`  Got Wikidata for ${wdMap.size} roads`);

  // ── Step 5: Fetch OSM geometry for each road ───────────────────────────────
  console.log("\n[5] Fetching OSM geometry …");
  let geometryCount = 0;
  for (const road of allRoads) {
    console.log(`  ${road.name} (ref="${road.osmRef}") …`);
    const line = await fetchOsmGeometry(road.osmRef, road.isEurop, project);
    if (line) {
      road.line = line;
      geometryCount++;
    }
    await delay(500); // be polite to Overpass
  }

  // ── Step 6: Build output ───────────────────────────────────────────────────
  console.log("\n[6] Building output …");
  const seen = new Set();
  const entries = [];

  for (const road of allRoads) {
    if (seen.has(road.id)) {
      console.warn(`  Duplicate id skipped: ${road.id}`);
      continue;
    }
    seen.add(road.id);

    const wd = road.qid ? (wdMap.get(road.qid) ?? {}) : {};
    const endpoints = ENDPOINTS[road.id] ?? {};

    const entry = {
      id: road.id,
      name: road.name,
      type: road.type,
    };
    if (wd.length != null && wd.length > 0) entry.length = wd.length;
    if (endpoints.from) entry.from = endpoints.from;
    if (endpoints.to) entry.to = endpoints.to;
    if (wd.photo) entry.photo = wd.photo;
    if (road.line) entry.line = road.line;

    entries.push(entry);
  }

  // Sort: europaveier first (by num), then riksveier (by num)
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "Europavei" ? -1 : 1;
    const numA = parseInt(a.id.replace(/[^\d]/g, "")) || 0;
    const numB = parseInt(b.id.replace(/[^\d]/g, "")) || 0;
    return numA - numB;
  });

  // ── Verify unique IDs ──────────────────────────────────────────────────────
  const idCounts = {};
  for (const e of entries) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
  const dups = Object.entries(idCounts).filter(([, c]) => c > 1);
  if (dups.length) {
    console.error("DUPLICATE IDs FOUND:", dups);
    process.exit(1);
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  await writeFile(OUT, JSON.stringify(entries, null, 2) + "\n");

  // ── Report ─────────────────────────────────────────────────────────────────
  const europaveier = entries.filter((e) => e.type === "Europavei");
  const riksveier = entries.filter((e) => e.type === "Riksvei");
  const withLine = entries.filter((e) => e.line);
  const withPhoto = entries.filter((e) => e.photo);
  const withLength = entries.filter((e) => e.length != null);
  const withEndpoints = entries.filter((e) => e.from);

  console.log("\n══ DONE ═══════════════════════════════════════════════════════");
  console.log(`Total:      ${entries.length} (${europaveier.length} europaveier + ${riksveier.length} riksveier)`);
  console.log(`Geometry:   ${withLine.length}/${entries.length} got 'line' path`);
  console.log(`Photo:      ${withPhoto.length}/${entries.length}`);
  console.log(`Length:     ${withLength.length}/${entries.length}`);
  console.log(`Endpoints:  ${withEndpoints.length}/${entries.length} got from/to`);
  console.log(`Unique IDs: PASS (0 duplicates)`);

  const major = ["e6", "e18", "e39"].map((id) => {
    const e = entries.find((x) => x.id === id);
    if (!e) return `${id.toUpperCase()}: missing`;
    return `${id.toUpperCase()}: ${e.line ? "traced" : "no geometry"}`;
  });
  console.log(`Major check: ${major.join(", ")}`);

  if (withLine.length === 0) {
    console.log("\nNOTE: No geometry obtained. If Overpass was rate-limited,");
    console.log("re-run the script. Each road queries Overpass independently.");
  } else if (withLine.length < entries.length * 0.5) {
    console.log("\nNOTE: Partial geometry coverage. OSM ref tags may differ for");
    console.log("some roads (especially riksveier with short numbers like '3', '4').");
  }

  console.log(`\nWrote ${entries.length} entries to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
