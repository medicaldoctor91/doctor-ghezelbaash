import test from "node:test";
import assert from "node:assert/strict";
import { applyRouteSchemaPolicy, reviewedRoutePurposes } from "../lib/route-schema-policy.mjs";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveIndependentPages } from "../lib/independent-pages.mjs";
import { attachTopicNavigation } from "../lib/topic-navigation.mjs";
import { applyTranslationAlternates } from "../lib/translation-alternates.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/";
const url = (path) => new URL(path, canonicalUrl).href;
const pageFor = (record) => record.document["@graph"].find((node) => node["@id"] === record.canonicalUrl + "#webpage");
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) freeze(entry);
  }
  return value;
};
const fixture = (path, { types = "WebPageElement", ancestors = [], about = [], acceptedAnswer,
  title = "Unrelated display label" } = {}) => {
  const entityId = url(path) + "#content";
  const entity = { "@id": entityId, "@type": types, name: title, about };
  if (acceptedAnswer) entity.acceptedAnswer = { "@id": acceptedAnswer };
  return { path, canonicalUrl: url(path), entityId, entityTypes: [types].flat(), pageType: "MedicalWebPage",
    title, description: "Original description", bodyHtml: "<p>Original prose</p>",
    navigation: { ancestors: ancestors.map((path) => ({ path })), children: [] },
    document: { "@context": "https://schema.org", "@graph": [
      { "@id": url(path) + "#webpage", "@type": acceptedAnswer ? ["MedicalWebPage", "FAQPage"] : "MedicalWebPage",
        mainEntity: { "@id": entityId }, about, name: title }, entity,
      ...(acceptedAnswer ? [{ "@id": acceptedAnswer, "@type": "Answer", text: "Original accepted answer" }] : []),
    ] } };
};
const emptyGraph = { "@graph": [] };
const role = (path, pageType, purpose, exact = false) => ({ path, pageType, purpose, ...(exact ? { exact } : {}) });

test("nearest reviewed purpose overrides clinical ancestry without replacing questions or answers", () => {
  const sourcePurposes = [role("/guide", "MedicalWebPage", "clinical-guide"),
    role("/biography", "WebPage", "professional-biography"),
    role("/identity", "WebPage", "physician-identity")];
  const records = [fixture("/guide"), fixture("/biography", { ancestors: ["/guide"] }),
    fixture("/identity", { types: "Question", ancestors: ["/guide"], acceptedAnswer: url("/identity-answer") }),
    fixture("/clinical-question", { types: "Question", ancestors: ["/guide"], acceptedAnswer: url("/clinical-answer") }),
    fixture("/biography-detail", { ancestors: ["/guide", "/biography"] })];
  const output = applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl, sourcePurposes });
  const byPath = new Map(output.map((record) => [record.path, record]));
  assert.deepEqual(pageFor(byPath.get("/identity"))["@type"], ["WebPage", "FAQPage"]);
  assert.deepEqual(pageFor(byPath.get("/clinical-question"))["@type"], ["MedicalWebPage", "FAQPage"]);
  assert.equal(byPath.get("/biography-detail").pageType, "WebPage");
  assert.deepEqual(byPath.get("/biography-detail").schemaClassification,
    { reason: "reviewed-source-purpose", purpose: "professional-biography", sourceRoleIds: [url("/biography")] });
  for (let index = 0; index < records.length; index++) {
    assert.deepEqual(pageFor(output[index]).mainEntity, pageFor(records[index]).mainEntity);
    assert.strictEqual(output[index].document["@graph"][1], records[index].document["@graph"][1]);
    if (records[index].entityTypes.includes("Question"))
      assert.strictEqual(output[index].document["@graph"][2], records[index].document["@graph"][2]);
  }
});

