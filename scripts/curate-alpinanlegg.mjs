// Builds alpinanlegg.json – Norway's notable alpine ski resorts.
//
// Sources (in priority order):
//   1. Wikidata SPARQL – items typed wd:Q1357964 (ski resort) or wd:Q130003
//      (ski area) located in Norway (P17=Q20); gives coords, image, muni.
//   2. Norwegian Wikipedia category "Alpinanlegg i Norge" – used to discover
//      additional titles, then Wikipedia coordinates/pageimages API fills gaps.
//   3. Wikipedia "Liste over norske alpinanlegg" – vertical drop (P2923) data
//      parsed from the HTML table.
//
// Run:  node scripts/curate-alpinanlegg.mjs
// The script is reproducible – it always overwrites src/data/alpinanlegg.json.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "alpinanlegg.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const photoUrl = (filename) =>
  filename
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1024`
    : undefined;

// Parse "Point(lon lat)" from Wikidata
const parsePoint = (v) => {
  if (!v) return null;
  const m = v.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  return m ? { lon: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
};

async function fetchWikidata() {
  const query = `
SELECT DISTINCT ?item ?itemLabel ?coord ?countyLabel ?muniLabel ?vertical ?image WHERE {
  ?item wdt:P17 wd:Q20 .
  { ?item wdt:P31 wd:Q1357964 } UNION { ?item wdt:P31 wd:Q130003 }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL {
    ?item wdt:P131 ?county .
    ?county wdt:P31/wdt:P279* wd:Q16824490
  }
  OPTIONAL {
    ?item wdt:P131 ?muni .
    ?muni wdt:P31 wd:Q755707
  }
  OPTIONAL { ?item wdt:P2923 ?vertical }
  OPTIONAL { ?item wdt:P18 ?image }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,no,en" }
}`.trim();

  const url =
    "https://query.wikidata.org/sparql?query=" +
    encodeURIComponent(query) +
    "&format=json";
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const data = await res.json();
  return data.results.bindings;
}

async function fetchCategoryMembers() {
  const url =
    "https://no.wikipedia.org/w/api.php?action=query&list=categorymembers" +
    "&cmtitle=Kategori:Alpinanlegg%20i%20Norge&cmlimit=500&format=json";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia category HTTP ${res.status}`);
  const data = await res.json();
  return (data.query.categorymembers || [])
    .map((m) => m.title)
    .filter((t) => !t.startsWith("Kategori:") && t !== "Liste over norske alpinanlegg");
}

async function fetchWikiCoords(titles) {
  if (!titles.length) return {};
  // Wikipedia API accepts up to 50 titles per request
  const results = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      "https://no.wikipedia.org/w/api.php?action=query&prop=coordinates|pageimages" +
      "&piprop=name&pithumbsize=1024" +
      "&titles=" +
      encodeURIComponent(batch.join("|")) +
      "&format=json";
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;
    const data = await res.json();
    for (const page of Object.values(data.query?.pages || {})) {
      const title = page.title;
      const coord = page.coordinates?.[0];
      const image = page.pageimage;
      results[title] = {
        lat: coord ? coord.lat : undefined,
        lon: coord ? coord.lon : undefined,
        image: image || undefined,
      };
    }
  }
  return results;
}

// Fetch the Wikipedia list page and extract vertical drop data per resort name
async function fetchVerticals() {
  const url =
    "https://no.wikipedia.org/w/api.php?action=parse&prop=text&format=json" +
    "&page=Liste%20over%20norske%20alpinanlegg";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return {};
  const html = (await res.json()).parse?.text?.["*"] || "";

  const stripTags = (s) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&#160;|&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\[[0-9]+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const verticals = {};
  // Each table row has cells; the resort name is in a link, vertical is a number column
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripTags(m[1])
    );
    if (cells.length < 2) continue;
    // Look for a cell that is a plain integer (the vertical drop)
    const nameCell = cells[0];
    for (const c of cells.slice(1)) {
      const n = parseInt(c.replace(/[^0-9]/g, ""), 10);
      if (n > 50 && n < 2000 && /^\d+$/.test(c.trim())) {
        const name = nameCell.toLowerCase().replace(/\s+/g, " ").trim();
        if (name) verticals[name] = n;
        break;
      }
    }
  }
  return verticals;
}

