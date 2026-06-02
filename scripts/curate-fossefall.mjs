// Expands fossefall.json to cover ~60-100 notable Norwegian waterfalls.
//
// Sources:
//   - Wikipedia "Liste over fosser i Norge" (height rankings)
//   - Wikidata (coords P625, photo P18, Q-ids)
//
// Run: node scripts/curate-fossefall.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "src", "data", "fossefall.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

const slug = (s) =>
  norm(s)
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// Curated new entries (from Wikipedia ranked list + Wikidata enrichment).
// Each has: id (foss-<slug>), name, height, county, lat?, lon?, photo?
// Heights are total fall in metres as listed on "Liste over fosser i Norge".
// Counties reflect current Norwegian county structure (post-2024 re-splits
// where known; otherwise the current county the waterfall belongs to).
// ---------------------------------------------------------------------------
const CURATED = [
  // Rank 7 — not in existing
  {
    wdId: "Q4564474",
    name: "Ølmåafossen",
    height: 720,
    county: "Møre og Romsdal",
    lat: 62.4333,
    lon: 7.81667,
    photo: "Oelmaaafossen-2020.jpg",
  },
  // Rank 8
  {
    wdId: "Q4564463",
    name: "Kjeragfossen",
    height: 715,
    county: "Rogaland",
    lat: 59.0333,
    lon: 6.58333,
    photo: "Kjerag_og_Kjeragsfossen.jpg",
  },
  // Rank 13 (Wikipedia says 657 m; existing entry says 705 — keep existing)
  // Rank 14
  {
    wdId: "Q1781830",
    name: "Tyssestrengene",
    height: 646,
    county: "Vestland",
    lat: 60.1367,
    lon: 6.7544,
    photo: "Tyssestrengene_Lindahl.jpg",
  },
  // Rank 16
  {
    wdId: "Q1805231",
    name: "Langfoss",
    height: 612,
    county: "Vestland",
    lat: 59.8444,
    lon: 6.3389,
    photo: "O-4-5_Norge-_Langfoss,_Åkrafjord._Ruten_Haugesund_-_Odda_(9354977731).jpg",
  },
  // Rank 29
  {
    wdId: "Q11976295",
    name: "Hydnefossen",
    height: 475,
    county: "Viken",
    lat: 60.81169,
    lon: 8.62123,
    photo: "Hydnefossen5.jpg",
  },
  // Rank 37
  {
    wdId: "Q11997873",
    name: "Ringedalsfossen",
    height: 420,
    county: "Vestland",
    lat: 60.10482,
    lon: 6.7635,
    photo: "Stor_foss_som_forgrener_seg_til_flere_små_-_NB_MS_G4_0686_(cropped).jpg",
  },
  // Rank 39
  {
    wdId: "Q38339",
    name: "De syv søstrene",
    height: 410,
    county: "Møre og Romsdal",
    lat: 62.107,
    lon: 7.0942,
    photo: "HPIM0821.JPG",
  },
  // Rank 42 (Vermafossen already in existing at 381 m — skip)
  // Rank 52
  {
    wdId: "Q3442878",
    name: "Rjoandefossen",
    height: 310,
    county: "Vestland",
    lat: 60.82639,
    lon: 7.1075,
    photo: "Rjoandefossen.jpg",
  },
  // Rank 58 (Vettisfossen already in existing — skip)
  // Rank 60
  {
    wdId: "Q11308801",
    name: "Rembesdalsfossen",
    height: 272,
    county: "Vestland",
    lat: 60.5185,
    lon: 7.25824,
  },
  // Rank 61
  {
    wdId: "Q11306646",
    name: "Valurfossen",
    height: 272,
    county: "Vestland",
    lat: 60.36004,
    lon: 7.14537,
    photo: "VALURSFOSSEN.jpg",
  },
  // Rank 62
  {
    wdId: "Q3738289",
    name: "Mollisfossen",
    height: 269,
    county: "Troms",
    lat: 69.36155,
    lon: 21.83243,
    photo: "Mollisfossen.jpg",
  },
  // Rank 66
  {
    wdId: "Q11311022",
    name: "Austerkrokfossen",
    height: 257,
    county: "Nordland",
    lat: 67.36249,
    lon: 15.80031,
  },
  // Rank 68
  {
    wdId: "Q11336528",
    name: "Søtefossen",
    height: 246,
    county: "Vestland",
    lat: 60.33113,
    lon: 6.80197,
    photo: "Søtefossen_no.jpg",
  },
  // Rank 69
  {
    wdId: "Q11336540",
    name: "Hjellefossen",
    height: 240,
    county: "Vestland",
    lat: 61.34374,
    lon: 7.88615,
    photo: "2007-06-16_Hjellefossen.jpg",
  },
  // Rank 69 (tie)
  {
    wdId: "Q11335483",
    name: "Sivlefossen",
    height: 240,
    county: "Vestland",
    lat: 60.84056,
    lon: 6.68806,
    photo: "Sivlefossen.JPG",
  },
  // Rank 71 (Rjukanfossen already in existing — skip)
  // Rank 74
  {
    wdId: "Q4578974",
    name: "Feigefossen",
    height: 229,
    county: "Vestland",
    lat: 61.3807,
    lon: 7.44131,
    photo: "Feigefossen_Norway_2009.JPG",
  },
  // Rank 75
  {
    wdId: "Q936336",
    name: "Reiårsfossen",
    height: 210,
    county: "Agder",
    lat: 58.94106,
    lon: 7.68537,
    photo: "Reiårsfossen_in_Ose.jpg",
  },
  // Rank 76
  {
    wdId: "Q11336555",
    name: "Gjerdefossen",
    height: 200,
    county: "Møre og Romsdal",
    lat: 62.12741,
    lon: 7.15714,
    photo: "Geirangerfjord.jpg",
  },
  // Rank 76 (Muldalsfossen)
  {
    wdId: "Q12717015",
    name: "Muldalsfossen",
    height: 200,
    county: "Møre og Romsdal",
    photo: "Muldalsfossen.JPG",
  },
  // Rank 76 (Vedalsfossen already in existing — skip)
  // Rank 81
  {
    wdId: "Q11336529",
    name: "Aurstaupet",
    height: 193,
    county: "Møre og Romsdal",
    lat: 62.40646,
    lon: 8.38207,
    photo: "View_to_Eikesdalen_from_a_cliff_at_Aurstaupet,_2013_June.jpg",
  },
  // Rank 84 (Vøringsfossen already in existing — skip)
  // Rank 86
  {
    wdId: "Q11336515",
    name: "Stigfossen",
    height: 180,
    county: "Møre og Romsdal",
    lat: 62.45546,
    lon: 7.67084,
    photo: "Stigfossen.JPG",
  },
  // Rank 90
  {
    wdId: "Q11336542",
    name: "Svøufallet",
    height: 156,
    county: "Møre og Romsdal",
    lat: 62.50999,
    lon: 9.05782,
    photo: "Jenstadjuvet_-_no-nb_digifoto_20160331_00011_bldsa_NGU0203.jpg",
  },
  // Rank 91
  {
    wdId: "Q11336491",
    name: "Honganvikfossen",
    height: 155,
    county: "Rogaland",
    lat: 59.59589,
    lon: 6.28515,
    photo: "Hongavikfossen.jpg",
  },
  // Rank 92 (Låtefossen already in existing — skip)
  // Rank 95
  {
    wdId: "Q11336543",
    name: "Skjervefossen",
    height: 135,
    county: "Vestland",
    lat: 60.5879,
    lon: 6.6363,
    photo: "Skjervefossen,_Norway_01.jpg",
  },
  // Rank 96
  {
    wdId: "Q3443541",
    name: "Espelandsfossen",
    height: 130,
    county: "Vestland",
    lat: 60.59833,
    lon: 6.82278,
    photo: "ESPELAND_WATERFALLS_Between_Eidfjord_and_Voss,_Norway_-_June_15,_1989.jpg",
  },
  // Rank 97
  {
    wdId: "Q37804",
    name: "Stalheimsfossen",
    height: 126,
    county: "Vestland",
    lat: 60.8344,
    lon: 6.68556,
    photo: "Stalheimsfossen.JPG",
  },
  // Rank 100
  {
    wdId: "Q2361962",
    name: "Tvindefossen",
    height: 110,
    county: "Vestland",
    lat: 60.7264,
    lon: 6.48639,
    photo: "Tvinnefossen.JPG",
  },
  // Additional notable waterfalls from the ranked list (no Wikipedia article found
  // but present on the list with height and county data):
  // Rank 11 — Spirefossen
  {
    wdId: "Q4569227",
    name: "Spirefossen",
    height: 690,
    county: "Vestland",
    lat: 61.7167,
    lon: 6.61667,
  },
  // Rank 12 — Krunefossen
  {
    wdId: "Q7211260",
    name: "Krunefossen",
    height: 660,
    county: "Vestland",
    lat: 61.7467,
    lon: 7.04389,
    photo: "Krunefossen.jpg",
  },
];

