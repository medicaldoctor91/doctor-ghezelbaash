import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSchemaInventory, inspectSchemaInventoryScope, serializeSchemaInventoryCsv,
  validateSchemaInventory, validateSchemaInventoryCoverage, validateSchemaInventoryRow,
} from "../lib/schema-inventory.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const canonicalUrl = "https://example.test/";
const physician = { "@id": canonicalUrl + "physician", "@type": ["Person", "IndividualPhysician"] };
const topic = { "@id": canonicalUrl + "condition", "@type": "MedicalCondition" };
const question = { "@id": canonicalUrl + "question-1", "@type": "Question", url: canonicalUrl + "clinical-question",
  acceptedAnswer: { "@id": canonicalUrl + "answer-1" }, about: { "@id": topic["@id"] } };
const answer = { "@id": canonicalUrl + "answer-1", "@type": "Answer" };
const video = { "@id": canonicalUrl + "video-1", "@type": "VideoObject" };
const homePage = { "@id": canonicalUrl + "webpage", "@type": "MedicalWebPage", inLanguage: "fa-IR",
  mainEntity: { "@id": physician["@id"] }, about: [{ "@id": physician["@id"] }, { "@id": topic["@id"] }] };
const canonicalGraph = { "@graph": [homePage, physician, topic, question, answer, video] };
const body = '<section id="clinical-question"><h2 id="question-heading">پرسش</h2><p>متن بالینی دقیق <span lang="en" dir="ltr">Clinical identity.</span></p></section>';
const html = (content, document, focused = false) => '<!doctype html><html lang="fa-IR" dir="rtl"><head><script type="application/ld+json">' +
  JSON.stringify(document) + '</script></head><body><main><article class="medical-guide">' +
  (focused ? '<header data-route-context id="route-context"><h1>Generated context</h1><nav>Generated navigation</nav></header>' : "") + content +
  '</article></main></body></html>';
const homeHtml = html(body + '<video id="player-1"></video>', canonicalGraph);

function fixture() {
  const page = { "@id": canonicalUrl + "clinical-question#webpage", "@type": ["MedicalWebPage", "FAQPage"],
    mainEntity: { "@id": question["@id"] }, about: [{ "@id": physician["@id"] }, { "@id": topic["@id"] }], hasPart: { "@id": video["@id"] } };
  const record = {
    path: "/clinical-question", file: "clinical-question.html", canonicalUrl: canonicalUrl + "clinical-question",
    title: "پرسش", htmlId: "clinical-question", lang: "fa-IR", dir: "rtl", scopeKind: "complete-region",
    entityId: question["@id"], entityTypes: ["Question"], pageType: "MedicalWebPage",
    entitySelection: { basis: "explicit-question-url", authoredSourceId: question["@id"], authoredSourceTypes: ["Question"] },
    topicSelection: { basis: "own-about", authoredSourceId: question["@id"], references: [{ "@id": topic["@id"] }] },
    schemaClassification: { reason: "medical-about", sourceRoleIds: [topic["@id"]] },
    navigation: { parent: { path: "/parent" }, ancestors: [{ path: "/parent" }], children: [], sourceOrder: 15 },
    bodyHtml: body,
    document: { "@graph": [page, question, answer, physician, topic, video] },
  };
  const source = html(body, record.document, true);
  const scopeByPath = new Map([[record.path, inspectSchemaInventoryScope(source, { focused: true })]]);
  const inventory = createSchemaInventory({ homeHtml, records: [record], canonicalGraph, canonicalUrl, scopeByPath });
  return { record, source, inventory };
}

test("inventory preserves all actual page types, authored subject evidence, FAQ sources and scoped media", () => {
  const { inventory, record, source } = fixture();
  assert.equal(inventory.rows.length, 2);
  const home = inventory.rows[0], row = inventory.rows[1];
  assert.deepEqual(home.pageTypes, ["MedicalWebPage"]);
  assert.deepEqual(home.mainEntity.types, ["IndividualPhysician", "Person"]);
  assert.equal(home.mainEntity.origin, "authored");
  assert.deepEqual(row.pageTypes, ["FAQPage", "MedicalWebPage"]);
  assert.equal(row.mainEntity.id, question["@id"]);
  assert.deepEqual(row.entitySelection, record.entitySelection);
  assert.deepEqual(row.topicSelection, record.topicSelection);
  assert.deepEqual(row.schemaClassification, record.schemaClassification);
  assert.deepEqual(row.about.find((item) => item.id === topic["@id"]).types, ["MedicalCondition"]);
  assert.deepEqual(row.faq.questions, [{ id: question["@id"], acceptedAnswerIds: [answer["@id"]], sourceUrls: [question.url], origin: "authored" }]);
  assert.deepEqual(row.primaryVideoIds, []);
  assert.deepEqual(row.supportingVideoIds, [video["@id"]]);
  assert.deepEqual(row.hierarchy.ancestorPaths, ["/parent"]);
  assert(row.scope.htmlIds.includes("clinical-question"));
  assert(row.scope.languageRegions.some((region) => region.lang === "en"));
  assert(!row.scope.htmlIds.includes("route-context"));
  assert.equal(validateSchemaInventoryRow(row, { record, html: source, scoped: { elements: inspectHtml(source).elements }, canonicalGraph, canonicalUrl }).status, "PASS");
  const serialized = JSON.stringify(inventory);
  assert(!serialized.includes("متن بالینی دقیق"));
  assert(!serialized.includes("Clinical identity."));
});

