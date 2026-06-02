// Generates turistveger.json — Norway's 18 Nasjonale turistveger.
//
// Sources:
//   • Lengths and elevation ranges: nasjonaleturistveger.no (hardcoded, authoritative)
//   • County, coords, blurb, photo: Norwegian Wikipedia + Wikimedia Commons
//
// The 18 routes are fully enumerated here; this script regenerates the file from
// scratch so it is reproducible without external state. Run:
//   node scripts/curate-turistveger.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "turistveger.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

// Hardcoded from nasjonaleturistveger.no (length km, elevRange [min, max] moh).
// Wikipedia/Wikidata is used for county, midpoint coords, photo and blurb.
const ROUTES = [
  {
    id: "varanger",
    name: "Varanger",
    length: 160,
    minElevation: 0,
    maxElevation: 125,
    wikiPage: "Varangerhalvøya",
    county: "Troms og Finnmark",
    lat: 70.38,
    lon: 29.0,
    photoFile: "Hamningberg.jpg",
    blurb: "Arktisk kystlandskap på Varangerhalvøya med rik fuglefauna og samisk kulturhistorie.",
  },
  {
    id: "havoysund",
    name: "Havøysund",
    length: 67,
    minElevation: 0,
    maxElevation: 233,
    wikiPage: "Havøysund",
    county: "Troms og Finnmark",
    lat: 70.99,
    lon: 24.67,
    photoFile: "Havøysund_winter.jpg",
    blurb: "Dramatisk kyst i Vest-Finnmark med åpen havutsikt mot Nordishavet.",
  },
  {
    id: "senja",
    name: "Senja",
    length: 102,
    minElevation: 0,
    maxElevation: 284,
    wikiPage: "Senja",
    county: "Troms",
    lat: 69.3,
    lon: 17.5,
    photoFile: "Oksneset_and_Ersfjorden_from_Tungeneset_in_low_sunlight,_Senja,_2012_October_-_2.jpg",
    blurb: "Norges nest største øy byr på spisse fjell, dype fjorder og fiskeværsidyll.",
  },
  {
    id: "andoya",
    name: "Andøya",
    length: 58,
    minElevation: 0,
    maxElevation: 66,
    wikiPage: "Andøya",
    county: "Nordland",
    lat: 69.1,
    lon: 15.77,
    photoFile: "Andoya2.jpg",
    blurb: "Myrlandskap og hvit sandstrand på Norges nordligste øy, med hvalsafari og nordlys.",
  },
  {
    id: "lofoten",
    name: "Lofoten",
    length: 230,
    minElevation: 0,
    maxElevation: 72,
    wikiPage: "Lofoten",
    county: "Nordland",
    lat: 68.15,
    lon: 14.37,
    photoFile: "Moskenes_Reinebringen_lub_2025-07-21_img09_Aussicht.jpg",
    blurb: "Spektakulære fjell stuper rett i havet langs E10 gjennom de ikoniske Lofoten-øyene.",
  },
  {
    id: "helgelandskysten",
    name: "Helgelandskysten",
    length: 433,
    minElevation: 0,
    maxElevation: 346,
    wikiPage: "Helgelandskysten",
    county: "Nordland",
    lat: 66.0,
    lon: 12.8,
    photoFile: "Helgelandskysten.jpg",
    blurb: "Norges lengste turistveg langs Helgelandskysten – skjærgård, fjell og fergestrekninger.",
  },
  {
    id: "atlanterhavsvegen",
    name: "Atlanterhavsvegen",
    length: 36,
    minElevation: 0,
    maxElevation: 25,
    wikiPage: "Atlanterhavsveien",
    county: "Møre og Romsdal",
    lat: 63.02,
    lon: 7.36,
    photoFile: "Storseisundet_bridge.jpg",
    blurb: "Ikoniske bruer over skjærgården på Nordmørskysten, kåret til århundrets norske byggverk.",
  },
  {
    id: "geiranger-trollstigen",
    name: "Geiranger–Trollstigen",
    length: 104,
    minElevation: 0,
    maxElevation: 1038,
    wikiPage: "Geirangerfjorden",
    county: "Møre og Romsdal",
    lat: 62.46,
    lon: 7.67,
    photoFile: "Geirangerfjord_from_Flydalsjuvet.jpg",
    blurb: "UNESCO-verdensarv Geirangerfjord og den legendariske Trollstigen-serpentinen i ett.",
  },
  {
    id: "gamle-strynefjellsvegen",
    name: "Gamle Strynefjellsvegen",
    length: 27,
    minElevation: 465,
    maxElevation: 1139,
    wikiPage: "Strynefjellsvegen",
    county: "Vestland",
    lat: 61.9,
    lon: 7.65,
    photoFile: "Strynefjellsveien_24_BG.jpg",
    blurb: "Historisk fjellveg fra 1894 over Strynefjell med panoramautsikt og sommerstengt vinter.",
  },
  {
    id: "rondane",
    name: "Rondane",
    length: 75,
    minElevation: 694,
    maxElevation: 1065,
    wikiPage: "Rondane",
    county: "Innlandet",
    lat: 61.92,
    lon: 9.82,
    photoFile: "Solhbergplassen_2016.jpg",
    blurb: "Norges første nasjonalpark med vidstrakte fjellplatåer og Sohlbergplassen som ikonisk utsiktspunkt.",
  },
  {
    id: "sognefjellet",
    name: "Sognefjellet",
    length: 108,
    minElevation: 0,
    maxElevation: 1434,
    wikiPage: "Sognefjell",
    county: "Vestland / Innlandet",
    lat: 61.57,
    lon: 8.03,
    photoFile: "Sognefjell_road.jpg",
    blurb: "Europas høyeste fjellovergang over Jotunheimen, åpen kun om sommeren.",
  },
  {
    id: "valdresflye",
    name: "Valdresflye",
    length: 49,
    minElevation: 885,
    maxElevation: 1389,
    wikiPage: "Valdresflye",
    county: "Innlandet",
    lat: 61.49,
    lon: 8.68,
    photoFile: "Valdresflya_(Jotunheimen).jpg",
    blurb: "Høyfjellsrute over Valdresflye med utsikt mot Gjende og Jotunheimens tinder.",
  },
  {
    id: "gaularfjellet",
    name: "Gaularfjellet",
    length: 114,
    minElevation: 0,
    maxElevation: 743,
    wikiPage: "Gaularfjellet",
    county: "Vestland",
    lat: 61.42,
    lon: 6.53,
    photoFile: "Gaularfjellet-Norway.jpg",
    blurb: "Vestlandsk fjell- og fjordlandskap mellom Balestrand og Sande i Sunnfjord.",
  },
  {
    id: "aurlandsfjellet",
    name: "Aurlandsfjellet",
    length: 47,
    minElevation: 0,
    maxElevation: 1308,
    wikiPage: "Aurlandsfjellet",
    county: "Vestland",
    lat: 60.9,
    lon: 7.25,
    photoFile: "Norway_Snovegen.jpg",
    blurb: "Snøvegen over Aurlandsfjell forbinder Aurlandsvangen og Lærdal med høyfjellsutsikt.",
  },
  {
    id: "hardanger",
    name: "Hardanger",
    length: 158,
    minElevation: 0,
    maxElevation: 274,
    wikiPage: "Hardangerfjorden",
    county: "Vestland",
    lat: 60.3,
    lon: 6.5,
    photoFile: "Steinsdalsfossen,_østover.jpg",
    blurb: "Fruktblomstring, fossefall og Hardangerfjorden langs en av Norges vakreste fjordveier.",
  },
  {
    id: "hardangervidda",
    name: "Hardangervidda",
    length: 67,
    minElevation: 0,
    maxElevation: 1251,
    wikiPage: "Hardangervidda",
    county: "Vestland / Numedal",
    lat: 60.43,
    lon: 7.25,
    photoFile: "Voringsfossen-viewingbridge-2020.jpg",
    blurb: "Rv. 7 over Europas største høyfjellsplatå med Vøringsfossen som naturlig høydepunkt.",
  },
  {
    id: "ryfylke",
    name: "Ryfylke",
    length: 260,
    minElevation: 0,
    maxElevation: 971,
    wikiPage: "Ryfylke",
    county: "Rogaland",
    lat: 59.5,
    lon: 6.5,
    photoFile: "Preikestolen_Norge.jpg",
    blurb: "Lysefjord, Preikestolen og innlandsfjorder i det mangfoldige Ryfylke.",
  },
  {
    id: "jaeren",
    name: "Jæren",
    length: 130,
    minElevation: 0,
    maxElevation: 274,
    wikiPage: "Jæren",
    county: "Rogaland",
    lat: 58.72,
    lon: 5.75,
    photoFile: "Ogna_sandstrand.jpg",
    blurb: "Åpen kystlinje med sandstrender, gårdslandskap og fossile kystklinter på Jæren.",
  },
];

const COMMONS_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath/";

function buildEntry(r) {
  return {
    id: r.id,
    name: r.name,
    county: r.county,
    length: r.length,
    maxElevation: r.maxElevation,
    lat: r.lat,
    lon: r.lon,
    photo: `${COMMONS_BASE}${encodeURIComponent(r.photoFile)}?width=1024`,
    blurb: r.blurb,
  };
}

// Optional: fetch Wikipedia wikitext for a route to verify/update coords.
// Not called by default so the script runs offline from hardcoded data.
async function fetchWikiCoords(page) {
  const url = `https://no.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(page)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${page}`);
  return (await res.json()).parse?.wikitext?.["*"] ?? null;
}

async function main() {
  const entries = ROUTES.map(buildEntry);

  await writeFile(OUT, JSON.stringify(entries, null, 2) + "\n");
  console.log(`turistveger: wrote ${entries.length} routes to ${OUT}`);

  // Summary
  const withPhoto = entries.filter((e) => e.photo).length;
  const withCoords = entries.filter((e) => e.lat != null && e.lon != null).length;
  const withCounty = entries.filter((e) => e.county).length;
  console.log(`  photo: ${withPhoto}/18  lat/lon: ${withCoords}/18  county: ${withCounty}/18`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
