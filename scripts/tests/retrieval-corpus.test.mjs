import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseFragment } from "parse5";
import {
  buildRetrievalBlocks,
  buildRetrievalSections,
  compileRetrievalCorpus,
  renderRetrievalBlock,
} from "../lib/projections/retrieval-corpus.mjs";
import { loadProjectionContext } from "../lib/projection-context.mjs";
import { deriveCanonicalAnswerProjection } from "../../src/lib/answer-projection.mjs";

const canonicalUrl = "https://example.test/";
const options = { canonicalUrl, language: "fa-IR" };
const sectionsFor = (html) =>
  buildRetrievalSections(buildRetrievalBlocks(html, options));

test("H5 and H6 topics retain their source IDs, aliases and heading ancestry", () => {
  const sections = sectionsFor(`
    <h1 id="guide">Guide</h1>
    <h4 id="parent">Parent</h4><p>Parent body.</p>
    <h5 id="topic" data-retrieval-alias="topic aliases">Topic</h5>
    <p id="answer-topic" class="answer-projection">Exact answer.</p>
    <h6 id="detail">Detail</h6><p>Detail body.</p>
    <h5 id="sibling">Sibling</h5><p>Sibling body.</p>
  `);
  assert.deepEqual(sections.map((section) => section.id),
    ["parent", "topic", "detail", "sibling"]);
  const topic = sections[1];
  assert.equal(topic.level, 5);
  assert.equal(topic.retrievalAlias, "topic aliases");
  assert.deepEqual(topic.headingPath.map((heading) => heading.id),
    ["guide", "parent", "topic"]);
  assert.deepEqual(topic.parts,
    [{ text: "Exact answer.", atomic: true, answerId: "answer-topic" }]);
  assert.deepEqual(sections[2].headingPath.map((heading) => heading.id),
    ["guide", "parent", "topic", "detail"]);
  assert.deepEqual(sections[3].headingPath.map((heading) => heading.id),
    ["guide", "parent", "sibling"]);
});

test("nested summary headings preserve topic anchors and inherited languages once", () => {
  for (const language of ["en", "ar-IQ", "ckb-IQ"]) {
    const blocks = buildRetrievalBlocks(`
      <details lang="${language}">
        <summary id="summary"><h2 id="topic">Topic title</h2></summary>
        <p>Topic body.</p>
      </details>
    `, options);
    assert.deepEqual(blocks.map((block) => block.tag), ["h2", "p"]);
    assert.equal(blocks[0].id, "topic");
    assert.equal(blocks[0].lang, language);
    assert.equal(blocks[1].lang, language);
    assert.equal(blocks.filter((block) => block.text === "Topic title").length, 1);
    const [section] = buildRetrievalSections(blocks);
    assert.equal(section.id, "topic");
    assert.equal(section.title, "Topic title");
    assert.equal(section.lang, language);
    assert.equal(section.parts[0].text, "Topic body.");
  }
});

test("plain summary labels and language transitions retain visible context", () => {
  const blocks = buildRetrievalBlocks(`
    <h1 id="guide">Guide</h1><p>Main body.</p>
    <details lang="en"><summary id="english">English overview</summary>
      <p>English body.</p>
    </details>
  `, options);
  const summary = blocks.find((block) => block.tag === "summary");
  assert.equal(renderRetrievalBlock(summary), "**English overview**");
  const sections = buildRetrievalSections(blocks);
  assert.equal(sections[0].id, "guide");
  assert.equal(sections[1].id, "english");
  assert.equal(sections[1].lang, "en");
  assert.deepEqual(sections[1].headingPath.map((heading) => heading.id), ["guide"]);
  assert.throws(() => sectionsFor("<h5>Unaddressable</h5><p>Body.</p>"),
    /heading lacks an ID/);
});

