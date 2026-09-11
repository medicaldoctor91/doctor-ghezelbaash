import assert from "node:assert/strict";
import { MIMEType } from "node:util";
import { readFile } from "node:fs/promises";
import jsonld from "jsonld";
import {
  MACHINE_RESOURCES,
  machineResourceForPath,
} from "../src/lib/resources.mjs";
import { compileHeadersTemplate } from "./lib/headers-template.mjs";
import {
  ENTITY_FACT_COLUMNS,
  entityFactsCsvwMetadata,
} from "./lib/entity-facts.mjs";
import { deriveEvidenceRegistry } from "./lib/projection-context.mjs";

const readText = (path) => readFile(path, "utf8");
const readJson = async (path) => JSON.parse(await readText(path));
const release = await readJson("src/data/release.json");
const rawEvidence = await readJson("src/data/evidence-registry.json");
const graph = await readJson("src/data/semantic/knowledge-graph.jsonld");
const codeMeta = await readJson("codemeta.json");
const codeMetaContext = await readJson("src/data/standards/codemeta-3.1-context.jsonld");

const expected = new Map([
  ["entity-facts.csv", { media: "text/csv", params: { charset: "utf-8", header: "present" } }],
  ["entity-facts.csv-metadata.json", { media: "application/csvm+json", params: {} }],
  ["index.md", { media: "text/markdown", params: { charset: "utf-8", variant: "GFM" } }],
  ["doctor.vcf", { media: "text/vcard", params: { charset: "utf-8", version: "4.0" } }],
  ["clinic.vcf", { media: "text/vcard", params: { charset: "utf-8", version: "4.0" } }],
  ["query-matrix.jsonl", { media: "application/x-ndjson", params: {} }],
  ["query-matrix.json-seq", { media: "application/json-seq", params: {} }],
  ["robots.txt", { media: "text/plain", params: { charset: "utf-8" } }],
  ["site.webmanifest", { media: "application/manifest+json", params: {} }],
]);
for (const [path, contract] of expected) {
  const resource = machineResourceForPath(path);
  const mime = new MIMEType(resource.contentType);
  assert.equal(mime.essence, contract.media, `${path} media type drift`);
  for (const [name, value] of Object.entries(contract.params))
    assert.equal(mime.params.get(name), value, `${path} ${name} drift`);
}

const template = await readText("src/data/templates/headers.template");
const headers = compileHeadersTemplate(template, {
  mainCsp: "default-src 'self'",
  csp404: "default-src 'none'",
  heroEarlyHintHref: "/hero.avif",
  httpResourceLinks: '<https://example.test/graph.jsonld>; rel="describedby"',
});
for (const resource of MACHINE_RESOURCES.filter((item) =>
  item.targets.includes("website"),
)) {
  const route = resource.path === "index.html" ? "/" : `/${resource.path}`;
  const marker = `\n${route}\n`;
  const start = headers.indexOf(marker);
  assert.ok(start >= 0, `HTTP route missing for registered website resource: ${route}`);
  const bodyStart = start + marker.length;
  const next = headers.indexOf("\n\n", bodyStart);
  const block = headers.slice(bodyStart, next < 0 ? headers.length : next);
  assert.equal(
    block.match(/^  Content-Type: (.+)$/m)?.[1],
    resource.contentType,
    `HTTP Content-Type drift for ${route}`,
  );
  const templateStart = template.indexOf(marker);
  const templateBodyStart = templateStart + marker.length;
  const templateNext = template.indexOf("\n\n", templateBodyStart);
  const templateBlock = template.slice(
    templateBodyStart,
    templateNext < 0 ? template.length : templateNext,
  );
  assert.ok(
    templateBlock.includes(
      `  Content-Type: {{CONTENT_TYPE:${resource.path}}}`,
    ),
    `Registered route is not registry-derived: ${route}`,
  );
}

const csv = await readText(".generated/projections/entity-facts.csv");
assert.ok(!csv.includes("\r"), "CSV bytes use CR but dialect declares LF");
assert.equal(csv.split("\n", 1)[0], ENTITY_FACT_COLUMNS.join(","), "CSV header drift");
const csvw = await readJson(".generated/projections/entity-facts.csv-metadata.json");
assert.deepEqual(csvw, entityFactsCsvwMetadata(), "CSVW must derive from canonical table schema/dialect");
assert.equal(csvw.dialect.lineTerminators[0], "\n");
assert.equal(csvw.tableSchema.primaryKey, "row_id");

const jsonlText = await readText(".generated/projections/query-matrix.jsonl");
const jsonlRows = jsonlText.trimEnd().split("\n").filter(Boolean).map(JSON.parse);
const seqBytes = await readFile(".generated/projections/query-matrix.json-seq");
assert.equal(seqBytes[0], 0x1e, "RFC 7464 sequence must start with RS");
assert.equal(seqBytes.at(-1), 0x0a, "RFC 7464 sequence must terminate each record with LF");
const seqText = seqBytes.toString("utf8");
const seqParts = seqText.split("\u001e");
assert.equal(seqParts.shift(), "", "RFC 7464 bytes before first RS");
const seqRows = seqParts.map((part, index) => {
  assert.ok(part.endsWith("\n"), `RFC 7464 record ${index + 1} lacks LF terminator`);
  return JSON.parse(part.slice(0, -1));
});
assert.deepEqual(seqRows, jsonlRows, "JSON-seq and NDJSON rows are not equivalent");

