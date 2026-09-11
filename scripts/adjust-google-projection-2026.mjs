import fs from "node:fs/promises";

const BASE = "https://www.ghezelbaash.ir/";
const PERSON = `${BASE}#saeed-ghezelbash`;
const CLINIC = `${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const IRIMC = `${BASE}#organization-iran-medical-council`;
const socialProjectionIds = new Set([
  `${BASE}#profile-facebook-ghezelbaash`,
  `${BASE}#profile-facebook-doctor-ghezelbaash`,
  `${BASE}#profile-instagram-doctor-ghezelbaash`,
  `${BASE}#identifier-person-facebook`,
  `${BASE}#identifier-clinic-facebook-page`,
  `${BASE}#identifier-person-instagram`,
  `${BASE}#identifier-person-drdr`,
]);

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const strip = (value) => Array.isArray(value) ? value.filter((id) => !socialProjectionIds.has(id)) : value;

const headPath = "src/data/semantic/head-profile.json";
const head = await readJson(headPath);
const person = head.nodes?.[PERSON];
const clinic = head.nodes?.[CLINIC];
if (!person || !clinic) throw new Error("Head Person/Clinic policy missing");
person.refAllow.owns = strip(person.refAllow.owns);
person.refAllow.identifier = strip(person.refAllow.identifier);
clinic.refAllow.identifier = strip(clinic.refAllow.identifier);
if (!person.refAllow.owns.includes(CLINIC)) throw new Error("Canonical clinic ownership projection lost");
await writeJson(headPath, head);

const supportPath = "src/data/semantic/support-profile.json";
const support = await readJson(supportPath);
support.ids = support.ids.filter((id) => !socialProjectionIds.has(id));
support.idProfiles ??= {};
for (const id of socialProjectionIds) delete support.idProfiles[id];
const irimc = support.idProfiles[IRIMC];
if (!irimc) throw new Error("IRIMC support profile missing");
irimc.include = [...new Set([...(irimc.include || []), "sameAs"])];
await writeJson(supportPath, support);

const graph = await readJson("src/data/semantic/knowledge-graph.jsonld");
const byId = new Map((graph["@graph"] || []).map((node) => [node["@id"], node]));
for (const id of [...socialProjectionIds].filter((id) => id.includes("#profile-"))) {
  if (!byId.has(id)) throw new Error(`Canonical social node unexpectedly missing: ${id}`);
}
for (const id of support.ids) {
  const node = byId.get(id);
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean);
  if (types.includes("ProfilePage")) throw new Error(`Competing ProfilePage remains in support projection: ${id}`);
}

console.log(JSON.stringify({
  googleProjectionIsolation: "PASS",
  supportIds: support.ids.length,
  socialCanonicalOnly: [...socialProjectionIds].filter((id) => id.includes("#profile-")),
}, null, 2));