test("scope fingerprint ignores generated context and formatting but catches authored language text changes", () => {
  const { source } = fixture();
  const original = inspectSchemaInventoryScope(source, { focused: true });
  assert.deepEqual(inspectSchemaInventoryScope(source.replace("Generated context", "A different generated title"), { focused: true }), original);
  assert.equal(inspectSchemaInventoryScope(source.replace("<p>", "<p>\n  "), { focused: true }).textSha256, original.textSha256);
  assert.notEqual(inspectSchemaInventoryScope(source.replace("Clinical identity.", "Changed identity."), { focused: true }).textSha256, original.textSha256);
});

test("derived main subjects remain explicitly derived and primary video differs from supporting media", () => {
  const { record } = fixture();
  const derived = { "@id": record.canonicalUrl + "#content", "@type": "WebPageElement" };
  const page = { ...record.document["@graph"][0], "@type": "WebPage", mainEntity: { "@id": derived["@id"] } };
  const derivedRecord = { ...record, entityId: derived["@id"], entityTypes: ["WebPageElement"], pageType: "WebPage",
    entitySelection: { basis: "synthesized-heading-scope", authoredSourceId: null, authoredSourceTypes: [] },
    document: { "@graph": [page, derived, physician] } };
  const source = html(body, derivedRecord.document, true);
  const inventory = createSchemaInventory({ homeHtml, records: [derivedRecord], canonicalGraph, canonicalUrl,
    scopeByPath: new Map([[record.path, inspectSchemaInventoryScope(source, { focused: true })]]) });
  assert.equal(inventory.rows[1].mainEntity.origin, "derived");
  assert.deepEqual(inventory.rows[1].mainEntity.authoredTypes, []);
  const mediaRecord = { ...record, entityId: video["@id"], entityTypes: ["VideoObject"], pageType: "WebPage",
    entitySelection: { basis: "explicit-media-target", authoredSourceId: video["@id"], authoredSourceTypes: ["VideoObject"] },
    schemaClassification: { reason: "media-target", sourceRoleIds: [video["@id"]] },
    document: { "@graph": [{ ...page, mainEntity: { "@id": video["@id"] } }, video, physician] } };
  const media = createSchemaInventory({ homeHtml, records: [mediaRecord], canonicalGraph, canonicalUrl,
    scopeByPath: new Map([[record.path, inspectSchemaInventoryScope(html(body, mediaRecord.document, true), { focused: true })]]) });
  assert.deepEqual(media.rows[1].primaryVideoIds, [video["@id"]]);
  assert.deepEqual(media.rows[1].supportingVideoIds, []);
});

test("coverage rejects missing, duplicate, unclassified or unsourced routes", () => {
  const { record, inventory } = fixture();
  const assertInvalid = (change, pattern) => {
    const altered = structuredClone(inventory);
    change(altered);
    assert.throws(() => validateSchemaInventoryCoverage(altered, { records: [record], canonicalUrl }), pattern);
  };
  assertInvalid((value) => value.rows.pop(), /every focused route/);
  assertInvalid((value) => value.rows.push(value.rows[1]), /every focused route/);
  assertInvalid((value) => value.rows[1].schemaClassification = null, /source selection evidence/);
  assertInvalid((value) => value.rows[1].scope.htmlIds = [], /source target absent/);
  assertInvalid((value) => value.rows[1].schemaClassification = { reason: "reviewed-source-purpose", sourceRoleIds: [canonicalUrl + "unrelated-region"] }, /authored route ancestry/);
  assertInvalid((value) => value.rows[1].entitySelection.authoredSourceId = physician["@id"], /authored source evidence/);
});

test("physical validator rejects JSON-LD, source text, authored ID and metadata evidence drift", () => {
  const { record, source, inventory } = fixture(), row = inventory.rows[1];
  const validate = (htmlSource = source, currentRecord = record) => validateSchemaInventoryRow(row, { record: currentRecord, html: htmlSource, canonicalGraph, canonicalUrl });
  assert.throws(() => validate(source.replace('["MedicalWebPage","FAQPage"]', '"WebPage"')), /route record|pageTypes/);
  assert.throws(() => validate(source.replace("متن بالینی دقیق", "متن تغییر یافته")), /scope/);
  assert.throws(() => validate(source.replace('id="question-heading"', 'id="different-heading"')), /scope/);
  assert.throws(() => validate(source, { ...record, schemaClassification: { reason: "unclassified-content", sourceRoleIds: [] } }), /schemaClassification/);
});

test("standalone validator checks every physical route and CSV offers evidence columns without prose", async () => {
  const { record, source, inventory } = fixture();
  const dist = await mkdtemp(path.join(os.tmpdir(), "schema-inventory-"));
  try {
    await writeFile(path.join(dist, record.file), source);
    assert.deepEqual(await validateSchemaInventory(inventory, { records: [record], homeHtml, canonicalGraph, canonicalUrl, dist }),
      { status: "PASS", homepage: 1, focusedPages: 1, totalPages: 2 });
    await writeFile(path.join(dist, record.file), source.replace("Clinical identity.", "Changed identity."));
    await assert.rejects(validateSchemaInventory(inventory, { records: [record], homeHtml, canonicalGraph, canonicalUrl, dist }), /source scope/);
    const csv = serializeSchemaInventoryCsv(inventory);
    assert.equal(csv.trim().split("\n").length, 3);
    assert(csv.includes("classification_reason"));
    assert(csv.includes("source_role_ids"));
    assert(csv.includes("scope_text_sha256"));
    assert(!csv.includes("متن بالینی دقیق"));
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
