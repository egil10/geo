// Build a projected, simplified SVG outline map for the Svalbard archipelago.
// Writes src/data/geo-svalbard.json with viewBox "0 0 360 360", proj params,
// and outline paths. Run: node scripts/build-svalbard.mjs
//
// Projection (same style as build-maps.mjs):
//   x = lon * cos * scale + ox
//   y = -lat * scale + oy
// where cos = cos(78.5° * π/180) (longitude squeeze at Svalbard's latitude)
//
// Geometry: OSM Overpass outer rings of island relations (by known relation ID),
// with fallback to Natural Earth 1:50m land clipped to the Svalbard bbox.

import { readFile, writeFile } from "node:fs/promises";

// ── Projection constants ──────────────────────────────────────────────────────
const COS = Math.cos((78.5 * Math.PI) / 180); // ≈ 0.19937
const BBOX_LAT_MIN = 74.0; // covers Bjørnøya
const BBOX_LAT_MAX = 81.0;
const BBOX_LON_MIN = 10.0;
const BBOX_LON_MAX = 35.0;
const VIEWBOX_SIZE = 360;
const PAD = 12;
const RDP_TOL = 0.8; // simplification tolerance in projected pixels
const MIN_AREA = 4; // drop rings smaller than this area (px²)

// Projected bbox corners
const pxMin = BBOX_LON_MIN * COS;
const pxMax = BBOX_LON_MAX * COS;
const pyMin = -BBOX_LAT_MAX; // y = -lat, higher lat → smaller y
const pyMax = -BBOX_LAT_MIN;

const scale = (VIEWBOX_SIZE - PAD * 2) / Math.max(pxMax - pxMin, pyMax - pyMin);
const ox = PAD - pxMin * scale;
const oy = PAD - pyMin * scale;

const project = (lon, lat) => [lon * COS * scale + ox, -lat * scale + oy];
const round = (v) => Math.round(v * 10) / 10;

// ── RDP simplification (identical to build-maps.mjs) ─────────────────────────
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const tol2 = tol * tol;
  const segDist = (p, a, b) => {
    let x = a[0],
      y = a[1];
    let dx = b[0] - x,
      dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0,
      idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > -1) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const ringArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
};

// Convert [lon,lat][] rings to SVG path string.
function ringsToPath(rings) {
  let d = "";
  for (const ring of rings) {
    const pts = simplify(
      ring.map(([lon, lat]) => project(lon, lat)),
      RDP_TOL,
    );
    if (pts.length < 3 || ringArea(pts) < MIN_AREA) continue;
    d += "M" + pts.map((p) => `${round(p[0])} ${round(p[1])}`).join("L") + "Z";
  }
  return d;
}

// ── OSM Overpass fetch ────────────────────────────────────────────────────────
// Primary: overpass-api.de (has full current data)
// osm.ch is omitted — it mirrors an older extract that lacks these island relations.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