test("dedicated profile and contact specializations do not spread to descendants or medical media", () => {
  const sourcePurposes = [role("/physician", "ProfilePage", "physician-profile", true),
    role("/clinic", "MedicalWebPage", "clinical-guide"),
    role("/contact", "ContactPage", "clinic-contact", true)];
  const records = [fixture("/physician", { types: ["Person", "IndividualPhysician"] }),
    fixture("/new-heading", { ancestors: ["/physician"], title: "Botox doctor medical treatment" }),
    fixture("/clinic", { ancestors: ["/physician"] }),
    fixture("/contact", { ancestors: ["/physician", "/clinic"] }),
    fixture("/contact-follow-up", { ancestors: ["/physician", "/clinic", "/contact"] }),
    fixture("/video", { types: "VideoObject", ancestors: ["/physician", "/clinic"] })];
  const output = applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl, sourcePurposes });
  assert.deepEqual(output.map((record) => record.pageType),
    ["ProfilePage", "WebPage", "MedicalWebPage", "ContactPage", "MedicalWebPage", "WebPage"]);
  assert.equal(output[1].schemaClassification.reason, "unclassified-content");
  assert.deepEqual(output[1].schemaClassification.sourceRoleIds, []);
  assert.equal(output.at(-1).schemaClassification.reason, "media-target");
  assert.throws(() => applyRouteSchemaPolicy([fixture("/physician")], emptyGraph,
    { canonicalUrl, sourcePurposes: sourcePurposes.slice(0, 1) }), /must retain its Person/);
});

test("fallback medical evidence uses authored about types or controlled terms, not arbitrary taxonomies or physician credentials", () => {
  const conditionId = url("/condition"), termId = url("/clinical-term"), tierId = url("/evidence-tier");
  const physicianId = url("/doctor"), specialtyId = url("/specialty");
  const graph = { "@graph": [
    { "@id": conditionId, "@type": "MedicalCondition" },
    { "@id": termId, "@type": "DefinedTerm", inDefinedTermSet: url("/biomedical-concept-registry") },
    { "@id": tierId, "@type": "DefinedTerm", inDefinedTermSet: { "@id": url("/evidence-assessment-tier-scheme") } },
    { "@id": physicianId, "@type": ["Person", "IndividualPhysician"], medicalSpecialty: { "@id": specialtyId } },
    { "@id": specialtyId, "@type": "MedicalSpecialty" },
  ] };
  const records = [fixture("/new-condition-information", { about: [conditionId] }),
    fixture("/new-clinical-concept", { about: [{ "@id": termId }] }),
    fixture("/new-evidence-information", { about: [{ "@id": tierId }] }),
    fixture("/new-professional-profile", { about: [{ "@id": physicianId }, { "@id": specialtyId }] })];
  const output = applyRouteSchemaPolicy(records, graph, { canonicalUrl, sourcePurposes: [] });
  assert.deepEqual(output.map((record) => record.pageType), ["MedicalWebPage", "MedicalWebPage", "WebPage", "WebPage"]);
  assert.deepEqual(output[0].schemaClassification, { reason: "medical-about", sourceRoleIds: [conditionId] });
  assert.deepEqual(output[1].schemaClassification, { reason: "medical-registry-term", sourceRoleIds: [termId] });
});

test("stale, duplicate or unbounded reviewed purpose declarations stop classification", () => {
  const records = [fixture("/present")];
  assert.throws(() => applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl,
    sourcePurposes: [role("/removed", "WebPage", "professional-biography")] }), /route is missing/);
  assert.throws(() => applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl,
    sourcePurposes: [role("/present", "WebPage", "biography"), role("/present", "MedicalWebPage", "clinical-guide")] }), /Invalid reviewed/);
  assert.throws(() => applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl,
    sourcePurposes: [role("/present", "ContactPage", "clinic-contact")] }), /Invalid reviewed/);
  assert.throws(() => applyRouteSchemaPolicy(records, emptyGraph, { canonicalUrl,
    sourcePurposes: [role("/present", "ImageGallery", "photograph")] }), /Invalid reviewed/);
});

const inputs = readCanonicalInputs();
const home = '<!doctype html><html lang="fa-IR"><head><title>Home</title></head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody, inputs.graph) + '</article></main></body></html>';
const raw = deriveIndependentPages(home, inputs.graph, canonicalUrl, { focusedViews: discoveryPolicy.focusedViews });
const topics = attachTopicNavigation(raw, home, canonicalUrl);
const translated = applyTranslationAlternates(topics, discoveryPolicy.translationGroups, { canonicalUrl, graph: inputs.graph });
freeze(translated);
freeze(inputs.graph);
const actual = applyRouteSchemaPolicy(translated, inputs.graph, { canonicalUrl });
const byPath = new Map(actual.map((record) => [record.path, record]));

