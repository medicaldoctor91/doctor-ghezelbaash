import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { URL_ARCHITECTURE } from "../../src/lib/url-architecture.mjs";
import { deriveIndependentPages } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";
import { compileReaderScope, guideSourceSignature, stampGuideSource } from "../lib/reader-scope.mjs";

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const fixture = (inner, head = "<title>Guide</title>") => {
  const html = "<!doctype html><html><head>" + head + '</head><body><main><article class="medical-guide">' + inner + "</article></main></body></html>";
  return { html, ...inspectHtml(html), article: inspectHtml(html).guideArticles[0] };
};
const element = (document, id) => document.elements.find((node) => attr(node, "id") === id);
const span = (node) => ({ start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset });
const resolveContainer = (article, point) => {
  let current = article;
  for (const index of point.path) {
    assert(Number.isInteger(index) && index >= 0 && index < current.childNodes.length, "DOM child path must resolve without skipping text or comments");
    current = current.childNodes[index];
  }
  assert(Number.isInteger(point.offset) && point.offset >= 0 && point.offset <= current.childNodes.length, "Range offset must be a real child boundary");
  return current;
};
// Decode DOM Range coordinates using the actual parsed child at that boundary.
// This deliberately does not rebuild the compiler's source-position map.
const sourceOffsetForPoint = (article, point) => {
  const parent = resolveContainer(article, point);
  return point.offset < parent.childNodes.length
    ? parent.childNodes[point.offset].sourceCodeLocation.startOffset
    : parent.sourceCodeLocation?.endTag?.startOffset ?? parent.childNodes.at(-1).sourceCodeLocation.endOffset;
};
const assertExactRanges = (article, intervals, compiled) => {
  assert.equal(compiled.ranges.length, intervals.length);
  for (const [index, range] of compiled.ranges.entries()) {
    assert.equal(sourceOffsetForPoint(article, range.start), intervals[index].start);
    assert.equal(sourceOffsetForPoint(article, range.end), intervals[index].end);
  }
};

test("reader ranges count whitespace, comments and inert JSON-LD as actual child nodes", () => {
  const document = fixture('\n<!-- context -->\n<script type="application/ld+json">{"name":"source"}</script>\n<section id="region">\n<h2 id="title">عنوان 🤝</h2>\n<p id="answer">Owned answer.</p>\n</section>\n');
  const intervals = [{ start: span(element(document, "title")).start, end: span(element(document, "answer")).end }];
  const compiled = compileReaderScope(document.article, intervals);
  assert.deepEqual(compiled.ranges, [{ start: { path: [5], offset: 1 }, end: { path: [5], offset: 4 } }]);
  assertExactRanges(document.article, intervals, compiled);
  assert.equal(compiled.schemaVersion, 1);
  assert.equal(compiled.sourceSignature, guideSourceSignature(document.article));
  assert.deepEqual(compiled.insertion, compiled.ranges[0].start);
  compiled.insertion.path[0] = 99;
  assert.equal(compiled.ranges[0].start.path[0], 5, "Insertion coordinates must be independently cloned");
});

test("disjoint nested intervals leave the child topic and both surrounding context regions unowned", () => {
  const document = fixture('<p id="before">Before.</p><section id="parent"><h2 id="intro">Parent introduction</h2><p id="first">Owned first.</p><details id="child"><summary>Child topic</summary><p>Child content survives as context.</p></details><p id="last">Owned last.</p></section><p id="after">After.</p>');
  const intervals = [{ start: span(element(document, "intro")).start, end: span(element(document, "first")).end }, span(element(document, "last"))];
  const compiled = compileReaderScope(document.article, intervals);
  assertExactRanges(document.article, intervals, compiled);
  assert.deepEqual(compiled.ranges, [
    { start: { path: [1], offset: 0 }, end: { path: [1], offset: 2 } },
    { start: { path: [1], offset: 3 }, end: { path: [1], offset: 4 } },
  ]);
  const parent = element(document, "parent");
  const ownedNodes = compiled.ranges.flatMap((range) => parent.childNodes.slice(range.start.offset, range.end.offset));
  assert.deepEqual(ownedNodes.map((node) => attr(node, "id")), ["intro", "first", "last"]);
  assert(!ownedNodes.includes(element(document, "child")), "Nested child topic must stay in common context");
  assert(span(element(document, "before")).end <= intervals[0].start);
  assert(span(element(document, "after")).start >= intervals.at(-1).end);
});