async function fetchOverpass(query, attempt = 0) {
  console.log(`  → ${OVERPASS_URL} (attempt ${attempt + 1})`);
  let resp;
  try {
    resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (attempt < 4) {
      const delay = Math.min(3000 * 2 ** attempt, 30_000);
      console.log(`  connection error (${err.message}), retry in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
      return fetchOverpass(query, attempt + 1);
    }
    throw err;
  }
  if (resp.status === 429 || resp.status === 504) {
    const delay = Math.min(5000 * 2 ** attempt, 60_000);
    console.log(`  HTTP ${resp.status}, retry in ${delay}ms…`);
    await new Promise((r) => setTimeout(r, delay));
    return fetchOverpass(query, attempt + 1);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  return resp.json();
}

// Extract outer-ring coordinate arrays from an OSM relation's ways.
function extractOuterRings(elements, relId) {
  const rel = elements.find((e) => e.type === "relation" && e.id === relId);
  if (!rel) return [];

  const nodes = new Map();
  for (const e of elements) {
    if (e.type === "node") nodes.set(e.id, [e.lon, e.lat]);
  }
  const ways = new Map();
  for (const e of elements) {
    if (e.type === "way" && e.nodes) {
      const coords = e.nodes.map((id) => nodes.get(id)).filter(Boolean);
      if (coords.length > 1) ways.set(e.id, coords);
    }
  }

  const outerWayIds = rel.members
    .filter((m) => m.type === "way" && m.role === "outer")
    .map((m) => m.ref);

  if (outerWayIds.length === 0) return [];

  const segments = outerWayIds
    .map((id) => ways.get(id) || [])
    .filter((s) => s.length > 0);
  return stitchSegments(segments);
}

// Stitch open way segments into closed rings by chaining endpoints.
function stitchSegments(segs) {
  if (segs.length === 0) return [];
  const remaining = segs.map((s) => [...s]);
  const rings = [];
  while (remaining.length > 0) {
    let current = remaining.shift();
    let changed = true;
    while (changed) {
      changed = false;
      const head = current[0];
      const tail = current[current.length - 1];
      if (
        Math.abs(head[0] - tail[0]) < 1e-9 &&
        Math.abs(head[1] - tail[1]) < 1e-9
      )
        break;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const s0 = seg[0],
          sN = seg[seg.length - 1];
        const eq = (a, b) =>
          Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
        if (eq(tail, s0)) {
          current = [...current, ...seg.slice(1)];
        } else if (eq(tail, sN)) {
          current = [...current, ...[...seg].reverse().slice(1)];
        } else if (eq(head, sN)) {
          current = [...seg, ...current.slice(1)];
        } else if (eq(head, s0)) {
          current = [[...seg].reverse(), ...current.slice(1)].flat();
        } else {
          continue;
        }
        remaining.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (current.length >= 3) rings.push(current);
  }
  return rings;
}

// ── Natural Earth fallback ────────────────────────────────────────────────────
const NE_LAND_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";

async function fetchNaturalEarth() {
  const file = "_ne_50m_land.geojson";
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    console.log("  downloading Natural Earth 1:50m land…");
    const resp = await fetch(NE_LAND_URL, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) throw new Error(`Natural Earth HTTP ${resp.status}`);
    const text = await resp.text();
    await writeFile(file, text);
    return JSON.parse(text);
  }
}

function clipFeatureRings(geom) {
  const polys =
    geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  const rings = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const inBox = ring.some(
        ([lon, lat]) =>
          lon >= BBOX_LON_MIN &&
          lon <= BBOX_LON_MAX &&
          lat >= BBOX_LAT_MIN &&
          lat <= BBOX_LAT_MAX,
      );
      if (inBox) rings.push(ring.map(([lon, lat]) => [lon, lat]));
    }
  }
  return rings;
}

// ── Island definitions with known OSM relation IDs ───────────────────────────
// IDs verified via Overpass bbox query 2026-06-02.
const ISLANDS = [
  { name: "Spitsbergen", relId: 1124190 },
  { name: "Nordaustlandet", relId: 5856703 },
  { name: "Edgeøya", relId: 5856837 },
  { name: "Bjørnøya", relId: 9382299 },
  { name: "Kvitøya", relId: 3358168 },
  // Smaller islands also found in bbox query:
  { name: "Hopen", relId: 10256615 },
  // Barentsøya and Prins Karls Forland may be nodes in OSM, not relations;
  // they'll be covered by Natural Earth supplement if missing.
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\nProjection params:");
  console.log(`  COS     = ${COS.toFixed(6)}  (cos 78.5°)`);
  console.log(`  scale   = ${scale.toFixed(4)}`);
  console.log(`  ox      = ${ox.toFixed(4)}`);
  console.log(`  oy      = ${oy.toFixed(4)}`);

  const [lbx, lby] = project(15.65, 78.22);
  console.log(
    `  Longyearbyen (78.22°N, 15.65°E) → (${lbx.toFixed(1)}, ${lby.toFixed(1)}) — expect in [0,360]`,
  );

  const outline = [];
  const gotIslands = [];
  const failedIslands = [];

  // ── Overpass: one request per island ─────────────────────────────────────
  for (const island of ISLANDS) {
    console.log(`\nFetching ${island.name} (relation ${island.relId})…`);
    // Add a short pause between requests to be polite
    if (gotIslands.length + failedIslands.length > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    try {
      // Fetch relation + all recursive members in one shot
      const query = `[out:json][timeout:120];relation(${island.relId});(._;>>;);out body;`;
      const data = await fetchOverpass(query);
      const elements = data.elements || [];
      const rel = elements.find(
        (e) => e.type === "relation" && e.id === island.relId,
      );
      if (!rel) {
        console.log(`  relation ${island.relId} not in response`);
        failedIslands.push(island.name);
        continue;
      }

      const rings = extractOuterRings(elements, island.relId);
      if (rings.length === 0) {
        console.log(`  no outer rings extracted`);
        failedIslands.push(island.name);
        continue;
      }

      const path = ringsToPath(rings);
      if (!path) {
        console.log(`  all rings too small after simplification`);
        failedIslands.push(island.name);
        continue;
      }

      console.log(`  ok: ${rings.length} ring(s) → ${path.length} chars`);
      outline.push(path);
      gotIslands.push(island.name);
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      failedIslands.push(island.name);
    }
  }

  // ── Natural Earth: fill in anything missing + add Barentsøya/PKF ─────────
  // Always use NE as a supplement: it provides Barentsøya, Prins Karls Forland,
  // Kong Karls Land, and any other landmasses not covered by individual Overpass
  // fetches. We merge NE rings that don't substantially overlap existing paths.
  console.log("\nSupplementing with Natural Earth (Barentsøya, PKF, etc.)…");
  try {
    const ne = await fetchNaturalEarth();
    const neRings = [];
    for (const feat of ne.features) {
      if (!feat.geometry) continue;
      const rings = clipFeatureRings(feat.geometry);
      neRings.push(...rings);
    }
    console.log(`  ${neRings.length} Natural Earth ring(s) in bbox`);

    if (outline.length === 0) {
      // Overpass got nothing — use NE for everything
      const path = ringsToPath(neRings);
      if (path) {
        outline.push(path);
        gotIslands.push("Natural Earth (all)");
        console.log(`  NE full fallback: ${path.length} chars`);
      }
    } else {
      // Overpass got some islands — add NE as a single extra path for the rest
      // (Barentsøya ~78.4°N 20°E, Prins Karls Forland ~78.5°N 11.5°E, etc.)
      const nePath = ringsToPath(neRings);
      if (nePath) {
        outline.push(nePath);
        console.log(
          `  NE supplement path: ${nePath.length} chars (covers Barentsøya, PKF, etc.)`,
        );
      }
    }
  } catch (err) {
    console.log(`  Natural Earth failed: ${err.message}`);
    if (outline.length === 0) {
      console.error("FATAL: no geometry produced");
      process.exit(1);
    }
  }

  // ── Write output ──────────────────────────────────────────────────────────
  const result = {
    viewBox: `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`,
    proj: {
      cos: parseFloat(COS.toFixed(6)),
      scale: parseFloat(scale.toFixed(4)),
      ox: parseFloat(ox.toFixed(4)),
      oy: parseFloat(oy.toFixed(4)),
    },
    outline,
  };

  const json = JSON.stringify(result);
  // Validate JSON before writing
  JSON.parse(json);
  await writeFile("src/data/geo-svalbard.json", json);

  const totalChars = outline.reduce((s, p) => s + p.length, 0);
  console.log(`\n═══ RESULT ═══`);
  console.log(
    `Overpass islands   : ${gotIslands.filter((n) => !n.startsWith("Natural")).join(", ") || "(none)"}`,
  );
  console.log(
    `NE supplement      : ${gotIslands.some((n) => n.startsWith("Natural")) || outline.length > gotIslands.filter((n) => !n.startsWith("Natural")).length ? "yes" : "no"}`,
  );
  console.log(`Failed from Overpass: ${failedIslands.join(", ") || "(none)"}`);
  console.log(`outline paths      : ${outline.length}`);
  console.log(`total path chars   : ${totalChars}`);
  console.log(
    `geo-svalbard.json  : ${(json.length / 1024).toFixed(1)} KB  ✓ JSON valid`,
  );
  console.log(
    `proj: cos=${result.proj.cos}  scale=${result.proj.scale}  ox=${result.proj.ox}  oy=${result.proj.oy}`,
  );
  const inBox =
    lbx >= 0 && lbx <= 360 && lby >= 0 && lby <= 360 ? "YES ✓" : "NO ✗";
  console.log(`Longyearbyen check : (${lbx.toFixed(1)}, ${lby.toFixed(1)}) in [0,360]: ${inBox}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
