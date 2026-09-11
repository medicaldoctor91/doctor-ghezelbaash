import fs from "node:fs";

const BASE = "https://www.ghezelbaash.ir/";
const PERSON = `${BASE}#saeed-ghezelbash`;
const CLINIC = `${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const MOJAVEZ = `${BASE}#evidence-mojavez-clinic-ownership`;
const FAQ_SLUG = "botox-vs-filler-differences";
const FAQ_ID = `${BASE}#answer-${FAQ_SLUG}`;
const FAQ_TOKEN = `{{CANONICAL_ANSWER:${FAQ_SLUG}}}`;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const registryPath = "src/data/evidence-registry.json";
const registry = readJson(registryPath);
const mojavezEvidence = registry.evidence.find((entry) => entry.id === MOJAVEZ);
if (!mojavezEvidence) throw new Error("Missing Mojavez evidence registry entry");
mojavezEvidence.supports = ["person-identity"];
writeJson(registryPath, registry);

const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const graph = readJson(graphPath);
const nodes = graph["@graph"] || [];
const byId = new Map(nodes.map((node) => [node["@id"], node]));
const mojavezNode = byId.get(MOJAVEZ);
const clinic = byId.get(CLINIC);
const faqAnswer = byId.get(FAQ_ID);
if (!mojavezNode || !clinic || !faqAnswer) throw new Error("Required canonical node missing");
mojavezNode.name = "Mojavez official medical-practice license record";
mojavezNode.mainEntity = { "@id": PERSON };
mojavezNode.about = { "@id": PERSON };
delete mojavezNode.description;
const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);
if ("subjectOf" in clinic) {
  const filtered = asArray(clinic.subjectOf).filter((value) => refId(value) !== MOJAVEZ);
  clinic.subjectOf = Array.isArray(clinic.subjectOf) ? filtered : filtered[0];
  if (clinic.subjectOf === undefined) delete clinic.subjectOf;
}
writeJson(graphPath, graph);

if (typeof faqAnswer.text !== "string" || !faqAnswer.text.trim()) throw new Error("Canonical FAQ Answer.text missing");
const pagePath = "src/content-source/page.md";
let page = fs.readFileSync(pagePath, "utf8");
const literalCount = page.split(faqAnswer.text).length - 1;
if (literalCount !== 1) throw new Error(`Expected exactly one duplicated FAQ literal in page.md, found ${literalCount}`);
if (page.includes(FAQ_TOKEN)) throw new Error("FAQ token already present before migration");
page = page.replace(faqAnswer.text, FAQ_TOKEN);
fs.writeFileSync(pagePath, page);

const assemblyPath = "scripts/lib/assemble-content.mjs";
let assembly = fs.readFileSync(assemblyPath, "utf8");
if (assembly.includes("bindCanonicalAnswers")) throw new Error("Canonical-answer binder unexpectedly exists on baseline candidate");
const insertionAnchor = "\nasync function canonicalSourceNames";
if (!assembly.includes(insertionAnchor)) throw new Error("Canonical assembly insertion anchor missing");
const binder = String.raw`
const canonicalAnswerTokenPattern = /\{\{CANONICAL_ANSWER:([a-z0-9][a-z0-9-]*)\}\}/g;

export const bindCanonicalAnswers = (content, graph, release) => {
  const source = String(content);
  const matches = [...source.matchAll(canonicalAnswerTokenPattern)];
  if (!matches.length) {
    if (source.includes("{{CANONICAL_ANSWER:"))
      throw new Error("Malformed or unresolved canonical answer token in page source");
    return source;
  }
  const { byId } = indexCanonicalGraph(graph);
  const seen = new Set();
  let resolved = source;
  for (const match of matches) {
    const [token, slug] = match;
    if (seen.has(token))
      throw new Error(\`Canonical answer token must be unique in page source: \${token}\`);
    seen.add(token);
    const answerId = \`\${release.canonicalUrl}#answer-\${slug}\`;
    const answer = byId.get(answerId);
    const types = Array.isArray(answer?.["@type"])
      ? answer["@type"]
      : [answer?.["@type"]].filter(Boolean);
    if (!types.includes("Answer") || typeof answer.text !== "string" || !answer.text.trim())
      throw new Error(\`Canonical answer token does not resolve to Answer.text: \${token}\`);
    if (source.includes(answer.text))
      throw new Error(\`Canonical answer literal duplicates graph-owned Answer.text: \${answerId}\`);
    resolved = resolved.replace(token, answer.text);
  }
  if (resolved.includes("{{CANONICAL_ANSWER:"))
    throw new Error("Unresolved canonical answer token remains after assembly");
  return resolved;
};
`;
assembly = assembly.replace(insertionAnchor, `${binder}${insertionAnchor}`);
const bindAnchor = "  content = bindPhysicianImages(content, graph, release);";
if (!assembly.includes(bindAnchor)) throw new Error("Canonical answer binding call anchor missing");
assembly = assembly.replace(bindAnchor, `${bindAnchor}\n  content = bindCanonicalAnswers(content, graph, release);`);
fs.writeFileSync(assemblyPath, assembly);

