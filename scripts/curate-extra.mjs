// Curated datasets for features Wikidata covers badly (glaciers dominated by
// Svalbard; tunnels/bridges under the wrong entity types). Verified values from
// Wikipedia (Glaciers of Norway, List of road tunnels in Norway). Photos are
// pulled by exact label match where available. Also patches in Sognefjorden,
// which Wikidata lacks a length for. Run: node scripts/curate-extra.mjs
import { writeFile, readFile } from "node:fs/promises";

const UA = "NorgesQuiz/1.0 (https://github.com/egil10/geo; egilfure@gmail.com)";
async function sparql(q) {
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
  });
  return (await r.json()).results.bindings;
}
const img = (u) => (u ? u.replace(/^http:/, "https:") + "?width=1024" : undefined);
const slug = (s) => "x-" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// [name, areaKm2, county]
const GLACIERS = [
  ["Austfonna", 7800, "Svalbard"], ["Vestfonna", 2510, "Svalbard"], ["Jostedalsbreen", 487, "Vestland"],
  ["Vestre Svartisen", 221, "Nordland"], ["Søndre Folgefonna", 168, "Vestland"], ["Østre Svartisen", 148, "Nordland"],
  ["Blåmannsisen", 87, "Nordland"], ["Hardangerjøkulen", 73, "Vestland"], ["Myklebustbreen", 57, "Vestland"],
  ["Okstindbreen", 46, "Nordland"], ["Øksfjordjøkelen", 41, "Troms"], ["Harbardsbreen", 36, "Innlandet"],
  ["Salajekna", 33, "Nordland"], ["Frostisen", 25, "Nordland"], ["Sekkebreen", 24, "Innlandet"], ["Tindefjellbreen", 22, "Vestland"],
];
// [name, lengthKm, county]
const TUNNELS = [
  ["Lærdalstunnelen", 24.5, "Vestland"], ["Ryfylketunnelen", 14.3, "Rogaland"], ["Gudvangatunnelen", 11.4, "Vestland"],
  ["Folgefonntunnelen", 11.1, "Vestland"], ["Toventunnelen", 10.7, "Nordland"], ["Mælefjelltunnelen", 9.4, "Telemark"],
  ["Korgfjelltunnelen", 8.5, "Nordland"], ["Steigentunnelen", 8.1, "Nordland"], ["Bømlafjordtunnelen", 7.9, "Vestland"],
  ["Eiksundtunnelen", 7.8, "Møre og Romsdal"], ["Svartistunnelen", 7.6, "Nordland"], ["Høyangertunnelen", 7.5, "Vestland"],
  ["Oslofjordtunnelen", 7.2, "Akershus"], ["Atlanterhavstunnelen", 5.7, "Møre og Romsdal"], ["Hitratunnelen", 5.6, "Trøndelag"],
  ["Frøyatunnelen", 5.2, "Trøndelag"],
];

const names = [...GLACIERS, ...TUNNELS].map((x) => x[0]);
const values = names.map((n) => `"${n.replace(/"/g, "")}"@nb`).join(" ");
let photoByName = {};
try {
  const rows = await sparql(`SELECT ?name ?photo WHERE { VALUES ?name { ${values} } ?x rdfs:label ?name ; wdt:P17 wd:Q20 ; wdt:P18 ?photo . }`);
  for (const r of rows) if (!photoByName[r.name.value]) photoByName[r.name.value] = img(r.photo.value);
} catch (e) {
  console.warn("photo lookup failed:", e.message);
}

const glaciers = GLACIERS.map(([name, area, county]) => ({ id: slug(name), name, area, county, photo: photoByName[name] }));
const tunnels = TUNNELS.map(([name, length, county]) => ({ id: slug(name), name, length, county, photo: photoByName[name] }));
await writeFile("src/data/isbreer.json", JSON.stringify(glaciers, null, 2));
await writeFile("src/data/tunneler.json", JSON.stringify(tunnels, null, 2));

const fj = JSON.parse(await readFile("src/data/fjorder.json", "utf8"));
if (!fj.some((f) => f.name === "Sognefjorden")) {
  fj.push({
    id: "Q208495",
    name: "Sognefjorden",
    length: 205,
    photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Sognefjord%2C%20Norway.jpg?width=1024",
    lat: 61.1,
    lon: 6.5,
    county: "Vestland",
  });
  await writeFile("src/data/fjorder.json", JSON.stringify(fj, null, 2));
}

console.log("glaciers:", glaciers.length, "with photo:", glaciers.filter((g) => g.photo).length);
console.log("tunnels:", tunnels.length, "with photo:", tunnels.filter((t) => t.photo).length);
console.log("fjorder now:", fj.length, "(Sognefjorden added)");
