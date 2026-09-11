import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const TODAY = "2026-09-11";
const BASE = "https://www.ghezelbaash.ir/";
const PERSON = `${BASE}#saeed-ghezelbash`;
const CLINIC = `${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const CITYCUBE = `${BASE}#place-messe-berlin-citycube`;
const IRIMC = `${BASE}#organization-iran-medical-council`;
const DATASET = `${BASE}graph.jsonld#dataset`;
const WEBSITE = `${BASE}#website`;
const WEBPAGE = `${BASE}#webpage`;
const GITHUB_SOURCE = `${BASE}#project-github-source`;
const FB_PERSONAL = `${BASE}#profile-facebook-ghezelbaash`;
const FB_PRO = `${BASE}#profile-facebook-doctor-ghezelbaash`;
const IG_PRO = `${BASE}#profile-instagram-doctor-ghezelbaash`;
const FB_PERSONAL_ID = `${BASE}#identifier-person-facebook`;
const FB_PRO_ID = `${BASE}#identifier-clinic-facebook-page`;
const IG_PRO_ID = `${BASE}#identifier-person-instagram`;
const DRDR = `${BASE}#evidence-drdr`;
const DRDR_ID = `${BASE}#identifier-person-drdr`;

const readText = (p) => fs.readFile(path.join(root, p), "utf8");
const writeText = (p, value) => fs.writeFile(path.join(root, p), value);
const readJson = async (p) => JSON.parse(await readText(p));
const writeJson = (p, value) => writeText(p, `${JSON.stringify(value, null, 2)}\n`);
const arr = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const ref = (id) => ({ "@id": id });
const refId = (value) => typeof value === "string" ? value : value?.["@id"];
const uniq = (values) => [...new Set(values)];
const ensureStrings = (value, additions) => uniq([...arr(value), ...additions]);
const ensureRefs = (value, additions) => {
  const existing = arr(value).filter(Boolean);
  const seen = new Set(existing.map(refId).filter(Boolean));
  for (const id of additions) if (!seen.has(id)) { existing.push(ref(id)); seen.add(id); }
  return existing;
};
const ensureList = (value, additions) => uniq([...arr(value), ...additions]);
const hasType = (node, type) => arr(node?.["@type"]).includes(type);

const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const graph = await readJson(graphPath);
if (graph?.["@context"]?.["@version"] !== 1.1) throw new Error("Expected JSON-LD 1.1 canonical graph");
if (!Array.isArray(graph["@graph"])) throw new Error("Canonical graph @graph missing");
const nodes = graph["@graph"];
const byId = new Map();
for (const node of nodes) {
  const id = node?.["@id"];
  if (!id) continue;
  if (byId.has(id)) throw new Error(`Duplicate canonical @id before migration: ${id}`);
  byId.set(id, node);
}
const need = (id) => {
  const node = byId.get(id);
  if (!node) throw new Error(`Required canonical node missing: ${id}`);
  return node;
};
const upsert = (node) => {
  const id = node?.["@id"];
  if (!id) throw new Error("Cannot upsert node without @id");
  const current = byId.get(id);
  if (current) Object.assign(current, node);
  else { nodes.push(node); byId.set(id, node); }
  return byId.get(id);
};

// 1) Entity identity corrections.
const cityCube = need(CITYCUBE);
cityCube.name = "CityCube Berlin";
cityCube.alternateName = ensureStrings(cityCube.alternateName, ["Messe Berlin / CityCube Berlin"]);
cityCube.sameAs = "https://www.wikidata.org/entity/Q15108815";

const irimc = need(IRIMC);
irimc.sameAs = "https://www.wikidata.org/entity/Q5944740";

const person = need(PERSON);
person.alternateName = ensureStrings(person.alternateName, ["Ghezelbash MS", "Doctor Ghezelbaash"]);
person.owns = ensureRefs(person.owns, [CLINIC, FB_PERSONAL, FB_PRO, IG_PRO]);
person.identifier = ensureRefs(person.identifier, [FB_PERSONAL_ID, IG_PRO_ID, DRDR_ID]);

const clinic = need(CLINIC);
clinic.identifier = ensureRefs(clinic.identifier, [FB_PRO_ID]);

