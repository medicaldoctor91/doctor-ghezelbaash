import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import jsonld from "jsonld";
import {
  buildEntityFacts, ENTITY_FACT_COLUMNS, entityFactsRecordSet,
  entityFactsTableSchema, serializeEntityFacts,
} from "./lib/entity-facts.mjs";

const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const release = { canonicalUrl: "https://example.org/", release: "1.0.0", dateModified: "2026-08-31" };
function context(graph, version = release) {
  return {
    graph, release: version,
    byId: new Map(graph["@graph"].map((node) => [node["@id"], node])),
    nodeName: (node) => typeof node?.name === "string" ? node.name : "",
  };
}
function reconstruct(records, sourceContext) {
  return {
    "@context": sourceContext,
    "@graph": records.map((record) => ({
      "@id": record.subject,
      [record.predicate]: record.predicate === "@type" ? record.object
        : record.value_kind === "iri" ? { "@id": record.object }
        : record.value_kind === "embedded-json" ? JSON.parse(record.value)
        : {
            "@value": record.value,
            ...(record.language ? { "@language": record.language } : { "@type": record.datatype }),
          },
    })),
  };
}
const canon = (value) => jsonld.canonize(value, { algorithm: "URDNA2015", format: "application/n-quads" });

test("JSON-LD context and RDF terms determine the value kind and datatype", async () => {
  const graph = {
    "@context": {
      "@vocab": "https://schema.org/",
      url: { "@id": "https://schema.org/url", "@type": "@id" },
    },
    "@graph": [{
      "@id": "https://example.org/#person", "@type": "Person",
      url: "https://example.org/profile", description: "https://example.org/plain-literal",
      name: { "@value": "دکتر", "@language": "fa" },
      dateModified: "2026-08-31", value: [false, 7, 1.25,
        { "@value": "0.125", "@type": `${XSD}decimal` },
        { "@value": "2026-08", "@type": `${XSD}gYearMonth` }],
      identifier: { "@type": "PropertyValue", propertyID: "local", value: "00123" },
    }],
  };
  const records = await buildEntityFacts(context(graph));
  const at = (predicate) => records.find((record) => record.predicate === predicate);
  assert.equal(at("url").value_kind, "iri");
  assert.equal(at("url").object, "https://example.org/profile");
  assert.equal(at("description").datatype, `${XSD}string`);
  assert.equal(at("@type").object, "https://schema.org/Person");
  assert.equal(at("name").language, "fa");
  assert.equal(at("name").datatype, `${RDF}langString`);
  assert.equal(at("dateModified").datatype, `${XSD}string`);
  assert.deepEqual(records.filter((record) => record.predicate === "value").map(({ value, datatype }) => [value, datatype]), [
    ["false", `${XSD}boolean`], ["7", `${XSD}integer`], ["1.25E0", `${XSD}double`],
    ["0.125", `${XSD}decimal`], ["2026-08", `${XSD}gYearMonth`],
  ]);
  assert.equal(at("identifier").value_media_type, "application/json");
  assert.equal(at("identifier").datatype, "");
  assert.equal(JSON.parse(at("identifier").value).value, "00123");
  assert.equal(await canon(reconstruct(records, graph["@context"])), await canon(graph));
});

test("fact identity survives labels, release metadata and embedded RDF serialization order", async () => {
  const graph = {
    "@context": { "@vocab": "https://schema.org/" },
    "@graph": [{
      "@id": "https://example.org/#person", "@type": "Person", name: "Name before",
      knows: { "@id": "https://example.org/#other" },
      identifier: { "@type": "PropertyValue", propertyID: "local", value: ["A", "B"] },
    }, { "@id": "https://example.org/#other", "@type": "Person", name: "Other before" }],
  };
  const before = await buildEntityFacts(context(graph));
  const changed = structuredClone(graph);
  changed["@graph"][0].name = "Name after";
  changed["@graph"][1].name = "Other after";
  changed["@graph"][0].identifier = { value: ["B", "A"], propertyID: "local", "@type": "PropertyValue" };
  const after = await buildEntityFacts(context(changed, { ...release, release: "2.0.0", dateModified: "2026-09-05" }));
  for (const record of before.filter((entry) => entry.predicate !== "name")) {
    const corresponding = after.find((entry) => entry.subject === record.subject && entry.predicate === record.predicate);
    assert.equal(corresponding.row_id, record.row_id);
    assert.equal(corresponding.version, "2.0.0");
  }
  assert.notEqual(before.find((r) => r.predicate === "name").row_id, after.find((r) => r.predicate === "name").row_id);
  changed["@graph"][0].knows["@id"] = "https://example.org/#different";
  const different = await buildEntityFacts(context(changed));
  assert.notEqual(before.find((r) => r.predicate === "knows").row_id, different.find((r) => r.predicate === "knows").row_id);
});

test("canonical graph round-trips through all CSV facts, including embedded structures", async () => {
  const graph = JSON.parse(await readFile("src/data/semantic/knowledge-graph.jsonld", "utf8"));
  const sourceRelease = JSON.parse(await readFile("src/data/release.json", "utf8"));
  const records = await buildEntityFacts(context(graph, sourceRelease));
  const inputRows = graph["@graph"].flatMap((node) => Object.entries(node)
    .filter(([key]) => !["@id", "@context"].includes(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : [value]));
  assert.equal(records.length, inputRows.length);
  assert.equal(new Set(records.map((record) => record.row_id)).size, records.length);
  assert.ok(records.every((record) => record.provenance === `${sourceRelease.canonicalUrl}graph.jsonld`));
  assert.ok(records.every((record) => record.value_kind === "literal" ? record.datatype.length > 0 : !record.datatype));
  assert.equal(await canon(reconstruct(records, graph["@context"])), await canon(graph));
  // An independent standards CSV reader exercises quoting, Persian text, embedded
  // JSON and multi-line answers, rather than mirroring our serializer.
  const python = spawnSync("python", ["-c", "import csv,io,json,sys; rows=list(csv.DictReader(io.StringIO(sys.stdin.read(), newline=''))); print(json.dumps(rows, ensure_ascii=False))"], {
    input: serializeEntityFacts(records), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), records);
});

test("tabular descriptors expose the physical schema, primary key and real Croissant CSV extraction", () => {
  const schema = entityFactsTableSchema();
  assert.deepEqual(schema.fields.map((field) => field.name), ENTITY_FACT_COLUMNS);
  assert.deepEqual(schema.primaryKey, ["row_id"]);
  assert.ok(schema.fields.every((field) => field.type === "string"));
  const recordSet = entityFactsRecordSet(release.canonicalUrl, `${release.canonicalUrl}entity-facts.csv#download`);
  assert.equal(recordSet.key[0]["@id"], `${recordSet["@id"]}/row_id`);
  assert.deepEqual(recordSet.field.map((field) => field.source.extract.column), ENTITY_FACT_COLUMNS);
  assert.ok(recordSet.field.every((field) => field.source.fileObject["@id"] === `${release.canonicalUrl}entity-facts.csv#download`));
});
