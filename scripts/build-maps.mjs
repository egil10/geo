// Build projected, simplified SVG paths for the "which region is highlighted?"
// map questions. Reads the fetched GeoJSON (Kartverket via robhop/fylker-og-
// kommuner, CC BY 4.0) and writes src/data/geo.json with a viewBox, the linear
// projection params (so the client can pin arbitrary lat/lon), and a path per
// fylke + kommune (keyed by number). Run: node scripts/build-maps.mjs
import { readFile, writeFile } from "node:fs/promises";

const COS = Math.cos((65 * Math.PI) / 180); // longitude squeeze at Norway's latitude
const round = (v) => Math.round(v * 10) / 10;

const eachCoord = (geom, cb) => {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) for (const ring of poly) for (const c of ring) cb(c[0], c[1]);
};

// Ramer–Douglas–Peucker simplification.
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
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
};

async function main() {
  const fylker = JSON.parse(await readFile("_fylker.geojson", "utf8"));
  const kommuner = JSON.parse(await readFile("_kommuner.geojson", "utf8"));

  // Projection from the fylker (mainland) bounds.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const f of fylker.features)
    eachCoord(f.geometry, (lon, lat) => {
      const x = lon * COS,
        y = -lat;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  const pad = 12;
  const scale = 1000 / Math.max(maxX - minX, maxY - minY);
  const ox = pad - minX * scale;
  const oy = pad - minY * scale;
  const W = Math.round((maxX - minX) * scale + pad * 2);
  const H = Math.round((maxY - minY) * scale + pad * 2);
  const project = (lon, lat) => [lon * COS * scale + ox, -lat * scale + oy];

  const featurePath = (geom, tol, minArea) => {
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    let d = "";
    for (const poly of polys) {
      for (const ring of poly) {
        let pts = simplify(
          ring.map(([lon, lat]) => project(lon, lat)),
          tol,
        );
        if (pts.length < 3 || ringArea(pts) < minArea) continue;
        d += "M" + pts.map((p) => `${round(p[0])} ${round(p[1])}`).join("L") + "Z";
      }
    }
    return d;
  };

  const fylkerOut = fylker.features.map((f) => ({ name: f.properties.name, number: f.properties.fylkesnummer, d: featurePath(f.geometry, 1.1, 2) }));
  const kommunerOut = kommuner.features.map((f) => ({ name: f.properties.name, number: f.properties.kommunenummer, d: featurePath(f.geometry, 1.6, 3) }));

  const geo = {
    viewBox: `0 0 ${W} ${H}`,
    proj: { cos: COS, scale, ox, oy },
    fylker: fylkerOut,
    kommuner: kommunerOut,
  };
  await writeFile("src/data/geo.json", JSON.stringify(geo));
  const bytes = JSON.stringify(geo).length;
  console.log(`viewBox ${W}x${H}, scale ${scale.toFixed(2)}`);
  console.log(`fylker ${fylkerOut.length} (empty: ${fylkerOut.filter((f) => !f.d).length}), kommuner ${kommunerOut.length} (empty: ${kommunerOut.filter((k) => !k.d).length})`);
  console.log(`geo.json: ${(bytes / 1024).toFixed(0)} KB`);
}
main();
