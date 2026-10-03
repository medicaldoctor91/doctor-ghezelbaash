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
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { documentPolicy } from "../../src/config/site-policy.mjs";

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

test("mixed-language captions preserve summary, language-group IDs and inline links", () => {
  const blocks = buildRetrievalBlocks(`
    <h1 id="guide">Guide</h1>
    <figcaption id="caption">
      <details><summary id="caption-title">عنوان فارسی تصویر</summary>
        <div id="physician-identity" lang="en"><strong>Professional identity</strong>
          · <a href="https://www.wikidata.org/wiki/Q1">Wikidata: Q1</a></div>
        <p>توضیح فارسی پس از هویت</p>
      </details>
    </figcaption>
  `, options);
  const captionBlocks = blocks.slice(1);
  assert.deepEqual(captionBlocks.map(({ lang, id }) => ({ lang, id })), [
    { lang: "fa-IR", id: "caption-title" },
    { lang: "en", id: "physician-identity" },
    { lang: "fa-IR", id: "caption" },
  ]);
  assert.equal(captionBlocks[0].text, "عنوان فارسی تصویر");
  assert.equal(captionBlocks[1].text,
    "**Professional identity**\n· [Wikidata: Q1](https://www.wikidata.org/wiki/Q1)");
  assert.equal(captionBlocks[2].text, "توضیح فارسی پس از هویت");
  const combined = captionBlocks.map((block) => block.text).join("\n");
  for (const text of ["عنوان فارسی تصویر", "Professional identity", "Wikidata: Q1", "توضیح فارسی پس از هویت"])
    assert.equal(combined.split(text).length - 1, 1, text);
  const sections = buildRetrievalSections(blocks);
  assert.deepEqual(sections.map(({ id, lang }) => ({ id, lang })), [
    { id: "guide", lang: "fa-IR" },
    { id: "physician-identity", lang: "en" },
    { id: "caption", lang: "fa-IR" },
  ]);
});

test("nested language prose keeps formatting and returns to its original heading source", () => {
  const blocks = buildRetrievalBlocks(`
    <h2 id="topic">موضوع</h2>
    <p>شروع فارسی <a href="/profile"><em><span id="english-term" lang="en">English identity</span></em></a> پایان فارسی</p>
    <p>ادامه فارسی</p>
  `, options);
  assert.deepEqual(blocks.slice(1).map((block) => block.lang), ["fa-IR", "en", "fa-IR", "fa-IR"]);
  assert.equal(blocks[2].id, "english-term");
  assert.equal(blocks[2].text, "[*English identity*](https://example.test/profile)");
  const sections = buildRetrievalSections(blocks);
  assert.deepEqual(sections.map(({ id, lang }) => ({ id, lang })), [
    { id: "topic", lang: "fa-IR" },
    { id: "english-term", lang: "en" },
    { id: "topic", lang: "fa-IR" },
  ]);
  assert.equal(sections[2].parts.map((part) => part.text).join("\n"), "پایان فارسی\nادامه فارسی");
});

test("bare clinical prose between paragraphs retains exact text, language and heading source", () => {
  const bareText = "متن بالینی بدون پاراگراف";
  const blocks = buildRetrievalBlocks(`
    <div class="render-chunk" lang="fa-IR">
      <h4 id="clinical-sequence">ترتیب درمان</h4><p>متن قبل</p>
      ${bareText} <a href="/evidence">منبع بالینی</a> و ادامه.
      <p>متن بعد</p>
    </div>
  `, options);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[2].lang, "fa-IR");
  assert.equal(blocks[2].text,
    `${bareText} [منبع بالینی](https://example.test/evidence) و ادامه.`);
  const sections = buildRetrievalSections(blocks);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "clinical-sequence");
  assert.equal(sections[0].parts[1].text, blocks[2].text);
});

test("mixed-language lists keep one bullet per group and ignore empty formatting runs", () => {
  const blocks = buildRetrievalBlocks(`
    <h2 id="topic">موضوع</h2>
    <ul><li>مقدمه <strong> <span lang="en" id="term">English term</span> </strong> پایان</li></ul>
  `, options).slice(1);
  assert.deepEqual(blocks.map((block) => renderRetrievalBlock(block)), [
    "- مقدمه", "- **English term**", "- پایان",
  ]);
});

test("canonical retrieval preserves all authored headings and exact answer sources", async () => {
  const context = await loadProjectionContext();
  const blocks = buildRetrievalBlocks(context.pageBody, {
    canonicalUrl: context.release.canonicalUrl,
    language: documentPolicy.lang,
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
    const identityRecords = records.filter((record) =>
      record.includes("Professional identity and identifiers: Dr. Saeed Ghezelbash"));
    assert.equal(identityRecords.length, 1);
    assert.ok(identityRecords[0].includes("LANGUAGE: en\n"));
    assert.ok(identityRecords[0].includes(`ANCHOR: ${context.release.canonicalUrl}#verified-physician-identity-core\n`));
    assert.ok(markdown.includes("دکتر سعید قزلباش در محیط بالینی"));
    assert.ok(markdown.includes("**Professional identity and identifiers: Dr. Saeed Ghezelbash**"));
    assert.ok(markdown.includes(`<!-- anchor: ${context.release.canonicalUrl}#verified-physician-identity-core -->`));
    const bareClinicalText = "اگر بعد از جوش فقط رنگ مانده و سطح پوست صاف است، مسیر درمان لک مطرح می‌شود. اگر سطح پوست فرورفته، لبه دار، چسبیده یا ناهموار است، موضوع دیگر فقط لک نیست و در ارزیابی اسکار باید جداگانه بررسی شود.";
    assert.ok(markdown.includes(bareClinicalText));
    const bareClinicalRecords = records.filter((record) => record.includes(bareClinicalText));
    assert.equal(bareClinicalRecords.length, 1);
    assert.ok(bareClinicalRecords[0].includes("LANGUAGE: fa-IR\n"));
    assert.ok(bareClinicalRecords[0].includes(`ANCHOR: ${context.release.canonicalUrl}acne-pigmentation-scar-treatment-sequence\n`));
    const cleanPaths = new Set(contentRoutePaths(context.pageBody, context.release.canonicalUrl));
    const sourceIds = new Set();
    const collectIds = (node) => {
      const id = node.attrs?.find((attribute) => attribute.name === "id")?.value;
      if (id) sourceIds.add(id);
      for (const child of node.childNodes ?? []) collectIds(child);
    };
    collectIds(parseFragment(context.pageBody));
    const anchors = [
      ...records.map((record) => record.match(/^ANCHOR: (.+)$/m)[1]),
      ...[...markdown.matchAll(/<!-- anchor: ([^ ]+) -->/g)].map((match) => match[1]),
    ];
    for (const anchor of anchors) {
      const url = new URL(anchor);
      assert.equal(url.origin, new URL(context.release.canonicalUrl).origin);
      if (url.hash) {
        assert.equal(url.pathname, new URL(context.release.canonicalUrl).pathname);
        assert.ok(sourceIds.has(decodeURIComponent(url.hash.slice(1))), anchor);
      } else assert.ok(cleanPaths.has(url.pathname), anchor);
    }
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
