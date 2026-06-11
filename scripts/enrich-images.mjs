// Build-time image enrichment. Scans src/data/*.json for Wikimedia Commons
// photo/coa refs (Special:FilePath URLs), batch-queries the Commons imageinfo
// API (50 titles/request) and writes src/data/img-meta.json:
//
//   { "<File name with spaces>": [origWidth, origHeight, "X/XY/Enc_Name.jpg", flag?] }
//
// flag: absent = standard thumb name "{w}px-<EncName>"
//       1      = SVG (thumb name gets ".png" appended; scalable, no clamp)
//       string = custom thumb-name pattern containing "{w}" (tif/pdf etc.)
//
// The third element is the exact shard+filename path as served by
// upload.wikimedia.org, so the client never needs to hash or re-encode
// anything. Every entry is verified byte-exact against the API's thumburl.
//
// The same pass is a liveness check: photo/coa fields whose file is missing
// on Commons are dropped from the data file, and renamed files have their
// URL rewritten to the new title.
//
// Run: node scripts/enrich-images.mjs
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const PROBE_W = 330; // a real Wikimedia render bucket; used to learn the thumb pattern

const SKIP_FILES = new Set(["img-meta.json", "geo.json", "geo-water.json", "geo-svalbard.json", "ssb-kommuner.json", "ssb-fylker.json"]);
const FILEPATH_RE = /^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?]+)(?:\?.*)?$/;
// Some curated data links originals on upload.wikimedia.org directly (the
// ?width= param there is silently ignored — the full original is served).
const DIRECT_RE = /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/.\/..\/([^/?]+)(?:\?.*)?$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// URL -> canonical File title (no "File:" prefix, spaces not underscores, NFC).
function urlToName(url) {
  const m = FILEPATH_RE.exec(url) ?? DIRECT_RE.exec(url);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/_/g, " ").normalize("NFC");
}

async function apiBatch(names, attempt = 1) {
  const body = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "imageinfo",
    iiprop: "url|size|mime",
    iiurlwidth: String(PROBE_W),
    titles: names.map((n) => `File:${n}`).join("|"),
  });
  const res = await fetch(API, { method: "POST", body, headers: { "User-Agent": UA } });
  if (!res.ok) {
    if (attempt <= 5 && (res.status === 429 || res.status >= 500)) {
      const wait = 2000 * attempt;
      console.warn(`  HTTP ${res.status}, retry ${attempt} in ${wait}ms`);
      await sleep(wait);
      return apiBatch(names, attempt + 1);
    }
    throw new Error(`Commons API HTTP ${res.status}`);
  }
  return res.json();
}

function entryFromImageinfo(ii) {
  const { width, height, url, thumburl } = ii;
  const pathMatch = /\/wikipedia\/commons\/(.\/..\/[^/]+)$/.exec(url);
  if (!pathMatch) return null;
  const path = pathMatch[1];
  const encName = path.split("/").pop();
  const entry = [width, height, path];
  if (thumburl && thumburl.includes("/thumb/")) {
    const thumbName = thumburl.split("/").pop();
    const std = `${PROBE_W}px-${encName}`;
    if (thumbName === std) {
      // standard — no flag
    } else if (thumbName === `${std}.png` && ii.mime === "image/svg+xml") {
      entry.push(1);
    } else if (thumbName.includes(`${PROBE_W}px-`)) {
      entry.push(thumbName.replace(`${PROBE_W}px-`, "{w}px-"));
    } else {
      return null; // unintelligible pattern -> leave to runtime fallback
    }
    // Verify byte-exact: rebuild the thumburl from the compact entry.
    const flag = entry[3];
    const rebuiltName = typeof flag === "string" ? flag.replace("{w}px-", `${PROBE_W}px-`) : flag === 1 ? `${std}.png` : std;
    const rebuilt = `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}/${rebuiltName}`;
    if (rebuilt !== thumburl) {
      console.warn(`  VERIFY MISMATCH for ${encName}:\n    api:   ${thumburl}\n    built: ${rebuilt}`);
      return null;
    }
  }
  return entry;
}

