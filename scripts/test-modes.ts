// Validate Sortér + Lister logic. Run: npx tsx scripts/test-modes.ts
import { nextOrderRound, Category } from "@/lib/questions";
import { LISTS } from "@/lib/lists";
import { normalize, matchesAnswer } from "@/lib/match";

let fail = 0;
const err = (m: string) => {
  console.error("✗ " + m);
  fail++;
};

// ---- Sortér: every order round is well-formed with a unique correct order ----
const cats: Category[] = ["fjell", "elver", "innsjoer", "fjorder", "oyer", "fossefall", "befolkning"];
for (const c of cats) {
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const r = nextOrderRound(new Set([c]));
    count++;
    if (r.items.length !== 4) err(`${c}: ${r.items.length} items`);
    if (new Set(r.items.map((x) => x.id)).size !== 4) err(`${c}: duplicate items`);
    if (r.correctIds.length !== 4) err(`${c}: correctIds length`);
    if (new Set(r.correctIds).size !== 4) err(`${c}: correctIds dupes`);
    // correctIds must be the items sorted by value desc
    const vals = r.correctIds.map((id) => r.items.find((it) => it.id === id)!.value);
    for (let k = 1; k < vals.length; k++) if (vals[k] > vals[k - 1]) err(`${c}: order not descending ${vals.join(",")}`);
    if (new Set(r.items.map((x) => x.value)).size !== 4) err(`${c}: non-unique values (ambiguous order)`);
  }
  console.log(`Sortér ${c.padEnd(10)} ${count} rounds ok`);
}
// "Alt" order rounds
for (let i = 0; i < 300; i++) {
  const r = nextOrderRound(new Set());
  if (r.items.length !== 4) err("ALT order bad");
}
console.log("Sortér ALT ok");

// ---- Lister: rows well-formed, no duplicate normalized answers within a list ----
console.log("\nLists:");
for (const l of LISTS) {
  if (!l.rows.length) err(`${l.key}: empty`);
  const norms = new Map<string, number>();
  l.rows.forEach((row, i) => {
    if (!row.answers.length) err(`${l.key} row ${i}: no answers`);
    if (!row.reveal || !row.hint) err(`${l.key} row ${i}: missing reveal/hint`);
    for (const a of row.answers) {
      const n = normalize(a);
      if (norms.has(n) && norms.get(n) !== i) err(`${l.key}: answer "${a}" collides across rows`);
      norms.set(n, i);
    }
    // first answer must match itself
    if (!matchesAnswer(row.answers[0], row.answers[0])) err(`${l.key} row ${i}: self-match failed`);
  });
  console.log(`  ${l.key.padEnd(12)} ${l.rows.length} rows`);
}

// spot-check forgiving matching
const checks: [string, string, boolean][] = [
  ["galdhøpiggen", "Galdhøpiggen", true],
  ["GALDHOPIGGEN", "Galdhøpiggen", true],
  ["more og romsdal", "Møre og Romsdal", true],
  ["herøy", "Herøy (Nordland)", true],
  ["oslo", "Bergen", false],
];
for (const [inp, ans, exp] of checks) if (matchesAnswer(inp, ans) !== exp) err(`match("${inp}","${ans}") != ${exp}`);
console.log("\nmatching spot-checks ok");

console.log(fail === 0 ? "\n✓ ALL CHECKS PASSED" : `\n✗ ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
