// Fetches all Norwegian mountain plateaus (vidder) from the Wikipedia category
// "Kategori:Vidder i Norge", enriches each entry with coordinates, photo, area,
// and county from the Wikipedia coordinates/pageimages API and Wikidata, then
// writes src/data/vidder.json.
//
// Run: node scripts/curate-vidder.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "src", "data", "vidder.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
const WIKI_API = "https://no.wikipedia.org/w/api.php";
const WD_API = "https://www.wikidata.org/w/api.php";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiFetch(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
  } catch (err) {
    if (attempt <= 4) {
      const wait = 2000 * attempt;
      console.warn(`  retry ${attempt} after: ${err.message} (waiting ${wait}ms)`);
      await sleep(wait);
      return apiFetch(url, attempt + 1);
    }
    throw err;
  }
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    // Sami and other Nordic characters -> ASCII approximations.
    .replace(/[áàâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[čč]/g, "c")
    .replace(/[šs̃]/g, "s")
    .replace(/[žz̃]/g, "z")
    .replace(/[đ]/g, "d")
    .replace(/[ŋ]/g, "ng")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Pages in the category that are not genuine vidder and should be excluded.
// Mauken: described as "fjellmassiv" (mountain massif), not a plateau.
// Storfjellet (Bergen): described as "et fjell i Bergen" (a mountain).
// Gauldalsvidda: no coordinates in Wikipedia or Wikidata — cannot meet lat/lon requirement.
const EXCLUDE = new Set(["Mauken", "Storfjellet (Bergen)", "Gauldalsvidda"]);

// Map from Wikipedia title -> photo thumbnail URL pattern to use for the photo
// field — only used when Wikidata has a better canonical image than the pageimage.
// The Norway Finnmark location map SVG used as pageimage for many Sami-area
// plateaus is a generic locator map, not a landscape photo; we omit photo for
// those entries rather than include a non-representative image.
const GENERIC_IMAGES = new Set([
  "Norway_Finnmark_location_map.svg",
  "Norway Finnmark location map.svg",
]);

function commonsUrl(filename) {
  if (!filename) return undefined;
  const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1024`;
}

async function fetchCategoryMembers() {
  const url =
    WIKI_API +
    "?action=query&list=categorymembers" +
    "&cmtitle=Kategori:Vidder%20i%20Norge&cmlimit=50&format=json";
  const data = await apiFetch(url);
  return data.query.categorymembers
    .filter((m) => m.ns === 0)
    .map((m) => m.title);
}

async function fetchWikiCoords(titles) {
  // Wikipedia coordinates|pageimages API — batch all titles in one request.
  const url =
    WIKI_API +
    "?action=query&prop=coordinates|pageimages" +
    "&titles=" +
    encodeURIComponent(titles.join("|")) +
    "&format=json&pithumbsize=1024";
  const data = await apiFetch(url);
  const result = {};
  for (const page of Object.values(data.query.pages)) {
    const coords = page.coordinates?.[0];
    result[page.title] = {
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      pageimage: page.pageimage ?? null,
    };
  }
  return result;
}

async function fetchWikidata(titles) {
  // wbgetentities via Norwegian Wikipedia sitelinks — one request for all titles.
  // Request sitelinks so we can build a reliable title -> entity map.
  const url =
    WD_API +
    "?action=wbgetentities&sites=nowiki" +
    "&titles=" +
    encodeURIComponent(titles.join("|")) +
    "&props=claims|labels|sitelinks&languages=nb|nn|en&format=json";
  const data = await apiFetch(url);

  // Build title -> entity map using the nowiki sitelink on each returned entity.
  const byTitle = {};
  for (const ent of Object.values(data.entities)) {
    const sitelink = ent.sitelinks?.nowiki?.title;
    if (sitelink) byTitle[sitelink] = ent;
  }
  return { entities: data.entities, byTitle };
}

// Walk the P131 chain upward (up to maxDepth levels) until a Norwegian county
// (P31 = Q192299) is found. Fetches missing entities into entitiesCache as needed.
async function resolveCounty(startQids, entitiesCache, maxDepth = 3) {
  const Q192299 = "Q192299";
  let frontier = startQids.filter(Boolean);

  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    // Fetch any entities not yet in cache.
    const missing = frontier.filter((q) => !entitiesCache[q]);
    if (missing.length) {
      const url =
        WD_API +
        "?action=wbgetentities&ids=" +
        missing.join("|") +
        "&props=claims|labels&languages=nb|nn|en&format=json";
      const data = await apiFetch(url);
      Object.assign(entitiesCache, data.entities);
    }
    // Check if any frontier entity is a fylke; collect next frontier.
    const next = new Set();
    for (const qid of frontier) {
      const ent = entitiesCache[qid];
      if (!ent) continue;
      const types = (ent.claims?.["P31"] ?? []).map(
        (c) => c.mainsnak?.datavalue?.value?.id
      );
      if (types.includes(Q192299)) {
        return (ent.labels?.nb ?? ent.labels?.nn ?? ent.labels?.en)?.value ?? null;
      }
      // Collect this entity's own P131 parents for the next round.
      for (const claim of ent.claims?.["P131"] ?? []) {
        const id = claim.mainsnak?.datavalue?.value?.id;
        if (id) next.add(id);
      }
    }
    frontier = [...next];
  }
  return null;
}

async function main() {
  await mkdir(join(__dirname, "..", "src", "data"), { recursive: true });

  console.log("Fetching category members from no.wikipedia.org...");
  const allTitles = await fetchCategoryMembers();
  console.log(`  ${allTitles.length} members found.`);

  const titles = allTitles.filter((t) => !EXCLUDE.has(t));
  const excluded = allTitles.filter((t) => EXCLUDE.has(t));
  console.log(`  Excluding: ${excluded.join(", ")}`);

  console.log("Fetching Wikipedia coordinates and pageimages...");
  const wikiInfo = await fetchWikiCoords(titles);

  console.log("Fetching Wikidata entities...");
  const { entities: wdEntities, byTitle: wdByTitle } = await fetchWikidata(titles);
  const entitiesCache = { ...wdEntities };

  // Pre-fetch all direct P131 targets so county checks work without per-entry fetches.
  const allP131Qids = new Set();
  for (const ent of Object.values(wdEntities)) {
    for (const claim of ent.claims?.["P131"] ?? []) {
      const id = claim.mainsnak?.datavalue?.value?.id;
      if (id) allP131Qids.add(id);
    }
  }
  if (allP131Qids.size) {
    const url =
      WD_API +
      "?action=wbgetentities&ids=" +
      [...allP131Qids].join("|") +
      "&props=claims|labels&languages=nb|nn|en&format=json";
    const data = await apiFetch(url);
    Object.assign(entitiesCache, data.entities);
  }

  const Q192299 = "Q192299";

  const vidder = [];
  for (const title of titles) {
    const wiki = wikiInfo[title] ?? {};
    // Use the sitelink-based map for reliable title -> entity lookup.
    const wdEnt = wdByTitle[title] ?? null;

    // Coordinates: prefer Wikipedia (more precise), fall back to Wikidata.
    let lat = wiki.lat;
    let lon = wiki.lon;
    if ((lat == null || lon == null) && wdEnt) {
      const coords =
        wdEnt.claims?.["P625"]?.[0]?.mainsnak?.datavalue?.value;
      lat = coords?.latitude ?? null;
      lon = coords?.longitude ?? null;
    }

    // Skip entries with no coordinates — cannot be a useful quiz entry.
    if (lat == null || lon == null) {
      console.warn(`  Skipping "${title}" — no coordinates found.`);
      continue;
    }

    // Photo: use Wikidata P18 if available; otherwise fall back to Wikipedia
    // pageimage if it is not a generic locator map.
    let photo;
    const wdPhoto = wdEnt?.claims?.["P18"]?.[0]?.mainsnak?.datavalue?.value;
    if (wdPhoto) {
      photo = commonsUrl(wdPhoto);
    } else if (wiki.pageimage && !GENERIC_IMAGES.has(wiki.pageimage)) {
      photo = commonsUrl(wiki.pageimage);
    }

    // Area from Wikidata P2046 (unit Q712226 = km²).
    let area;
    if (wdEnt) {
      const areaClaim = wdEnt.claims?.["P2046"]?.[0]?.mainsnak?.datavalue?.value;
      if (areaClaim?.amount) {
        const raw = Math.abs(Number(areaClaim.amount));
        // Values > 50 000 are almost certainly m² — convert.
        area = !isNaN(raw)
          ? raw > 50000
            ? Math.round(raw / 1000) / 1000
            : Math.round(raw * 10) / 10
          : undefined;
      }
    }

    // County: walk P131 chain upward until we hit a Norwegian county (Q192299).
    let county;
    if (wdEnt) {
      const directP131 = (wdEnt.claims?.["P131"] ?? [])
        .map((c) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);

      // Check if any direct P131 entity is already a fylke.
      for (const qid of directP131) {
        const ent = entitiesCache[qid];
        if (!ent) continue;
        const types = (ent.claims?.["P31"] ?? []).map(
          (c) => c.mainsnak?.datavalue?.value?.id
        );
        if (types.includes(Q192299)) {
          county =
            (ent.labels?.nb ?? ent.labels?.nn ?? ent.labels?.en)?.value ?? undefined;
          break;
        }
      }

      // If not found yet, go one level up (municipality -> fylke).
      if (!county && directP131.length) {
        county = (await resolveCounty(directP131, entitiesCache)) ?? undefined;
      }
    }

    const entry = {
      id: `vidde-${slug(title)}`,
      name: title,
      ...(county !== undefined && { county }),
      ...(area !== undefined && { area }),
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      ...(photo !== undefined && { photo }),
    };
    vidder.push(entry);
  }

  // Sort alphabetically by name.
  vidder.sort((a, b) => a.name.localeCompare(b.name, "nb"));

  await writeFile(OUT_FILE, JSON.stringify(vidder, null, 2));

  const withPhoto = vidder.filter((v) => v.photo).length;
  const withCounty = vidder.filter((v) => v.county).length;
  const withArea = vidder.filter((v) => v.area != null).length;

  console.log(`\n${vidder.length} vidder written to src/data/vidder.json`);
  console.log(
    `  photo: ${withPhoto}/${vidder.length}  county: ${withCounty}/${vidder.length}  area: ${withArea}/${vidder.length}  lat/lon: ${vidder.length}/${vidder.length}`
  );
  console.log(`  Excluded (no coords or not a plateau): ${excluded.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