async function main() {
  // ---- 1. Collect every Commons image URL across the dataset ---------------
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json") && !SKIP_FILES.has(f));
  const datasets = new Map(); // file -> parsed JSON
  const nameToUrls = new Map(); // canonical name -> Set of raw URLs seen
  const records = []; // { obj, field, url, name }

  for (const f of files) {
    const json = JSON.parse(await readFile(join(DATA_DIR, f), "utf8"));
    datasets.set(f, json);
    const lists = Array.isArray(json) ? [json] : Object.values(json).filter(Array.isArray);
    for (const list of lists) {
      for (const obj of list) {
        if (obj == null || typeof obj !== "object") continue;
        for (const field of ["photo", "coa"]) {
          const url = obj[field];
          if (typeof url !== "string") continue;
          const name = urlToName(url);
          if (!name) continue;
          records.push({ file: f, obj, field, url, name });
          if (!nameToUrls.has(name)) nameToUrls.set(name, new Set());
          nameToUrls.get(name).add(url);
        }
      }
    }
  }
  const names = [...nameToUrls.keys()];
  console.log(`Found ${records.length} image refs (${names.length} unique files) across ${files.length} data files`);

  // ---- 2. Query Commons in batches of 50 -----------------------------------
  const meta = {}; // canonical name -> [w, h, path, flag?]
  const renames = new Map(); // old name -> new name
  const dead = new Set();
  for (let i = 0; i < names.length; i += 50) {
    const batch = names.slice(i, i + 50);
    const json = await apiBatch(batch);
    // Map response titles back to our keys through normalized + redirects.
    const toQueried = new Map(); // final title -> originally queried title
    for (const n of batch) toQueried.set(`File:${n}`, `File:${n}`);
    for (const stage of [json.query?.normalized, json.query?.redirects]) {
      for (const { from, to } of stage ?? []) {
        if (toQueried.has(from)) toQueried.set(to, toQueried.get(from));
        if (json.query?.redirects?.some((r) => r.from === to)) continue;
      }
    }
    for (const page of json.query?.pages ?? []) {
      const queried = toQueried.get(page.title) ?? page.title;
      const key = queried.replace(/^File:/, "");
      const finalName = page.title.replace(/^File:/, "").normalize("NFC");
      if (page.missing || !page.imageinfo?.[0]?.url) {
        dead.add(key);
        continue;
      }
      const entry = entryFromImageinfo(page.imageinfo[0]);
      if (!entry) continue; // runtime falls back to Special:FilePath
      meta[finalName] = entry;
      if (finalName !== key) renames.set(key, finalName);
    }
    process.stdout.write(`  ${Math.min(i + 50, names.length)}/${names.length}\r`);
    await sleep(300);
  }
  console.log();

  // ---- 3. Apply liveness + renames back to the data files -------------------
  const changedFiles = new Set();
  let dropped = 0;
  let renamed = 0;
  for (const r of records) {
    if (dead.has(r.name)) {
      delete r.obj[r.field];
      changedFiles.add(r.file);
      dropped++;
    } else if (renames.has(r.name)) {
      const widthMatch = /[?&]width=(\d+)/.exec(r.url);
      const w = widthMatch ? `?width=${widthMatch[1]}` : "";
      r.obj[r.field] = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(renames.get(r.name))}${w}`;
      changedFiles.add(r.file);
      renamed++;
    }
  }
  for (const f of changedFiles) {
    await writeFile(join(DATA_DIR, f), JSON.stringify(datasets.get(f), null, 2));
  }

  await writeFile(join(DATA_DIR, "img-meta.json"), JSON.stringify(meta));
  const covered = Object.keys(meta).length;
  console.log(`img-meta.json: ${covered} entries (${((covered / names.length) * 100).toFixed(1)}% of unique files)`);
  console.log(`liveness: dropped ${dropped} dead refs, rewrote ${renamed} renamed refs in: ${[...changedFiles].join(", ") || "(none)"}`);
  if (dead.size) console.log(`dead files: ${[...dead].slice(0, 20).join(" | ")}${dead.size > 20 ? " …" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