for (const file of ["doctor.vcf", "clinic.vcf"]) {
  const card = await readFile(`.generated/public/${file}`, "utf8");
  assert.ok(card.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\n"), `${file} is not vCard 4.0 CRLF`);
  assert.ok(card.endsWith("END:VCARD\r\n"), `${file} does not terminate cleanly`);
}

assert.ok(Array.isArray(codeMeta["@context"]), "CodeMeta context must explicitly extend 3.1");
assert.ok(codeMeta["@context"].includes("https://w3id.org/codemeta/3.1"), "CodeMeta 3.1 context missing");
assert.equal(codeMeta["@context"].find((entry) => typeof entry === "object")?.schema, "http://schema.org/");
assert.equal(codeMetaContext["@context"]?.schema, "http://schema.org/", "Pinned CodeMeta 3.1 context schema prefix drift");
assert.equal(codeMetaContext["@context"]?.SoftwareSourceCode?.["@id"], "schema:SoftwareSourceCode", "Pinned CodeMeta 3.1 SoftwareSourceCode mapping drift");
assert.ok(Object.hasOwn(codeMeta, "schema:subjectOf"), "Schema.org subjectOf must be explicitly namespaced");
assert.ok(!Object.hasOwn(codeMeta, "subjectOf"), "Unmapped raw subjectOf remains in CodeMeta");
const codeMetaForExpansion = structuredClone(codeMeta);
codeMetaForExpansion["@context"] = [
  codeMetaContext["@context"],
  ...codeMeta["@context"].slice(1),
];
const expandedCodeMeta = await jsonld.expand(codeMetaForExpansion);
const software = expandedCodeMeta.find((node) =>
  (node["@type"] || []).includes("http://schema.org/SoftwareSourceCode"),
);
assert.ok(software, "CodeMeta JSON-LD expansion lost SoftwareSourceCode");
assert.ok(software["http://schema.org/subjectOf"]?.length, "CodeMeta expansion lost schema:subjectOf");

const cff = await readText("CITATION.cff");
assert.match(cff, /^cff-version: 1\.2\.0$/m);
assert.match(cff, new RegExp(`^version: ${release.release.replaceAll(".", "\\.")}$`, "m"));
assert.match(cff, new RegExp(`^doi: ${release.dataset.zenodo.versionDoi.replaceAll(".", "\\.")}$`, "m"));

const derivedEvidence = deriveEvidenceRegistry(release, rawEvidence);
const currentEvidenceId = `${release.canonicalUrl}#evidence-zenodo-current-release`;
const rawCurrentEvidence = rawEvidence.evidence.find((entry) => entry.id === currentEvidenceId);
const currentEvidence = derivedEvidence.evidence.find((entry) => entry.id === currentEvidenceId);
assert.equal(rawCurrentEvidence?.releaseBinding, "zenodo-version");
assert.ok(!Object.hasOwn(rawCurrentEvidence || {}, "url"), "Raw current-release evidence must not duplicate the DOI URL");
assert.equal(currentEvidence?.url, `https://doi.org/${release.dataset.zenodo.versionDoi}`);
const latestHistory = release.dataset.zenodo.releaseHistory.at(-1);
assert.equal(latestHistory.release, release.release);
assert.equal(latestHistory.versionDoi, release.dataset.zenodo.versionDoi);
assert.equal(String(latestHistory.recordId), String(release.dataset.zenodo.recordId));

const stack = await readText(".github/workflows/stack-monitor.yml");
for (const forbidden of [
  "secrets.",
  "CLOUDFLARE_API_TOKEN",
  "HF_TOKEN",
  "huggingface.mjs push",
  "configure-cloudflare-edge.py",
  "cloudflare-pages.mjs ensure --configure",
  "git push",
])
  assert.ok(!stack.includes(forbidden), `Read-only stack monitor contains mutation capability: ${forbidden}`);
assert.ok(stack.includes("HISTORICAL_REPRODUCIBILITY_INSTALL"));
const externalRelease = await readText(".github/workflows/hugging-face-authority.yml");
assert.ok(!/^\s*push\s*:/m.test(externalRelease), "External release workflow must not publish from ordinary push");
assert.match(externalRelease, /github\.event_name == 'workflow_dispatch' && inputs\.version != ''/);

console.log(JSON.stringify({
  valid: true,
  standardContract: "P3-P4-2026",
  websiteRegisteredResources: MACHINE_RESOURCES.filter((item) => item.targets.includes("website")).length,
  csvRows: Math.max(0, csv.trimEnd().split("\n").length - 1),
  queryRows: jsonlRows.length,
  jsonSequenceRows: seqRows.length,
  release: release.release,
  archivedDoi: release.dataset.zenodo.versionDoi,
  stackMonitor: "READ_VERIFY_REPORT",
}, null, 2));
