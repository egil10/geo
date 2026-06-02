// Build projected SVG paths for rivers, lakes and fjords.
// Reads src/data/{elver,innsjoer,fjorder}.json and geo.json (for the projection).
//
// Strategy (in order of fallback):
//  1. Wikidata P402 (OSM relation ID) → Overpass API for geometry
//  2. Name-based OSM lookup near lat/lon via Overpass API
//
// Writes src/data/geo-water.json (merges with existing entries).
// Run: node scripts/build-water.mjs

import { readFile, writeFile } from "node:fs/promises";

// Projection from geo.json (exact values from build-maps.mjs output).
const { proj } = JSON.parse(await readFile("src/data/geo.json", "utf8"));
const { cos, scale, ox, oy } = proj;

const project = (lon, lat) => [lon * cos * scale + ox, -lat * scale + oy];
const round1 = (v) => Math.round(v * 10) / 10;

// Mainland viewBox bounds for clipping.
const VB_X_MIN = 0, VB_X_MAX = 873, VB_Y_MIN = 0, VB_Y_MAX = 1024;
function inView(x, y) {
  return x >= VB_X_MIN - 50 && x <= VB_X_MAX + 50 && y >= VB_Y_MIN - 50 && y <= VB_Y_MAX + 50;
}

// Skip Svalbard.
const SVALBARD_LAT = 74;

// Ramer–Douglas–Peucker simplification (copied from build-maps.mjs).
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const tol2 = tol * tol;
  const segDist = (p, a, b) => {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
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
    if (maxD > tol2 && idx > -1) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const SPARQL_URL = "https://query.wikidata.org/sparql";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Exponential backoff sleep.
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// POST a query to Overpass with retry + fallback mirrors.
// Strategy: try each mirror once (fast fail 15s timeout), then retry with backoff.
async function overpassQuery(query) {
  const BACKOFFS = [5000, 15000, 40000];

  // First pass: try each mirror once quickly.
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status === 504) {
        console.log(`    Overpass ${res.status} from ${url}, trying next mirror…`);
        continue;
      }
      if (!res.ok) { console.log(`    Overpass ${res.status} from ${url}, trying next mirror…`); continue; }
      const j = await res.json();
      if (j && j.elements) return j;
    } catch (_) {
      // timeout or network error - try next mirror immediately
    }
  }

  // Second pass: retry with backoff on the primary mirror.
  const reliableUrl = OVERPASS_URLS[0];
  for (let attempt = 0; attempt < BACKOFFS.length; attempt++) {
    console.log(`    Overpass retry ${attempt + 1}/${BACKOFFS.length} after ${BACKOFFS[attempt]/1000}s…`);
    await sleep(BACKOFFS[attempt]);
    try {
      const res = await fetch(reliableUrl, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status === 504) continue;
      if (!res.ok) continue;
      const j = await res.json();
      if (j && j.elements) return j;
    } catch (err) {
      if (attempt === BACKOFFS.length - 1) console.warn(`    Overpass final error: ${err.message}`);
    }
  }
  return null;
}

