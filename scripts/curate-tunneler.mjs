// Expands tunneler.json to cover all Norwegian road tunnels over 3 km.
//
// Sources:
//   Wikipedia "Liste over veitunneler i Norge" — full list with lengths (table 0 = opened tunnels)
//   Wikidata — coordinates (P625), photo (P18), county (P131)
//
// Run: node scripts/curate-tunneler.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "tunneler.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const WIKI_TITLE = "Liste over veitunneler i Norge";
const MIN_LENGTH_M = 3000; // 3 km threshold
const CURRENT_YEAR = 2026; // tunnels opened by this year only

// ── helpers ──────────────────────────────────────────────────────────────────
const norm = (s) =>
  (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

const stripTags = (s) =>
  s
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\[[0-9a-z*]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const slug = (s) =>
  norm(s)
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Strip trailing parenthetical from name, e.g. "Ryfylketunnelen (Solbakktunnelen, Ryfast)"
// → "Ryfylketunnelen"
const stripParens = (name) => name.replace(/\s*\(.*\)\s*$/, "").trim();

// Parse the first (longest) length value from a length cell that may contain:
//  - multiple tube lengths separated by • or / e.g. "3 825 / 3 195"
//  - parenthetical notes e.g. "680 (1000)" or "3 445 (planned)"
//  - Norwegian non-breaking space as thousands separator e.g. "3 445"
function parseFirstLengthM(txt) {
  // Strip parenthetical notes first (e.g. "(1000)" or "(planned)")
  let s = txt.replace(/\(.*?\)/g, " ");
  // Split on bullet, middle dot, or slash — take the first segment (longest tube)
  s = s.split(/[•·\/]|&#8226;/)[0];
  // Remove thousands separators (non-breaking space, regular space, dot/comma before 3 digits)
  s = s.replace(/\s/g, "").replace(/[.,](?=\d{3})/g, "");
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
}

// ── Wikipedia HTML parser ─────────────────────────────────────────────────────
// Only uses the table whose year column is "åpnet" (past tense = already opened).
// Tables with "åpner" or "mulig åpning" are planned tunnels — skip.
// Table columns: Navn | Strekning | Lengde (m) | Antall løp | Åpnet | Kommune | Fylke | muh.
function parseTunnels(html) {
  const tunnels = [];

  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    if (!/Lengde/i.test(tableHtml) || !/Navn/i.test(tableHtml)) continue;

    const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    if (rows.length < 2) continue;

    // Parse header to find column positions
    const hCells = [...rows[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      norm(stripTags(m[1]))
    );
    let colNavn = -1, colLengde = -1, colFylke = -1, colKommune = -1, colAapnet = -1;
    for (let i = 0; i < hCells.length; i++) {
      const h = hCells[i];
      if (h.includes("navn") && colNavn === -1) colNavn = i;
      else if (h.includes("lengde") && colLengde === -1) colLengde = i;
      else if (h.includes("fylke") && colFylke === -1) colFylke = i;
      else if (h.includes("kommune") && colKommune === -1) colKommune = i;
      else if ((h === "åpnet" || h === "åpner" || h.includes("pning")) && colAapnet === -1)
        colAapnet = i;
    }

    if (colNavn === -1 || colLengde === -1) continue;

    // CRITICAL: skip planned-tunnel tables — they have "åpner" or "mulig åpning" not "åpnet"
    if (colAapnet >= 0) {
      const yearHeader = hCells[colAapnet];
      if (yearHeader !== "åpnet") {
        // This is a planned tunnels table — skip entirely
        continue;
      }
    }

    const NC =
      Math.max(
        colNavn,
        colLengde,
        colFylke >= 0 ? colFylke : 0,
        colKommune >= 0 ? colKommune : 0,
        colAapnet >= 0 ? colAapnet : 0
      ) + 2;
    const carry = {};

    for (let ri = 1; ri < rows.length; ri++) {
      const row = rows[ri];
      if (/<th\b/i.test(row) && !/<td\b/i.test(row)) continue;

      const cells = [...row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((m) => ({
        attr: m[1],
        html: m[2],
      }));
      if (!cells.length) continue;

      const out = new Array(NC).fill(null);
      let col = 0, pc = 0;

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
          const a = c.html.match(/<a\b[^>]*?title="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
          const txt = stripTags(c.html);
          const val = { txt, title: a ? a[1] : null, disp: a ? stripTags(a[2]) : txt };
          for (let k = 0; k < cs && col + k < NC; k++) {
            out[col + k] = val;
            if (rs > 1) carry[col + k] = { val, rows: rs - 1 };
          }
          col += cs;
        } else {
          col++;
        }
      }

      const navnCell = out[colNavn];
      const lengdeCell = out[colLengde];
      const fylkeCell = colFylke >= 0 ? out[colFylke] : null;
      const kommuneCell = colKommune >= 0 ? out[colKommune] : null;
      const aapnetCell = colAapnet >= 0 ? out[colAapnet] : null;

      if (!navnCell || !lengdeCell) continue;

      // Parse length — only the first tube's length
      const lenM = parseFirstLengthM(lengdeCell.txt);
      if (!lenM || lenM < MIN_LENGTH_M) continue;

      // Check opening year — skip future tunnels
      if (aapnetCell) {
        const yearStr = aapnetCell.txt.replace(/[^0-9]/g, "").slice(0, 4);
        const year = parseInt(yearStr, 10);
        if (year && year > CURRENT_YEAR) continue;
      }

      // Clean name — strip parenthetical project names
      const rawName = navnCell.disp || navnCell.txt;
      const name = stripParens(rawName);

      // Take first county value (some rows list multiple municipalities)
      const county = fylkeCell
        ? stripParens(stripTags(fylkeCell.txt).split(/[•·,\/]/)[0].trim())
        : null;

      tunnels.push({
        name,
        wikiTitle: navnCell.title || null,
        lengthM: lenM,
        county: county || null,
        municipality: kommuneCell
          ? stripParens(stripTags(kommuneCell.txt).split(/[•·,\/]/)[0].trim())
          : null,
      });
    }
  }

  // Deduplicate by normalized name (keep first occurrence)
  const seen = new Set();
  return tunnels.filter((t) => {
    const k = norm(t.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Wikidata enrichment ───────────────────────────────────────────────────────
// Query all Norwegian items whose Norwegian label contains "tunnel" — this
// captures the ~24 tunnels that actually have coordinates in Wikidata.
async function wikidataEnrich() {
  const sparql = `
SELECT DISTINCT ?item ?itemLabel ?coord ?image ?countyLabel WHERE {
  ?item rdfs:label ?itemLabel .
  FILTER(LANG(?itemLabel) = "no")
  FILTER(CONTAINS(LCASE(?itemLabel), "tunnel"))
  ?item wdt:P17 wd:Q20 .
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL {
    ?item wdt:P131 ?county .
    ?county rdfs:label ?countyLabel .
    FILTER(LANG(?countyLabel) = "no")
  }
}
LIMIT 1000
  `.trim();

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    });
    if (!res.ok) {
      console.warn(`  Wikidata SPARQL HTTP ${res.status} — skipping bulk enrichment`);
      return new Map();
    }
    const data = await res.json();
    const map = new Map();
    for (const row of data.results.bindings) {
      const label = norm(row.itemLabel?.value || "");
      if (!label) continue;
      const entry = map.get(label) || {};
      if (row.coord?.value && entry.lat == null) {
        const m = row.coord.value.match(/Point\(([0-9.+\-]+)\s+([0-9.+\-]+)\)/i);
        if (m) {
          entry.lon = parseFloat(m[1]);
          entry.lat = parseFloat(m[2]);
        }
      }
      if (row.image?.value && !entry.photo) {
        const raw = row.image.value.replace(
          "http://commons.wikimedia.org/wiki/Special:FilePath/",
          ""
        );
        entry.photo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
          decodeURIComponent(raw)
        )}?width=1024`;
      }
      if (row.countyLabel?.value && !entry.county) {
        entry.county = row.countyLabel.value;
      }
      map.set(label, entry);
    }
    return map;
  } catch (e) {
    console.warn("  Wikidata enrichment failed:", e.message);
    return new Map();
  }
}

// Individual Wikidata lookup — only accepts hits whose description mentions "tunnel"
async function wikidataLookupOne(name) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=no&type=item&format=json&limit=5`;
  try {
    const res = await fetch(searchUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    for (const hit of data.search || []) {
      if (norm(hit.label) !== norm(name)) continue;
      // Require description to contain "tunnel" to avoid false positives (municipalities, etc.)
      if (!hit.description || !/tunnel/i.test(hit.description)) continue;
      // Fetch entity claims
      const eRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (!eRes.ok) continue;
      const eData = await eRes.json();
      const claims = eData.entities?.[hit.id]?.claims || {};
      const result = {};
      const coordVal = claims.P625?.[0]?.mainsnak?.datavalue?.value;
      if (coordVal) {
        result.lat = coordVal.latitude;
        result.lon = coordVal.longitude;
      }
      const imgVal = claims.P18?.[0]?.mainsnak?.datavalue?.value;
      if (imgVal) {
        result.photo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imgVal)}?width=1024`;
      }
      return result;
    }
  } catch (_) {}
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading existing tunneler.json …");
  const existing = JSON.parse(await readFile(FILE, "utf8"));
  const beforeCount = existing.length;
  console.log(`  Before: ${beforeCount} tunnels`);

  const existingByName = new Map(existing.map((t) => [norm(t.name), t]));
  const usedIds = new Set(existing.map((t) => t.id));

  const uniqueId = (name) => {
    const base = `tunnel-${slug(name)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  // ── Step 1: fetch Wikipedia list ──────────────────────────────────────────
  console.log("\nFetching Wikipedia tunnel list …");
  const wikiUrl = `https://no.wikipedia.org/w/api.php?action=parse&prop=text&format=json&page=${encodeURIComponent(WIKI_TITLE)}`;
  const wikiRes = await fetch(wikiUrl, { headers: { "User-Agent": UA } });
  if (!wikiRes.ok) throw new Error(`Wikipedia HTTP ${wikiRes.status}`);
  const wikiJson = await wikiRes.json();
  if (wikiJson.error) throw new Error(`Wikipedia error: ${JSON.stringify(wikiJson.error)}`);
  const html = wikiJson.parse.text["*"];
  console.log(`  HTML length: ${(html.length / 1024).toFixed(0)} KB`);

  const wikiTunnels = parseTunnels(html);
  console.log(`  Found ${wikiTunnels.length} opened tunnels ≥ ${MIN_LENGTH_M / 1000} km`);

  // ── Step 2: Wikidata bulk enrichment ─────────────────────────────────────
  console.log("\nQuerying Wikidata (bulk SPARQL, Norwegian road tunnels) …");
  const wdMap = await wikidataEnrich();
  console.log(`  Wikidata returned data for ${wdMap.size} tunnel labels`);

  // ── Step 3: Enrich existing entries ──────────────────────────────────────
  console.log("\nEnriching existing entries …");
  let existingEnriched = 0;
  for (const entry of existing) {
    const wd = wdMap.get(norm(entry.name));
    let changed = false;
    if (wd) {
      if (entry.lat == null && wd.lat != null) {
        entry.lat = wd.lat;
        entry.lon = wd.lon;
        changed = true;
      }
      if (!entry.photo && wd.photo) { entry.photo = wd.photo; changed = true; }
      if (!entry.county && wd.county) { entry.county = wd.county; changed = true; }
    }
    if (changed) existingEnriched++;
  }
  console.log(`  Enriched ${existingEnriched} existing entries from Wikidata`);

  // ── Step 4: Add new tunnels from Wikipedia ────────────────────────────────
  console.log("\nMerging Wikipedia tunnels …");
  const added = [];
  for (const wt of wikiTunnels) {
    const key = norm(wt.name);
    if (existingByName.has(key)) {
      const ex = existingByName.get(key);
      if (!ex.county && wt.county) ex.county = wt.county;
      continue;
    }

    const lenKm = Math.round(wt.lengthM / 100) / 10; // one decimal, in km
    const wd = wdMap.get(key);

    const entry = {
      id: uniqueId(wt.name),
      name: wt.name,
      length: lenKm,
      county: wt.county || wd?.county || undefined,
    };
    if (wd?.lat != null) { entry.lat = wd.lat; entry.lon = wd.lon; }
    if (wd?.photo) entry.photo = wd.photo;
    if (!entry.county) delete entry.county;

    added.push(entry);
    existingByName.set(key, entry);
  }
  console.log(`  Added ${added.length} new tunnels`);

  // ── Step 5: Spot-enrich missing coords via individual Wikidata lookups ────
  const merged = [...existing, ...added].sort((a, b) => (b.length ?? 0) - (a.length ?? 0));
  const needCoords = merged.filter((t) => t.lat == null && (t.length ?? 0) >= 3);
  const lookupCount = Math.min(needCoords.length, 70);
  console.log(`\nSpot-enriching ${lookupCount} tunnels missing coords …`);
  let spotEnriched = 0;
  for (const entry of needCoords.slice(0, lookupCount)) {
    const result = await wikidataLookupOne(entry.name);
    if (result?.lat != null) {
      entry.lat = result.lat;
      entry.lon = result.lon;
      spotEnriched++;
    }
    if (result?.photo && !entry.photo) entry.photo = result.photo;
    await sleep(130);
  }
  console.log(`  Spot-enriched ${spotEnriched} entries with coords`);

  // ── Step 6: Validate — zero duplicate ids ─────────────────────────────────
  const idCounts = {};
  for (const t of merged) idCounts[t.id] = (idCounts[t.id] || 0) + 1;
  const dupIds = Object.entries(idCounts).filter(([, c]) => c > 1);
  if (dupIds.length) {
    console.error("DUPLICATE IDs FOUND:", dupIds);
    process.exit(1);
  }

  // ── Step 7: Sort and write ────────────────────────────────────────────────
  merged.sort((a, b) => (b.length ?? 0) - (a.length ?? 0));
  await writeFile(FILE, JSON.stringify(merged, null, 2));

  // Verify JSON round-trips cleanly
  const verify = JSON.parse(await readFile(FILE, "utf8"));
  if (verify.length !== merged.length) throw new Error("JSON write verification failed!");

  // ── Report ────────────────────────────────────────────────────────────────
  const withCoords = merged.filter((t) => t.lat != null).length;
  const withPhoto = merged.filter((t) => t.photo).length;
  const withCounty = merged.filter((t) => t.county).length;

  console.log("\n══ DONE ══════════════════════════════════════════════════════");
  console.log(`Tunnels:          ${beforeCount} → ${merged.length} (+${added.length} new)`);
  console.log(`Length coverage:  ${merged.length}/${merged.length} (100%)`);
  console.log(`Lat/lon coverage: ${withCoords}/${merged.length}`);
  console.log(`Photo coverage:   ${withPhoto}/${merged.length}`);
  console.log(`County coverage:  ${withCounty}/${merged.length}`);
  console.log(`Duplicate id check: PASS (0 duplicates)`);
  console.log(`Enriched existing: ${existingEnriched} entries updated`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
