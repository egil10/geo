// Produces src/data/dnthytter.json — the 46 staffed DNT mountain lodges (betjente DNT-hytter).
//
// Sources (in priority order):
//   1. Norwegian Wikipedia API  — coordinates (prop=coordinates) + lead image (piprop=original)
//   2. Kartverket stedsnavn API — coordinates for cabins absent from Wikipedia
//   3. Kartverket kommuneinfo   — reverse-geocoded fylke/municipality from coordinates
//
// UA: "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)"
//
// Run: node scripts/curate-dnthytter.mjs
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "dnthytter.json");
const UA = "NorgeGeoQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- helpers ----------------------------------------------------------------

const slug = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function imgUrl(raw, width = 1024) {
  if (!raw) return undefined;
  let u = raw.replace(/^http:\/\//, "https://");
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}width=${width}`;
}

// ---- API helpers ------------------------------------------------------------

async function wikiQuery(titles) {
  const encoded = titles.map((t) => encodeURIComponent(t)).join("|");
  const url =
    "https://no.wikipedia.org/w/api.php?action=query&prop=coordinates|pageimages" +
    "&piprop=original&titles=" + encoded +
    "&format=json&formatversion=2&redirects=1";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const j = await res.json();
  const out = {};
  for (const p of j.query?.pages ?? []) {
    if (p.missing) continue;
    const c = p.coordinates?.[0];
    out[p.title] = { lat: c?.lat ?? null, lon: c?.lon ?? null, img: p.original?.source ?? null };
  }
  for (const r of j.query?.redirects ?? []) {
    if (out[r.to] && !out[r.from]) out[r.from] = out[r.to];
  }
  return out;
}

async function kartverketCoords(name) {
  const url =
    "https://ws.geonorge.no/stedsnavn/v1/sted?sok=" +
    encodeURIComponent(name + "*") +
    "&utkoordsys=4258&treffPerSide=5";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const j = await res.json();
  for (const h of j.navn ?? []) {
    const rp = h.representasjonspunkt;
    if (rp?.nord && rp?.["øst"])
      return { lat: rp.nord, lon: rp["øst"] };
  }
  return null;
}

async function reverseGeocode(lat, lon) {
  const url =
    `https://api.kartverket.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const j = await res.json();
  return { county: j.fylkesnavn ?? null, municipality: j.kommunenavn ?? null };
}

// ---- canonical list ---------------------------------------------------------

