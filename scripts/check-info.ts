// Verify choiceInfo aligns with choices. Run: npx tsx scripts/check-info.ts
import { activeGenerators, nextRound, Category } from "@/lib/questions";

let fail = 0;
const ctx = { recentSubjects: new Set<string>(), recentAnswers: [] as string[], lastGen: null as string | null };
const samples: Record<string, string> = {};

for (const cat of ["befolkning", "fjell", "kommuner", "vapen", "fylker"] as Category[]) {
  const gens = activeGenerators(new Set([cat]));
  for (let i = 0; i < 600; i++) {
    const r = nextRound(gens, ctx);
    if (r.choiceInfo) {
      if (r.choiceInfo.length !== r.choices.length) {
        console.error(`✗ ${r.genKey}: choiceInfo length ${r.choiceInfo.length} != choices ${r.choices.length}`);
        fail++;
      }
      if (!samples[r.genKey]) {
        samples[r.genKey] = r.choices.map((c, j) => `${c}=${r.choiceInfo![j] ?? "–"}`).join(" | ");
      }
    }
  }
}

console.log("Sample rounds (choice = its revealed value):");
for (const [k, v] of Object.entries(samples)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log(fail === 0 ? "\n✓ choiceInfo aligned" : `\n✗ ${fail} failures`);
process.exit(fail === 0 ? 0 : 1);
