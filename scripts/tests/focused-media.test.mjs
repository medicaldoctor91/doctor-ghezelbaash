import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveIndependentPages, renderIndependentPage } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";
import { projectFocusedMedia } from "../lib/focused-media.mjs";

const inputs = readCanonicalInputs();
const canonicalUrl = inputs.lifecycle.canonicalUrl;
const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const hero = inputs.pageFrontmatter.heroPreload;
const home = '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><meta name="description" content="Home">' +
  '<link rel="canonical" href="' + canonicalUrl + '">' +
  '<link rel="preload" as="image" fetchpriority="high" href="' + escape(hero.href) +
  '" imagesrcset="' + escape(hero.srcset) + '" imagesizes="' + escape(hero.sizes) + '">' +
  '</head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody) + '</article></main></body></html>';
const pages = deriveIndependentPages(home, inputs.graph, canonicalUrl);
const articleHtml = (html) => {
  const location = inspectHtml(html).guideArticles[0].sourceCodeLocation;
  return html.slice(location.startOffset, location.endOffset);
};
const imagePreloads = (html) => inspectHtml(html).elements.filter((node) =>
  node.tagName === "link" && attr(node, "rel") === "preload" && attr(node, "as") === "image");
const focused = (body, head = "") => '<!doctype html><html data-route-view="focused"><head>' + head +
  '</head><body><main><article class="medical-guide">' + body + '</article></main></body></html>';

test("actual text and English topic entries do not download the unrelated homepage portrait", () => {
  const botox = pages.find((page) => page.path === "/botox");
  const english = pages.find((page) => page.lang === "en");
  assert(botox && english);
  for (const page of [botox, english]) {
    const rendered = renderIndependentPage(home, page);
    const html = projectFocusedMedia(rendered, page.canonicalUrl);
    assert.equal(imagePreloads(html).length, 0);
    assert.equal(articleHtml(html), articleHtml(rendered));
  }
});

test("the actual portrait entry retains the matching responsive preload", () => {
  const page = pages.find((page) => page.path === "/image-saeed-ghezelbash-portrait-master");
  assert(page);
  const rendered = renderIndependentPage(home, page);
  const html = projectFocusedMedia(rendered, page.canonicalUrl);
  const preloads = imagePreloads(html);
  assert.equal(preloads.length, 1);
  assert.equal(attr(preloads[0], "href"), hero.href);
  assert.equal(attr(preloads[0], "imagesrcset"), hero.srcset);
  assert.equal(articleHtml(html), articleHtml(rendered));
});

test("real focused video entries expose their authored poster without requiring JavaScript", () => {
  const page = pages.find((page) => page.path === "/jalupro-vs-profhilo-selection");
  assert(page && page.videos.length === 1);
  const html = projectFocusedMedia(renderIndependentPage(home, page), page.canonicalUrl);
  assert.equal(imagePreloads(html).length, 0);
  const videos = inspectHtml(html).videos;
  assert.equal(videos.length, 1);
  assert.equal(new URL(attr(videos[0], "poster"), canonicalUrl).href, page.videos[0].thumbnailUrl);
  assert.equal(attr(videos[0], "poster"), attr(videos[0], "data-poster"));
  assert.equal(attr(videos[0], "preload"), "none");
});

test("responsive sources match by URL, while text mentions and unrelated non-image preloads do not", () => {
  const head = '<link rel="preload" as="image" href="/unused.avif" imagesrcset="/small.avif 1x, /large.avif 2x">' +
    '<link rel="preload" as="image" href="/mentioned.webp">' +
    '<link rel="preload" as="font" href="/font.woff2" crossorigin>' +
    '<link rel="preload" as="style" href="/style.css">';
  const body = '<picture><source srcset="' + canonicalUrl + 'large.avif 2x" type="image/avif">' +
    '<img src="/fallback.webp" alt="Portrait"></picture><p>/mentioned.webp is just text.</p>';
  const html = projectFocusedMedia(focused(body, head), canonicalUrl);
  assert.equal(imagePreloads(html).length, 1);
  assert.equal(attr(imagePreloads(html)[0], "href"), "/unused.avif");
  assert(html.includes('as="font" href="/font.woff2"'));
  assert(html.includes('as="style" href="/style.css"'));
  assert(html.includes(body));
});

test("poster promotion preserves author choices, escapes attributes, and adds no external request", () => {
  const body = '<video id="local" data-poster="/poster.webp?one=1&amp;two=2" preload="none"></video>' +
    '<video id="selected" poster="/selected.webp" data-poster="/deferred.webp"></video>' +
    '<video id="external" data-poster="https://elsewhere.test/poster.webp"></video>';
  const html = projectFocusedMedia(focused(body), canonicalUrl);
  const byId = new Map(inspectHtml(html).videos.map((node) => [attr(node, "id"), node]));
  assert.equal(attr(byId.get("local"), "poster"), "/poster.webp?one=1&two=2");
  assert(html.includes('poster="/poster.webp?one=1&amp;two=2"'));
  assert.equal(attr(byId.get("selected"), "poster"), "/selected.webp");
  assert.equal(attr(byId.get("external"), "poster"), undefined);
  assert.equal(projectFocusedMedia(html, canonicalUrl), html, "Projection must be idempotent");
});

test("focused media edits preserve exact scripts, styles and authored text", () => {
  const script = '<script id="runtime">const value = "unchanged < > &";</script>';
  const data = '<script type="application/ld+json">{"name":"unchanged","url":"/absent.webp"}</script>';
  const style = '<style>video { max-width: 100%; }</style>';
  const body = '<h5 id="topic">متن پزشکی بدون تغییر</h5><video data-poster="/poster.webp"></video>';
  const html = projectFocusedMedia(focused(body, '<link rel="preload" as="image" href="/absent.webp">' +
    script + data + style), canonicalUrl);
  for (const block of [script, data, style, '<h5 id="topic">متن پزشکی بدون تغییر</h5>']) assert(html.includes(block));
  assert.equal(imagePreloads(html).length, 0);
});

test("comprehensive homepage bytes and lazy poster policy remain unchanged", () => {
  assert.equal(projectFocusedMedia(home, canonicalUrl), home);
  const homepageVideos = inspectHtml(home).videos;
  assert(homepageVideos.length > 0);
  assert(homepageVideos.every((node) => attr(node, "poster") === undefined && attr(node, "data-poster")));
});