test("canonical retrieval preserves all authored headings and exact answer sources", async () => {
  const context = await loadProjectionContext();
  const blocks = buildRetrievalBlocks(context.pageBody, {
    canonicalUrl: context.release.canonicalUrl,
    language: context.pageFrontmatter.lang,
  });
  const authoredIds = [], authoredH5Ids = [];
  const walk = (node) => {
    if (["script", "style", "template"].includes(node.tagName)) return;
    if (/^h[1-6]$/.test(node.tagName ?? "")) {
      const id = node.attrs.find((attribute) => attribute.name === "id").value;
      authoredIds.push(id);
      if (node.tagName === "h5") authoredH5Ids.push(id);
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(parseFragment(context.pageBody));
  const headingBlocks = blocks.filter((block) => /^h[1-6]$/.test(block.tag));
  assert.ok(authoredH5Ids.includes("botox-clinical-assessment-checklist"));
  assert.deepEqual(headingBlocks.filter((block) => block.tag === "h5").map((block) => block.id), authoredH5Ids);
  assert.deepEqual(headingBlocks.map((block) => block.id), authoredIds);

  const sections = buildRetrievalSections(blocks);
  const bindings = new Map();
  for (const section of sections)
    for (const part of section.parts)
      if (part.answerId) {
        assert.ok(!bindings.has(part.answerId), "An answer must occur once");
        bindings.set(part.answerId, new URL(section.id, context.release.canonicalUrl).href);
      }
  const projection = deriveCanonicalAnswerProjection(context.graph, context.release);
  assert.ok(projection.answers.length > 0);
  assert.equal(bindings.size, projection.answers.length);
  for (const answer of projection.answers)
    assert.equal(bindings.get(answer.htmlId), answer.sourceUrl, answer.answerId);
});

test("passage export carries topic ancestry, graph bindings and canonical answer provenance", async () => {
  const context = await loadProjectionContext();
  const workspace = await mkdtemp(path.join(tmpdir(), "retrieval-corpus-"));
  try {
    // Exercise the passage compiler separately from answer-record serialization.
    await compileRetrievalCorpus({ ...context, projections: workspace }, { answerRecords: [] });
    const full = await readFile(path.join(workspace, "llms-full.txt"), "utf8");
    const markdown = await readFile(path.join(workspace, "index.md"), "utf8");
    const records = [...full.matchAll(/\[PASSAGE\]\n([\s\S]*?)\n\[\/PASSAGE\]/g)]
      .map((match) => match[1]);
    const projection = deriveCanonicalAnswerProjection(context.graph, context.release);
    for (const answer of projection.answers) {
      const matches = records.filter((record) =>
        record.includes(`ANSWER_IDS: ${answer.answerId}\n`));
      assert.equal(matches.length, 1, answer.answerId);
      assert.ok(matches[0].includes(`ANCHOR: ${answer.sourceUrl}\n`), answer.answerId);
      assert.ok(matches[0].includes(answer.questionId), answer.answerId);
      assert.ok(matches[0].includes("HEADING_PATH: "), answer.answerId);
      assert.ok(matches[0].includes(`ENTITY_IDS: ${context.release.primaryEntity.id}`), answer.answerId);
    }
    for (const suffix of ["ar-iq", "en", "ckb-iq"]) {
      const id = `best-facial-aesthetic-doctor-cosmetic-surgery-kermanshah-iran-${suffix}`;
      assert.ok(markdown.includes(`<!-- anchor: ${context.release.canonicalUrl}${id} -->`));
    }
    const topicUrl = `${context.release.canonicalUrl}botox-clinical-assessment-checklist`;
    assert.ok(records.some((record) => record.includes(`LEVEL: H5\n`) &&
      record.includes(`ANCHOR: ${topicUrl}\n`)));
    const provenance = JSON.parse(await readFile(path.join(workspace, "provenance.jsonld"), "utf8"));
    for (const answer of projection.answers)
      assert.ok(provenance["@graph"].some((node) =>
        node.url === answer.sourceUrl &&
        [node.isBasedOn].flat().some((reference) => reference?.["@id"] === answer.answerId)),
      answer.answerId);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