// County mapping from municipality (used as fallback when Wikidata lacks county)
const MUNI_COUNTY = {
  trysil: "Innlandet",
  øyer: "Innlandet",
  ringebu: "Innlandet",
  ringsaker: "Innlandet",
  gausdal: "Innlandet",
  "øystre slidre": "Innlandet",
  "vågå": "Innlandet",
  lesja: "Innlandet",
  vinje: "Telemark",
  tinn: "Telemark",
  nissedal: "Telemark",
  kviteseid: "Telemark",
  bykle: "Agder",
  åseral: "Agder",
  sirdal: "Agder",
  vegårshei: "Agder",
  hol: "Buskerud",
  hemsedal: "Buskerud",
  ål: "Buskerud",
  "nore og uvdal": "Buskerud",
  sigdal: "Buskerud",
  numedal: "Buskerud",
  krødsherad: "Buskerud",
  kongsberg: "Buskerud",
  modum: "Buskerud",
  "flå": "Buskerud",
  nesbyen: "Buskerud",
  gol: "Buskerud",
  bærum: "Akershus",
  asker: "Akershus",
  nittedal: "Akershus",
  hurdal: "Akershus",
  lunner: "Akershus",
  drammen: "Viken",
  "ringerike": "Viken",
  oppdal: "Trøndelag",
  trondheim: "Trøndelag",
  surnadal: "Trøndelag",
  knyken: "Trøndelag",
  hitra: "Trøndelag",
  stryn: "Vestland",
  voss: "Vestland",
  ulvik: "Vestland",
  odda: "Vestland",
  jondal: "Vestland",
  kvam: "Vestland",
  volda: "Møre og Romsdal",
  ørsta: "Møre og Romsdal",
  rauma: "Møre og Romsdal",
  "smøla": "Møre og Romsdal",
  "nesset": "Møre og Romsdal",
  vestnes: "Møre og Romsdal",
  "bremsnes": "Møre og Romsdal",
  "ørskog": "Møre og Romsdal",
  narvik: "Nordland",
  glomfjord: "Nordland",
  bodø: "Nordland",
  vestvatn: "Nordland",
  fauske: "Nordland",
  "sortland": "Nordland",
  vågan: "Nordland",
  "lødingen": "Nordland",
  "andøy": "Nordland",
  "hadsel": "Nordland",
  tromsø: "Troms og Finnmark",
  målselv: "Troms og Finnmark",
  "balsfjord": "Troms og Finnmark",
  "lenvik": "Troms og Finnmark",
  "sør-varanger": "Troms og Finnmark",
  alta: "Troms og Finnmark",
  hammerfest: "Troms og Finnmark",
  sauda: "Rogaland",
  sandnes: "Rogaland",
  stavanger: "Rogaland",
  hjelmeland: "Rogaland",
  suldal: "Rogaland",
  röldal: "Vestland",
  røldal: "Vestland",
  ullensvang: "Vestland",
  stord: "Vestland",
  "fjord": "Møre og Romsdal",
  "fjord kommune": "Møre og Romsdal",
  "våler": "Innlandet",
  "våler (innlandet)": "Innlandet",
};

function countyFromMuni(muni) {
  if (!muni) return undefined;
  return MUNI_COUNTY[muni.toLowerCase()] || undefined;
}

async function main() {
  console.log("Fetching Wikidata…");
  const wdBindings = await fetchWikidata();

  console.log("Fetching Wikipedia category members…");
  const catTitles = await fetchCategoryMembers();

  console.log("Fetching Wikipedia coordinates + images…");
  const wikiData = await fetchWikiCoords(catTitles);

  console.log("Fetching vertical drop data from Wikipedia list…");
  const verticals = await fetchVerticals();

  // Build from Wikidata first
  const entries = [];
  const seen = new Set();

  for (const b of wdBindings) {
    const name = b.itemLabel?.value;
    if (!name) continue;
    const key = slug(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const coord = parsePoint(b.coord?.value);
    if (!coord) continue; // skip if no location

    const muni = b.muniLabel?.value || undefined;
    const county =
      b.countyLabel?.value ||
      countyFromMuni(muni) ||
      undefined;

    const imageFile = b.image?.value
      ? b.image.value.replace("http://commons.wikimedia.org/wiki/Special:FilePath/", "").replace("https://commons.wikimedia.org/wiki/Special:FilePath/", "")
      : undefined;

    const vRaw = b.vertical?.value;
    const vertical = vRaw ? Math.round(parseFloat(vRaw)) : undefined;

    // Fallback vertical from Wikipedia list
    const wikiVertical = verticals[name.toLowerCase()] || undefined;

    const entry = {
      id: `alpin-${key}`,
      name,
      county,
      municipality: muni,
      ...(vertical ?? wikiVertical ? { vertical: vertical ?? wikiVertical } : {}),
      lat: Math.round(coord.lat * 1e6) / 1e6,
      lon: Math.round(coord.lon * 1e6) / 1e6,
      ...(imageFile ? { photo: photoUrl(decodeURIComponent(imageFile)) } : {}),
    };

    entries.push(entry);
  }

  // Merge Wikipedia category entries not already in Wikidata
  for (const title of catTitles) {
    const key = slug(title);
    if (seen.has(key)) continue;
    const wd = wikiData[title];
    if (!wd || !wd.lat || !wd.lon) continue;
    seen.add(key);

    const wikiVertical = verticals[title.toLowerCase()] || undefined;

    const entry = {
      id: `alpin-${key}`,
      name: title,
      county: undefined,
      municipality: undefined,
      ...(wikiVertical ? { vertical: wikiVertical } : {}),
      lat: Math.round(wd.lat * 1e6) / 1e6,
      lon: Math.round(wd.lon * 1e6) / 1e6,
      ...(wd.image ? { photo: photoUrl(wd.image) } : {}),
    };

    entries.push(entry);
  }

  // Sort: largest vertical first, then alphabetical
  entries.sort((a, b) => {
    const vd = (b.vertical ?? 0) - (a.vertical ?? 0);
    return vd !== 0 ? vd : a.name.localeCompare(b.name, "nb");
  });

  // Clean up undefined county/municipality
  for (const e of entries) {
    if (!e.county) delete e.county;
    if (!e.municipality) delete e.municipality;
  }

  await writeFile(OUT, JSON.stringify(entries, null, 2));

  const withVertical = entries.filter((e) => e.vertical != null).length;
  const withPhoto = entries.filter((e) => e.photo).length;
  const withCounty = entries.filter((e) => e.county).length;
  const withMuni = entries.filter((e) => e.municipality).length;

  console.log(`\nalpinanlegg.json written: ${entries.length} resorts`);
  console.log(
    `  vertical: ${withVertical}/${entries.length} (${Math.round((withVertical / entries.length) * 100)}%)`,
  );
  console.log(
    `  photo:    ${withPhoto}/${entries.length} (${Math.round((withPhoto / entries.length) * 100)}%)`,
  );
  console.log(
    `  county:   ${withCounty}/${entries.length} (${Math.round((withCounty / entries.length) * 100)}%)`,
  );
  console.log(
    `  muni:     ${withMuni}/${entries.length} (${Math.round((withMuni / entries.length) * 100)}%)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
