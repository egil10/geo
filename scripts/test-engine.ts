// Engine sanity test. Run: npx tsx scripts/test-engine.ts
import { activeGenerators, nextRound, CATEGORIES, Category } from "@/lib/questions";
import { kommuner, fylker, byKind } from "@/lib/data";

let fail = 0;
const err = (m: string) => {
  console.error("✗ " + m);
  fail++;
};

// ---- Data invariants ----
console.log("kommuner:", kommuner.length, "| fylker:", fylker.length);
if (kommuner.length !== 357) err(`expected 357 kommuner, got ${kommuner.length}`);
if (fylker.length !== 15) err(`expected 15 fylker, got ${fylker.length}`);
for (const k of kommuner) {
  if (!k.county) err(`kommune ${k.name} missing county`);
  if (!k.number) err(`kommune ${k.name} missing number`);
  if (!k.coa) err(`kommune ${k.name} missing coa`);
  if (k.population == null) err(`kommune ${k.name} missing population`);
}
const BLOCK = new Set(["Q11223614", "Q19384217", "Q16467321", "Q6980145", "Q6513906", "Q20113109"]);
for (const kind of Object.keys(byKind) as (keyof typeof byKind)[]) {
  for (const p of byKind[kind]) if (BLOCK.has(p.id)) err(`blocklisted ${p.id} present in ${kind}`);
}

// ---- Round generation across every single category, plus the all-mix ----
const cases: { name: string; sel: Set<Category> }[] = CATEGORIES.map((c) => ({
  name: c.label,
  sel: new Set<Category>([c.key]),
}));
cases.push({ name: "ALT", sel: new Set<Category>() });

const genCounts: Record<string, number> = {};
let rounds = 0;
for (const c of cases) {
  const gens = activeGenerators(c.sel);
  if (!gens.length) err(`${c.name}: no active generators`);
  const ctx = { recentSubjects: new Set<string>(), recentAnswers: [] as string[], lastGen: null as string | null };
  for (let i = 0; i < 1500; i++) {
    const r = nextRound(gens, ctx);
    rounds++;
    genCounts[r.genKey] = (genCounts[r.genKey] || 0) + 1;
    // invariants
    if (r.choices.length !== 4) err(`${c.name}/${r.genKey}: ${r.choices.length} choices`);
    if (new Set(r.choices).size !== 4) err(`${c.name}/${r.genKey}: duplicate choices [${r.choices.join(", ")}]`);
    if (r.answerIndex < 0 || r.answerIndex > 3) err(`${c.name}/${r.genKey}: bad answerIndex ${r.answerIndex}`);
    if (r.choices[r.answerIndex] !== r.answerKey)
      err(`${c.name}/${r.genKey}: choices[ai]="${r.choices[r.answerIndex]}" != answerKey="${r.answerKey}"`);
    if (!Number.isFinite(r.difficulty)) err(`${c.name}/${r.genKey}: bad difficulty`);
    if (!r.prompt.text) err(`${c.name}/${r.genKey}: empty prompt`);
    if (r.prompt.kind === "image" && !r.prompt.src) err(`${c.name}/${r.genKey}: image prompt missing src`);
    ctx.recentSubjects.add(r.subject.id);
    ctx.recentAnswers.push(r.answerKey);
    if (ctx.recentAnswers.length > 14) ctx.recentAnswers.shift();
    ctx.lastGen = r.genKey;
  }
}

console.log(`\nGenerated ${rounds} rounds. Generator usage:`);
for (const [k, n] of Object.entries(genCounts).sort((a, b) => b[1] - a[1])) console.log("  " + k.padEnd(16), n);

console.log(fail === 0 ? "\n✓ ALL CHECKS PASSED" : `\n✗ ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
