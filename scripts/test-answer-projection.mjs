import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  canonicalAnswerHtmlId,
  deriveCanonicalAnswerProjection,
  projectCanonicalAnswerHtml,
  validateProjectedAnswerHtml,
} from "../src/lib/answer-projection.mjs";

const release = JSON.parse(await readFile("src/data/release.json", "utf8"));
const graph = JSON.parse(
  await readFile("src/data/semantic/knowledge-graph.jsonld", "utf8"),
);
const fullProjection = deriveCanonicalAnswerProjection(graph, release);
const projection = {
  ...fullProjection,
  answers: [fullProjection.answers[0]],
};
const record = projection.answers[0];
const escapeAttribute = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("canonical graph answer projects to one visible HTML atom", () => {
  const source = `<h2 id="${escapeAttribute(record.sourceFragment)}">${record.questionText}</h2><p>Context before the answer.</p>`;
  const output = projectCanonicalAnswerHtml(source, projection);
  assert.match(output, new RegExp(`id="${record.htmlId}"`));
  assert.match(output, /class="answer-projection"/);
  assert.match(output, new RegExp(escapeRegExp(record.answerText.slice(0, 24))));
  assert.deepEqual(validateProjectedAnswerHtml(output, projection), {
    answers: 1,
    insertedOrTagged: 1,
    integrity: "PASS",
  });
  assert.equal(
    canonicalAnswerHtmlId(record.answerId, release.canonicalUrl),
    record.htmlId,
  );
});

test("existing exact answer markup is tagged without duplicating visible text", () => {
  const source = `<h2 id="${record.sourceFragment}">${record.questionText}</h2><p>${record.answerText}</p>`;
  const output = projectCanonicalAnswerHtml(source, projection);
  assert.equal(
    (output.match(new RegExp(escapeRegExp(record.answerText.slice(0, 24)), "g")) || []).length,
    1,
  );
  assert.match(output, new RegExp(`id="${record.htmlId}"`));
  assert.doesNotMatch(output, new RegExp(`<p id="${record.htmlId}"[^>]*>[^<]*</p><p`));
});

test("ambiguous duplicate visible answers fail closed", () => {
  const source = `<h2 id="${record.sourceFragment}">${record.questionText}</h2><p>${record.answerText}</p><p>${record.answerText}</p>`;
  assert.throws(
    () => projectCanonicalAnswerHtml(source, projection),
    /Duplicate visible answer text/,
  );
});

test("graph answer topology cannot silently diverge from its questions", () => {
  const changed = structuredClone(graph);
  const question = changed["@graph"].find((node) => node["@id"] === record.questionId);
  question.acceptedAnswer = { "@id": `${release.canonicalUrl}#answer-does-not-exist` };
  assert.throws(
    () => deriveCanonicalAnswerProjection(changed, release),
    /canonical Answer|one-to-one/,
  );
});
