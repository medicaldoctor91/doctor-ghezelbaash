import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { createSchemaVocabulary, validateJsonLdScope } from "./lib/schemaorg-vocabulary.mjs";
import { assertSocialIdentity } from "./lib/social-identity-contract.mjs";

const fail = (message) => {
  throw new Error(message);
};
const SCHEMA_ORIGIN = "https://schema.org/";
const SCHEMA_RELEASE = "30.0";
const SCHEMA_COMMIT = "420231f6bfac8372fc564abb121fae57ccb36a0c";
const OFFICIAL_FILES = Object.freeze({
  properties: Object.freeze({
    path: `data/releases/${SCHEMA_RELEASE}/schemaorg-current-https-properties.csv`,
    blob: "e58ee705f990b798c3571cbcd59193e28d6107ef",
  }),
  types: Object.freeze({
    path: `data/releases/${SCHEMA_RELEASE}/schemaorg-current-https-types.csv`,
    blob: "a465eb2b364e5b7eca26fe9e45aae8b175d28c71",
  }),
});
const schemaLocal = (value) =>
  typeof value === "string" && value.startsWith(SCHEMA_ORIGIN)
    ? value.slice(SCHEMA_ORIGIN.length)
    : null;

const gitBlobSha = (buffer) =>
  createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`, "utf8"))
    .update(buffer)
    .digest("hex");

async function fetchOfficialCsv(spec, label) {
  const url = `https://raw.githubusercontent.com/schemaorg/schemaorg/${SCHEMA_COMMIT}/${spec.path}`;
  const response = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": "doctor-ghezelbaash-schema-validator" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    fail(`Schema.org ${label} fetch failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actualBlob = gitBlobSha(buffer);
  if (actualBlob !== spec.blob)
    fail(
      `Schema.org ${label} immutable blob mismatch: ${actualBlob} != ${spec.blob}`,
    );
  return buffer.toString("utf8");
}

function parseCsv(source) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) fail("Malformed Schema.org CSV: unterminated quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift();
  if (!headers?.length) fail("Schema.org CSV lacks a header row");
  return rows
    .filter((values) => values.some((value) => value !== ""))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function extractJsonLd(html) {
  const documents = [];
  const pattern = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) documents.push(JSON.parse(match[1]));
  if (documents.length !== 2)
    fail(`Expected exactly two rendered JSON-LD documents, received ${documents.length}`);
  return documents;
}

const attrMap = (node) =>
  new Map((node?.attrs || []).map((attr) => [attr.name, attr.value]));

const release = JSON.parse(await readFile("src/data/release.json", "utf8"));
if (release.schemaVersion !== `${SCHEMA_ORIGIN}version/${SCHEMA_RELEASE}/`)
  fail(
    `release.schemaVersion must match the pinned validator release ${SCHEMA_RELEASE}`,
  );
const html = await readFile("dist/index.html", "utf8");
const [propertiesCsv, typesCsv] = await Promise.all([
  fetchOfficialCsv(OFFICIAL_FILES.properties, "properties"),
  fetchOfficialCsv(OFFICIAL_FILES.types, "types"),
]);
const propertyRows = parseCsv(propertiesCsv),
  typeRows = parseCsv(typesCsv);
for (const required of ["id", "label", "domainIncludes", "rangeIncludes"])
  if (!Object.hasOwn(propertyRows[0] || {}, required))
    fail(`Schema.org property CSV missing column ${required}`);
for (const required of ["id", "label", "subTypeOf"])
  if (!Object.hasOwn(typeRows[0] || {}, required))
    fail(`Schema.org type CSV missing column ${required}`);

const vocabulary = createSchemaVocabulary(propertyRows, typeRows);
const { properties, types, domainMatches, domainFor } = vocabulary;
const jsonDocuments = extractJsonLd(html);
const [authoredGraph, deliveredGraph] = await Promise.all([
  readFile("src/data/semantic/knowledge-graph.jsonld", "utf8").then(JSON.parse),
  readFile("dist/graph.jsonld", "utf8").then(JSON.parse),
]);
const jsonLdScopes = [
  validateJsonLdScope(jsonDocuments, vocabulary, "dist/index.html"),
  validateJsonLdScope([authoredGraph], vocabulary, "src/data/semantic/knowledge-graph.jsonld"),
  validateJsonLdScope([deliveredGraph], vocabulary, "dist/graph.jsonld"),
];
for (const graph of [authoredGraph, deliveredGraph]) assertSocialIdentity({ graph, release });
const total = (key) => jsonLdScopes.reduce((sum, scope) => sum + scope[key], 0);

const microdataErrors = [];
let microdataScopes = 0,
  microdataPropertyUses = 0;
const document = parse(html);
const walkMicrodata = (node, scopeTypes = []) => {
  const attrs = attrMap(node),
    itemprop = String(attrs.get("itemprop") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
    hasScope = attrs.has("itemscope"),
    itemtype = String(attrs.get("itemtype") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(schemaLocal)
      .filter(Boolean);

  if (itemprop.length) {
    if (!scopeTypes.length)
      microdataErrors.push(`Microdata itemprop outside itemscope: ${itemprop.join(" ")}`);
    for (const property of itemprop) {
      microdataPropertyUses++;
      if (!properties.has(property)) {
        microdataErrors.push(`Unknown/superseded Microdata property ${property}`);
        continue;
      }
      if (scopeTypes.length && !domainMatches(scopeTypes, domainFor(property)))
        microdataErrors.push(
          `Microdata ${property} outside domain for ${scopeTypes.join("+")}`,
        );
    }
  }

  let childScope = scopeTypes;
  if (hasScope) {
    microdataScopes++;
    if (!itemtype.length) microdataErrors.push("Microdata itemscope lacks Schema.org itemtype");
    for (const type of itemtype)
      if (!types.has(type)) microdataErrors.push(`Unknown/superseded Microdata type ${type}`);
    childScope = itemtype;
  }
  for (const child of node?.childNodes || []) walkMicrodata(child, childScope);
};
walkMicrodata(document);
if (microdataErrors.length)
  fail(`Schema.org v${SCHEMA_RELEASE} Microdata conformance failed:\n${microdataErrors.join("\n")}`);
if (!microdataScopes || !microdataPropertyUses)
  fail("Schema.org Microdata validator exercised no meaningful scopes/properties");

console.log(
  JSON.stringify(
    {
      schemaOrgVocabulary: "PASS",
      release: SCHEMA_RELEASE,
      sourceCommit: SCHEMA_COMMIT,
      propertyBlob: OFFICIAL_FILES.properties.blob,
      typeBlob: OFFICIAL_FILES.types.blob,
      officialProperties: properties.size,
      officialTypes: types.size,
      jsonLdDocuments: total("documents"),
      jsonLdScopes,
      jsonLdTypedObjects: total("jsonTypedObjects"),
      jsonLdPropertyUses: total("jsonPropertyUses"),
      jsonLdCheckedRanges: total("checkedRanges"),
      standardDatatypeLiterals: total("standardDatatypeLiterals"),
      languageTaggedLiterals: total("languageTaggedLiterals"),
      externalPropertyUses: total("externalPropertyUses"),
      microdataScopes,
      microdataPropertyUses,
      supersededTermsAccepted: false,
    },
    null,
    2,
  ),
);