test("adjacent source intervals and the complete article body have valid exact boundaries", () => {
  const document = fixture('<p id="first">First.</p><p id="second">Second.</p>');
  const intervals = [span(element(document, "first")), span(element(document, "second"))];
  const compiled = compileReaderScope(document.article, intervals);
  assertExactRanges(document.article, intervals, compiled);
  assert.deepEqual(compiled.ranges, [
    { start: { path: [], offset: 0 }, end: { path: [], offset: 1 } },
    { start: { path: [], offset: 1 }, end: { path: [], offset: 2 } },
  ]);
  const whole = [{ start: document.article.sourceCodeLocation.startTag.endOffset, end: document.article.sourceCodeLocation.endTag.startOffset }];
  assertExactRanges(document.article, whole, compileReaderScope(document.article, whole));
});

test("ranges can cross nested containers without replacing their text with guessed string offsets", () => {
  const document = fixture('<section id="one"><p id="start">Start.</p><p>Middle one.</p></section><!-- separator --><section id="two"><p>Middle two.</p><p id="end">End.</p></section>');
  const intervals = [{ start: span(element(document, "start")).start, end: span(element(document, "end")).end }];
  const compiled = compileReaderScope(document.article, intervals);
  assertExactRanges(document.article, intervals, compiled);
  assert.deepEqual(compiled.ranges, [{ start: { path: [0], offset: 0 }, end: { path: [2], offset: 2 } }]);
});

test("invalid, unsorted, overlapping and out-of-article source intervals are rejected", () => {
  const document = fixture('<p id="first">First.</p><p id="second">Second.</p>');
  const first = span(element(document, "first")), second = span(element(document, "second"));
  const lower = document.article.sourceCodeLocation.startTag.endOffset, upper = document.article.sourceCodeLocation.endTag.startOffset;
  for (const invalid of [
    [], null, [{ start: first.start, end: first.start }], [{ start: first.end, end: first.start }],
    [{ start: lower - 1, end: first.end }], [{ start: second.start, end: upper + 1 }],
    [{ start: first.start + 0.5, end: first.end }], [{ start: String(first.start), end: first.end }],
    [second, first], [first, first], [{ start: first.start, end: second.end }, second],
  ]) assert.throws(() => compileReaderScope(document.article, invalid), /owned source intervals|Invalid or overlapping/);
  assert.throws(() => compileReaderScope(document.article, [{ start: first.start + 1, end: first.end }]), /not an authored DOM boundary/);
  const text = element(document, "first").childNodes[0];
  assert.throws(() => compileReaderScope(document.article, [{ start: text.sourceCodeLocation.startOffset + 1, end: first.end }]), /not an authored DOM boundary/);
});

test("source signatures detect content, child-order, whitespace, comments and inert payload drift", () => {
  const source = '<p>One.</p><!-- note --><script type="application/ld+json">{"name":"source"}</script><p>Two.</p>';
  const signature = guideSourceSignature(fixture(source).article);
  assert.match(signature, /^[a-f\d]{64}$/);
  assert.equal(guideSourceSignature(fixture(source).article), signature);
  for (const changed of [
    source.replace("One.", "Changed."), source.replace("<!-- note -->", "<!-- changed -->"),
    source.replace('"source"', '"updated"'), "\n" + source,
    source.replace('<p>One.</p><!-- note -->', '<!-- note --><p>One.</p>'),
  ]) assert.notEqual(guideSourceSignature(fixture(changed).article), signature);
  assert.equal(guideSourceSignature(fixture(source, "<title>Different metadata</title>").article), signature,
    "Route head metadata does not change the common reader source");
  assert.throws(() => guideSourceSignature({}), /explicitly closed article/);
  assert.throws(() => guideSourceSignature({ sourceCodeLocation: { startTag: { endOffset: 0 } } }), /explicitly closed article/);
});

test("stamping is idempotent and preserves authored source without adding a second article", () => {
  const document = fixture('\n<p id="content">Original source.</p>\n');
  const stamped = stampGuideSource(document.html);
  const inspected = inspectHtml(stamped);
  assert.equal(inspected.guideArticles.length, 1);
  const markers = inspected.elements.filter((node) => node.tagName === "meta" && attr(node, "name") === "guide-source-signature");
  assert.equal(markers.length, 1);
  assert.equal(attr(markers[0], "content"), guideSourceSignature(document.article));
  assert.equal(stampGuideSource(stamped), stamped);
  const article = inspected.guideArticles[0], original = document.article;
  assert.equal(stamped.slice(article.sourceCodeLocation.startOffset, article.sourceCodeLocation.endOffset),
    document.html.slice(original.sourceCodeLocation.startOffset, original.sourceCodeLocation.endOffset));
});

test("stamping rejects stale signatures and duplicate markers, including matching duplicates", () => {
  const document = fixture("<p>Original.</p>");
  const stamped = stampGuideSource(document.html);
  assert.throws(() => stampGuideSource(stamped.replace("Original.", "Changed.")), /Conflicting compiled guide source signature/);
  const marker = '<meta name="guide-source-signature" content="' + guideSourceSignature(document.article) + '">';
  assert.throws(() => stampGuideSource(stamped.replace("</head>", marker + "</head>")), /Conflicting compiled guide source signature/);
  assert.throws(() => stampGuideSource(document.html.replace("</head>", '<meta name="guide-source-signature" content="stale"></head>')), /Conflicting compiled guide source signature/);
  assert.throws(() => stampGuideSource('<article class="medical-guide"><p>Original.</p></article>'), /document head/);
  assert.throws(() => stampGuideSource("<html><head></head><body></body></html>"), /explicitly closed article/);
});

