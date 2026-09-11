import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://www.ghezelbaash.ir/";
const TODAY = "2026-09-11";
const readText = (path) => readFile(path, "utf8");
const writeText = (path, text) => writeFile(path, text);
const readJson = async (path) => JSON.parse(await readText(path));
const writeJson = (path, value) =>
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
const need = (condition, message) => {
  if (!condition) throw new Error(message);
};
const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected one replacement target, found ${count}`);
  return source.replace(before, after);
};
const insertAfterResource = (resources, path, entry) => {
  if (resources.some((resource) => resource.path === entry.path)) return;
  const index = resources.findIndex((resource) => resource.path === path);
  if (index < 0) throw new Error(`Machine resource anchor missing: ${path}`);
  resources.splice(index + 1, 0, entry);
};

// P3.1 — one-source MIME registry plus justified companion resources.
const registryPath = "src/data/machine-resources.json";
const registry = await readJson(registryPath);
need(Array.isArray(registry.resources), "Machine resource registry is invalid");
const resourceByPath = new Map(registry.resources.map((resource) => [resource.path, resource]));
const setParameters = (path, parameters) => {
  const resource = resourceByPath.get(path);
  if (!resource) throw new Error(`Machine resource missing: ${path}`);
  if (parameters && Object.keys(parameters).length)
    resource.mediaTypeParameters = parameters;
  else
    delete resource.mediaTypeParameters;
};
for (const [path, parameters] of Object.entries({
  "index.html": { charset: "utf-8" },
  "graph.ttl": { charset: "utf-8" },
  "shapes.ttl": { charset: "utf-8" },
  "entity-facts.csv": { charset: "utf-8", header: "present" },
  "answers.txt": { charset: "utf-8" },
  "knowledge.xml": { charset: "utf-8" },
  "llms.txt": { charset: "utf-8" },
  "index.md": { charset: "utf-8", variant: "GFM" },
  "llms-full.txt": { charset: "utf-8" },
  "doctor.vcf": { charset: "utf-8", version: "4.0" },
  "clinic.vcf": { charset: "utf-8", version: "4.0" },
  "sitemap.xml": { charset: "utf-8" },
  "void.ttl": { charset: "utf-8" },
  "dcat.ttl": { charset: "utf-8" },
})) setParameters(path, parameters);

insertAfterResource(registry.resources, "entity-facts.csv", {
  path: "entity-facts.csv-metadata.json",
  source: ".generated/projections/entity-facts.csv-metadata.json",
  mediaType: "application/csvm+json",
  targets: ["website", "huggingFace", "zenodo"],
  materialize: true,
  head: {
    rel: "describedby",
    title: "CSVW companion metadata for entity facts",
  },
  footerLabel: "CSVW metadata",
});
insertAfterResource(registry.resources, "query-matrix.jsonl", {
  path: "query-matrix.json-seq",
  source: ".generated/projections/query-matrix.json-seq",
  mediaType: "application/json-seq",
  targets: ["huggingFace", "zenodo"],
});
insertAfterResource(registry.resources, "sitemap.xml", {
  path: "robots.txt",
  source: "public/robots.txt",
  mediaType: "text/plain",
  mediaTypeParameters: { charset: "utf-8" },
  targets: ["website"],
});
insertAfterResource(registry.resources, "robots.txt", {
  path: "site.webmanifest",
  source: "public/site.webmanifest",
  mediaType: "application/manifest+json",
  targets: ["website"],
});
await writeJson(registryPath, registry);

// P3.2 — deterministic Content-Type serialization, including media parameters.
const resourcesPath = "src/lib/resources.mjs";
let resourcesSource = await readText(resourcesPath);
const functionStart = resourcesSource.indexOf("export const resourceContentType = (resource) => {");
const functionEnd = resourcesSource.indexOf("\n\nconst resources =", functionStart);
need(functionStart >= 0 && functionEnd > functionStart, "resourceContentType source boundary missing");
const serializer = `const mediaTypeParameterToken = /^[!#$%&'*+.^_\`|~0-9A-Za-z-]+$/;
const serializeMediaTypeParameter = (value) => {
  const text = String(value);
  if (!text || /[\\r\\n\\u0000-\\u001f\\u007f]/.test(text))
    throw new Error("Invalid media type parameter value");
  return mediaTypeParameterToken.test(text) ? text : quoteHttpParameter(text);
};
export const resourceContentType = (resource) => {
  if (!/^[a-z0-9!#$&^_.+-]+\\/[a-z0-9!#$&^_.+-]+$/i.test(resource.mediaType))
    throw new Error(\`Machine resource requires a bare media type: \${resource.path}\`);
  const parameters = resource.mediaTypeParameters ?? {};
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  )
    throw new Error(\`Machine resource parameters must be an object: \${resource.path}\`);
  const serialized = [];
  for (const [name, value] of Object.entries(parameters)) {
    if (!mediaTypeParameterToken.test(name) || name.toLowerCase() === "profile")
      throw new Error(\`Invalid or reserved media type parameter: \${resource.path} \${name}\`);
    serialized.push(\`\${name}=\${serializeMediaTypeParameter(value)}\`);
  }
  if (resource.profileIri) {
    if (!/^https?:\\/\\/[^\\s"<>]+$/.test(resource.profileIri))
      throw new Error(\`Invalid machine resource profile IRI: \${resource.path}\`);
    serialized.push(\`profile=\${quoteHttpParameter(resource.profileIri)}\`);
  }
  return [resource.mediaType, ...serialized].join("; ");
};`;
resourcesSource =
  resourcesSource.slice(0, functionStart) +
  serializer +
  resourcesSource.slice(functionEnd);
resourcesSource = mustReplace(
  resourcesSource,
  `    contentType: resourceContentType(resource),
    targets: Object.freeze([...resource.targets]),`,
  `    contentType: resourceContentType(resource),
    ...(resource.mediaTypeParameters
      ? { mediaTypeParameters: Object.freeze({ ...resource.mediaTypeParameters }) }
      : {}),
    targets: Object.freeze([...resource.targets]),`,
  "Freeze media type parameters",
);
await writeText(resourcesPath, resourcesSource);

// P3.3 — CSVW is derived from the existing Table Schema/Table Dialect source.
const entityFactsPath = "scripts/lib/entity-facts.mjs";
let entityFacts = await readText(entityFactsPath);
if (!entityFacts.includes("export function entityFactsCsvwMetadata()")) {
  const anchor = "\nexport function entityFactsRecordSet(canonicalUrl, fileObjectId) {";
  const csvwFunction = `
export function entityFactsCsvwMetadata() {
  const schema = entityFactsTableSchema();
  const dialect = entityFactsTableDialect();
  const primaryKey =
    schema.primaryKey.length === 1 ? schema.primaryKey[0] : [...schema.primaryKey];
  return {
    "@context": [
      "http://www.w3.org/ns/csvw",
      { dc: "http://purl.org/dc/terms/" },
    ],
    url: "entity-facts.csv",
    dialect: {
      encoding: "utf-8",
      header: true,
      headerRowCount: dialect.headerRows.length,
      delimiter: dialect.delimiter,
      quoteChar: dialect.quoteChar,
      doubleQuote: dialect.doubleQuote,
      lineTerminators: [dialect.lineTerminator],
    },
    tableSchema: {
      columns: schema.fields.map((field) => ({
        name: field.name,
        titles: field.name,
        "dc:description": field.description,
        datatype: "string",
        ...(field.constraints?.required ? { required: true } : {}),
      })),
      primaryKey,
    },
  };
}
`;
  entityFacts = mustReplace(entityFacts, anchor, `${csvwFunction}${anchor}`, "CSVW generator");
  await writeText(entityFactsPath, entityFacts);
}

const semanticCorpusPath = "scripts/lib/projections/semantic-corpus.mjs";
let semanticCorpus = await readText(semanticCorpusPath);
semanticCorpus = mustReplace(
  semanticCorpus,
  `import { buildEntityFacts, serializeEntityFacts } from "../entity-facts.mjs";`,
  `import {
  buildEntityFacts,
  entityFactsCsvwMetadata,
  serializeEntityFacts,
} from "../entity-facts.mjs";`,
  "Semantic corpus entity-facts import",
);
semanticCorpus = mustReplace(
  semanticCorpus,
  `  await writeFile(
    path.join(projections, "entity-facts.csv"),
    serializeEntityFacts(factRecords),
  );

  const answerRecords = [];`,
  `  await writeFile(
    path.join(projections, "entity-facts.csv"),
    serializeEntityFacts(factRecords),
  );
  await writeFile(
    path.join(projections, "entity-facts.csv-metadata.json"),
    \`\${JSON.stringify(entityFactsCsvwMetadata(), null, 2)}\\n\`,
  );

  const answerRecords = [];`,
  "CSVW materialization",
);
await writeText(semanticCorpusPath, semanticCorpus);

// P3.4 — RFC 7464 serialization from the exact same query rows as NDJSON.
const retrievalPath = "scripts/generate-retrieval-projections.mjs";
let retrieval = await readText(retrievalPath);
retrieval = mustReplace(
  retrieval,
  `const queryMatrix = dedup.map((r) => JSON.stringify(r)).join("\\n") + "\\n";
await write(
  path.join(generated.projections, "query-matrix.jsonl"),
  queryMatrix,
);`,
  `const queryMatrixLines = dedup.map((row) => JSON.stringify(row));
const queryMatrix = queryMatrixLines.join("\\n") + "\\n";
await write(
  path.join(generated.projections, "query-matrix.jsonl"),
  queryMatrix,
);
await write(
  path.join(generated.projections, "query-matrix.json-seq"),
  queryMatrixLines.map((line) => \`\\u001e\${line}\\n\`).join(""),
);`,
  "RFC 7464 query serialization",
);
await writeText(retrievalPath, retrieval);

// P3.5 — CodeMeta 3.1 keeps non-CodeMeta Schema.org terms explicitly namespaced.
const codeMetaPath = "codemeta.json";
const codeMeta = await readJson(codeMetaPath);
codeMeta["@context"] = [
  "https://w3id.org/codemeta/3.1",
  { schema: "https://schema.org/" },
];
if (Object.hasOwn(codeMeta, "subjectOf")) {
  codeMeta["schema:subjectOf"] = codeMeta.subjectOf;
  delete codeMeta.subjectOf;
}
await writeJson(codeMetaPath, codeMeta);

// P3.6 — centralize route Content-Type values in the registry/compiler.
const headersPath = "src/data/templates/headers.template";
let headers = await readText(headersPath);
if (!headers.includes("/entity-facts.csv-metadata.json\n")) {
  const csvBlockEnd = `  Cross-Origin-Resource-Policy: cross-origin

/answers.txt`;
  const companionBlock = `  Cross-Origin-Resource-Policy: cross-origin

/entity-facts.csv-metadata.json
  Content-Type: application/csvm+json
  Vary: Accept-Encoding
  X-Robots-Tag: index, follow, max-snippet:-1
  X-Robots-Tag: googlebot: noindex, follow
  Cache-Control: public, max-age=3600, must-revalidate
  Cloudflare-CDN-Cache-Control: public, max-age=3600, stale-if-error=86400
  Link: <https://www.ghezelbaash.ir/entity-facts.csv-metadata.json>; rel="canonical", <https://www.ghezelbaash.ir/entity-facts.csv>; rel="describedby"; type="text/csv", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"
  Access-Control-Allow-Origin: *
  Access-Control-Expose-Headers: Link, Content-Signal
  Cross-Origin-Resource-Policy: cross-origin

/answers.txt`;
  headers = mustReplace(headers, csvBlockEnd, companionBlock, "CSVW HTTP route");
}
headers = mustReplace(
  headers,
  `  Link: <https://www.ghezelbaash.ir/entity-facts.csv>; rel="canonical", <https://www.ghezelbaash.ir/graph.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"`,
  `  Link: <https://www.ghezelbaash.ir/entity-facts.csv>; rel="canonical", <https://www.ghezelbaash.ir/entity-facts.csv-metadata.json>; rel="describedby"; type="application/csvm+json", <https://www.ghezelbaash.ir/graph.jsonld>; rel="describedby"; type="application/ld+json", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about"`,
  "CSVW describedby discovery",
);
const routeResourcePairs = [
  ["/", "index.html"],
  ["/robots.txt", "robots.txt"],
  ["/sitemap.xml", "sitemap.xml"],
  ["/graph.jsonld", "graph.jsonld"],
  ["/graph.ttl", "graph.ttl"],
  ["/entity-facts.csv", "entity-facts.csv"],
  ["/entity-facts.csv-metadata.json", "entity-facts.csv-metadata.json"],
  ["/answers.txt", "answers.txt"],
  ["/knowledge.xml", "knowledge.xml"],
  ["/llms.txt", "llms.txt"],
  ["/index.md", "index.md"],
  ["/llms-full.txt", "llms-full.txt"],
  ["/datapackage.json", "datapackage.json"],
  ["/linkset.json", "linkset.json"],
  ["/void.ttl", "void.ttl"],
  ["/dcat.ttl", "dcat.ttl"],
  ["/croissant.json", "croissant.json"],
  ["/provenance.jsonld", "provenance.jsonld"],
  ["/evidence-snapshot.json", "evidence-snapshot.json"],
  ["/shapes.ttl", "shapes.ttl"],
  ["/doctor.vcf", "doctor.vcf"],
  ["/clinic.vcf", "clinic.vcf"],
  ["/site.webmanifest", "site.webmanifest"],
];
const setBlockContentType = (source, route, resourcePath) => {
  const marker = `\n${route}\n`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`HTTP header block missing: ${route}`);
  const bodyStart = start + marker.length;
  const next = source.indexOf("\n\n", bodyStart);
  const end = next < 0 ? source.length : next;
  const block = source.slice(bodyStart, end);
  const matches = [...block.matchAll(/^  Content-Type: .+$/gm)];
  if (matches.length !== 1)
    throw new Error(`HTTP Content-Type cardinality drift: ${route}`);
  const nextBlock = block.replace(
    /^  Content-Type: .+$/m,
    `  Content-Type: {{CONTENT_TYPE:${resourcePath}}}`,
  );
  return source.slice(0, bodyStart) + nextBlock + source.slice(end);
};
for (const [route, resourcePath] of routeResourcePairs)
  headers = setBlockContentType(headers, route, resourcePath);
await writeText(headersPath, headers);

// P4.1 — stack monitor becomes strictly read/verify/report; publication stays in explicit release workflow.
const stackPath = ".github/workflows/stack-monitor.yml";
let stack = await readText(stackPath);
stack = mustReplace(
  stack,
  "  group: doctor-ghezelbaash-external-mutation",
  "  group: doctor-ghezelbaash-stack-monitor",
  "Read-only monitor concurrency group",
);
const firstPartyStart = stack.indexOf("      - name: Verify first-party deployment and self-heal only edge drift");
const frozenStart = stack.indexOf("      - name: Verify frozen release snapshot truth");
need(firstPartyStart >= 0 && frozenStart > firstPartyStart, "Stack monitor mutation section boundary missing");
const frozenSection = stack.slice(frozenStart);
const readOnlyVerification = `      - name: Verify first-party deployment without mutation
        if: github.event_name != 'push'
        shell: bash
        run: |
          set -euo pipefail
          node scripts/verify-live.mjs discovery
          node scripts/verify-live.mjs current --website-only
          echo 'FIRST_PARTY_CURRENT_SERVING_PASS'
      - name: Verify Hugging Face current authority surface without mutation
        if: github.event_name != 'push'
        shell: bash
        run: |
          set -euo pipefail
          node scripts/verify-live.mjs current --hf-only
          echo 'HF_CURRENT_AUTHORITY_PASS'
      - name: Verify complete current cross-surface truth
        if: github.event_name != 'push'
        shell: bash
        run: |
          set -euo pipefail
          node scripts/verify-live.mjs current
          echo 'CURRENT_CROSS_SURFACE_TRUTH_PASS'
`;
stack = stack.slice(0, firstPartyStart) + readOnlyVerification + frozenSection;
stack = mustReplace(
  stack,
  `            npm ci
            node "$GITHUB_WORKSPACE/scripts/dependency-advisory-gate.mjs"
            C=$(git rev-parse HEAD);`,
  `            # HISTORICAL_REPRODUCIBILITY_INSTALL: install the frozen lockfile
            # only to reproduce attested historical bytes. Current dependency
            # security is enforced above against current main and is a separate gate.
            npm ci
            C=$(git rev-parse HEAD);`,
  "Historical reproducibility/security lane split",
);
await writeText(stackPath, stack);

// P4.2 — hygiene understands the one explicit historical reproducibility exemption.
const hygienePath = "scripts/validate-repository-hygiene.mjs";
let hygiene = await readText(hygienePath);
const gateStart = hygiene.indexOf("const validateWorkflowDependencyGates = (content, workflow) => {");
const gateEnd = hygiene.indexOf("\nconst dependencyGateFixture =", gateStart);
need(gateStart >= 0 && gateEnd > gateStart, "Dependency gate validator boundary missing");
const gateFunction = `const validateWorkflowDependencyGates = (content, workflow) => {
  const historicalMarker = "HISTORICAL_REPRODUCIBILITY_INSTALL";
  const historicalMatches = [
    ...content.matchAll(
      /# HISTORICAL_REPRODUCIBILITY_INSTALL:[^\\n]*\\n(?:\\s*#[^\\n]*\\n)*\\s*npm ci\\b/g,
    ),
  ];
  if (historicalMatches.length > 1)
    throw new Error(\`Historical reproducibility install marker is not unique: \${workflow}\`);
  if (
    historicalMatches.length === 1 &&
    workflow !== ".github/workflows/stack-monitor.yml" &&
    workflow !== "historical reproducibility fixture"
  )
    throw new Error(\`Historical install exemption is forbidden outside stack monitor: \${workflow}\`);

  const historicalInstallIndexes = new Set(
    historicalMatches.map(
      (match) => match.index + match[0].lastIndexOf("npm ci"),
    ),
  );
  const installs = [...content.matchAll(/\\bnpm ci\\b/g)].filter(
    (match) => !historicalInstallIndexes.has(match.index),
  );
  const gates = [
    ...content.matchAll(
      /^\\s*(?:run:\\s*)?(?:npm run security:dependencies|node "\\$GITHUB_WORKSPACE\\/scripts\\/dependency-advisory-gate\\.mjs")\\s*$/gm,
    ),
  ];
  if (/\\bnpm audit\\b/.test(content))
    throw new Error(
      \`Canonical workflows must use the bounded fail-closed advisory gate: \${workflow}\`,
    );
  if (
    installs.length !== gates.length ||
    installs.some(
      (install, index) =>
        gates[index].index <= install.index ||
        (installs[index + 1] &&
          gates[index].index >= installs[index + 1].index),
    )
  )
    throw new Error(
      \`Every current npm ci must be followed by the explicit dependency advisory gate: \${workflow} (\${installs.length}/\${gates.length})\`,
    );

  if (historicalMatches.length === 1) {
    if (
      !content.includes('git worktree add --detach "$SNAPSHOT_SOURCE" "$TAG"') ||
      !content.includes('cd "$SNAPSHOT_SOURCE"') ||
      !content.includes("npm run build")
    )
      throw new Error(
        \`Historical reproducibility exemption requires an isolated frozen worktree: \${workflow}\`,
      );
    const historicalTail = content.slice(historicalMatches[0].index);
    const buildIndex = historicalTail.indexOf("npm run build");
    const beforeBuild =
      buildIndex >= 0 ? historicalTail.slice(0, buildIndex) : historicalTail;
    if (/dependency-advisory-gate|security:dependencies/.test(beforeBuild))
      throw new Error(
        \`Historical reproducibility lane must not be blocked by current advisories: \${workflow}\`,
      );
  }
};`;
hygiene =
  hygiene.slice(0, gateStart) + gateFunction + hygiene.slice(gateEnd);
hygiene = mustReplace(
  hygiene,
  `validateWorkflowDependencyGates(dependencyGateFixture, "advisory gate fixture");`,
  `validateWorkflowDependencyGates(dependencyGateFixture, "advisory gate fixture");
validateWorkflowDependencyGates(
  \`git worktree add --detach "$SNAPSHOT_SOURCE" "$TAG"
(
  cd "$SNAPSHOT_SOURCE"
  # HISTORICAL_REPRODUCIBILITY_INSTALL: fixture
  npm ci
  npm run build
)\`,
  "historical reproducibility fixture",
);`,
  "Historical reproducibility positive fixture",
);
await writeText(hygienePath, hygiene);

// P3/P4 regression validator.
const validatorPath = "scripts/validate-machine-standards-2026.mjs";
const validator = `import assert from "node:assert/strict";
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
  assert.equal(mime.type, contract.media, \`\${path} media type drift\`);
  for (const [name, value] of Object.entries(contract.params))
    assert.equal(mime.params.get(name), value, \`\${path} \${name} drift\`);
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
  const route = resource.path === "index.html" ? "/" : \`/\${resource.path}\`;
  const marker = \`\\n\${route}\\n\`;
  const start = headers.indexOf(marker);
  assert.ok(start >= 0, \`HTTP route missing for registered website resource: \${route}\`);
  const bodyStart = start + marker.length;
  const next = headers.indexOf("\\n\\n", bodyStart);
  const block = headers.slice(bodyStart, next < 0 ? headers.length : next);
  assert.equal(
    block.match(/^  Content-Type: (.+)$/m)?.[1],
    resource.contentType,
    \`HTTP Content-Type drift for \${route}\`,
  );
  const templateStart = template.indexOf(marker);
  const templateBodyStart = templateStart + marker.length;
  const templateNext = template.indexOf("\\n\\n", templateBodyStart);
  const templateBlock = template.slice(
    templateBodyStart,
    templateNext < 0 ? template.length : templateNext,
  );
  assert.ok(
    templateBlock.includes(
      \`  Content-Type: {{CONTENT_TYPE:\${resource.path}}}\`,
    ),
    \`Registered route is not registry-derived: \${route}\`,
  );
}

const csv = await readText(".generated/projections/entity-facts.csv");
assert.ok(!csv.includes("\\r"), "CSV bytes use CR but dialect declares LF");
assert.equal(csv.split("\\n", 1)[0], ENTITY_FACT_COLUMNS.join(","), "CSV header drift");
const csvw = await readJson(".generated/projections/entity-facts.csv-metadata.json");
assert.deepEqual(csvw, entityFactsCsvwMetadata(), "CSVW must derive from canonical table schema/dialect");
assert.equal(csvw.dialect.lineTerminators[0], "\\n");
assert.equal(csvw.tableSchema.primaryKey, "row_id");

const jsonlText = await readText(".generated/projections/query-matrix.jsonl");
const jsonlRows = jsonlText.trimEnd().split("\\n").filter(Boolean).map(JSON.parse);
const seqBytes = await readFile(".generated/projections/query-matrix.json-seq");
assert.equal(seqBytes[0], 0x1e, "RFC 7464 sequence must start with RS");
assert.equal(seqBytes.at(-1), 0x0a, "RFC 7464 sequence must terminate each record with LF");
const seqText = seqBytes.toString("utf8");
const seqParts = seqText.split("\\u001e");
assert.equal(seqParts.shift(), "", "RFC 7464 bytes before first RS");
const seqRows = seqParts.map((part, index) => {
  assert.ok(part.endsWith("\\n"), \`RFC 7464 record \${index + 1} lacks LF terminator\`);
  return JSON.parse(part.slice(0, -1));
});
assert.deepEqual(seqRows, jsonlRows, "JSON-seq and NDJSON rows are not equivalent");

for (const file of ["doctor.vcf", "clinic.vcf"]) {
  const card = await readFile(\`.generated/public/\${file}\`, "utf8");
  assert.ok(card.startsWith("BEGIN:VCARD\\r\\nVERSION:4.0\\r\\n"), \`\${file} is not vCard 4.0 CRLF\`);
  assert.ok(card.endsWith("END:VCARD\\r\\n"), \`\${file} does not terminate cleanly\`);
}

assert.ok(Array.isArray(codeMeta["@context"]), "CodeMeta context must explicitly extend 3.1");
assert.ok(codeMeta["@context"].includes("https://w3id.org/codemeta/3.1"), "CodeMeta 3.1 context missing");
assert.equal(codeMeta["@context"].find((entry) => typeof entry === "object")?.schema, "https://schema.org/");
assert.ok(Object.hasOwn(codeMeta, "schema:subjectOf"), "Schema.org subjectOf must be explicitly namespaced");
assert.ok(!Object.hasOwn(codeMeta, "subjectOf"), "Unmapped raw subjectOf remains in CodeMeta");
const expandedCodeMeta = await jsonld.expand(codeMeta);
const software = expandedCodeMeta.find((node) =>
  (node["@type"] || []).includes("https://schema.org/SoftwareSourceCode"),
);
assert.ok(software, "CodeMeta JSON-LD expansion lost SoftwareSourceCode");
assert.ok(software["https://schema.org/subjectOf"]?.length, "CodeMeta expansion lost schema:subjectOf");

const cff = await readText("CITATION.cff");
assert.match(cff, /^cff-version: 1\\.2\\.0$/m);
assert.match(cff, new RegExp(\`^version: \${release.release.replaceAll(".", "\\\\.")}$\`, "m"));
assert.match(cff, new RegExp(\`^doi: \${release.dataset.zenodo.versionDoi.replaceAll(".", "\\\\.")}$\`, "m"));

const derivedEvidence = deriveEvidenceRegistry(release, rawEvidence);
const currentEvidenceId = \`\${release.canonicalUrl}#evidence-zenodo-current-release\`;
const rawCurrentEvidence = rawEvidence.evidence.find((entry) => entry.id === currentEvidenceId);
const currentEvidence = derivedEvidence.evidence.find((entry) => entry.id === currentEvidenceId);
assert.equal(rawCurrentEvidence?.releaseBinding, "zenodo-version");
assert.ok(!Object.hasOwn(rawCurrentEvidence || {}, "url"), "Raw current-release evidence must not duplicate the DOI URL");
assert.equal(currentEvidence?.url, \`https://doi.org/\${release.dataset.zenodo.versionDoi}\`);
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
  assert.ok(!stack.includes(forbidden), \`Read-only stack monitor contains mutation capability: \${forbidden}\`);
assert.ok(stack.includes("HISTORICAL_REPRODUCIBILITY_INSTALL"));
const externalRelease = await readText(".github/workflows/hugging-face-authority.yml");
assert.ok(!/^\\s*push\\s*:/m.test(externalRelease), "External release workflow must not publish from ordinary push");
assert.match(externalRelease, /github\\.event_name == 'workflow_dispatch' && inputs\\.version != ''/);

console.log(JSON.stringify({
  valid: true,
  standardContract: "P3-P4-2026",
  websiteRegisteredResources: MACHINE_RESOURCES.filter((item) => item.targets.includes("website")).length,
  csvRows: Math.max(0, csv.trimEnd().split("\\n").length - 1),
  queryRows: jsonlRows.length,
  jsonSequenceRows: seqRows.length,
  release: release.release,
  archivedDoi: release.dataset.zenodo.versionDoi,
  stackMonitor: "READ_VERIFY_REPORT",
}, null, 2));
`;
await writeText(validatorPath, validator);

// P1/P3 — SHACL captures the newly corrected authority/identity semantics.
const shapesPath = "src/data/semantic/shapes.ttl";
let shapes = await readText(shapesPath);
if (!shapes.includes("ex:CityCubeIdentityShape")) {
  shapes += `

# Corrected authority anchors are part of the RDF contract, not only JS tests.
ex:CityCubeIdentityShape a sh:NodeShape ;
  sh:targetNode ex:place-messe-berlin-citycube ;
  sh:property [ sh:path schema:name ; sh:hasValue "CityCube Berlin" ; sh:minCount 1 ] ;
  sh:property [ sh:path schema:sameAs ; sh:hasValue <https://www.wikidata.org/entity/Q15108815> ; sh:minCount 1 ; sh:maxCount 1 ] .

ex:IranMedicalCouncilIdentityShape a sh:NodeShape ;
  sh:targetNode ex:organization-iran-medical-council ;
  sh:property [ sh:path rdf:type ; sh:hasValue schema:Organization ] ;
  sh:property [ sh:path schema:sameAs ; sh:hasValue <https://www.wikidata.org/entity/Q5944740> ; sh:minCount 1 ; sh:maxCount 1 ] .

ex:PersonalFacebookProfileShape a sh:NodeShape ;
  sh:targetNode ex:profile-facebook-ghezelbaash ;
  sh:property [ sh:path rdf:type ; sh:hasValue schema:ProfilePage ] ;
  sh:property [ sh:path schema:owner ; sh:hasValue ex:saeed-ghezelbash ; sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path schema:mainEntity ; sh:hasValue ex:saeed-ghezelbash ; sh:minCount 1 ; sh:maxCount 1 ] .

ex:ClinicFacebookProfileShape a sh:NodeShape ;
  sh:targetNode ex:profile-facebook-doctor-ghezelbaash ;
  sh:property [ sh:path rdf:type ; sh:hasValue schema:ProfilePage ] ;
  sh:property [ sh:path schema:owner ; sh:hasValue ex:saeed-ghezelbash ; sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path schema:mainEntity ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah ; sh:minCount 1 ; sh:maxCount 1 ] .

ex:ClinicInstagramProfileShape a sh:NodeShape ;
  sh:targetNode ex:profile-instagram-doctor-ghezelbaash ;
  sh:property [ sh:path rdf:type ; sh:hasValue schema:ProfilePage ] ;
  sh:property [ sh:path schema:owner ; sh:hasValue ex:saeed-ghezelbash ; sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path schema:mainEntity ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah ; sh:minCount 1 ; sh:maxCount 1 ] .

ex:RetiredIdentifierExclusionShape a sh:NodeShape ;
  sh:targetNode <https://www.ghezelbaash.ir/graph.jsonld#dataset> ;
  sh:sparql [
    sh:message "Retired/deleted or superseded identifiers must not re-enter the active canonical RDF graph." ;
    sh:select """
      SELECT $this WHERE {
        ?s ?p ?o .
        FILTER(
          CONTAINS(STR(?o), "Q140288589") ||
          CONTAINS(STR(?o), "Q140304972") ||
          CONTAINS(STR(?o), "Q700236")
        )
      }
    """
  ] .
`;
}
await writeText(shapesPath, shapes);

// Package contracts: make standards validation part of the canonical release gate.
const packagePath = "package.json";
const pkg = await readJson(packagePath);
pkg.scripts["validate:machine-standards"] = "node scripts/validate-machine-standards-2026.mjs";
if (!pkg.scripts["validate:source"].includes("validate:machine-standards"))
  pkg.scripts["validate:source"] = pkg.scripts["validate:source"].replace(
    "npm run validate:final-entity-contract",
    "npm run validate:final-entity-contract && npm run validate:machine-standards",
  );
await writeJson(packagePath, pkg);

console.log(JSON.stringify({
  migrated: true,
  contract: "P3-P4-2026",
  registryResources: registry.resources.length,
  stackMonitor: "READ_VERIFY_REPORT",
}, null, 2));