// Batch SPARQL query for P402 (OSM relation ID) for a list of QIDs.
// Returns Map<qid, osmRelationId>.
async function fetchOsmIds(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const query = `SELECT ?item ?osm WHERE { VALUES ?item { ${values} } ?item wdt:P402 ?osm }`;
  const url = `${SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status >= 500) { console.warn(`  SPARQL ${res.status}, retrying…`); continue; }
      if (!res.ok) throw new Error(`SPARQL error ${res.status}`);
      const json = await res.json();
      const map = new Map();
      for (const row of json.results.bindings) {
        const qid = row.item.value.replace("http://www.wikidata.org/entity/", "");
        map.set(qid, row.osm.value);
      }
      return map;
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`  SPARQL error: ${err.message}, retrying…`);
    }
  }
  return new Map();
}

// Convert Overpass JSON (with nodes/ways already loaded) to SVG path string.
function elementsToPath(json, isLine, tol) {
  if (!json || !json.elements) return null;

  const nodes = new Map();
  for (const el of json.elements) {
    if (el.type === "node") nodes.set(el.id, [el.lon, el.lat]);
  }
  const ways = new Map();
  for (const el of json.elements) {
    if (el.type === "way" && el.nodes) ways.set(el.id, el.nodes);
  }

  // Collect all relations and loose ways.
  const rels = json.elements.filter((e) => e.type === "relation");
  // Also handle bare way results (no relation wrapping them).
  const looseWayIds = json.elements
    .filter((e) => e.type === "way")
    .map((e) => e.id);

  // Gather all member way ids from all relations.
  let memberWayIds = [];
  for (const rel of rels) {
    const members = rel.members || [];
    memberWayIds.push(...members.filter((m) => m.type === "way").map((m) => m.ref));
  }
  // If no relations, use loose ways.
  if (memberWayIds.length === 0) memberWayIds = looseWayIds;

  if (isLine) {
    let d = "";
    for (const wayId of memberWayIds) {
      const nodeIds = ways.get(wayId);
      if (!nodeIds || nodeIds.length < 2) continue;
      const coords = nodeIds.map((nid) => {
        const c = nodes.get(nid);
        return c ? project(c[0], c[1]) : null;
      }).filter(Boolean).filter(([x, y]) => inView(x, y));
      if (coords.length < 2) continue;
      const pts = simplify(coords, tol);
      if (pts.length < 2) continue;
      d += "M" + pts.map(([x, y]) => `${round1(x)} ${round1(y)}`).join("L");
    }
    return d || null;
  } else {
    // Polygon: group outer members into rings.
    const outerMembers = [];
    for (const rel of rels) {
      const members = rel.members || [];
      const outer = members.filter((m) => m.type === "way" && (m.role === "outer" || m.role === ""));
      outerMembers.push(...outer.map((m) => m.ref));
    }
    const ringWayIds = outerMembers.length ? outerMembers : memberWayIds;
    const rings = buildRings(ringWayIds, ways);

    let d = "";
    for (const ring of rings) {
      const coords = [];
      for (const nid of ring) {
        const c = nodes.get(nid);
        if (c) coords.push(project(c[0], c[1]));
      }
      if (coords.length < 3) continue;
      const pts = simplify(coords, tol);
      if (pts.length < 3) continue;
      d += "M" + pts.map(([x, y]) => `${round1(x)} ${round1(y)}`).join("L") + "Z";
    }
    return d || null;
  }
}

// Fetch OSM relation geometry via Overpass API (relation by ID).
async function fetchOverpassGeometry(osmRelId, isLine, tol = 0.6) {
  const query = `[out:json][timeout:90];relation(${osmRelId});(._;>;);out body;`;
  const j = await overpassQuery(query);
  if (!j || !j.elements || !j.elements.some((e) => e.type === "relation")) return null;
  return elementsToPath(j, isLine, tol);
}

// Fetch geometry from OSM by NAME near a lat/lon coordinate.
// Returns an SVG path string or null.
async function fetchByName(name, lat, lon, isLine, tol = 0.6) {
  // Build a bounding box around the coordinate.
  // Use a larger box for big features (fjords/long rivers).
  const delta = 1.5; // degrees
  const s = lat - delta, n = lat + delta;
  const w = lon - delta, e = lon + delta;
  const bbox = `${s},${w},${n},${e}`;

  // Escape name for Overpass QL (backslash-escape quotes).
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  let query;
  if (isLine) {
    // Rivers: try waterway relation first, then waterway ways.
    query = `[out:json][timeout:90];
(
  relation[type=waterway]["name"="${escapedName}"](${bbox});
  relation[waterway]["name"="${escapedName}"](${bbox});
  way[waterway=river]["name"="${escapedName}"](${bbox});
  way[waterway=stream]["name"="${escapedName}"](${bbox});
);
(._;>;);
out body;`;
  } else {
    // Lakes/fjords: try natural=water relation, natural=coastline, place=sea/bay.
    query = `[out:json][timeout:90];
(
  relation[natural=water]["name"="${escapedName}"](${bbox});
  relation[place=sea]["name"="${escapedName}"](${bbox});
  relation[place=bay]["name"="${escapedName}"](${bbox});
  way[natural=water]["name"="${escapedName}"](${bbox});
);
(._;>;);
out body;`;
  }

  const j = await overpassQuery(query);
  if (!j || !j.elements || j.elements.length === 0) return null;
  return elementsToPath(j, isLine, tol);
}

// Chain a list of way node-id arrays into closed rings.
function buildRings(wayIds, ways) {
  if (!wayIds.length) return [];
  const segs = wayIds.map((id) => (ways.get(id) || []).slice());
  const rings = [];
  while (segs.length) {
    const ring = segs.shift();
    if (!ring.length) continue;
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (!s.length) continue;
        if (ring[ring.length - 1] === s[0]) {
          ring.push(...s.slice(1));
          segs.splice(i, 1);
          extended = true;
          break;
        } else if (ring[ring.length - 1] === s[s.length - 1]) {
          ring.push(...s.slice(0, -1).reverse());
          segs.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    rings.push(ring);
  }
  return rings;
}

// Process a collection of items: look up OSM IDs via Wikidata P402, then fall back
// to name-based lookup for items still missing geometry. Merge with existing.
async function processItems(items, typeLabel, isLine, existing, outKey, outObj, outPath) {
  const SPARQL_BATCH = 50;
  const result = { ...existing }; // start with what we already have
  let foundWikidata = 0, foundName = 0, skipped = 0;

  // Filter to items with Q-ids that are on mainland Norway (lat <= SVALBARD_LAT).
  const qItems = items.filter((it) => {
    if (!/^Q\d+$/.test(it.id)) return false;
    if (it.lat && it.lat > SVALBARD_LAT) return false;
    if (!it.lat || !it.lon) return false;
    return true;
  });

  // Already covered items.
  const already = new Set(Object.keys(existing));

  // Items needing geometry.
  const missing = qItems.filter((it) => !already.has(it.id));
  console.log(`  [${typeLabel}] ${already.size} already covered, ${missing.length} to fetch`);

  if (missing.length === 0) return { result, foundWikidata, foundName, skipped, total: qItems.length };

  // Step 1: collect OSM relation IDs via Wikidata P402 for missing items.
  const osmIdMap = new Map();
  for (let i = 0; i < missing.length; i += SPARQL_BATCH) {
    const batch = missing.slice(i, i + SPARQL_BATCH);
    const qids = batch.map((it) => it.id);
    console.log(`  [${typeLabel}] SPARQL batch ${Math.floor(i / SPARQL_BATCH) + 1}/${Math.ceil(missing.length / SPARQL_BATCH)}`);
    try {
      const batchMap = await fetchOsmIds(qids);
      for (const [k, v] of batchMap) osmIdMap.set(k, v);
    } catch (err) {
      console.warn(`  SPARQL failed: ${err.message}`);
    }
    if (i + SPARQL_BATCH < missing.length) await sleep(1000);
  }
  console.log(`  [${typeLabel}] Wikidata OSM IDs found: ${osmIdMap.size}/${missing.length}`);

  // Step 2: fetch geometry for each missing item.
  for (const item of missing) {
    const osmId = osmIdMap.get(item.id);
    let d = null;

    if (osmId) {
      // Path A: use Wikidata P402 relation ID.
      console.log(`  [${typeLabel}] ${item.id} (${item.name}) → OSM relation ${osmId} [Wikidata]`);
      try {
        d = await fetchOverpassGeometry(osmId, isLine, 0.6);
        if (d) { foundWikidata++; console.log(`    → OK (${d.length} chars)`); }
        else console.log(`    → no geometry from relation`);
      } catch (err) {
        console.warn(`    → error: ${err.message}`);
      }
    }

    if (!d) {
      // Path B: name-based lookup near lat/lon.
      console.log(`  [${typeLabel}] ${item.id} (${item.name}) → name lookup near ${item.lat.toFixed(2)},${item.lon.toFixed(2)}`);
      try {
        d = await fetchByName(item.name, item.lat, item.lon, isLine, 0.6);
        if (d) { foundName++; console.log(`    → OK by name (${d.length} chars)`); }
        else { skipped++; console.log(`    → not found by name`); }
      } catch (err) {
        skipped++;
        console.warn(`    → name lookup error: ${err.message}`);
      }
    }

    if (d) {
      result[item.id] = d;
      // Write incrementally to avoid losing progress.
      outObj[outKey] = result;
      const json = JSON.stringify(outObj);
      JSON.parse(json); // validate
      await writeFile(outPath, json);
    }

    // Polite 2s delay between requests.
    await sleep(2000);
  }

  return { result, foundWikidata, foundName, skipped, total: qItems.length };
}

async function main() {
  const [elver, innsjoer, fjorder] = await Promise.all([
    readFile("src/data/elver.json", "utf8").then(JSON.parse),
    readFile("src/data/innsjoer.json", "utf8").then(JSON.parse),
    readFile("src/data/fjorder.json", "utf8").then(JSON.parse),
  ]);

  // Load existing geo-water.json to merge with (keep all existing entries).
  let existing = { rivers: {}, lakes: {}, fjords: {} };
  try {
    existing = JSON.parse(await readFile("src/data/geo-water.json", "utf8"));
    console.log(`Loaded existing: ${Object.keys(existing.rivers).length} rivers, ${Object.keys(existing.lakes).length} lakes, ${Object.keys(existing.fjords).length} fjords`);
  } catch (_) {
    console.log("No existing geo-water.json, starting fresh.");
  }

  console.log(`Source data: ${elver.length} rivers, ${innsjoer.length} lakes, ${fjorder.length} fjords`);
  console.log("Strategy: Wikidata P402 first, then name-based OSM lookup.\n");

  const OUT_PATH = "src/data/geo-water.json";
  const out = {
    rivers: existing.rivers,
    lakes: existing.lakes,
    fjords: existing.fjords,
  };

  console.log("=== Rivers ===");
  const rivers = await processItems(elver, "river", true, existing.rivers, "rivers", out, OUT_PATH);
  out.rivers = rivers.result;

  console.log("\n=== Lakes ===");
  const lakes = await processItems(innsjoer, "lake", false, existing.lakes, "lakes", out, OUT_PATH);
  out.lakes = lakes.result;

  console.log("\n=== Fjords ===");
  const fjords = await processItems(fjorder, "fjord", false, existing.fjords, "fjords", out, OUT_PATH);
  out.fjords = fjords.result;

  const json = JSON.stringify(out);

  // Final write (already incrementally written, but do a final pass to confirm).
  JSON.parse(json); // throws if invalid
  await writeFile(OUT_PATH, json);

  console.log("\n=== Summary ===");
  console.log(`rivers: ${Object.keys(rivers.result).length}/${elver.length} (Wikidata: +${rivers.foundWikidata}, name: +${rivers.foundName}, failed: ${rivers.skipped})`);
  console.log(`lakes:  ${Object.keys(lakes.result).length}/${innsjoer.length} (Wikidata: +${lakes.foundWikidata}, name: +${lakes.foundName}, failed: ${lakes.skipped})`);
  console.log(`fjords: ${Object.keys(fjords.result).length}/${fjorder.length} (Wikidata: +${fjords.foundWikidata}, name: +${fjords.foundName}, failed: ${fjords.skipped})`);
  console.log(`geo-water.json: ${(json.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
