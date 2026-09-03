import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";

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
const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const schemaLocal = (value) =>
  typeof value === "string" && value.startsWith(SCHEMA_ORIGIN)
    ? value.slice(SCHEMA_ORIGIN.length)
    : null;
const splitIris = (value) =>
  String(value || "")
    .split(/,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

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

const properties = new Map(propertyRows.map((row) => [row.label, row]));
const types = new Map(typeRows.map((row) => [row.label, row]));
const superTypes = new Map(
  typeRows.map((row) => [
    row.label,
    splitIris(row.subTypeOf).map(schemaLocal).filter(Boolean),
  ]),
);
const closureMemo = new Map();
const typeClosure = (type, trail = new Set()) => {
  if (closureMemo.has(type)) return closureMemo.get(type);
  if (trail.has(type)) fail(`Schema.org type inheritance cycle at ${type}`);
  if (!types.has(type)) fail(`Unknown/superseded Schema.org type ${type}`);
  const nextTrail = new Set(trail).add(type),
    closure = new Set([type]);
  for (const parent of superTypes.get(type) || [])
    for (const inherited of typeClosure(parent, nextTrail)) closure.add(inherited);
  closureMemo.set(type, closure);
  return closure;
};
const domainFor = (property) =>
  new Set(splitIris(properties.get(property)?.domainIncludes).map(schemaLocal).filter(Boolean));
const rangeFor = (property) =>
  new Set(splitIris(properties.get(property)?.rangeIncludes).map(schemaLocal).filter(Boolean));
const typesFor = (node) =>
  asArray(node?.["@type"])
    .map((value) => (typeof value === "string" ? value : null))
    .filter(Boolean)
    .map((value) => schemaLocal(value) || value)
    .filter((value) => !value.startsWith("http://www.w3.org/2001/XMLSchema#"));
const domainMatches = (nodeTypes, allowed) => {
  if (!allowed.size) return true;
  return nodeTypes.some((type) =>
    [...typeClosure(type)].some((candidate) => allowed.has(candidate)),
  );
};
const rangeMatchesTypes = (valueTypes, allowed) => {
  if (!allowed.size) return true;
  return valueTypes.some((type) =>
    [...typeClosure(type)].some((candidate) => allowed.has(candidate)),
  );
};

const jsonDocuments = extractJsonLd(html);
const graphNodes = jsonDocuments.flatMap((document) => document?.["@graph"] || []);
const graphById = new Map(
  graphNodes
    .filter((node) => typeof node?.["@id"] === "string")
    .map((node) => [node["@id"], node]),
);
const jsonErrors = [];
let jsonTypedObjects = 0,
  jsonPropertyUses = 0,
  checkedRanges = 0;

const validateRange = (property, value, path, context) => {
  const allowed = rangeFor(property);
  if (!allowed.size) return;
  for (const item of asArray(value)) {
    if (item && typeof item === "object") {
      if (Object.hasOwn(item, "@value")) continue;
      const explicitTypes = typesFor(item);
      if (explicitTypes.length) {
        for (const type of explicitTypes)
          if (!types.has(type))
            jsonErrors.push(`${path}: unknown/superseded range type ${type}`);
        if (
          explicitTypes.every((type) => types.has(type)) &&
          !rangeMatchesTypes(explicitTypes, allowed)
        )
          jsonErrors.push(
            `${path}: ${property} range ${explicitTypes.join("+")} not in ${[...allowed].join("|")}`,
          );
        checkedRanges++;
        continue;
      }
      if (typeof item["@id"] === "string") {
        if (allowed.has("URL")) {
          checkedRanges++;
          continue;
        }
        const target = graphById.get(item["@id"]),
          targetTypes = typesFor(target);
        if (targetTypes.length) {
          if (!rangeMatchesTypes(targetTypes, allowed))
            jsonErrors.push(
              `${path}: ${property} target ${item["@id"]} has ${targetTypes.join("+")} not in ${[...allowed].join("|")}`,
            );
          checkedRanges++;
        }
      }
      continue;
    }
    if (typeof item === "boolean") {
      if (!allowed.has("Boolean"))
        jsonErrors.push(`${path}: ${property} Boolean literal outside ${[...allowed].join("|")}`);
      checkedRanges++;
    } else if (typeof item === "number") {
      if (!["Number", "Integer", "Float"].some((type) => allowed.has(type)))
        jsonErrors.push(`${path}: ${property} numeric literal outside ${[...allowed].join("|")}`);
      checkedRanges++;
    } else if (typeof item === "string") {
      const mapping = context?.[property],
        iriCoerced = mapping && typeof mapping === "object" && mapping["@type"] === "@id";
      if (iriCoerced) {
        if (allowed.has("URL")) checkedRanges++;
        continue;
      }
      const literalRanges = new Set([
        "Text",
        "URL",
        "Date",
        "DateTime",
        "Time",
        "Duration",
        "Number",
        "Integer",
        "Float",
      ]);
      if (![...allowed].some((type) => literalRanges.has(type)))
        jsonErrors.push(`${path}: ${property} string literal outside ${[...allowed].join("|")}`);
      checkedRanges++;
    }
  }
};

const validateJsonObject = (node, path, context) => {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const nodeTypes = typesFor(node);
  if (nodeTypes.length) {
    jsonTypedObjects++;
    for (const type of nodeTypes)
      if (!types.has(type)) jsonErrors.push(`${path}: unknown/superseded Schema.org type ${type}`);
    for (const [property, value] of Object.entries(node)) {
      if (property.startsWith("@")) continue;
      jsonPropertyUses++;
      const spec = properties.get(property);
      if (!spec) {
        jsonErrors.push(`${path}: unknown/superseded Schema.org property ${property}`);
        continue;
      }
      if (
        nodeTypes.every((type) => types.has(type)) &&
        !domainMatches(nodeTypes, domainFor(property))
      )
        jsonErrors.push(
          `${path}: ${property} is outside domain for ${nodeTypes.join("+")}`,
        );
      validateRange(property, value, `${path}.${property}`, context);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "@context") continue;
    for (const item of asArray(value))
      if (item && typeof item === "object" && !Object.hasOwn(item, "@id"))
        validateJsonObject(item, `${path}.${key}`, context);
  }
};
for (const [documentIndex, document] of jsonDocuments.entries()) {
  const context = document?.["@context"] || {};
  for (const [nodeIndex, node] of (document?.["@graph"] || []).entries())
    validateJsonObject(node, `$jsonld[${documentIndex}].@graph[${nodeIndex}]`, context);
}
if (jsonErrors.length)
  fail(`Schema.org v${SCHEMA_RELEASE} JSON-LD conformance failed:\n${jsonErrors.join("\n")}`);
if (!jsonTypedObjects || !jsonPropertyUses || !checkedRanges)
  fail("Schema.org JSON-LD validator exercised no meaningful typed objects/properties/ranges");

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
      jsonLdDocuments: jsonDocuments.length,
      jsonLdTypedObjects: jsonTypedObjects,
      jsonLdPropertyUses: jsonPropertyUses,
      jsonLdCheckedRanges: checkedRanges,
      microdataScopes,
      microdataPropertyUses,
      supersededTermsAccepted: false,
    },
    null,
    2,
  ),
);