const physicianValidatorPath = "scripts/validate-physician-projection.mjs";
let physicianValidator = fs.readFileSync(physicianValidatorPath, "utf8");
const clinicAuthorityPattern = /const CORE_CLINIC_AUTHORITY_SUBJECTS = \[\s*"https:\/\/www\.ghezelbaash\.ir\/#evidence-google-maps-clinic",\s*"https:\/\/www\.ghezelbaash\.ir\/#evidence-mojavez-clinic-ownership",\s*\];/m;
if (!clinicAuthorityPattern.test(physicianValidator)) throw new Error("Legacy clinic authority expectation not found");
physicianValidator = physicianValidator.replace(
  clinicAuthorityPattern,
  'const CORE_CLINIC_AUTHORITY_SUBJECTS = [\n  "https://www.ghezelbaash.ir/#evidence-google-maps-clinic",\n];',
);
fs.writeFileSync(physicianValidatorPath, physicianValidator);

const packagePath = "package.json";
const pkg = readJson(packagePath);
pkg.scripts["validate:active-source-identifiers"] = "node scripts/validate-active-source-identifiers.mjs";
const sourceScript = pkg.scripts["validate:source"];
if (!sourceScript.includes("validate:active-source-identifiers")) {
  const anchor = "npm run validate:architecture &&";
  if (!sourceScript.includes(anchor)) throw new Error("validate:source insertion anchor missing");
  pkg.scripts["validate:source"] = sourceScript.replace(
    anchor,
    `${anchor} npm run validate:active-source-identifiers &&`,
  );
}
writeJson(packagePath, pkg);

fs.writeFileSync(
  "scripts/validate-active-source-identifiers.mjs",
  String.raw`import fs from "node:fs";
import path from "node:path";

const forbidden = ["Q700236", "Q256688", "Q140288589", "Q140304972"];
const roots = ["src", "public"];
const rootFiles = ["codemeta.json", "CITATION.cff"];
const textExtensions = new Set([
  ".astro", ".csv", ".html", ".js", ".json", ".jsonld", ".md", ".mdx",
  ".mjs", ".toml", ".ts", ".tsx", ".ttl", ".txt", ".xml", ".yaml", ".yml",
]);
const nonAssertionSources = new Map([
  ["src/data/semantic/shapes.ttl", "SHACL negative constraints intentionally mention retired identifiers"],
  ["src/data/standards/codemeta-3.1-context.jsonld", "Pinned external standards context, not project factual assertions"],
]);
const historicalAllowlist = new Map();

const normalize = (value) => value.split(path.sep).join("/");
const files = [];
const walk = (entry) => {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry).sort()) walk(path.join(entry, name));
    return;
  }
  const rel = normalize(path.relative(process.cwd(), entry));
  if (textExtensions.has(path.extname(entry).toLowerCase())) files.push(rel);
};
for (const root of roots) walk(root);
for (const file of rootFiles) if (fs.existsSync(file)) files.push(file);

const violations = [];
for (const file of [...new Set(files)].sort()) {
  if (nonAssertionSources.has(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const allowed = historicalAllowlist.get(file) || new Set();
  for (const id of forbidden) {
    if (!text.includes(id) || allowed.has(id)) continue;
    const firstOffset = text.indexOf(id);
    const line = text.slice(0, firstOffset).split(/\r?\n/).length;
    violations.push(\`\${file}:\${line}:\${id}\`);
  }
}
if (violations.length) {
  throw new Error(\`Forbidden identifiers found in active authored assertion sources:\n\${violations.join("\n")}\`);
}
console.log(JSON.stringify({
  valid: true,
  checkedFiles: [...new Set(files)].length,
  forbidden,
  nonAssertionSources: [...nonAssertionSources.keys()],
  historicalAllowlist: [...historicalAllowlist.keys()],
}, null, 2));
`,
);

