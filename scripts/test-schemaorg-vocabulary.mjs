import assert from "node:assert/strict";
import test from "node:test";
import { createSchemaVocabulary, validateJsonLdScope } from "./lib/schemaorg-vocabulary.mjs";

const S = "https://schema.org/";
// Minimal official vocabulary relationships exercise the algorithm offline;
// production separately fetches and verifies the complete immutable release.
const typeRows = [
  ["Thing", ""], ["Person", "Thing"], ["Organization", "Thing"],
  ["CreativeWork", "Thing"], ["ProfilePage", "CreativeWork"],
  ["DataType", "Thing"], ["Text", "DataType"], ["URL", "Text"],
  ["Date", "DataType"], ["Number", "DataType"], ["Integer", "Number"],
].map(([label, parent]) => ({ label, subTypeOf: parent && S + parent }));
const propertyRows = [
  ["name", "Thing", "Text"], ["mainEntity", "CreativeWork", "Thing"],
  ["worksFor", "Person", "Organization"], ["url", "Thing", "URL"],
  ["birthDate", "Person", "Date"],
].map(([label, domain, range]) => ({ label, domainIncludes: S + domain, rangeIncludes: S + range }));
const vocabulary = createSchemaVocabulary(propertyRows, typeRows);
const baseline = {
  "@context": { "@version": 1.1, "@vocab": S, schema: S,
    prov: "http://www.w3.org/ns/prov#", dcterms: "http://purl.org/dc/terms/" },
  "@graph": [
    { "@id": "https://example.test/#person", "@type": "Person", name: "A",
      worksFor: { "@id": "https://example.test/#clinic" },
      birthDate: { "@value": "2000-01-01", "@type": "http://www.w3.org/2001/XMLSchema#date" } },
    { "@id": "https://example.test/#clinic", "@type": "Organization", name: "B" },
    { "@id": "https://example.test/#page", "@type": "ProfilePage", name: { "@value": "C", "@language": "en" },
      mainEntity: [{ "@id": "https://example.test/#person" }, { "@id": "https://example.test/#clinic" }],
      "prov:wasDerivedFrom": { "@id": "https://source.test/" },
      "dcterms:issued": { "@value": "2026-09", "@type": "http://www.w3.org/2001/XMLSchema#gYearMonth" } },
  ],
};
const validate = (document) => validateJsonLdScope([document], vocabulary, "fixture");
test("checks graph types, cross-node ranges, typed/language literals and explicit external terms", () => {
  const result = validate(baseline);
  assert.equal(result.graphNodes, 3);
  assert.equal(result.externalPropertyUses, 2);
  assert.equal(result.standardDatatypeLiterals, 1);
  assert.equal(result.languageTaggedLiterals, 1);
  assert.ok(result.checkedRanges >= 7);
});
for (const [name, mutate, error] of [
  ["unknown type", (c) => c["@graph"][1]["@type"] = "ImaginaryClinic", /Unknown|unknown/],
  ["unknown property outside homepage subset", (c) => c["@graph"][1].madeUpAuthority = "true", /madeUpAuthority/],
  ["domain mismatch", (c) => c["@graph"][1].worksFor = { "@id": "https://example.test/#clinic" }, /outside domain/],
  ["referenced node range mismatch", (c) => c["@graph"][1]["@type"] = "Person", /target.*not in/],
  ["undefined local reference", (c) => c["@graph"][0].worksFor = { "@id": "https://example.test/#missing" }, /unresolved local range target/],
  ["typed literal mismatch", (c) => c["@graph"][0].birthDate["@type"] = "http://www.w3.org/2001/XMLSchema#integer", /literal datatype/],
  ["fully defined nested node with an id", (c) => c["@graph"][2].mainEntity.push({ "@id": "https://example.test/#nested", "@type": "Person", inventedProperty: "bad" }), /inventedProperty/],
  ["invented external property", (c) => c["@graph"][2]["prov:inventedAuthority"] = { "@id": "https://source.test/" }, /unknown external term/],
  ["namespace substitution", (c) => c["@context"].prov = "https://example.test/prov#", /namespace binding/],
  ["context property redefinition", (c) => c["@context"].name = S + "url", /context term remapped/],
  ["scoped context bypass", (c) => c["@graph"][0]["@context"] = { name: S + "url" }, /scoped contexts/],
  ["literal PROV entity", (c) => c["@graph"][2]["prov:wasDerivedFrom"] = "https://source.test/", /entity reference/],
  ["duplicate graph identity", (c) => c["@graph"].push(structuredClone(c["@graph"][0])), /unique/],
]) test(`rejects ${name}`, () => {
  const document = structuredClone(baseline); mutate(document);
  assert.throws(() => validate(document), error);
});
test("separate output scopes cannot borrow canonical types to hide a projected range error", () => {
  const badProjection = structuredClone(baseline);
  badProjection["@graph"][1]["@type"] = "Person";
  assert.doesNotThrow(() => validateJsonLdScope([baseline], vocabulary, "canonical"));
  assert.throws(() => validateJsonLdScope([badProjection], vocabulary, "homepage"), /target.*not in/);
});
test("IRI-coerced strings check known target types instead of bypassing range validation", () => {
  const document = structuredClone(baseline);
  document["@context"].worksFor = { "@id": S + "worksFor", "@type": "@id" };
  document["@graph"][0].worksFor = "https://example.test/#person";
  assert.throws(() => validate(document), /target.*not in/);
});