// 46 staffed DNT lodges grouped by region.
// wikipedia_title: the Norwegian Wikipedia article used to pull coords + photo.
// source_url: the dnt.no cabin page (or fallback).
const CANONICAL = [
  // Hardangervidda ----------------------------------------------------------
  {
    name: "Solheimstulen",
    region: "Hardangervidda",
    wikipedia_title: "Solheimstulen",
    source_url: "https://www.dnt.no/hytter/betjente/solheimstulen/",
  },
  {
    name: "Rauhelleren",
    region: "Hardangervidda",
    wikipedia_title: "Rauhelleren",
    source_url: "https://www.dnt.no/hytter/betjente/rauhelleren/",
  },
  {
    name: "Mårbu",
    region: "Hardangervidda",
    wikipedia_title: "Mårbu",
    source_url: "https://www.dnt.no/hytter/betjente/marbu/",
  },
  {
    name: "Litlos",
    region: "Hardangervidda",
    wikipedia_title: "Litlos",
    source_url: "https://www.dnt.no/hytter/betjente/litlos/",
  },
  {
    name: "Sandhaug",
    region: "Hardangervidda",
    wikipedia_title: "Sandhaug",
    source_url: "https://www.dnt.no/hytter/betjente/sandhaug/",
  },
  {
    name: "Stavali",
    region: "Hardangervidda",
    wikipedia_title: "Stavali",
    source_url: "https://www.dnt.no/hytter/betjente/stavali/",
  },
  {
    name: "Krækkja",
    region: "Hardangervidda",
    wikipedia_title: "Krækkja",
    source_url: "https://www.dnt.no/hytter/betjente/kraekkja/",
  },
  {
    name: "Kalhovd",
    region: "Hardangervidda",
    wikipedia_title: "Kalhovd turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/kalhovd/",
  },
  {
    name: "Mogen",
    region: "Hardangervidda",
    wikipedia_title: "Mogen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/mogen/",
  },
  {
    name: "Gaustatoppen turisthytte",
    region: "Hardangervidda",
    wikipedia_title: "Gaustatoppen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/gaustatoppen/",
  },
  // Jotunheimen -------------------------------------------------------------
  {
    name: "Fannaråkhytta",
    region: "Jotunheimen",
    wikipedia_title: "Fannaråkhytta",
    source_url: "https://www.dnt.no/hytter/betjente/fannarakhytta/",
  },
  {
    name: "Fondsbu",
    region: "Jotunheimen",
    wikipedia_title: "Fondsbu",
    source_url: "https://www.dnt.no/hytter/betjente/fondsbu/",
  },
  {
    name: "Glitterheim",
    region: "Jotunheimen",
    wikipedia_title: "Glitterheim",
    source_url: "https://www.dnt.no/hytter/betjente/glitterheim/",
  },
  {
    name: "Gjendebu",
    region: "Jotunheimen",
    wikipedia_title: "Gjendebu",
    source_url: "https://www.dnt.no/hytter/betjente/gjendebu/",
  },
  {
    name: "Skogadalsbøen",
    region: "Jotunheimen",
    wikipedia_title: "Skogadalsbøen",
    source_url: "https://www.dnt.no/hytter/betjente/skogadalsboeen/",
  },
  {
    name: "Gjendesheim",
    region: "Jotunheimen",
    wikipedia_title: "Gjendesheim",
    source_url: "https://www.dnt.no/hytter/betjente/gjendesheim/",
  },
  {
    name: "Leirvassbu",
    region: "Jotunheimen",
    wikipedia_title: "Leirvassbu",
    source_url: "https://www.dnt.no/hytter/betjente/leirvassbu/",
  },
  // Rondane og Dovre --------------------------------------------------------
  {
    name: "Grimsdalshytta",
    region: "Rondane og Dovre",
    wikipedia_title: "Grimsdalshytta",
    source_url: "https://www.dnt.no/hytter/betjente/grimsdalshytta/",
  },
  {
    name: "Bjørnhollia",
    region: "Rondane og Dovre",
    wikipedia_title: "Bjørnhollia",
    source_url: "https://www.dnt.no/hytter/betjente/bjornhollia/",
  },
  {
    name: "Snøheim",
    region: "Rondane og Dovre",
    wikipedia_title: "Snøheim",
    source_url: "https://www.dnt.no/hytter/betjente/snoheim/",
  },
  {
    name: "Rondvassbu",
    region: "Rondane og Dovre",
    wikipedia_title: "Rondvassbu",
    source_url: "https://www.dnt.no/hytter/betjente/rondvassbu/",
  },
  {
    name: "Vangshaugen",
    region: "Rondane og Dovre",
    wikipedia_title: "Vangshaugen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/vangshaugen/",
  },
  // Trollheimen og Sylan ----------------------------------------------------
  {
    name: "Trollheimshytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Trollheimshytta",
    source_url: "https://www.dnt.no/hytter/betjente/trollheimshytta/",
  },
  {
    name: "Gjevilvasshytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Gjevilvasshytta",
    source_url: "https://www.dnt.no/hytter/betjente/gjevilvasshytta/",
  },
  {
    name: "Jøldalshytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Jøldalshytta",
    source_url: "https://www.dnt.no/hytter/betjente/joldalshytta/",
  },
  {
    name: "Todalshytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Todalshytta",
    source_url: "https://www.dnt.no/hytter/betjente/todalshytta/",
  },
  {
    name: "Storerikvollen",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Storerikvollen",
    source_url: "https://www.dnt.no/hytter/betjente/storerikvollen/",
  },
  {
    name: "Nedalshytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Nedalshytta",
    source_url: "https://www.dnt.no/hytter/betjente/nedalshytta/",
  },
  {
    name: "Schulzhytta",
    region: "Trollheimen og Sylan",
    wikipedia_title: "Schulzhytta",
    source_url: "https://www.dnt.no/hytter/betjente/schulzhytta/",
  },
  // Skarvheimen -------------------------------------------------------------
  {
    name: "Iungsdalshytta",
    region: "Skarvheimen",
    wikipedia_title: "Iungsdalshytta",
    source_url: "https://www.dnt.no/hytter/betjente/iungsdalshytta/",
  },
  {
    name: "Aurlandsdalen turisthytte",
    region: "Skarvheimen",
    wikipedia_title: "Aurlandsdalen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/aurlandsdalen/",
  },
  {
    name: "Geiterygghytta",
    region: "Skarvheimen",
    wikipedia_title: "Geiterygghytta",
    source_url: "https://www.dnt.no/hytter/betjente/geiterygghytta/",
  },
  {
    name: "Finsehytta",
    region: "Skarvheimen",
    wikipedia_title: "Finsehytta",
    source_url: "https://www.dnt.no/hytter/betjente/finsehytta/",
  },
  // Ryfylke -----------------------------------------------------------------
  {
    name: "Haukeliseter",
    region: "Ryfylke",
    wikipedia_title: "Haukeliseter",
    source_url: "https://www.dnt.no/hytter/betjente/haukeliseter/",
  },
  {
    name: "Stranddalen turisthytte",
    region: "Ryfylke",
    wikipedia_title: "Stranddalen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/stranddalen/",
  },
  {
    name: "Lysefjorden turisthytte",
    region: "Ryfylke",
    wikipedia_title: "Lysefjorden turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/lysefjorden/",
  },
  {
    name: "Gramstadtunet",
    region: "Ryfylke",
    wikipedia_title: "Gramstadtunet",
    // Kartverket: "Gramstad" Turisthytte, Sandnes, Rogaland (58.88422, 5.79915)
    fallback_coords: { lat: 58.88422, lon: 5.79915 },
    source_url: "https://www.dnt.no/hytter/betjente/gramstadtunet/",
  },
  // Breheimen/Jostedalsbreen ------------------------------------------------
  {
    name: "Sota Sæter",
    region: "Breheimen/Jostedalsbreen",
    wikipedia_title: "Sota Sæter",
    source_url: "https://www.dnt.no/hytter/betjente/sota-saeter/",
  },
  {
    name: "Nørdstedalseter",
    region: "Breheimen/Jostedalsbreen",
    wikipedia_title: "Nørdstedalseter",
    source_url: "https://www.dnt.no/hytter/betjente/nordstedalseter/",
  },
  {
    name: "Tungestølen",
    region: "Breheimen/Jostedalsbreen",
    wikipedia_title: "Tungestølen turisthytte",
    source_url: "https://www.dnt.no/hytter/betjente/tungestolen/",
  },
  // Langsua og Femundsmarka -------------------------------------------------
  {
    name: "Liomseter",
    region: "Langsua og Femundsmarka",
    wikipedia_title: "Liomseter",
    source_url: "https://www.dnt.no/hytter/betjente/liomseter/",
  },
  {
    name: "Svukuriset",
    region: "Langsua og Femundsmarka",
    wikipedia_title: "Svukuriset",
    source_url: "https://www.dnt.no/hytter/betjente/svukuriset/",
  },
  // Oslo/Drammen-området ----------------------------------------------------
  {
    name: "Eiksetra",
    region: "Oslo/Drammen-området",
    wikipedia_title: "Eiksetra",
    source_url: "https://www.dnt.no/hytter/betjente/eiksetra/",
  },
  {
    name: "Sæteren Gård",
    region: "Oslo/Drammen-området",
    wikipedia_title: "Sæteren Gård",
    source_url: "https://www.dnt.no/hytter/betjente/saeteren-gard/",
  },
  {
    name: "Breivoll Gård",
    region: "Oslo/Drammen-området",
    wikipedia_title: "Breivoll Gård",
    // Kartverket: "Breivoll friområde" Friluftsområde, Ås, Akershus (59.73364, 10.72927)
    // DNT page confirms "ved Bunnefjorden utenfor Oslo, i Ås kommune"
    fallback_coords: { lat: 59.73364, lon: 10.72927 },
    source_url: "https://www.dnt.no/hytter/betjente/breivoll-gard/",
  },
  {
    name: "Kobberhaughytta",
    region: "Oslo/Drammen-området",
    wikipedia_title: "Kobberhaughytta",
    source_url: "https://www.dnt.no/hytter/betjente/kobberhaughytta/",
  },
];

