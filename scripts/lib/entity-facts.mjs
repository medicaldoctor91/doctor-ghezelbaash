import jsonld from "jsonld";
import { csvCell, nodeTypes, sha256 } from "./projection-context.mjs";

// Keep the original physical columns in order. RDF types describe the value,
// while all CSV fields remain strings so consumers preserve lexical values.
export const ENTITY_FACT_COLUMNS = Object.freeze([
  "subject", "type", "name", "predicate", "value", "object", "object_name",
  "language", "datatype", "provenance", "dataset", "version", "modified",
  "row_id", "value_kind", "value_media_type",
]);

const descriptions = {
  subject: "Absolute IRI of the subject in the canonical graph.",
  type: "Source node types, separated by |; @type rows provide their expanded IRIs.",
  name: "Human-readable subject label; not part of the fact identity.",
  predicate: "Source JSON-LD property; expand with the context at the provenance URL. @type denotes rdf:type.",
  value: "RDF lexical value for literals, or canonical JSON for embedded-json; empty for IRI objects.",
  object: "Absolute object IRI when value_kind is iri; otherwise empty.",
  object_name: "Human-readable object label when available; not part of the fact identity.",
  language: "RDF language tag for language literals; otherwise empty.",
  datatype: "Expanded RDF datatype IRI for literals; no inference from the spelling of the value.",
  provenance: "First-party source document from which the row was projected; not independent corroboration.",
  dataset: "IRI of the Dataset containing the canonical source graph.",
  version: "Release label attached to this projection, independent of the stable fact identity.",
  modified: "Release modification date as declared by the source metadata.",
  row_id: "SHA-256 of the subject, expanded predicate and RDF term or canonical embedded subgraph.",
  value_kind: "Object representation: iri, literal, or embedded-json.",
  value_media_type: "application/json for embedded-json; otherwise empty.",
};

export function entityFactsTableSchema() {
  return {
    $schema: "https://datapackage.org/profiles/2.0/tableschema.json",
    fields: ENTITY_FACT_COLUMNS.map((name) => ({
      name,
      type: "string",
      description: descriptions[name],
      ...(["subject", "predicate", "provenance", "dataset", "version", "modified", "row_id", "value_kind"].includes(name)
        ? { constraints: {
            required: true,
            ...(name === "row_id" ? { pattern: "^[a-f0-9]{64}$", unique: true } : {}),
            ...(name === "value_kind" ? { enum: ["iri", "literal", "embedded-json"] } : {}),
          } }
        : {}),
    })),
    primaryKey: ["row_id"],
    missingValues: [""],
  };
}

export function entityFactsTableDialect() {
  return {
    $schema: "https://datapackage.org/profiles/2.0/tabledialect.json",
    delimiter: ",",
    quoteChar: "\"",
    doubleQuote: true,
    headerRows: [1],
    lineTerminator: "\n",
  };
}