const fbPersonal = need(FB_PERSONAL);
Object.assign(fbPersonal, {
  "@type": "ProfilePage",
  name: "Facebook profile — Saeed Ghezelbash",
  url: "https://www.facebook.com/ghezelbaash",
  owner: ref(PERSON),
  mainEntity: ref(PERSON),
  about: [ref(PERSON)],
  identifier: ref(FB_PERSONAL_ID),
});

upsert({
  "@id": FB_PRO,
  "@type": "ProfilePage",
  name: "Official Facebook Page — Dr. Saeed Ghezelbash Aesthetic Clinic",
  url: "https://www.facebook.com/doctor.ghezelbaash",
  owner: ref(PERSON),
  mainEntity: ref(CLINIC),
  about: [ref(CLINIC), ref(PERSON)],
  identifier: ref(FB_PRO_ID),
});
upsert({
  "@id": FB_PRO_ID,
  "@type": "PropertyValue",
  propertyID: "Facebook Page username",
  value: "doctor.ghezelbaash",
  url: "https://www.facebook.com/doctor.ghezelbaash",
});

upsert({
  "@id": IG_PRO,
  "@type": "ProfilePage",
  name: "Instagram — Dr. Saeed Ghezelbash",
  url: "https://www.instagram.com/doctor.ghezelbaash/",
  owner: ref(PERSON),
  mainEntity: ref(CLINIC),
  about: [ref(CLINIC), ref(PERSON)],
  identifier: ref(IG_PRO_ID),
});

const drdr = need(DRDR);
drdr.mainEntity = ref(PERSON);
drdr.about = ensureRefs(drdr.about, [PERSON]);
drdr.identifier = ref(DRDR_ID);
upsert({
  "@id": DRDR_ID,
  "@type": "PropertyValue",
  propertyID: "DrDr profile ID",
  value: "92014",
  url: drdr.url,
});

// 2) Neutralize historical semantic role claims without changing stable media IDs/URLs.
const replacements = new Map([
  ["Saeed Ghezelbash with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic", "Group photograph of Dr. Saeed Ghezelbash at his private practice in Kermanshah"],
  ["Saeed Ghezelbash with his clinical team in Kermanshah, Iran.", "Group photograph of Dr. Saeed Ghezelbash at his private practice in Kermanshah, Iran. This description makes no claim about the professional roles of other people pictured."],
  ["Dr. Saeed Ghezelbash with members of his clinical team in Kermanshah, Iran.", "Dr. Saeed Ghezelbash in a group photograph at his private practice in Kermanshah, Iran; no claim is made about the professional roles of other people pictured."],
  ["Physician with clinical team", "Group photograph at private practice"],
  ["clinical team", "group photograph"],
  ["medical team", "private practice"],
  ["دکتر سعید قزلباش همراه تیم بالینی کلینیک زیبایی در کرمانشاه", "تصویر گروهی دکتر سعید قزلباش در مطب شخصی او در کرمانشاه"],
  ["دکتر سعید قزلباش همراه اعضای تیم بالینی در کرمانشاه، ایران.", "تصویر گروهی دکتر سعید قزلباش در مطب شخصی او در کرمانشاه، ایران؛ این توضیح درباره نقش حرفه‌ای سایر افراد حاضر در تصویر ادعایی ندارد."],
  ["تیم بالینی", "تصویر گروهی"],
  ["اعضای تیم درمان", "افراد حاضر در تصویر"],
]);
const replaceText = (value) => {
  if (typeof value === "string") {
    let out = value;
    for (const [from, to] of replacements) out = out.replaceAll(from, to);
    return out;
  }
  if (Array.isArray(value)) return value.map(replaceText);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceText(v)]));
  return value;
};
for (const node of nodes) {
  if (!/clinical-team|clinic-team/.test(node?.["@id"] || "")) continue;
  for (const key of ["name", "alternateName", "caption", "description", "keywords"])
    if (Object.hasOwn(node, key)) node[key] = replaceText(node[key]);
}

// 3) Current-resource revision dates; archived Zenodo/Hugging Face nodes are deliberately untouched.
need(DATASET).dateModified = TODAY;
need(WEBSITE).dateModified = TODAY;
need(WEBPAGE).dateModified = TODAY;
need(GITHUB_SOURCE).dateModified = TODAY;
for (const node of nodes) {
  if (!hasType(node, "DataDownload")) continue;
  if (refId(node.isPartOf) !== DATASET) continue;
  if (node.url?.startsWith("https://doi.org/") || /zenodo|huggingface/i.test(node["@id"] || "")) continue;
  node.dateModified = TODAY;
}

