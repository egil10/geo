// Build projected SVG paths for rivers, lakes and fjords.
// Reads src/data/{elver,innsjoer,fjorder}.json and geo.json (for the projection).
//
// Strategy (in order of fallback):
//  1. Wikidata P402 (OSM relation ID) → Overpass API for geometry
//  2. (P3896 geoshape is NOT used: Norwegian water bodies have no P3896 in Wikidata)
//
// Writes src/data/geo-water.json.
// Run: node scripts/build-water.mjs

import { readFile, writeFile } from "node:fs/promises";

// Projection from geo.json (exact values from build-maps.mjs output).
const { proj } = JSON.parse(await readFile("src/data/geo.json", "utf8"));
const { cos, scale, ox, oy } = proj;

const project = (lon, lat) => [lon * cos * scale + ox, -lat * scale + oy];
const round1 = (v) => Math.round(v * 10) / 10;

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

// Batch SPARQL query for P402 (OSM relation ID) for a list of QIDs.
// Returns Map<qid, osmRelationId>. Retries on 5xx errors.
async function fetchOsmIds(qids) {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const query = `SELECT ?item ?osm WHERE { VALUES ?item { ${values} } ?item wdt:P402 ?osm }`;
  const url = `${SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * attempt));
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
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

// Fetch OSM relation geometry via Overpass API and convert to projected SVG path.
// For rivers (waterway=*) → open polyline paths.
// For lakes/fjords (natural=water, place=sea/bay) → filled polygon paths.
async function fetchOverpassGeometry(osmRelId, isLine, tol = 0.6) {
  const overpassUrl = "https://overpass-api.de/api/interpreter";
  // Retry up to 3 times with backoff to handle Overpass rate limiting.
  const RETRIES = 3;

  // Query the relation, get all way members, recurse to nodes.
  const query = `[out:json][timeout:90];relation(${osmRelId});(._;>;);out body;`;
  let json = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000 * attempt));
    try {
      const res = await fetch(overpassUrl, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      const j = await res.json();
      // A valid response must have at least the relation element.
      if (j.elements && j.elements.some((e) => e.type === "relation")) {
        json = j;
        break;
      }
    } catch (_) {
      // network error, retry
    }
  }
  if (!json) return null;

  // Build node id → [lon, lat] map.
  const nodes = new Map();
  for (const el of json.elements) {
    if (el.type === "node") nodes.set(el.id, [el.lon, el.lat]);
  }

  // Collect ways by id.
  const ways = new Map();
  for (const el of json.elements) {
    if (el.type === "way" && el.nodes) ways.set(el.id, el.nodes);
  }

  // Find the relation element.
  const rel = json.elements.find((e) => e.type === "relation");
  if (!rel) return null;

  const members = rel.members || [];

  if (isLine) {
    // Rivers: chain ways in member order (roles: main_stream, side_stream, branch, or empty).
    // Collect all way members and chain them in sequence.
    const wayMembers = members.filter((m) => m.type === "way");
    // Group into main stream and side streams for cleaner rendering.
    // Just append all ways sequentially (each as a separate M...L... subpath).
    let d = "";
    for (const member of wayMembers) {
      const nodeIds = ways.get(member.ref);
      if (!nodeIds || nodeIds.length < 2) continue;
      const coords = nodeIds.map((nid) => {
        const c = nodes.get(nid);
        return c ? project(c[0], c[1]) : null;
      }).filter(Boolean);
      if (coords.length < 2) continue;
      const pts = simplify(coords, tol);
      if (pts.length < 2) continue;
      d += "M" + pts.map(([x, y]) => `${round1(x)} ${round1(y)}`).join("L");
    }
    return d || null;
  } else {
    // Polygon (lake/fjord): assemble outer rings from way members with role "outer" (or empty).
    // Key fix: chain all outer way coordinates into one flat list before simplifying,
    // so short individual way segments don't get wiped out by per-segment simplification.
    const outerMembers = members.filter(
      (m) => m.type === "way" && (m.role === "outer" || m.role === "")
    );
    const allMembers = outerMembers.length
      ? outerMembers
      : members.filter((m) => m.type === "way");

    // Group into distinct rings by chaining consecutive ways that share endpoints.
    const wayIds = allMembers.map((m) => m.ref);
    const rings = buildRings(wayIds, ways);

    let d = "";
    for (const ring of rings) {
      // Flatten node ids to projected coords in one pass, then simplify globally.
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

// Chain a list of way node-id arrays into closed rings.
function buildRings(wayIds, ways) {
  if (!wayIds.length) return [];
  // Copy way node arrays, possibly reverse them to chain.
  const segs = wayIds.map((id) => (ways.get(id) || []).slice());
  const rings = [];
  while (segs.length) {
    const ring = segs.shift();
    if (!ring.length) continue;
    // Try to extend ring by chaining other segments.
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

// Process a collection of items: look up OSM IDs, fetch geometry.
async function processItems(items, typeLabel, isLine) {
  const SPARQL_BATCH = 50;
  const result = {};
  let found = 0;

  // Filter to items with Q-ids.
  const qItems = items.filter((it) => /^Q\d+$/.test(it.id));

  // Step 1: collect OSM relation IDs.
  const osmIdMap = new Map(); // qid → osmRelId
  for (let i = 0; i < qItems.length; i += SPARQL_BATCH) {
    const batch = qItems.slice(i, i + SPARQL_BATCH);
    const qids = batch.map((it) => it.id);
    console.log(`  [${typeLabel}] SPARQL batch ${Math.floor(i / SPARQL_BATCH) + 1}/${Math.ceil(qItems.length / SPARQL_BATCH)}`);
    try {
      const batchMap = await fetchOsmIds(qids);
      for (const [k, v] of batchMap) osmIdMap.set(k, v);
    } catch (err) {
      console.warn(`  SPARQL failed: ${err.message}`);
    }
    if (i + SPARQL_BATCH < qItems.length) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`  [${typeLabel}] OSM IDs found: ${osmIdMap.size}/${qItems.length}`);

  // Step 2: fetch geometry for each item with an OSM ID.
  for (const item of qItems) {
    const osmId = osmIdMap.get(item.id);
    if (!osmId) continue;
    console.log(`  [${typeLabel}] ${item.id} (${item.name}) → OSM relation ${osmId}`);
    try {
      const d = await fetchOverpassGeometry(osmId, isLine, 0.6);
      if (d) {
        result[item.id] = d;
        found++;
        console.log(`    → OK (path length ${d.length})`);
      } else {
        console.log(`    → no geometry`);
      }
    } catch (err) {
      console.warn(`    → error: ${err.message}`);
    }
    // Polite delay between Overpass requests.
    await new Promise((r) => setTimeout(r, 800));
  }

  return { result, found, total: qItems.length, withOsm: osmIdMap.size };
}

async function main() {
  const [elver, innsjoer, fjorder] = await Promise.all([
    readFile("src/data/elver.json", "utf8").then(JSON.parse),
    readFile("src/data/innsjoer.json", "utf8").then(JSON.parse),
    readFile("src/data/fjorder.json", "utf8").then(JSON.parse),
  ]);

  console.log(`Loaded: ${elver.length} rivers, ${innsjoer.length} lakes, ${fjorder.length} fjords`);
  console.log("Note: P3896 (Wikidata geoshape) has 0% coverage for Norwegian water bodies.");
  console.log("Using P402 (OSM relation ID) → Overpass API instead.\n");

  console.log("=== Rivers ===");
  const rivers = await processItems(elver, "river", true);

  console.log("\n=== Lakes ===");
  const lakes = await processItems(innsjoer, "lake", false);

  console.log("\n=== Fjords ===");
  const fjords = await processItems(fjorder, "fjord", false);

  const out = {
    rivers: rivers.result,
    lakes: lakes.result,
    fjords: fjords.result,
  };

  const json = JSON.stringify(out);
  await writeFile("src/data/geo-water.json", json);

  console.log("\n=== Summary ===");
  console.log(`rivers: ${rivers.found}/${rivers.total} (${rivers.withOsm} had OSM ID)`);
  console.log(`lakes:  ${lakes.found}/${lakes.total} (${lakes.withOsm} had OSM ID)`);
  console.log(`fjords: ${fjords.found}/${fjords.total} (${fjords.withOsm} had OSM ID)`);
  console.log(`geo-water.json: ${(json.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => { console.error(err); process.exit(1); });