export function entityFactsRecordSet(canonicalUrl, fileObjectId) {
  const recordId = `${canonicalUrl}entity-facts.csv#records`;
  if (typeof fileObjectId !== "string" || !URL.canParse(fileObjectId))
    throw new Error("Croissant record set requires the registered distribution IRI");
  return {
    "@id": recordId,
    "@type": "cr:RecordSet",
    name: "entity_facts",
    description: "Canonical graph facts. Literal datatype and language are explicit columns; embedded JSON uses the source graph context.",
    key: [{ "@id": `${recordId}/row_id` }],
    field: ENTITY_FACT_COLUMNS.map((name) => ({
      "@id": `${recordId}/${name}`,
      "@type": "cr:Field",
      name,
      description: descriptions[name],
      dataType: "sc:Text",
      source: {
        fileObject: { "@id": fileObjectId },
        extract: { column: name },
      },
    })),
  };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export const serializeEntityFacts = (records) => {
  const { delimiter, lineTerminator } = entityFactsTableDialect();
  return [ENTITY_FACT_COLUMNS, ...records.map((record) => ENTITY_FACT_COLUMNS.map((key) => record[key]))]
    .map((row) => row.map(csvCell).join(delimiter)).join(lineTerminator) + lineTerminator;
};

export async function buildEntityFacts({ graph, release, byId, nodeName }) {
  const sourceUrl = `${release.canonicalUrl}graph.jsonld`;
  const sourceRows = [];
  const rowPrefix = "urn:entity-fact-projection:row:";
  for (const node of graph["@graph"]) {
    if (typeof node["@id"] !== "string")
      throw new Error("Entity facts require named source nodes");
    for (const [predicate, values] of Object.entries(node)) {
      if (["@id", "@context"].includes(predicate)) continue;
      if (predicate.startsWith("@") && predicate !== "@type")
        throw new Error(`Unsupported graph keyword in entity facts: ${predicate}`);
      for (const value of Array.isArray(values) ? values : [values])
        sourceRows.push({ node, predicate, value, id: `${rowPrefix}${sourceRows.length}` });
    }
  }
  // Expand each source value under its real JSON-LD context in one operation.
  // Temporary subjects let the standards processor resolve even context-coerced
  // IRIs, rdf:type, numeric lexical forms and explicit datatypes unambiguously.
  const expanded = await jsonld.expand({
    "@context": graph["@context"],
    "@graph": sourceRows.map(({ node, predicate, value, id }) => ({
      ...(node["@context"] ? { "@context": node["@context"] } : {}),
      "@id": id,
      [predicate]: value,
    })),
  }, { base: sourceUrl });
  const expandedById = new Map(expanded.map((node) => [node["@id"], node]));
  const quads = await jsonld.toRDF(expanded);
  const parentQuads = new Map();
  for (const quad of quads) {
    if (quad.subject.termType !== "NamedNode" || !quad.subject.value.startsWith(rowPrefix)) continue;
    if (parentQuads.has(quad.subject.value))
      throw new Error(`Entity fact does not expand to one parent statement: ${quad.subject.value}`);
    parentQuads.set(quad.subject.value, quad);
  }
  const records = [];
  const rowIds = new Set();
  for (const { node, predicate, value, id } of sourceRows) {
    const quad = parentQuads.get(id);
    if (!quad) throw new Error(`Entity fact has no RDF statement: ${node["@id"]} ${predicate}`);
    const embedded = value && typeof value === "object" && !("@value" in value)
      && Object.keys(value).some((key) => key !== "@id");
    let literal = "", object = "", language = "", datatype = "", valueKind, identity;
    if (embedded) {
      valueKind = "embedded-json";
      literal = canonicalJson(value);
      // Canonical RDF removes blank-node labels and JSON key/array ordering from
      // the ID. The stored JSON still preserves the complete original structure.
      const embeddedGraph = structuredClone(expandedById.get(id));
      embeddedGraph["@id"] = node["@id"];
      identity = await jsonld.canonize([embeddedGraph], {
        algorithm: "RDFC-1.0", rejectURDNA2015: true, format: "application/n-quads",
      });
    } else if (quad.object.termType === "NamedNode") {
      valueKind = "iri";
      object = quad.object.value;
      identity = [valueKind, object];
    } else if (quad.object.termType === "Literal") {
      valueKind = "literal";
      literal = quad.object.value;
      language = quad.object.language || "";
      datatype = quad.object.datatype.value;
      identity = [valueKind, literal, language, datatype];
    } else {
      throw new Error(`Unrepresented RDF object in entity facts: ${node["@id"]} ${predicate}`);
    }
    const rowId = sha256(Buffer.from(canonicalJson([node["@id"], quad.predicate.value, identity])));
    if (rowIds.has(rowId)) throw new Error(`Duplicate semantic fact: ${node["@id"]} ${predicate}`);
    rowIds.add(rowId);
    records.push({
      subject: node["@id"], type: nodeTypes(node).join("|"), name: nodeName(node),
      predicate, value: literal, object, object_name: nodeName(byId.get(object)),
      language, datatype, provenance: sourceUrl, dataset: `${sourceUrl}#dataset`,
      version: release.release, modified: release.dateModified, row_id: rowId,
      value_kind: valueKind, value_media_type: embedded ? "application/json" : "",
    });
  }
  return records;
}
