import test from "node:test";
import assert from "node:assert/strict";
import { applyTranslationAlternates } from "../lib/translation-alternates.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/";
const members = [
  { path: "/who-en", lang: "en", hreflang: "en" },
  { path: "/who-ar-iq", lang: "ar-IQ", hreflang: "ar-IQ" },
  { path: "/who-ckb-iq", lang: "ckb-IQ", hreflang: "ku-IQ" },
];
function fixture() {
  const records = members.map((member) => ({
    path: member.path, canonicalUrl: canonicalUrl.slice(0, -1) + member.path, lang: member.lang,
    entityId: canonicalUrl + "question-" + member.path.slice(1),
  }));
  records.push({ path: "/unrelated", canonicalUrl: canonicalUrl + "unrelated", lang: "fa-IR", entityId: canonicalUrl + "other" });
  const graph = { "@graph": members.flatMap((member, index) => [
    { "@id": records[index].entityId, "@type": "Question", url: records[index].canonicalUrl, inLanguage: member.lang,
      acceptedAnswer: { "@id": canonicalUrl + "answer-" + index } },
    { "@id": canonicalUrl + "answer-" + index, "@type": "Answer", text: "An authored answer", inLanguage: member.lang },
  ]) };
  return { records, graph, groups: [{ members: members.map((member) => ({ ...member })) }] };
}
const apply = ({ records, groups, graph }) => applyTranslationAlternates(records, groups, { canonicalUrl, graph });
test("reviewed translations have self and reciprocal alternates without mutating source records", () => {
  const input = fixture(), before = structuredClone(input), records = apply(input);
  assert.deepEqual(input, before);
  const expected = members.map((member) => ({ href: canonicalUrl.slice(0, -1) + member.path, hrefLang: member.hreflang }));
  for (const record of records.slice(0, 3)) assert.deepEqual(record.alternates, expected);
  assert.deepEqual(records[3].alternates, []);
  assert.equal(records[2].lang, "ckb-IQ");
  records[0].alternates[0].hrefLang = "changed";
  assert.equal(records[1].alternates[0].hrefLang, "en");
});
test("missing routes, homepage defaults, overlapping groups and mismatched canonicals cannot become translations", () => {
  for (const change of [
    (input) => { input.groups[0].members[0].path = "/missing"; },
    (input) => { input.groups[0].members[0].path = "/"; },
    (input) => { input.groups.push(structuredClone(input.groups[0])); },
    (input) => { input.records[0].canonicalUrl = canonicalUrl + "different"; },
    (input) => { input.records.push({ ...input.records[0] }); },
    (input) => { input.groups[0].members = [input.groups[0].members[0]]; },
  ]) { const input = fixture(); change(input); assert.throws(() => apply(input), /Translation/); }
});
test("declared languages must match both visible content and supported Google hreflang", () => {
  for (const change of [
    (input) => { input.groups[0].members[0].lang = "fa-IR"; },
    (input) => { input.groups[0].members[2].hreflang = "ckb-IQ"; },
    (input) => { input.groups[0].members[0].hreflang = "x-default"; },
    (input) => { input.graph["@graph"][0].inLanguage = "fa-IR"; },
    (input) => { input.graph["@graph"][1].inLanguage = "fa-IR"; },
  ]) { const input = fixture(); change(input); assert.throws(() => apply(input), /Translation/); }
});
test("source Question identity and authored accepted Answers are required, without similarity inference", () => {
  for (const change of [
    (input) => { input.records[0].entityId = canonicalUrl + "unrelated"; },
    (input) => { input.graph["@graph"][0]["@type"] = "Article"; },
    (input) => { input.graph["@graph"][1].text = ""; },
    (input) => { input.graph["@graph"][0].acceptedAnswer = { "@id": canonicalUrl + "missing" }; },
    (input) => { input.graph["@graph"].push({ ...input.graph["@graph"][0], "@id": canonicalUrl + "duplicate-question" }); },
  ]) { const input = fixture(); change(input); assert.throws(() => apply(input), /Translation/); }
  const input = fixture();
  assert(apply({ ...input, groups: [] }).every((record) => record.alternates.length === 0));
});

function guideFixture() {
  const input = fixture();
  input.groups[0].kind = "equivalent-guide";
  input.records = input.records.map((record, index) => index < members.length ? {
    ...record, entityId: canonicalUrl + "guide-content-" + index,
    htmlId: ["english-complete-section", "arabic-complete-section", "sorani-complete-section"][index],
    bodyHtml: '<section><h2>Reviewed complete guide</h2><p>Authored assessment, identity and practical information.</p></section>',
  } : record);
  input.graph = { "@graph": input.records.slice(0, members.length).map((record, index) => ({
    "@id": record.entityId, "@type": "WebPageElement", url: record.canonicalUrl,
    inLanguage: members[index].lang,
  })) };
  return input;
}

test("explicitly reviewed complete guide equivalents retain full language scopes without needing Question-primary pages", () => {
  const input = guideFixture(), before = structuredClone(input), records = apply(input);
  assert.deepEqual(input, before);
  for (let index = 0; index < members.length; index++) {
    assert.equal(records[index].bodyHtml, input.records[index].bodyHtml);
    assert.equal(records[index].htmlId, input.records[index].htmlId);
    assert.deepEqual(records[index].alternates, members.map((member) => ({
      href: new URL(member.path, canonicalUrl).href, hrefLang: member.hreflang,
    })));
  }
  assert.deepEqual(records.at(-1).alternates, []);
  const undeclared = guideFixture();
  undeclared.groups = [];
  assert(apply(undeclared).every((record) => record.alternates.length === 0));
});

test("equivalent guide declarations reject missing authored identities, wrong source languages and empty initial content", () => {
  for (const change of [
    (input) => { input.records[0].entityId = canonicalUrl + "unpublished-guide"; },
    (input) => { input.graph["@graph"][0].inLanguage = "fa-IR"; },
    (input) => { input.records[0].bodyHtml = ""; },
    (input) => { delete input.groups[0].kind; },
  ]) { const input = guideFixture(); change(input); assert.throws(() => apply(input), /Translation/); }
});
