// Verify divisjon-klubb keeps options same-gender + states it. Run: npx tsx scripts/check-gender.ts
import { activeGenerators, nextRound } from "@/lib/questions";
import { klubber } from "@/lib/data";

const genderOf = (tag?: string) => (/kvinner/i.test(tag ?? "") ? "K" : "H");
// A name can exist in both genders (Brann); record which genders each name has.
const genders: Record<string, Set<string>> = {};
for (const k of klubber) (genders[k.name] = genders[k.name] || new Set()).add(genderOf(k.tag));

const gens = activeGenerators(new Set(["fotball"]), new Set());
const ctx = { recentSubjects: new Set<string>(), recentAnswers: [] as string[], lastGen: null as string | null };
let checked = 0,
  noGender = 0,
  badMix = 0;
const samples: string[] = [];

for (let i = 0; i < 3000; i++) {
  const r = nextRound(gens, ctx);
  if (r.genKey !== "divisjon-klubb") continue;
  checked++;
  const women = /kvinner/i.test(r.prompt.text);
  if (!/herrer|kvinner/i.test(r.prompt.text)) noGender++;
  // every option must be able to belong to the asked gender
  for (const name of r.choices) {
    const gs = genders[name];
    if (gs && !gs.has(women ? "K" : "H")) badMix++;
  }
  if (samples.length < 4) samples.push(r.prompt.text + "  ->  " + r.choices.join(", "));
}

console.log("divisjon-klubb rounds:", checked);
console.log("prompts missing a gender word:", noGender);
console.log("options not available in the asked gender:", badMix);
samples.forEach((s) => console.log("  " + s));
console.log(noGender === 0 && badMix === 0 ? "\n✓ gender kept consistent" : "\n✗ problem");