// ---- main -------------------------------------------------------------------

async function main() {
  // 1. Wikipedia: batch in groups of 20
  console.log("Fetching Wikipedia coordinates and photos...");
  const wikiTitles = CANONICAL.map((c) => c.wikipedia_title);
  const wikiData = {};
  for (let i = 0; i < wikiTitles.length; i += 20) {
    const batch = wikiTitles.slice(i, i + 20);
    const r = await wikiQuery(batch);
    Object.assign(wikiData, r);
    if (i + 20 < wikiTitles.length) await sleep(500);
  }

  // 2. For entries that Wikipedia has no coordinates, fall back to Kartverket stedsnavn.
  console.log("Resolving missing coordinates via Kartverket stedsnavn...");
  const needKartverket = CANONICAL.filter((c) => {
    const w = wikiData[c.wikipedia_title];
    return !w || w.lat == null;
  });
  const kvCoords = {};
  for (const c of needKartverket) {
    const r = await kartverketCoords(c.name);
    if (r) kvCoords[c.name] = r;
    await sleep(150);
  }

  // 3. Reverse-geocode all coordinates to get county.
  console.log("Reverse-geocoding county for each cabin...");
  const countyCache = {};
  for (const c of CANONICAL) {
    const w = wikiData[c.wikipedia_title];
    const lat = w?.lat ?? kvCoords[c.name]?.lat ?? c.fallback_coords?.lat;
    const lon = w?.lon ?? kvCoords[c.name]?.lon ?? c.fallback_coords?.lon;
    if (lat != null && lon != null) {
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (!countyCache[key]) {
        countyCache[key] = await reverseGeocode(lat, lon);
        await sleep(100);
      }
    }
  }

  // 4. Assemble output.
  const result = [];
  for (const c of CANONICAL) {
    const w = wikiData[c.wikipedia_title];
    const lat = w?.lat ?? kvCoords[c.name]?.lat ?? c.fallback_coords?.lat ?? null;
    const lon = w?.lon ?? kvCoords[c.name]?.lon ?? c.fallback_coords?.lon ?? null;
    const geoKey = lat != null ? `${lat.toFixed(4)},${lon.toFixed(4)}` : null;
    const geo = geoKey ? countyCache[geoKey] : null;

    const entry = {
      id: `dnthytte-${slug(c.name)}`,
      name: c.name,
      region: c.region,
      county: geo?.county ?? null,
      status: "betjent",
      source_url: c.source_url,
    };
    if (lat != null) { entry.lat = lat; entry.lon = lon; }
    if (w?.img) entry.photo = imgUrl(w.img, 1024);

    result.push(entry);
  }

  await writeFile(OUT, JSON.stringify(result, null, 2));

  // 5. Coverage report.
  const n = result.length;
  const withCoords = result.filter((x) => x.lat != null).length;
  const withPhoto  = result.filter((x) => x.photo).length;
  const withCounty = result.filter((x) => x.county).length;
  const noCoords   = result.filter((x) => x.lat == null).map((x) => x.name);
  const noPhoto    = result.filter((x) => !x.photo).map((x) => x.name);

  console.log(`\ndnthytter: ${n} lodges written to ${OUT}`);
  console.log(`Field coverage: lat/lon ${withCoords}/${n}, photo ${withPhoto}/${n}, county ${withCounty}/${n}`);
  if (noCoords.length) console.log(`Missing coords: ${noCoords.join(", ")}`);
  if (noPhoto.length)  console.log(`Missing photos: ${noPhoto.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
