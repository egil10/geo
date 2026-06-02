// Builds src/data/flagg.json from Wikipedia "Liste over Norges flagg".
//
// Parses the wikitext tables, extracts [[Fil:...]] image references, and
// writes one entry per distinct historical flag. Run with:
//   node scripts/curate-flagg.mjs
//
// The output file is fully reproducible — re-running overwrites it with the
// same data (modulo Wikipedia edits).

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "flagg.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const TITLE = "Liste over Norges flagg";

// Build a Wikimedia Commons Special:FilePath URL from a bare filename.
function commonsUrl(filename) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=512`;
}

// Kebab-case ASCII slug.
function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Extract the first [[Fil:...]] or [[File:...]] filename from a wikitext cell.
function extractFil(cell) {
  const m = cell.match(/\[\[(?:Fil|File):([^\]|]+)/i);
  return m ? m[1].trim() : null;
}

// Strip wikitext markup to plain text.
function stripWiki(s) {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1") // [[link|text]] -> text
    .replace(/\[\[[^\]]*\]\]/g, "") // remaining [[...]]
    .replace(/'{2,}/g, "") // bold/italic
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Parse a period string like "1844-1899" or "1815-1844" into a start year.
function startYear(period) {
  const m = period.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

// Parse wikitext tables into rows: [{ image, period, use, note }]
// Each table row has 4 columns: Flagg | Periode | Bruk | Merknader
function parseTables(wikitext) {
  const rows = [];
  // Split into table blocks
  const tableBlocks = wikitext.split(/\{\|/);
  for (const block of tableBlocks) {
    // Split rows on "|-"
    const rawRows = block.split(/^\|-/m);
    for (const row of rawRows) {
      // Collect cells: lines starting with "|" that aren't "|-" or "||" continuations
      const cellLines = row.split("\n");
      const cells = [];
      let current = null;
      for (const line of cellLines) {
        if (line.startsWith("! ") || line.startsWith("!width")) continue; // header
        if (line.startsWith("| ") || line.startsWith("|[[") || line.startsWith("|'''") || line.startsWith("|Bilde")) {
          if (current !== null) cells.push(current);
          current = line.slice(1).trim();
        } else if (line.startsWith("||")) {
          // inline cell separator
          if (current !== null) cells.push(current);
          current = line.slice(2).trim();
        } else if (current !== null && line.trim() !== "" && !line.startsWith("|") && !line.startsWith("!") && !line.startsWith("{") && !line.startsWith("}")) {
          current += " " + line.trim();
        }
      }
      if (current !== null) cells.push(current);

      if (cells.length < 2) continue;

      const imageCell = cells[0] || "";
      const periodCell = cells[1] || "";
      const useCell = cells[2] || "";
      const noteCell = cells[3] || "";

      const image = extractFil(imageCell);
      if (!image) continue; // skip rows without an image

      const periodRaw = stripWiki(periodCell).replace(/'''/g, "").trim();
      if (!periodRaw) continue;

      rows.push({
        image,
        period: periodRaw,
        use: stripWiki(useCell),
        note: stripWiki(noteCell),
      });
    }
  }
  return rows;
}

// Map of image filenames to curated metadata overrides.
// Keys are the exact [[Fil:...]] filenames from Wikipedia.
const OVERRIDES = {
  "Flag_of_Norway_(1370).svg": {
    id: "norsk-flagg-1300-tallet",
    name: "Eldste kjente norske flagg",
    period: "1300-tallet",
    year: 1318,
    note: "Eldste kjente flaggform, tidvis brukt fra 1318 på skip og festninger; rødt med gult kors.",
  },
  "Flag of the Kalmar Union.svg": {
    id: "kalmarunionens-flagg",
    name: "Kalmarunionens flagg",
    period: "ca. 1430–1537",
    year: 1430,
    note: "Unionsflagg (Rigenes banner) for personalunionen mellom Danmark, Norge og Sverige.",
  },
  "Heraldisk_kongeflagg_fra_1600-tallet.gif": {
    id: "heraldisk-kongeflagg-1600-tallet",
    name: "Heraldisk kongeflagg (1600-tallet)",
    period: "1600-tallet",
    year: 1600,
    note: "Rødt flagg med gul løve som holder en hellebard; kongens personlige symbol på Norge i unionstiden.",
  },
  "Flag_of_Denmark.svg": {
    id: "dansk-norsk-handelsflagg-1536",
    name: "Dansk-norsk handelsflagg (Dannebrog)",
    period: "1536–1814",
    year: 1536,
    note: "Dannebrog brukt som dansk-norsk handelsflagg etter reformasjonen.",
  },
  "Handelsflagg_fjerne_farvann.gif": {
    id: "dansk-norsk-handelsflagg-fjerne-farvann",
    name: "Dansk-norsk handelsflagg (fjerne farvann)",
    period: "1757–1814",
    year: 1757,
    note: "Dannebrog med kongens monogram, brukt sør for Kapp Finisterre for å skille seg fra malteserordenens flagg.",
  },
  "Tollflagg_1778-1814.gif": {
    id: "dansk-norsk-tollflagg-1778",
    name: "Dansk-norsk tollflagg",
    period: "1778–1814",
    year: 1778,
    note: "Offisielt tollflagg brukt av det dansk-norske tollvesenet.",
  },
  "Royal_Standard_of_Denmark_(1731–1819).svg": {
    id: "danmark-norges-kongeflagg-1731",
    name: "Danmark-Norges kongeflagg",
    period: "1731–1814",
    year: 1731,
    note: "Kongeflagget for personalunionen Danmark-Norge.",
  },
  "Danish-Naval-Ensign.svg": {
    id: "dansk-norsk-statsflagg-1696",
    name: "Danmark-Norges statsflagg",
    period: "1696–1814",
    year: 1696,
    note: "Statsflaget (splittet Dannebrog) brukt av den dansk-norske marine og som statsflagg.",
  },
  "Flag_of_the_Kingdom_of_Norway_(1814).svg": {
    id: "norsk-handelsflagg-1814",
    name: "Norsk løveflagg (1814)",
    period: "1814–1821",
    year: 1814,
    note: "Norges første nasjonalflagg etter løsrivelsen fra Danmark; rødt med den norske løven.",
  },
  "Norway_War_Ensign_1814.png": {
    id: "norsk-statsflagg-1814",
    name: "Norsk statsflagg (1814)",
    period: "1814",
    year: 1814,
    note: "Norsk statsflagg og orlogsflagg vedtatt av Riksforsamlingen i 1814.",
  },
  "Royal_Norwegian_Navy_Pennant_1814.png": {
    id: "norsk-orlogsvimpel-1814",
    name: "Norsk orlogsvimpel (1814)",
    period: "1814",
    year: 1814,
    note: "Norsk orlogsvimpel brukt av marinen i 1814.",
  },
  "Alternativt_flaggforslag_av_Cristian_Frederik_1814.gif": {
    id: "flaggforslag-christian-frederik-1814",
    name: "Alternativt flaggforslag 1814 (Christian Frederik)",
    period: "1814 (ikke tatt i bruk)",
    year: 1814,
    note: "Christian Frederiks forslag til norsk flagg i grått og grønt; ble aldri offisielt.",
  },
  "Royal_Standard_of_Sweden_and_Norway_(1815-1844).svg": {
    id: "sverige-norges-kongeflagg-1815",
    name: "Sverige-Norges kongeflagg",
    period: "1815–1844",
    year: 1815,
    note: "Felles kongeflagg for unionen mellom Sverige og Norge under Karl Johan.",
  },
  "Ensign of Sweden and Norway (1815–1844).svg": {
    id: "felles-statsflagg-1815",
    name: "Felles svensk-norsk statsflagg",
    period: "1815–1844",
    year: 1815,
    note: "Felles statsflagg og orlogsflagg for Sverige-Norge i unionstiden.",
  },
  "Svensk_flagg_1815.svg": {
    id: "svensk-handelsflagg-1815",
    name: "Svensk handelsflagg (norske skip, fjerne farvann)",
    period: "1815–1818",
    year: 1815,
    note: "Norske skip måtte bruke det svenske handelsflagget i fjerne farvann inntil unionshandelsflagget kom.",
  },
  "Tollflagg_1815-1824.gif": {
    id: "felles-tollflagg-1815",
    name: "Felles svensk-norsk tollflagg",
    period: "1815–1824",
    year: 1815,
    note: "Felles tollvesenflagg for Sverige-Norge i den tidlige unionstiden.",
  },
  "Swedish_and_Norwegian_merchant_flag_1818-1844.svg": {
    id: "unions-handelsflagg-1818",
    name: "Unionshandelsflagg (1818–1844)",
    period: "1818–1844",
    year: 1818,
    note: "Felles svensk-norsk handelsflagg til bruk i fjerne farvann, sør for Kapp Finisterre.",
  },
  "Customs flag of Sweden-Norway (1824-1842).svg": {
    id: "felles-tollflagg-1824",
    name: "Felles svensk-norsk tollflagg (1824–1842)",
    period: "1824–1842",
    year: 1824,
    note: "Revidert felles tollflagg for Sverige-Norge.",
  },
  "Royal_Standard_of_Norway_(1844-1905).svg": {
    id: "norsk-kongeflagg-1844",
    name: "Norges kongeflagg (1844–1905)",
    period: "1844–1905",
    year: 1844,
    note: "Norges separate kongeflagg etter at Sverige og Norge i 1844 fikk hvert sitt kongeflagg.",
  },
  "Norge-Unionsflagg-1844.svg": {
    id: "sildesalaten-unionsflagg-1844",
    name: "Norsk handelsflagg med unionsmerke – «Sildesalaten»",
    period: "1844–1899",
    year: 1844,
    note: "Norsk nasjonalflagg med unionsmerkekant (kalt «sildesalaten»), påkrevd i alle farvann.",
  },
  "Naval_Ensign_of_Norway_(1844-1905).svg": {
    id: "norsk-statsflagg-1844",
    name: "Norsk statsflagg / orlogsflagg (1844–1899)",
    period: "1844–1899",
    year: 1844,
    note: "Norsk statsflagg og orlogsflagg med unionsmerkekant, brukt av marinen og staten.",
  },
  "Kongevimpel_1844-1905.gif": {
    id: "norsk-kongevimpel-1844",
    name: "Norsk kongevimpel (1844–1905)",
    period: "1844–1905",
    year: 1844,
    note: "Norsk kongevimpel brukt på kongeskip i unionstiden.",
  },
  "Union_Jack_of_Sweden_and_Norway_(1844-1905).svg": {
    id: "unionsmerket-1844",
    name: "Unionsmerket / Unionsgjoset (1844–1905)",
    period: "1844–1905",
    year: 1844,
    note: "Felles svensk-norsk unionsflagg brukt på utenriksstasjoner og som orlogsgjos.",
  },
  "Kantonflagg_Dansk_i_vestindien.gif": {
    id: "kantonflagg-vestindia",
    name: "Kantonflagg (Dansk Vestindia)",
    period: "ca. 1796–1848",
    year: 1796,
    note: "Brukt av danske og norske skip seilende til Dansk Vestindia; Dannebrog i blått hjørnekvadrant.",
  },
  "Flag of Nortraship.tif": {
    id: "nortraship-flagg-1941",
    name: "Nortraship-flagget",
    period: "1941–1958",
    year: 1941,
    note: "Splittflagg for Nortraship, som administrerte den norske handelsflåten utenfor akseokkupert område under 2. verdenskrig.",
  },
  "Norges_tollflagg.gif": {
    id: "norsk-tollflagg-1899",
    name: "Norsk tollflagg (1899–)",
    period: "1899–",
    year: 1899,
    note: "Nåværende norsk tollflagg; splittet flagg med tollemblem.",
  },
  "Flag_of_Norway,_state.svg": {
    id: "norsk-statsflagg-1899",
    name: "Norsk statsflagg / orlogsflagg (1899–)",
    period: "1899–",
    year: 1899,
    note: "Nåværende norsk statsflagg og orlogsflagg; splittet (tunget) utgave av nasjonalflagget.",
  },
  "Kongeflagget.svg": {
    id: "norsk-kongeflagg-1905",
    name: "Norges kongeflagg (1905–)",
    period: "1905–",
    year: 1905,
    note: "Nåværende kongeflagg; heises på Slottet når Kongen er i Norge.",
  },
  "Naval_Jack_of_Norway.svg": {
    id: "norsk-orlogsgjos-1905",
    name: "Norsk orlogsgjos (1905–)",
    period: "1905–",
    year: 1905,
    note: "Nåværende norsk orlogsgjos (jack) brukt på marinefartøy i havn.",
  },
  "Royal_Norwegian_Navy_pennant.svg": {
    id: "norsk-orlogsvimpel-1905",
    name: "Norsk orlogsvimpel (1905–)",
    period: "1905–",
    year: 1905,
    note: "Nåværende norsk orlogsvimpel, ført av Sjøforsvarets fartøy.",
  },
  "Kronprinsflagg.svg": {
    id: "norsk-kronprinsflagg-1924",
    name: "Norsk kronprinsflagg (1924–)",
    period: "1924–",
    year: 1924,
    note: "Kronprinsens flagg; heises fra Slottet når Kronprinsen er regent.",
  },
  "Postal_Flag_of_Norway.svg": {
    id: "postflagg-norge",
    name: "Norsk postflagg",
    period: "ukjent–",
    year: 1900,
    note: "Offisielt postflagg for norsk posttjeneste.",
  },
};

// Images to skip entirely (rank flags, proposals without real use, duplicates handled above)
const SKIP_FILES = new Set([
  "Flag_of_Norway.svg", // appears twice (1821 and 1899) — handled by year context below
  "Norwegian_command_flag_(1844-1858)_-_Commanding_Admiral.svg",
  "Norwegian_command_flag_(1875-1905)_-_Commanding_Admiral.svg",
  "Flag_of_the_Inspector_General_of_the_Norwegian_Navy.svg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Admiral.svg",
  "Norwegian_command_flag_(1844-1858)_-_Admiral.svg",
  "Norwegian_command_flag_(1875-1905)_-_Admiral.svg",
  "Rank_Flag_of_a_Vice_Admiral_of_the_Royal_Norwegian_Navy.svg",
  "Rank_Flag_of_an_Admiral_of_the_Royal_Norwegian_Navy.svg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Vice_Admiral.svg",
  "Norwegian_command_flag_(1875-1905)_-_Vice_Admiral.svg",
  "Rank_Flag_of_a_Rear_Admiral_of_the_Royal_Norwegian_Navy.svg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Rear_Admiral.svg",
  "Norwegian_command_flag_(1875-1905)_-_Rear_Admiral.svg",
  "Rank_Flag_of_a_Commodor_of_the_Royal_Norwegian_Navy.svg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Commander_of_a_Squadron.svg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Commodore.svg",
  "Norwegian_command_flag_(1844-1858)_-_Commodore.svg",
  "Norwegian_command_flag_(1858-1875)_-_Commodore.svg",
  "Rank_Flag_of_a_Norwegian_Squadron_Commander_or_Senior_Officer.svg",
  "Norwegian_command_flag_(1844-1858)_-_Detachment_Commander.svg",
  "Norwegian_command_flag_(1858-1875)_-_Detachment_Commander.svg",
  "Norwegian_command_flag_(1875-1905)_-_Detachment_Commander.svg",
  "Royal_Norwegian_Navy_NCO_rank_flag.svg",
  "Kommanderende_general_1901-1905.png",
  "Flag_of_the_Inspector_General_of_the_Norwegian_Army.svg",
  "Norwegian_Lieutenant_General_rank_flag.svg",
  "Norwegian_General_rank_flag.svg",
  "Norwegian_Major_General_rank_flag.svg",
  "Norwegian_Brigadier_rank_flag.svg",
  "Kommandoflagg_Sjefen_for_luftforsvaret_eldre_design.gif",
  "Flag_of_the_Inspector_General_of_the_Royal_Norwegian_Air_Force.svg",
  "Flag_of_the_Inspector_General_of_the_Norwegian_Home_Guard.svg",
  "Flag_of_the_Norwegian_Chief_of_Defence.svg",
  "Standard_of_the_Minister_of_Defence_of_Norway_(1901-1905).svg",
  "Standard_of_the_Minister_of_Defence_of_Norway_(1905-1937).svg",
  "Flag_of_the_Norwegian_Minister_of_Defence.svg",
  "Norsk_Forening_for_Lystseilads.png",
  "Flag_of_the_Kongelig_Norsk_Seilforening_(Royal_Norwegian_Yacht_Club).jpg",
  "Swedish-Norwegian_command_flag_(1815-1844)_-_Commissioning_Pennant.svg",
  "Norwegian_command_flag_(1844-1858)_-_Commissioning_Pennant.svg",
  "Norw_Flag_proposal_C_J_1.jpg",
  "Norw_Flag_proposal_C_J_2.jpg",
  "Nordisk_konge_til_hest_i_Ernst_von_Kirchbergs_Mecklenburgske_Rimkrøike.png",
  "Dansk-norsk_skip_med_norsk_løveflagg.gif",
  "Alternativt_uoffisielt_flagg_1814.gif",
  "Swedish_civil_ensign_(1844–1905).svg",
  "Kongevimpel.png", // current royal pennant — minor duplicate context
]);

async function main() {
  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(TITLE)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const wikitext = (await res.json()).parse.wikitext["*"];

  const tableRows = parseTables(wikitext);

  // Collect entries, deduplicate by id
  const seen = new Set();
  const entries = [];

  // Process table rows first (picks up ordering from the page)
  for (const row of tableRows) {
    if (SKIP_FILES.has(row.image)) continue;

    const override = OVERRIDES[row.image];
    if (!override) continue; // not in our curated list

    if (seen.has(override.id)) continue;
    seen.add(override.id);

    entries.push({
      id: override.id,
      name: override.name,
      period: override.period,
      year: override.year,
      photo: commonsUrl(row.image),
      note: override.note,
    });
  }

  // Add any OVERRIDES entries that weren't found in tables
  // (e.g. Kalmar Union flag which is in a separate section)
  for (const [file, override] of Object.entries(OVERRIDES)) {
    if (seen.has(override.id)) continue;
    if (SKIP_FILES.has(file)) continue;
    seen.add(override.id);
    entries.push({
      id: override.id,
      name: override.name,
      period: override.period,
      year: override.year,
      photo: commonsUrl(file),
      note: override.note,
    });
  }

  // Sort chronologically by year, then by id for stable ordering
  entries.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

  await writeFile(OUT, JSON.stringify(entries, null, 2));

  const withPhoto = entries.filter((e) => e.photo).length;
  const years = [...new Set(entries.map((e) => e.year))].sort((a, b) => a - b);
  const eras = `${years[0]}–${years[years.length - 1]}`;

  console.log(`flagg: ${entries.length} entries written to ${OUT}`);
  console.log(`  with photo: ${withPhoto}/${entries.length}`);
  console.log(`  years covered: ${eras}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
