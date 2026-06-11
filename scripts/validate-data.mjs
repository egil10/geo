// Dataset gate, run before shipping: unique ids, required fields, image-meta
// coverage, per-category count floors (composition guard), and a live
// HEAD-check of sampled real thumbnail URLs (429 counts as a warning — that's
// per-IP throttling, not breakage). Run: node scripts/validate-data.mjs
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

// Floors = counts at the time of the 2026-06 expansion. A re-fetch that drops
// below a floor means a category the quiz depends on silently shrank.
const FLOORS = {
  "kommuner.json": 357, "fylker.json": 15, "fjell.json": 340, "elver.json": 120,
  "innsjoer.json": 260, "fjorder.json": 32, "oyer.json": 290, "fossefall.json": 46,
  "isbreer.json": 16, "tunneler.json": 16, "byer.json": 100, "fyr.json": 60,
  "dyr.json": 90, "stavkirker.json": 28, "nasjonalparker.json": 40,
};
const SKIP = new Set(["img-meta.json", "geo.json", "geo-water.json", "geo-svalbard.json", "ssb-kommuner.json", "ssb-fylker.json", "fotballklubber.json"]);
const FILEPATH_RE = /^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?]+)/;
const DIRECT_RE = /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/.\/..\/([^/?]+)/;

// Mirrors src/lib/images.ts (kept independent on purpose: a drift between the
// two shows up here as failed HEAD checks).
const UPLOAD = "https://upload.wikimedia.org/wikipedia/commons/";
const BUCKETS = [20, 40, 60, 120, 250, 330, 500, 960];
function thumbUrl(meta, w) {
  const [, , path, flag] = meta;
  const encName = path.slice(path.lastIndexOf("/") + 1);
  const name = typeof flag === "string" ? flag.replace("{w}px-", `${w}px-`) : `${w}px-${encName}${flag === 1 ? ".png" : ""}`;
  return `${UPLOAD}thumb/${path}/${name}`;
}
function sampleUrl(meta) {
  const valid = meta[3] === 1 ? BUCKETS : BUCKETS.filter((b) => b < meta[0]);
  const w = valid.find((b) => b >= 330) ?? valid[valid.length - 1];
  return w == null ? UPLOAD + meta[2] : thumbUrl(meta, w);
}

let errors = 0;
let warnings = 0;
const err = (m) => { console.error("  ERROR:", m); errors++; };
const warn = (m) => { console.warn("  warn:", m); warnings++; };

const meta = JSON.parse(await readFile(join(DATA_DIR, "img-meta.json"), "utf8"));
const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json") && !SKIP.has(f));

let refs = 0;
let covered = 0;
const sampled = [];
for (const f of files) {
  const json = JSON.parse(await readFile(join(DATA_DIR, f), "utf8"));
  const list = Array.isArray(json) ? json : Object.values(json).flat();
  if (FLOORS[f] != null && list.length < FLOORS[f]) err(`${f}: ${list.length} records < floor ${FLOORS[f]}`);
  const ids = new Set();
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    if (x.id != null) {
      if (ids.has(x.id)) err(`${f}: duplicate id ${x.id}`);
      ids.add(x.id);
    }
    if (!x.name) err(`${f}: record without name (id=${x.id})`);
    for (const field of ["photo", "coa"]) {
      const url = x[field];
      if (typeof url !== "string") continue;
      const m = FILEPATH_RE.exec(url) ?? DIRECT_RE.exec(url);
      if (!m) { warn(`${f}: unrecognized ${field} URL: ${url.slice(0, 80)}`); continue; }
      refs++;
      const key = decodeURIComponent(m[1]).replace(/_/g, " ").normalize("NFC");
      const entry = meta[key];
      if (entry) {
        covered++;
        sampled.push([f, key, entry]);
      }
    }
  }
}
const coverage = (covered / refs) * 100;
console.log(`image refs: ${refs}, meta coverage: ${coverage.toFixed(2)}%`);
if (coverage < 99) err(`img-meta coverage ${coverage.toFixed(2)}% < 99% — re-run scripts/enrich-images.mjs`);

// Live HEAD-check ~24 evenly spaced samples (deterministic), always including
// an SVG and a custom-pattern (tif) entry if present.
const picks = [];
for (let i = 0; i < 20; i++) picks.push(sampled[Math.floor((i * sampled.length) / 20)]);
const svg = sampled.find(([, , e]) => e[3] === 1);
const custom = sampled.find(([, , e]) => typeof e[3] === "string");
const tinyOrig = sampled.find(([, , e]) => e[0] < 330);
for (const extra of [svg, custom, tinyOrig]) if (extra) picks.push(extra);

let ok = 0;
for (const [f, key, entry] of picks) {
  const url = sampleUrl(entry);
  const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA } });
  if (res.ok) ok++;
  else if (res.status === 429) { warn(`429 throttled: ${key}`); ok++; }
  else err(`HEAD ${res.status} for ${f} / ${key}\n    ${url}`);
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`live HEAD checks: ${ok}/${picks.length} ok`);

console.log(errors ? `\nFAILED with ${errors} error(s), ${warnings} warning(s)` : `\nOK (${warnings} warning(s))`);
process.exit(errors ? 1 : 0);