// These checks decode the published coordinates back into original HTML. They
// neither invoke the range compiler again nor use its source-position map.
const inputs = readCanonicalInputs();
const corpusHtml = '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title>' +
  '<link rel="canonical" href="' + inputs.lifecycle.canonicalUrl + '"></head><body><main>' +
  '<article class="medical-guide">' + renderCanonicalPageHtml(inputs.pageBody, inputs.graph) +
  "</article></main></body></html>";
const corpus = inspectHtml(corpusHtml);
const corpusArticle = corpus.guideArticles[0];
const records = deriveIndependentPages(corpusHtml, inputs.graph, inputs.lifecycle.canonicalUrl,
  { focusedViews: discoveryPolicy.focusedViews });
const originalIntervals = (record) => record.readerScope.ranges.map((range) => ({
  start: sourceOffsetForPoint(corpusArticle, range.start),
  end: sourceOffsetForPoint(corpusArticle, range.end),
}));
const prose = (html) => {
  const readable = (node) => {
    if (["script", "style", "template"].includes(node.tagName)) return "";
    if (node.nodeName === "#text") return node.value;
    return (node.childNodes || []).map(readable).join(" ");
  };
  return readable(parseFragment(html)).normalize("NFC").replace(/\s+/gu, " ").trim();
};

test("every canonical focused document owns exactly the prose selected by its authored reader ranges", () => {
  const resources = URL_ARCHITECTURE.resources.filter((resource) => resource.path !== "/");
  assert.equal(records.length, 71);
  assert.deepEqual(records.map((record) => record.path), resources.map((resource) => resource.path));
  const signature = guideSourceSignature(corpusArticle);
  const lower = corpusArticle.sourceCodeLocation.startTag.endOffset;
  const upper = corpusArticle.sourceCodeLocation.endTag.startOffset;
  for (const record of records) {
    assert.equal(record.readerScope.sourceSignature, signature, record.path);
    const intervals = originalIntervals(record);
    let previous = lower;
    for (const interval of intervals) {
      assert(interval.start >= previous && interval.start < interval.end && interval.end <= upper,
        "Nonoverlapping authored boundaries: " + record.path);
      previous = interval.end;
    }
    const selected = intervals.map(({ start, end }) => corpusHtml.slice(start, end)).join("");
    assert.equal(prose(selected), prose(record.bodyHtml), "Owned source prose: " + record.path);
    assert(prose(selected), "Each focused route must select readable prose: " + record.path);
    assert.deepEqual(record.readerScope.insertion, record.readerScope.ranges[0].start, record.path);
  }
});

test("actual parent reader ranges preserve retained nested topics in their surrounding context", () => {
  const parent = records.find((record) => record.path === "/botox");
  assert(parent);
  const intervals = originalIntervals(parent);
  assert(intervals.length > 1, "The parent must have disjoint owned regions after nested topics are removed");
  for (const id of ["upper-face-botox", "botox-pre-injection-clinical-assessment"]) {
    const node = element(corpus, id);
    assert(node, "Expected actual nested source topic: " + id);
    const child = span(node);
    assert(intervals.every((interval) => interval.end <= child.start || interval.start >= child.end),
      "Nested child source must remain outside the parent primary scope: " + id);
    assert(!inspectHtml(parent.bodyHtml, { wrapMain: true }).ids.includes(id),
      "Nested child must not be copied into the parent primary body: " + id);
    assert(records.some((record) => inspectHtml(record.bodyHtml, { wrapMain: true }).ids.includes(id)),
      "Retained nested topic must have its own readable primary body: " + id);
  }
});

test("historical patient origin selects its empty alias and precisely its first authored disclosure", () => {
  const record = records.find((record) => record.path === "/historical-patient-origin-summary");
  assert(record);
  const alias = element(corpus, "historical-patient-origin-summary");
  assert.equal(prose(corpusHtml.slice(span(alias).start, span(alias).end)), "");
  const disclosure = corpus.elements.find((node) => node.tagName === "details" &&
    node.sourceCodeLocation.startOffset > alias.sourceCodeLocation.endOffset);
  assert(disclosure, "The historical source must have an authored disclosure following its alias");
  assert.deepEqual(originalIntervals(record), [span(alias), span(disclosure)]);
  assert.equal(prose(record.bodyHtml), prose(corpusHtml.slice(span(disclosure).start, span(disclosure).end)));
});