// Hard invariants before writing canonical graph.
if (JSON.stringify(graph).includes("https://www.wikidata.org/entity/Q700236"))
  throw new Error("Q700236 remains in active canonical graph after CityCube migration");
if (arr(person.sameAs).map(refId).includes("https://www.wikidata.org/entity/Q5944740"))
  throw new Error("Iranian Medical Council QID must not be a Person sameAs target");
if (nodes.some((node) => /#profile-instagram-ghezelbaash$/.test(node?.["@id"] || "")))
  throw new Error("Personal Instagram must not be asserted before direct live verification");
await writeJson(graphPath, graph);

// 4) Projection contracts: canonical truth lives in graph; allowlists only select fields/refs.
const headPath = "src/data/semantic/head-profile.json";
const head = await readJson(headPath);
const personPolicy = head.nodes?.[PERSON];
if (!personPolicy) throw new Error("Head Person policy missing");
delete personPolicy.valueAllow?.alternateName;
personPolicy.refAllow.owns = ensureList(personPolicy.refAllow.owns, [FB_PERSONAL, FB_PRO, IG_PRO]);
personPolicy.refAllow.identifier = ensureList(personPolicy.refAllow.identifier, [FB_PERSONAL_ID, IG_PRO_ID, DRDR_ID]);
const clinicPolicy = head.nodes?.[CLINIC];
if (!clinicPolicy) throw new Error("Head Clinic policy missing");
clinicPolicy.refAllow.identifier = ensureList(clinicPolicy.refAllow.identifier, [FB_PRO_ID]);
await writeJson(headPath, head);

const supportPath = "src/data/semantic/support-profile.json";
const support = await readJson(supportPath);
support.idProfiles ??= {};
const socialIds = [FB_PERSONAL, FB_PRO, IG_PRO, FB_PERSONAL_ID, FB_PRO_ID, IG_PRO_ID, DRDR_ID];
for (const id of socialIds) if (!support.ids.includes(id)) support.ids.push(id);
for (const id of [FB_PERSONAL, FB_PRO, IG_PRO])
  support.idProfiles[id] = { include: ["@id", "@type", "name", "url", "owner", "mainEntity", "about", "identifier"] };
for (const id of [FB_PERSONAL_ID, FB_PRO_ID, IG_PRO_ID, DRDR_ID])
  support.idProfiles[id] = { include: ["@id", "@type", "propertyID", "value", "url"] };
const irimcProfile = support.idProfiles?.[IRIMC];
if (!irimcProfile) throw new Error("Support IRIMC policy missing");
irimcProfile.include = ensureList(irimcProfile.include, ["sameAs"]);
await writeJson(supportPath, support);

// 5) Evidence roles and live-verified DrDr directory corroboration.
const evidencePath = "src/data/evidence-registry.json";
const evidence = await readJson(evidencePath);
evidence.verifiedAt = TODAY;
const wikidataEvidence = evidence.evidence.find((entry) => entry.id === `${BASE}#evidence-wikidata-doctor`);
if (!wikidataEvidence) throw new Error("Wikidata evidence entry missing");
wikidataEvidence.supports = ["person-identity", "canonical-name", "aliases"];
let drdrEvidence = evidence.evidence.find((entry) => entry.id === DRDR);
const drdrEntry = {
  id: DRDR,
  tier: "C",
  supports: ["person-identity", "directory-profile"],
  url: drdr.url,
  liveStatus: "verified-live-web",
  verifiedAt: TODAY,
  expectedMarkers: ["دکتر سعید قزلباش", "167430"],
  role: "identity-reference",
};
if (drdrEvidence) Object.assign(drdrEvidence, drdrEntry); else evidence.evidence.push(drdrEntry);
await writeJson(evidencePath, evidence);

// 6) Neutral media source metadata; stable historical filenames/IRIs remain unchanged.
const mediaPath = "src/data/media-metadata.json";
const media = await readJson(mediaPath);
const teamProfile = media.imageProfiles.find((profile) => arr(profile.includes).some((x) => x === "clinical-team" || x === "clinic-team"));
if (!teamProfile) throw new Error("Historical group-photo media profile missing");
teamProfile.title = "Group photograph of Dr. Saeed Ghezelbash at his private practice in Kermanshah";
teamProfile.description = "تصویر گروهی دکتر سعید قزلباش در مطب شخصی او در کرمانشاه | Group photograph of Dr. Saeed Ghezelbash at his private practice in Kermanshah. This description makes no claim about the professional roles of other people pictured.";
teamProfile.role = "Group photograph at private practice";
teamProfile.subjects = ["group photograph", "private practice", "aesthetic clinic", "physician portrait"];
teamProfile.alt = {
  en: "Dr. Saeed Ghezelbash in a group photograph at his private practice in Kermanshah, Iran; no claim is made about the professional roles of other people pictured.",
  fa: "تصویر گروهی دکتر سعید قزلباش در مطب شخصی او در کرمانشاه، ایران؛ این توضیح درباره نقش حرفه‌ای سایر افراد حاضر در تصویر ادعایی ندارد.",
};
await writeJson(mediaPath, media);

// 7) Visible/retrieval prose: remove unsupported organizational roles and neutralize group-photo descriptions.
for (const file of ["src/content-source/page.md", "src/data/templates/llms.template.txt"]) {
  let text = await readText(file);
  text = replaceText(text);
  if (file.endsWith("page.md")) {
    text = text
      .split(/(?<=\n)/)
      .filter((line) => !/(^|\|)\s*(Director\s*\/\s*Manager|Operator|مدیر|گرداننده)\s*(\||:)/i.test(line))
      .join("");
  }
  await writeText(file, text);
}

// 8) vCard REV must derive from each DigitalDocument.dateModified, not archived release date.
const contactPath = "scripts/lib/projections/contact-discovery.mjs";
let contact = await readText(contactPath);
const oldRev = '  const rev = `${release.dateModified.replaceAll("-", "")}T000000Z`;';
if (!contact.includes(oldRev)) throw new Error("Expected release-derived vCard REV source not found");
contact = contact.replace(oldRev, `  const vCardRev = (documentId, label) => {\n    const dateModified = requiredText(\n      requiredNode(byId, documentId, label).dateModified,\n      \`\${label} dateModified\`,\n    );\n    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateModified))\n      throw new Error(\`Contact discovery: \${label} dateModified is invalid\`);\n    return \`\${dateModified.replaceAll("-", "")}T000000Z\`;\n  };\n  const doctorRev = vCardRev(\n    \`\${release.canonicalUrl}doctor.vcf#document\`,\n    "physician vCard document",\n  );\n  const clinicRev = vCardRev(\n    \`\${release.canonicalUrl}clinic.vcf#document\`,\n    "clinic vCard document",\n  );`);
contact = contact.replace("      `REV:${rev}`,", "      `REV:${doctorRev}`,");
contact = contact.replace("      `REV:${rev}`,", "      `REV:${clinicRev}`,");
if (contact.includes("REV:${rev}")) throw new Error("Legacy shared vCard REV reference remains");
await writeText(contactPath, contact);

// 9) Permanent regression contract.
const validator = `import fs from "node:fs";\n\nconst BASE = "https://www.ghezelbaash.ir/";\nconst graph = JSON.parse(fs.readFileSync("src/data/semantic/knowledge-graph.jsonld", "utf8"));\nconst head = JSON.parse(fs.readFileSync("src/data/semantic/head-profile.json", "utf8"));\nconst support = JSON.parse(fs.readFileSync("src/data/semantic/support-profile.json", "utf8"));\nconst evidence = JSON.parse(fs.readFileSync("src/data/evidence-registry.json", "utf8"));\nconst media = JSON.parse(fs.readFileSync("src/data/media-metadata.json", "utf8"));\nconst nodes = graph["@graph"] || [];\nconst ids = nodes.map((n) => n["@id"]).filter(Boolean);\nif (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical @id");\nconst byId = new Map(nodes.map((n) => [n["@id"], n]));\nconst arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];\nconst id = (v) => typeof v === "string" ? v : v?.["@id"];\nconst refs = (v) => new Set(arr(v).map(id).filter(Boolean));\nconst get = (suffix) => { const value = byId.get(\`\${BASE}\${suffix}\`); if (!value) throw new Error(\`Missing node: \${suffix}\`); return value; };\nconst PERSON = \`\${BASE}#saeed-ghezelbash\`;\nconst CLINIC = \`\${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah\`;\nconst person = byId.get(PERSON), clinic = byId.get(CLINIC);\nif (!person || !clinic || person === clinic) throw new Error("Person/Clinic separation failure");\nconst serialized = JSON.stringify(graph);\nfor (const forbidden of ["https://www.wikidata.org/entity/Q700236", "Q256688", "Q140288589", "Q140304972"]) if (serialized.includes(forbidden)) throw new Error(\`Forbidden active identifier: \${forbidden}\`);\nconst city = get("#place-messe-berlin-citycube");\nif (city.name !== "CityCube Berlin" || city.sameAs !== "https://www.wikidata.org/entity/Q15108815") throw new Error("CityCube identity contract failure");\nconst irimc = get("#organization-iran-medical-council");\nif (irimc.sameAs !== "https://www.wikidata.org/entity/Q5944740") throw new Error("Iranian Medical Council identity contract failure");\nif (arr(person.sameAs).map(id).includes(irimc.sameAs)) throw new Error("IRIMC QID leaked into Person.sameAs");\nfor (const alias of ["Ghezelbash MS", "Doctor Ghezelbaash"]) if (!arr(person.alternateName).includes(alias)) throw new Error(\`Missing alias: \${alias}\`);\nif (head.nodes?.[PERSON]?.valueAllow && Object.hasOwn(head.nodes[PERSON].valueAllow, "alternateName")) throw new Error("Duplicate alternateName truth remains in head profile");\nconst social = [\n  ["#profile-facebook-ghezelbaash", PERSON, PERSON],\n  ["#profile-facebook-doctor-ghezelbaash", PERSON, CLINIC],\n  ["#profile-instagram-doctor-ghezelbaash", PERSON, CLINIC],\n];\nfor (const [suffix, owner, main] of social) { const n = get(suffix); if (id(n.owner) !== owner || id(n.mainEntity) !== main) throw new Error(\`Social ownership/mainEntity drift: \${suffix}\`); if (!refs(person.owns).has(n["@id"])) throw new Error(\`Person.owns missing: \${suffix}\`); }\nif (byId.has(\`\${BASE}#profile-instagram-ghezelbaash\`)) throw new Error("Unverified personal Instagram asserted");\nconst drdrId = get("#identifier-person-drdr");\nif (drdrId.value !== "92014") throw new Error("DrDr structured identifier drift");\nconst wd = evidence.evidence.find((e) => e.id === \`\${BASE}#evidence-wikidata-doctor\`);\nif (JSON.stringify(wd?.supports) !== JSON.stringify(["person-identity", "canonical-name", "aliases"])) throw new Error("Wikidata evidence overclaims independence");\nif (!evidence.evidence.some((e) => e.id === \`\${BASE}#evidence-drdr\` && e.tier === "C")) throw new Error("DrDr evidence registry entry missing");\nconst team = media.imageProfiles.find((p) => arr(p.includes).includes("clinical-team"));\nconst semanticText = JSON.stringify([team, ...nodes.filter((n) => /clinical-team|clinic-team/.test(n?.["@id"] || ""))]);\nfor (const claim of ["clinical team", "medical team", "تیم بالینی", "اعضای تیم درمان"]) if (semanticText.toLowerCase().includes(claim.toLowerCase())) throw new Error(\`Unsupported group-photo role claim remains: \${claim}\`);\nconst irimcProfile = support.idProfiles?.[\`\${BASE}#organization-iran-medical-council\`];\nif (!irimcProfile?.include?.includes("sameAs")) throw new Error("IRIMC sameAs not projected");\nconsole.log(JSON.stringify({ valid: true, canonicalNodes: nodes.length, checked: "final-entity-contract-2026" }, null, 2));\n`;
await writeText("scripts/validate-final-entity-contract.mjs", validator);

// Register regression contract in source validation.
const packagePath = "package.json";
const pkg = await readJson(packagePath);
pkg.scripts["validate:final-entity-contract"] = "node scripts/validate-final-entity-contract.mjs";
if (!pkg.scripts["validate:source"].includes("validate:final-entity-contract"))
  pkg.scripts["validate:source"] = pkg.scripts["validate:source"].replace("npm run validate:architecture", "npm run validate:architecture && npm run validate:final-entity-contract");
await writeJson(packagePath, pkg);

console.log(JSON.stringify({ migrated: true, date: TODAY, canonicalNodes: nodes.length }, null, 2));
