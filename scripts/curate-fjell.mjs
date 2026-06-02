// Expands fjell.json to cover every Norwegian peak over 2000 m.
//
// Wikidata (fetched by fetch-data.mjs) misses many 2000 m tops, so this script
// merges in the canonical Wikipedia list "Liste over Norges høyeste fjell".
// It keeps the existing Wikidata entries (which carry photos + coordinates) and
// appends any 2000 m+ peak that isn't already present, tagging it with its
// fylke (county) from the list. Run AFTER fetch-data.mjs:  node scripts/curate-fjell.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "fjell.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const TITLE = "Liste over Norges høyeste fjell";

const norm = (s) => (s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const stripTags = (s) =>
  s
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const slug = (s) =>
  norm(s).replace(/[æ]/g, "ae").replace(/[ø]/g, "o").replace(/[å]/g, "a").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "Knutsholstinden, Store" -> "Store Knutsholstinden" (Wikipedia sort form).
const QUALIFIERS = new Set([
  "store", "lille", "vesle", "store", "søre", "sør", "søndre", "nordre", "nord", "nørdre",
  "vestre", "vest", "østre", "øst", "austre", "aust", "midtre", "indre", "ytre", "fremste",
  "bakarste", "nedre", "øvre", "vetle", "veslpiggen",
]);
function tidyName(disp) {
  const parts = disp.split(", ");
  if (parts.length === 2 && QUALIFIERS.has(norm(parts[1]))) {
    const q = parts[1];
    return q.charAt(0).toUpperCase() + q.slice(1) + " " + parts[0];
  }
  return disp;
}

// The peak's identifying words, dropping directional/size qualifiers and
// technical sub-top ids (e.g. "Ø-1", "V-3"), so "Søre Veotinden" reduces to
// the same token as the Wikidata entry labelled plainly "Veotinden".
function baseWords(name) {
  return norm(name)
    .replace(/\(.*?\)/g, "")
    .split(/[\s,]+/)
    .filter((w) => w && !QUALIFIERS.has(w) && !/^[a-zæøå]?-?\d/.test(w));
}

// Rowspan-aware parse of the height-segment tables (8 fixed columns:
// Nr, Navn, Høyde, Primærfaktor, Kommune, Fylke, Fjellområde, Andre).
function parsePeaks(html) {
  const NC = 8;
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]
    .map((m) => m[0])
    .filter((t) => /Prim/i.test(t) && /H.yde/i.test(t));
  const peaks = [];
  for (const t of tables) {
    const trs = [...t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
    const carry = {};
    for (const tr of trs) {
      if (/<th\b/i.test(tr) && !/<td\b/i.test(tr)) continue; // header row
      const cells = [...tr.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((m) => ({ attr: m[1], html: m[2] }));
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
          const a = c.html.match(/<a\b[^>]*?title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
          const val = { txt: stripTags(c.html), title: a ? a[1] : null, disp: a ? stripTags(a[2]) : stripTags(c.html) };
          for (let k = 0; k < cs && col + k < NC; k++) {
            out[col + k] = val;
            if (rs > 1) carry[col + k] = { val, rows: rs - 1 };
          }
          col += cs;
        } else col++;
      }
      const navn = out[1], hoyde = out[2], fylke = out[5];
      if (!navn || !hoyde) continue;
      const h = parseInt(String(hoyde.txt).replace(/[^0-9]/g, ""), 10);
      if (!h || h < 2000 || h > 2475) continue;
      peaks.push({ disp: navn.disp, title: navn.title, elevation: h, fylke: fylke ? fylke.disp : null });
    }
  }
  // Dedupe by display name (sub-tops share a page title, so don't key on it).
  const seen = new Set();
  return peaks.filter((p) => {
    const k = norm(p.disp);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  const existing = JSON.parse(await readFile(FILE, "utf8"));
  const known = new Set(existing.map((x) => norm(x.name)));
  // Ids must be unique — several sub-tops link to the same group article, so
  // base the id on the (unique) name and guard against any residual collision.
  const usedIds = new Set(existing.map((x) => x.id));
  const uniqueId = (name) => {
    const base = `fjell-${slug(name)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };
  // Index existing peaks by rounded elevation, so a Wikipedia peak that's the
  // same mountain under a fuller name (same height + same base word) is skipped.
  const byElev = new Map();
  for (const x of existing) {
    if (x.elevation == null) continue;
    const k = Math.round(x.elevation);
    if (!byElev.has(k)) byElev.set(k, []);
    byElev.get(k).push(new Set(baseWords(x.name)));
  }
  const isSamePeak = (name, elev) => {
    const bw = baseWords(name);
    if (!bw.length) return false;
    for (const k of [elev - 1, elev, elev + 1]) {
      for (const ws of byElev.get(k) || []) {
        if (bw.every((w) => ws.has(w))) return true;
      }
    }
    return false;
  };

  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=text&format=json&page=${encodeURIComponent(TITLE)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.json()).parse.text["*"];
  const wiki = parsePeaks(html);

  const added = [];
  for (const p of wiki) {
    if (known.has(norm(p.disp)) || (p.title && known.has(norm(p.title)))) continue;
    const name = tidyName(p.disp);
    // Drop technical sub-tops whose name still carries a comma id (e.g.
    // "Vestre Memurutindan, V-3") — they make poor quiz answers.
    if (name.includes(",")) continue;
    if (known.has(norm(name)) || isSamePeak(name, p.elevation)) continue;
    known.add(norm(name));
    const k = Math.round(p.elevation);
    if (!byElev.has(k)) byElev.set(k, []);
    byElev.get(k).push(new Set(baseWords(name)));
    added.push({ id: uniqueId(name), name, elevation: p.elevation, county: p.fylke || undefined });
  }

  const merged = [...existing, ...added].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
  await writeFile(FILE, JSON.stringify(merged, null, 2));

  const over2000 = merged.filter((m) => (m.elevation ?? 0) >= 2000).length;
  console.log(`fjell: ${existing.length} -> ${merged.length} (+${added.length} from Wikipedia); over 2000 m: ${over2000}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
