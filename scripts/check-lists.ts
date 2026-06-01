// Cross-check every list + the new categories. Run: npx tsx scripts/check-lists.ts
import { LISTS } from "@/lib/lists";
import { nextOrderRound, nextRound, activeGenerators, Category } from "@/lib/questions";
import { isbreer, tunneler, fjorder } from "@/lib/data";

let fail = 0;
const err = (m: string) => {
  console.error("✗ " + m);
  fail++;
};

console.log("=== TOP-10 / list contents (eyeball correctness) ===\n");
for (const l of LISTS) {
  console.log(`• ${l.title} (${l.rows.length})`);
  console.log("   " + l.rows.map((r) => r.reveal).join("  |  "));
}

// New categories produce valid order + choose rounds
console.log("\n=== new categories ===");
console.log("isbreer:", isbreer.length, "| tunneler:", tunneler.length, "| fjorder:", fjorder.length);
console.log("Sognefjorden present:", fjorder.some((f) => f.name === "Sognefjorden"));
console.log("longest fjord =", [...fjorder].sort((a, b) => b.metric! - a.metric!)[0]?.name);

for (const c of ["isbreer", "tunneler"] as Category[]) {
  for (let i = 0; i < 200; i++) {
    const o = nextOrderRound(new Set([c]));
    if (o.items.length !== 4 || new Set(o.items.map((x) => x.value)).size !== 4) err(`${c} order bad`);
    const gens = activeGenerators(new Set([c]), new Set());
    const r = nextRound(gens, { recentSubjects: new Set(), recentAnswers: [], lastGen: null });
    if (r.choices[r.answerIndex] !== r.answerKey) err(`${c} choose answer mismatch`);
  }
  console.log(`${c}: order + choose rounds ok`);
}

console.log(fail === 0 ? "\n✓ ALL CHECKS PASSED" : `\n✗ ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