fs.writeFileSync(
  "scripts/validate-final-entity-contract.mjs",
  String.raw`import fs from "node:fs";

const BASE = "https://www.ghezelbaash.ir/";
const graph = JSON.parse(fs.readFileSync("src/data/semantic/knowledge-graph.jsonld", "utf8"));
const head = JSON.parse(fs.readFileSync("src/data/semantic/head-profile.json", "utf8"));
const support = JSON.parse(fs.readFileSync("src/data/semantic/support-profile.json", "utf8"));
const evidence = JSON.parse(fs.readFileSync("src/data/evidence-registry.json", "utf8"));
const media = JSON.parse(fs.readFileSync("src/data/media-metadata.json", "utf8"));
const pageSource = fs.readFileSync("src/content-source/page.md", "utf8");
const nodes = graph["@graph"] || [];
const ids = nodes.map((n) => n["@id"]).filter(Boolean);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical @id");
const byId = new Map(nodes.map((n) => [n["@id"], n]));
const arr = (v) => Array.isArray(v) ? v : v == null ? [] : [v];
const id = (v) => typeof v === "string" ? v : v?.["@id"];
const refs = (v) => new Set(arr(v).map(id).filter(Boolean));
const get = (suffix) => { const value = byId.get(\`\${BASE}\${suffix}\`); if (!value) throw new Error(\`Missing node: \${suffix}\`); return value; };
const PERSON = \`\${BASE}#saeed-ghezelbash\`;
const CLINIC = \`\${BASE}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah\`;
const person = byId.get(PERSON), clinic = byId.get(CLINIC);
if (!person || !clinic || person === clinic) throw new Error("Person/Clinic separation failure");
const serialized = JSON.stringify(graph);
for (const forbidden of ["https://www.wikidata.org/entity/Q700236", "Q256688", "Q140288589", "Q140304972"])
  if (serialized.includes(forbidden)) throw new Error(\`Forbidden active identifier: \${forbidden}\`);
const city = get("#place-messe-berlin-citycube");
if (city.name !== "CityCube Berlin" || city.sameAs !== "https://www.wikidata.org/entity/Q15108815") throw new Error("CityCube identity contract failure");
const irimc = get("#organization-iran-medical-council");
if (irimc.sameAs !== "https://www.wikidata.org/entity/Q5944740") throw new Error("Iranian Medical Council identity contract failure");
if (arr(person.sameAs).map(id).includes(irimc.sameAs)) throw new Error("IRIMC QID leaked into Person.sameAs");
for (const alias of ["Ghezelbash MS", "Doctor Ghezelbaash"])
  if (!arr(person.alternateName).includes(alias)) throw new Error(\`Missing alias: \${alias}\`);
if (head.nodes?.[PERSON]?.valueAllow && Object.hasOwn(head.nodes[PERSON].valueAllow, "alternateName")) throw new Error("Duplicate alternateName truth remains in head profile");
const social = [
  ["#profile-facebook-ghezelbaash", PERSON, PERSON],
  ["#profile-facebook-doctor-ghezelbaash", PERSON, CLINIC],
  ["#profile-instagram-doctor-ghezelbaash", PERSON, CLINIC],
];
for (const [suffix, owner, main] of social) {
  const n = get(suffix);
  if (id(n.owner) !== owner || id(n.mainEntity) !== main) throw new Error(\`Social ownership/mainEntity drift: \${suffix}\`);
  if (!refs(person.owns).has(n["@id"])) throw new Error(\`Person.owns missing: \${suffix}\`);
}
if (byId.has(\`\${BASE}#profile-instagram-ghezelbaash\`)) throw new Error("Unverified personal Instagram asserted");
const drdrId = get("#identifier-person-drdr");
if (drdrId.value !== "92014") throw new Error("DrDr structured identifier drift");
const wd = evidence.evidence.find((e) => e.id === \`\${BASE}#evidence-wikidata-doctor\`);
if (JSON.stringify(wd?.supports) !== JSON.stringify(["person-identity", "canonical-name", "aliases"])) throw new Error("Wikidata evidence overclaims independence");
if (!evidence.evidence.some((e) => e.id === \`\${BASE}#evidence-drdr\` && e.tier === "C")) throw new Error("DrDr evidence registry entry missing");

const mojavezId = \`\${BASE}#evidence-mojavez-clinic-ownership\`;
const mojavezEvidence = evidence.evidence.find((e) => e.id === mojavezId);
if (!mojavezEvidence) throw new Error("Mojavez evidence registry entry missing");
if (arr(mojavezEvidence.supports).includes("clinic-ownership")) throw new Error("Mojavez must not support clinic ownership");
if (JSON.stringify(arr(mojavezEvidence.supports)) !== JSON.stringify(["person-identity"])) throw new Error("Mojavez evidence scope contract failure");
const mojavezNode = byId.get(mojavezId);
if (!mojavezNode) throw new Error("Mojavez canonical graph node missing");
if (/ownership|owner\s+of|مالکیت|مالک\s*(?:کلینیک|مطب)/i.test(JSON.stringify(mojavezNode.name ?? ""))) throw new Error("Mojavez semantic label implies ownership");
if (refs(mojavezNode.about).has(CLINIC)) throw new Error("Mojavez evidence must not be about Clinic without an explicit clinic contract");
if (id(mojavezNode.mainEntity) !== PERSON || !refs(mojavezNode.about).has(PERSON)) throw new Error("Mojavez evidence must remain person-bound");
if (refs(clinic.subjectOf).has(mojavezId)) throw new Error("Clinic.subjectOf must not cite Mojavez as clinic evidence");

for (const entry of evidence.evidence.filter((e) => e.liveStatus === "declared-in-canonical-graph")) {
  const node = byId.get(entry.id);
  if (!node) throw new Error(\`Declared evidence missing canonical graph node: \${entry.id}\`);
  if (node.url !== entry.url) throw new Error(\`Evidence registry/graph URL parity failure: \${entry.id}\`);
}

const faqToken = "{{CANONICAL_ANSWER:botox-vs-filler-differences}}";
const faqAnswer = get("#answer-botox-vs-filler-differences");
if (typeof faqAnswer.text !== "string" || !faqAnswer.text.trim()) throw new Error("Canonical FAQ Answer.text missing");
if (pageSource.split(faqToken).length !== 2) throw new Error("page.md must contain exactly one canonical FAQ answer token");
if (pageSource.includes(faqAnswer.text)) throw new Error("FAQ Answer.text is duplicated in page.md instead of graph-owned token binding");

const team = media.imageProfiles.find((p) => arr(p.includes).includes("clinical-team"));
const semanticText = JSON.stringify([team, ...nodes.filter((n) => /clinical-team|clinic-team/.test(n?.["@id"] || ""))]);
for (const claim of ["clinical team", "medical team", "تیم بالینی", "اعضای تیم درمان"])
  if (semanticText.toLowerCase().includes(claim.toLowerCase())) throw new Error(\`Unsupported group-photo role claim remains: \${claim}\`);
const irimcProfile = support.idProfiles?.[\`\${BASE}#organization-iran-medical-council\`];
if (!irimcProfile?.include?.includes("sameAs")) throw new Error("IRIMC sameAs not projected");
console.log(JSON.stringify({
  valid: true,
  canonicalNodes: nodes.length,
  declaredEvidenceParity: evidence.evidence.filter((e) => e.liveStatus === "declared-in-canonical-graph").length,
  checked: "final-entity-contract-2026",
}, null, 2));
`,
);

console.log(JSON.stringify({
  migrated: true,
  mojavezSupports: mojavezEvidence.supports,
  faqToken: FAQ_TOKEN,
  clinicAuthority: ["https://www.ghezelbaash.ir/#evidence-google-maps-clinic"],
}, null, 2));
