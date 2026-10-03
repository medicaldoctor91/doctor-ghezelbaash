import test from "node:test";
import assert from "node:assert/strict";
import { readerBaseline } from "../validate-reader.mjs";

const fixture = (body) => '<!doctype html><html lang="en" dir="ltr"><head><title>Topic</title>' +
  '<link rel="canonical" href="https://example.test/topic"></head><body><main id="main-content">' +
  '<article class="medical-guide" lang="en" dir="ltr">' + body + '</article></main></body></html>';

test("reader expectation preserves authored text and IDs while omitting only inert scripts and expansion controls", () => {
  const baseline = readerBaseline(fixture('<header id="route-context"><h1 id="route-page-title">Topic title</h1>' +
    '<p><a data-guide-expand href="/">Show complete guide</a> · <a href="/">Doctor homepage</a></p>' +
    '<p data-guide-expand-status>Loading the complete guide</p></header>' +
    '<section id="source-topic"><h2 id="source-question">Source question</h2>' +
    '<p id="source-answer">Visible answer <span class="visually-hidden">semantic qualifier</span>.</p></section>' +
    '<script id="inert-source">{"text":"not reader prose"}</script>'));
  assert.equal(baseline.text, "Topic title · Doctor homepageSource questionVisible answer semantic qualifier.");
  assert.deepEqual(baseline.primaryIds, ["route-context", "route-page-title", "source-answer", "source-question", "source-topic"]);
  assert.equal(baseline.h1, "Topic title");
  assert.equal(baseline.lang, "en");
  assert.equal(baseline.articleLang, "en");
  assert.equal(baseline.canonical, "https://example.test/topic");
  assert.match(baseline.textHash, /^[a-f\d]{64}$/);
});

test("reader expectation rejects an ambiguous primary article or page heading", () => {
  const original = fixture('<h1 id="route-page-title">Topic</h1><p>Authored answer.</p>');
  assert.throws(() => readerBaseline(original.replace("</main>", '<article class="medical-guide">Another article</article></main>')), /one primary article/);
  assert.throws(() => readerBaseline(original.replace("</article>", "<h1>Another title</h1></article>")), /one H1/);
  assert.throws(() => readerBaseline(original.replace("</body>", "<main>Another landmark</main></body>")), /one main/);
});
