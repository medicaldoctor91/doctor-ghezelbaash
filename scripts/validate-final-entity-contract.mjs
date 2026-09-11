import fs from "node:fs";

const BASE = "https://www.ghezelbaash.ir/";
const graph = JSON.parse(fs.readFileSync("src/data/semantic/knowledge-graph.jsonld", "utf8"));
const head = JSON.parse(fs.readFileSync("src/data/semantic/head-profile.json", "utf8"));
const support = JSON.parse(fs.readFileSync("src/data/semantic/support-profile.json", "utf8"));
const evidence = JSON.parse(fs.readFileSync("src/data/evidence-registry.json", "utf8"));
const media = JSON.parse(fs.readFileSync("src/data/media-metadata.json", "utf8"));
const nodes = graph["@graph"] || [];
const ids = nodes.map((n) => n["@id"]).filter(Boolean);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical @id");
const byId = new Map(nodes.map((n) => [n["@id"], n]));
const arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const id = (v) => typeof v === "string" ? v : v?.["@id"];
const refs = (v) => new Set(arr(v).map(id).filter(Boolean));
const get = (suffix) => { const value = byId.get(`${BASE}${suffix}`); if (!value) throw new Error(`Missing node: ${suffix}`); return value; };
const PERSON = `${BASE}#saeed-ghezelbash`;
const CLINIC = `${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const person = byId.get(PERSON), clinic = byId.get(CLINIC);
if (!person || !clinic || person === clinic) throw new Error("Person/Clinic separation failure");
const serialized = JSON.stringify(graph);
for (const forbidden of ["https://www.wikidata.org/entity/Q700236", "Q256688", "Q140288589", "Q140304972"]) if (serialized.includes(forbidden)) throw new Error(`Forbidden active identifier: ${forbidden}`);
const city = get("#place-messe-berlin-citycube");
if (city.name !== "CityCube Berlin" || city.sameAs !== "https://www.wikidata.org/entity/Q15108815") throw new Error("CityCube identity contract failure");
const irimc = get("#organization-iran-medical-council");
if (irimc.sameAs !== "https://www.wikidata.org/entity/Q5944740") throw new Error("Iranian Medical Council identity contract failure");
if (arr(person.sameAs).map(id).includes(irimc.sameAs)) throw new Error("IRIMC QID leaked into Person.sameAs");
for (const alias of ["Ghezelbash MS", "Doctor Ghezelbaash"]) if (!arr(person.alternateName).includes(alias)) throw new Error(`Missing alias: ${alias}`);
if (head.nodes?.[PERSON]?.valueAllow && Object.hasOwn(head.nodes[PERSON].valueAllow, "alternateName")) throw new Error("Duplicate alternateName truth remains in head profile");
const social = [
  ["#profile-facebook-ghezelbaash", PERSON, PERSON],
  ["#profile-facebook-doctor-ghezelbaash", PERSON, CLINIC],
  ["#profile-instagram-doctor-ghezelbaash", PERSON, CLINIC],
];
for (const [suffix, owner, main] of social) { const n = get(suffix); if (id(n.owner) !== owner || id(n.mainEntity) !== main) throw new Error(`Social ownership/mainEntity drift: ${suffix}`); if (!refs(person.owns).has(n["@id"])) throw new Error(`Person.owns missing: ${suffix}`); }
if (byId.has(`${BASE}#profile-instagram-ghezelbaash`)) throw new Error("Unverified personal Instagram asserted");
const drdrId = get("#identifier-person-drdr");
if (drdrId.value !== "92014") throw new Error("DrDr structured identifier drift");
const wd = evidence.evidence.find((e) => e.id === `${BASE}#evidence-wikidata-doctor`);
if (JSON.stringify(wd?.supports) !== JSON.stringify(["person-identity", "canonical-name", "aliases"])) throw new Error("Wikidata evidence overclaims independence");
if (!evidence.evidence.some((e) => e.id === `${BASE}#evidence-drdr` && e.tier === "C")) throw new Error("DrDr evidence registry entry missing");
const team = media.imageProfiles.find((p) => arr(p.includes).includes("clinical-team"));
const semanticText = JSON.stringify([team, ...nodes.filter((n) => /clinical-team|clinic-team/.test(n?.["@id"] || ""))]);
for (const claim of ["clinical team", "medical team", "تیم بالینی", "اعضای تیم درمان"]) if (semanticText.toLowerCase().includes(claim.toLowerCase())) throw new Error(`Unsupported group-photo role claim remains: ${claim}`);
const irimcProfile = support.idProfiles?.[`${BASE}#organization-iran-medical-council`];
if (!irimcProfile?.include?.includes("sameAs")) throw new Error("IRIMC sameAs not projected");
console.log(JSON.stringify({ valid: true, canonicalNodes: nodes.length, checked: "final-entity-contract-2026" }, null, 2));
