import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  canonicalAnswerHtmlId,
  deriveCanonicalAnswerProjection,
  deriveCanonicalAnswerTopology,
  extractVisibleAnswerTexts,
  normalizeProjectedText,
  validateProjectedAnswerHtml,
} from "../src/lib/answer-projection.mjs";
import { assembleCanonicalContent } from "./lib/assemble-content.mjs";

const release = JSON.parse(await readFile("src/data/release.json", "utf8"));
const graph = JSON.parse(await readFile("src/data/semantic/knowledge-graph.jsonld", "utf8"));
const fullProjection = deriveCanonicalAnswerProjection(graph, release);
const record = fullProjection.answers[0];
const projection = { ...fullProjection, answers: [record] };
const escapeText = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const heading = `<h2 id="${escapeText(record.sourceFragment)}">${escapeText(record.questionText)}</h2>`;
const answer = `<p class="answer-projection" id="${escapeText(record.htmlId)}">${escapeText(record.answerText)}</p>`;

test("authored answer identity and text agree with graph semantics", () => {
  assert.deepEqual(validateProjectedAnswerHtml(heading + answer, projection), {
    answers: 1, authoredAnswers: 1, integrity: "PASS",
  });
  assert.equal(canonicalAnswerHtmlId(record.answerId, release.canonicalUrl), record.htmlId);
});

test("the complete authored page passes before and after assembly", async () => {
  const source = await readFile("src/content-source/page.md", "utf8");
  assert.equal(validateProjectedAnswerHtml(source, fullProjection).authoredAnswers, fullProjection.answers.length);
  const assembled = await assembleCanonicalContent({ graph });
  assert.equal(validateProjectedAnswerHtml(assembled.content, fullProjection).authoredAnswers, fullProjection.answers.length);
});

test("page wording is the authored source for the graph Answer.text mirror", async () => {
  const source = await readFile("src/content-source/page.md", "utf8");
  const withoutText = structuredClone(graph);
  for (const node of withoutText["@graph"])
    if ([node?.["@type"]].flat().includes("Answer")) delete node.text;
  const topology = deriveCanonicalAnswerTopology(withoutText, release);
  const visible = extractVisibleAnswerTexts(source, topology);
  assert.equal(visible.answers.length, fullProjection.answers.length);
  const visibleById = new Map(visible.answers.map((item) => [item.answerId, item.text]));
  for (const item of fullProjection.answers)
    assert.equal(visibleById.get(item.answerId), normalizeProjectedText(item.answerText));
  assert.throws(
    () => deriveCanonicalAnswerProjection(withoutText, release),
    /lacks synchronized text/,
  );
});

test("missing text and untagged answers fail instead of being synthesized or patched", () => {
  for (const source of [heading, heading + `<p>${escapeText(record.answerText)}</p>`])
    assert.throws(() => validateProjectedAnswerHtml(source, projection), /cardinality/);
  assert.throws(() => validateProjectedAnswerHtml(heading + answer.replace(escapeText(record.answerText), "Changed answer"), projection), /text drift/);
});

test("duplicate answer IDs cannot hide on an element without the answer class", () => {
  assert.throws(() => validateProjectedAnswerHtml(heading + answer + `<div id="${record.htmlId}"></div>`, projection), /exactly once/);
  assert.throws(() => validateProjectedAnswerHtml(heading + answer + answer, projection), /cardinality/);
});

test("answers belong to exactly one question region", () => {
  assert.throws(() => validateProjectedAnswerHtml(heading + heading + answer, projection), /exactly one question heading/);
  assert.throws(() => validateProjectedAnswerHtml(answer + heading, projection), /outside its question region/);
  assert.throws(() => validateProjectedAnswerHtml(heading + '<h2 id="next-question">Another question</h2>' + answer, projection), /outside its question region/);
  assert.throws(() => validateProjectedAnswerHtml(heading + answer.replaceAll('<p ', '<div ').replace('</p>', '</div>'), projection), /answer block/);
});

test("graph answer topology cannot silently diverge from its questions", () => {
  const changed = structuredClone(graph);
  const question = changed["@graph"].find((node) => node["@id"] === record.questionId);
  question.acceptedAnswer = { "@id": `${release.canonicalUrl}#answer-does-not-exist` };
  assert.throws(() => deriveCanonicalAnswerProjection(changed, release), /canonical Answer|one-to-one/);
});
