// Deep data + engine audit. Run: npx tsx scripts/audit.ts
// Checks id integrity (no dup / no cross-kind leakage), generator soundness
// (every generator yields valid 4-option rounds with distinct choices and the
// answer among them), map payload validity, image renderability, and Sortér.
import { byKind, Kind } from "@/lib/data";
import { activeGenerators, nextRound, nextOrderRound, CATEGORIES, Category } from "@/lib/questions";

let problems = 0;
const fail = (m: string) => { console.log("  ✗ " + m); problems++; };
const ok = (m: string) => console.log("  ✓ " + m);

// ---- 1. ID integrity -------------------------------------------------------
console.log("\n[1] ID integrity");
const idOwner = new Map<string, Kind[]>();
let dupTotal = 0;
for (const [kind, list] of Object.entries(byKind) as [Kind, typeof byKind[Kind]][]) {
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p.id)) { fail(`duplicate id within ${kind}: ${p.id}`); dupTotal++; }
    seen.add(p.id);
    idOwner.set(p.id, [...(idOwner.get(p.id) ?? []), kind]);
  }
}
if (!dupTotal) ok("no duplicate ids within any kind");
// Cross-kind collisions (Oslo as kommune+fylke is the one known/accepted case).
let cross = 0;
for (const [id, kinds] of idOwner) {
  const uniq = [...new Set(kinds)];
  if (uniq.length > 1) {
    const accepted = uniq.length === 2 && uniq.includes("kommune") && uniq.includes("fylke");
    if (!accepted) { fail(`id ${id} shared across kinds: ${uniq.join(", ")}`); cross++; }
  }
}
if (!cross) ok("no cross-kind id leakage (besides Oslo kommune/fylke)");

// ---- 2. Generator soundness -----------------------------------------------
console.log("\n[2] Generator soundness (every generator, 60 builds each)");
const allCats = new Set(CATEGORIES.map((c) => c.key));
const gens = activeGenerators(allCats, new Set(), false);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
let genFail = 0;
for (const g of gens) {
  let built = 0, bad = 0;
  for (let i = 0; i < 60; i++) {
    const r = g.build(pick(g.pool));
    if (!r) continue;
    built++;
    const issues: string[] = [];
    if (r.choices.length !== 4) issues.push("not 4 choices");
    if (new Set(r.choices).size !== r.choices.length) issues.push("duplicate choices");
    if (!r.choices.includes(r.answerKey)) issues.push("answer not in choices");
    if (r.answerIndex !== r.choices.indexOf(r.answerKey)) issues.push("answerIndex mismatch");
    if (!Number.isFinite(r.difficulty)) issues.push("bad difficulty");
    if (!r.prompt || !("kind" in r.prompt)) issues.push("no prompt");
    if (r.prompt?.kind === "map" && !(r.prompt.region || r.prompt.line || r.prompt.pin || r.prompt.svalbard)) issues.push("empty map");
    if (r.prompt?.kind === "image" && !r.prompt.src) issues.push("empty image src");
    if (issues.length) { bad++; if (bad <= 1) fail(`${g.key}: ${issues.join("; ")}`); }
  }
  if (bad) genFail++;
}
if (!genFail) ok(`all ${gens.length} active generators produce valid rounds`);

// ---- 3. nextRound across categories ---------------------------------------
console.log("\n[3] nextRound per category (200 rounds each)");
let rndFail = 0;
for (const c of CATEGORIES.map((x) => x.key) as Category[]) {
  const g = activeGenerators(new Set([c]), new Set(), false);
  if (!g.length) { fail(`${c}: no active generators`); rndFail++; continue; }
  const ctx = { recentSubjects: new Set<string>(), recentAnswers: [] as string[], lastGen: null as string | null };
  try { for (let i = 0; i < 200; i++) { const r = nextRound(g, ctx); if (!r.choices.includes(r.answerKey)) { fail(`${c}: bad round`); rndFail++; break; } } }
  catch (e) { fail(`${c}: threw ${(e as Error).message}`); rndFail++; }
}
if (!rndFail) ok("every category yields valid rounds");

// ---- 4. Image renderability ------------------------------------------------
console.log("\n[4] Image URLs");
const okExt = /\.(svg|png|jpe?g|gif|webp)(\?|$)/i;
// Wikimedia Special:FilePath with a width param thumbnails any source (tif, pdf,
// svg) to a browser-renderable raster, so those count as renderable too.
const renderable = (url: string) => okExt.test(url) || (/Special:FilePath/i.test(url) && /[?&]width=/i.test(url));
let badImg = 0;
for (const [kind, list] of Object.entries(byKind) as [Kind, typeof byKind[Kind]][]) {
  for (const p of list) {
    for (const url of [p.photo, p.coa]) {
      if (url && !renderable(url)) { if (badImg < 8) fail(`${kind} ${p.name}: non-renderable image ${url.slice(-40)}`); badImg++; }
    }
  }
}
if (!badImg) ok("all image URLs use renderable formats");
else fail(`${badImg} non-renderable image URLs total`);

// ---- 5. Sortér -------------------------------------------------------------
console.log("\n[5] Sortér (nextOrderRound) per category");
let ordFail = 0;
for (const c of ["fjell","elver","innsjoer","fjorder","oyer","fossefall","isbreer","tunneler","befolkning","byer","baner","nasjonalparker","turistveger","veier","distrikter","landsdeler"] as Category[]) {
  try { const o = nextOrderRound(new Set([c])); if (o.items.length !== 4 || o.correctIds.length !== 4) { fail(`${c}: bad order round`); ordFail++; } }
  catch (e) { fail(`${c}: order threw ${(e as Error).message}`); ordFail++; }
}
if (!ordFail) ok("Sortér works for all listed categories");

console.log(`\n${problems ? "AUDIT FAILED: " + problems + " problem(s)" : "AUDIT PASSED — no problems"}`);
process.exit(problems ? 1 : 0);