test("reviewed source roles classify actual mixed purposes and preserve authored medical questions", () => {
  for (const declaration of reviewedRoutePurposes) assert(byPath.has(declaration.path));
  for (const path of ["/forehead-lines-overactivity-vs-compensation", "/subcision-for-tethered-acne-scars",
    "/can-iraqi-patients-send-photos-before-travel-en", "/clinic-follow-up-after-returning-home",
    "/diagnosis-before-aesthetic-treatment-selection", "/clinic-consultation-treatment-and-follow-up-path"])
    assert.equal(byPath.get(path).pageType, "MedicalWebPage", path);
  for (const path of ["/saeed-ghezelbash-research-education-and-clinical-decisions", "/medical-content-governance",
    "/historical-patient-origin-summary", "/aesthetic-physician-ratings-patient-satisfaction-ckb-iq"])
    assert.equal(byPath.get(path).pageType, "WebPage", path);
  assert(!byPath.has("/media-license-title"));
  const contact = byPath.get("/saeed-ghezelbash-clinic-contact-and-location");
  assert.equal(contact.pageType, "ContactPage");
  const profile = byPath.get("/saeed-ghezelbash");
  assert.equal(profile.pageType, "ProfilePage");
  assert.deepEqual(profile.entityTypes, ["Person", "IndividualPhysician"]);
  for (const language of ["en", "ar-iq", "ckb-iq"]) {
    const identity = byPath.get("/who-is-dr-saeed-ghezelbash-" + language);
    assert.deepEqual(pageFor(identity)["@type"], ["WebPage", "FAQPage"]);
    assert.deepEqual(identity.entityTypes, ["Question"]);
    assert.equal(byPath.get("/dr-saeed-ghezelbash-aesthetic-clinic-information-" + language).pageType, "WebPage");
    for (const slug of ["can-iraqi-patients-send-photos-before-travel",
      "which-facial-cosmetic-surgery-procedures-are-assessed", "can-surgical-and-non-surgical-treatments-be-combined"]) {
      const clinical = byPath.get("/" + slug + "-" + language);
      assert.equal(clinical.pageType, "MedicalWebPage", clinical.path);
      assert.deepEqual(pageFor(clinical)["@type"], ["MedicalWebPage", "FAQPage"]);
      assert.deepEqual(clinical.entityTypes, ["Question"]);
    }
  }
  for (const record of actual.filter((record) => record.entityTypes.includes("VideoObject"))) {
    assert.equal(record.pageType, "WebPage");
    assert.equal(record.schemaClassification.reason, "media-target");
  }
});

test("policy changes only copied page types and internal annotations, preserving every source and visible record", () => {
  assert.deepEqual(actual.map((record) => record.path), translated.map((record) => record.path));
  for (let index = 0; index < actual.length; index++) {
    const before = translated[index], after = actual[index];
    assert.notStrictEqual(after, before);
    assert.notStrictEqual(after.document, before.document);
    assert.notStrictEqual(after.document["@graph"], before.document["@graph"]);
    assert.notStrictEqual(pageFor(after), pageFor(before));
    const { pageType: beforeType, document: beforeDocument, ...beforeFields } = before;
    const { pageType: afterType, document: afterDocument, schemaClassification, ...afterFields } = after;
    assert.deepEqual(afterFields, beforeFields);
    for (let nodeIndex = 0; nodeIndex < beforeDocument["@graph"].length; nodeIndex++) {
      const beforeNode = beforeDocument["@graph"][nodeIndex], afterNode = afterDocument["@graph"][nodeIndex];
      if (beforeNode === pageFor(before)) {
        const { "@type": oldType, ...oldFields } = beforeNode;
        const { "@type": newType, ...newFields } = afterNode;
        assert.deepEqual(newFields, oldFields);
      } else assert.strictEqual(afterNode, beforeNode);
    }
    assertRichResultsDocument(after.document, { primaryPageId: after.canonicalUrl + "#webpage" });
  }
  const authoredHome = inputs.graph["@graph"].find((node) => node["@id"] === canonicalUrl + "webpage");
  assert.equal(authoredHome["@type"], "MedicalWebPage");
});