// ---------------------------------------------------------------------------

async function wdPhotoUrl(filename) {
  if (!filename) return undefined;
  const enc = encodeURIComponent(filename.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=1024`;
}

async function main() {
  const existing = JSON.parse(await readFile(FILE, "utf8"));
  const known = new Set(existing.map((x) => norm(x.name)));
  const usedIds = new Set(existing.map((x) => x.id));

  const uniqueId = (name) => {
    const base = `foss-${slug(name)}`;
    let id = base, n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  const added = [];
  for (const entry of CURATED) {
    if (known.has(norm(entry.name))) continue; // already present
    known.add(norm(entry.name));

    const obj = {
      id: uniqueId(entry.name),
      name: entry.name,
      height: entry.height,
      county: entry.county,
    };
    if (entry.lat != null) obj.lat = entry.lat;
    if (entry.lon != null) obj.lon = entry.lon;
    if (entry.photo) obj.photo = await wdPhotoUrl(entry.photo);

    added.push(obj);
  }

  const merged = [...existing, ...added].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  // Final duplicate-id guard
  const idCounts = {};
  for (const e of merged) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
  const dups = Object.entries(idCounts).filter(([, c]) => c > 1);
  if (dups.length) {
    console.error("DUPLICATE IDS:", dups);
    process.exit(1);
  }

  await writeFile(FILE, JSON.stringify(merged, null, 2));

  const withPhoto = merged.filter((e) => e.photo).length;
  const withCoords = merged.filter((e) => e.lat != null && e.lon != null).length;
  const newWithPhoto = added.filter((e) => e.photo).length;
  const newWithCoords = added.filter((e) => e.lat != null && e.lon != null).length;

  console.log(`fossefall: ${existing.length} -> ${merged.length} (+${added.length} added)`);
  console.log(`  New entries with photo: ${newWithPhoto}/${added.length}`);
  console.log(`  New entries with lat/lon: ${newWithCoords}/${added.length}`);
  console.log(`  Total with photo: ${withPhoto}/${merged.length}`);
  console.log(`  Total with lat/lon: ${withCoords}/${merged.length}`);
  console.log(`  Duplicate id check: ${dups.length === 0 ? "PASS (0 duplicates)" : "FAIL"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
