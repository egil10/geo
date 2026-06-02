// Validates and reports on forsvar.json (Norwegian military + air-ambulance bases).
// This script is intentionally read-only / idempotent — it does not mutate the file.
// Run: node scripts/curate-forsvar.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "forsvar.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const BRANCHES = ["Luftforsvaret", "Sjøforsvaret", "Hæren", "Luftambulanse"];
const US_ACCESS_IDS = new Set([
  "forsvar-evenes-flystasjon",
  "forsvar-ramsund",
  "forsvar-rygge-flystasjon",
  "forsvar-sola-flystasjon",
]);

async function main() {
  const raw = await readFile(FILE, "utf8");
  const entries = JSON.parse(raw); // throws if invalid JSON

  // ── 1. Check required fields ─────────────────────────────────────────────
  const errors = [];
  for (const e of entries) {
    if (!e.id)           errors.push(`Missing id: ${JSON.stringify(e)}`);
    if (!e.name)         errors.push(`${e.id}: missing name`);
    if (!BRANCHES.includes(e.branch)) errors.push(`${e.id}: unknown branch "${e.branch}"`);
    if (!e.county)       errors.push(`${e.id}: missing county`);
    if (!e.municipality) errors.push(`${e.id}: missing municipality`);
    if (typeof e.lat !== "number") errors.push(`${e.id}: lat not a number`);
    if (typeof e.lon !== "number") errors.push(`${e.id}: lon not a number`);
  }
  if (errors.length) {
    console.error("VALIDATION ERRORS:\n" + errors.join("\n"));
    process.exit(1);
  }

  // ── 2. Duplicate ID check ─────────────────────────────────────────────────
  const seen = new Set();
  const dupes = [];
  for (const e of entries) {
    if (seen.has(e.id)) dupes.push(e.id);
    seen.add(e.id);
  }
  if (dupes.length) {
    console.error("DUPLICATE IDs:\n" + dupes.join("\n"));
    process.exit(1);
  }

  // ── 3. usAccess sanity check ──────────────────────────────────────────────
  const usEntries = entries.filter((e) => e.usAccess === true);
  const unexpectedUs = usEntries.filter((e) => !US_ACCESS_IDS.has(e.id));
  if (unexpectedUs.length) {
    console.warn("WARNING — unexpected usAccess entries:", unexpectedUs.map((e) => e.id));
  }
  const missingUs = [...US_ACCESS_IDS].filter((id) => !entries.find((e) => e.id === id && e.usAccess));
  if (missingUs.length) {
    console.warn("WARNING — expected usAccess but not set:", missingUs);
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  const byBranch = {};
  for (const b of BRANCHES) byBranch[b] = 0;
  for (const e of entries) byBranch[e.branch]++;

  const withPhoto = entries.filter((e) => e.photo).length;
  const withCoords = entries.filter(
    (e) => typeof e.lat === "number" && typeof e.lon === "number"
  ).length;

  console.log(`\nforsvar.json — ${entries.length} entries, 0 duplicate IDs, 0 validation errors`);
  console.log("\nBy branch:");
  for (const [b, n] of Object.entries(byBranch)) {
    console.log(`  ${b}: ${n}`);
  }
  console.log(`\nCoords coverage : ${withCoords}/${entries.length}`);
  console.log(`Photo coverage  : ${withPhoto}/${entries.length}`);
  console.log(`usAccess entries: ${usEntries.length} (${usEntries.map((e) => e.id).join(", ")})`);
  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
