import assert from "node:assert/strict";
import test from "node:test";
import { renderDiscoverySitemap } from "../lib/discovery-sitemap.mjs";

const video = {
  thumbnailUrl: "https://www.ghezelbaash.ir/media/thumb.jpg",
  contentUrl: "https://www.ghezelbaash.ir/media/video.mp4",
  title: "بوتاکس & روش <صحیح>",
  description: "توضیحات پزشکی درباره روش درمان",
  publicationDate: "2025-01-16T17:17:17.334Z",
  duration: "PT1M2S",
};
const fixture = (changes = {}) => ({
  canonicalUrl: "https://www.ghezelbaash.ir/",
  lastmod: "2026-09-30",
  imageUrls: ["https://www.ghezelbaash.ir/media/image.jpg"],
  videos: [video],
  ...changes,
});
const withVideo = (changes) => fixture({ videos: [{ ...video, ...changes }] });
test("one canonical document carries authored date, escaped media metadata and durations", () => {
  const xml = renderDiscoverySitemap(fixture());
  assert.equal([...xml.matchAll(/<loc>/g)].length, 1);
  assert(xml.includes("<loc>https://www.ghezelbaash.ir/</loc>"));
  assert(xml.includes("<lastmod>2026-09-30</lastmod>"));
  assert(xml.includes("<video:title>بوتاکس &amp; روش &lt;صحیح&gt;</video:title>"));
  assert(xml.includes("<video:duration>62</video:duration>"));
  assert(xml.endsWith("</urlset>\n"));
});
test("sitemap media must be absolute HTTPS URLs on the canonical origin", () => {
  for (const url of [
    "http://www.ghezelbaash.ir/media/image.jpg",
    "https://elsewhere.test/media/image.jpg",
    "https://www.ghezelbaash.ir/media/image.jpg#fragment",
    "https://user:password@www.ghezelbaash.ir/media/image.jpg",
    "/media/image.jpg",
  ]) assert.throws(() => renderDiscoverySitemap(fixture({ imageUrls: [url] })));
  assert.throws(() => renderDiscoverySitemap(fixture({ canonicalUrl: "https://www.ghezelbaash.ir/?filter=1" })), /canonical URL/);
});
test("source dates must describe real calendar dates and explicit timezones", () => {
  for (const lastmod of ["2026-02-30", "2026-13-01", "today", "2026-09-30T12:00:00"])
    assert.throws(() => renderDiscoverySitemap(fixture({ lastmod })), /date is invalid/);
  assert.throws(() => renderDiscoverySitemap(withVideo({ publicationDate: "2025-02-30T17:00:00Z" })), /date is invalid/);
  assert(renderDiscoverySitemap(fixture({ lastmod: "2026-09-30T12:00:00+03:30" })));
});
test("image protocol limit and media uniqueness prevent broken publication", () => {
  assert.throws(() => renderDiscoverySitemap(fixture({ imageUrls: [] })), /1 to 1000/);
  assert.throws(() => renderDiscoverySitemap(fixture({ imageUrls: Array.from({ length: 1001 }, (_, i) => "https://www.ghezelbaash.ir/media/" + i + ".jpg") })), /1 to 1000/);
  assert.throws(() => renderDiscoverySitemap(fixture({ imageUrls: [fixture().imageUrls[0], fixture().imageUrls[0]] })), /duplicate image/);
  assert.throws(() => renderDiscoverySitemap(fixture({ videos: [video, { ...video }] })), /duplicate video/);
});
test("video text and duration bounds follow the sitemap protocol", () => {
  assert.throws(() => renderDiscoverySitemap(withVideo({ title: "x".repeat(101) })), /protocol limits/);
  assert.throws(() => renderDiscoverySitemap(withVideo({ description: "x".repeat(2049) })), /protocol limits/);
  for (const duration of ["PT", "PT0S", "PT8H1S", "unknown", 0, 28801])
    assert.throws(() => renderDiscoverySitemap(withVideo({ duration })), /duration/);
  assert(renderDiscoverySitemap(withVideo({ duration: "PT8H" })).includes("<video:duration>28800</video:duration>"));
  assert(renderDiscoverySitemap(withVideo({ duration: 1 })).includes("<video:duration>1</video:duration>"));
});
test("invalid XML controls and unnormalized values cannot enter sitemap", () => {
  assert.throws(() => renderDiscoverySitemap(withVideo({ title: "عنوان\u0000" })), /invalid XML/);
  assert.throws(() => renderDiscoverySitemap(withVideo({ description: " توضیح" })), /normalized/);
  assert.throws(() => renderDiscoverySitemap(withVideo({ thumbnailUrl: "https://www.ghezelbaash.ir/media/thumb.jpg " })), /normalized/);
});

test("independent canonical pages may be text-only and are emitted exactly once", () => {
  const input = { pages: [
    { canonicalUrl: "https://www.ghezelbaash.ir/", lastmod: "2026-09-30", imageUrls: [], videos: [] },
    { canonicalUrl: "https://www.ghezelbaash.ir/botox", lastmod: "2026-09-30", imageUrls: [], videos: [] },
  ] };
  const xml = renderDiscoverySitemap(input);
  assert.equal([...xml.matchAll(/<url>/g)].length, 2);
  assert(xml.includes("<loc>https://www.ghezelbaash.ir/botox</loc>"));
  assert.throws(() => renderDiscoverySitemap({ pages: [...input.pages, input.pages[0]] }), /duplicate canonical/);
  assert.throws(() => renderDiscoverySitemap({ pages: [input.pages[0], { ...input.pages[1], canonicalUrl: "https://other.test/botox" }] }), /origin/);
});

const translatedPages = () => {
  const alternates = [
    { href: "https://www.ghezelbaash.ir/who-en", hrefLang: "en" },
    { href: "https://www.ghezelbaash.ir/who-ar-iq", hrefLang: "ar-IQ" },
    { href: "https://www.ghezelbaash.ir/who-ckb-iq", hrefLang: "ku-IQ" },
  ];
  return alternates.map(({ href }) => ({ canonicalUrl: href, lastmod: "2026-10-01", alternates: structuredClone(alternates) }));
};
test("sitemap publishes reciprocal equivalents with XHTML namespace even when home is the first entry", () => {
  const pages = translatedPages(), homepage = { canonicalUrl: "https://www.ghezelbaash.ir/", lastmod: "2026-10-01" };
  const xml = renderDiscoverySitemap({ pages: [homepage, ...pages] });
  assert(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
  assert.equal([...xml.matchAll(/<xhtml:link /g)].length, 9);
  assert(xml.includes('<xhtml:link rel="alternate" hreflang="ku-IQ" href="https://www.ghezelbaash.ir/who-ckb-iq"/>'));
  const homeEntry = xml.slice(xml.indexOf("  <url>"), xml.indexOf("  </url>"));
  assert(!homeEntry.includes("xhtml:link"));
});
test("sitemap rejects missing, nonreciprocal, repeated or noncanonical language equivalents", () => {
  for (const change of [
    (pages) => { pages[0].alternates = pages[0].alternates.slice(1); },
    (pages) => { pages[1].alternates = []; },
    (pages) => { pages[0].alternates.push({ ...pages[0].alternates[0] }); },
    (pages) => { pages[0].alternates[1].href = "https://elsewhere.test/who"; },
    (pages) => { pages[0].alternates[1].href += "?variant=1"; },
    (pages) => { pages[0].alternates[1].href += "#content"; },
    (pages) => { pages[0].alternates[1].href = "https://www.ghezelbaash.ir/missing"; },
    (pages) => { pages[0].alternates[2].hrefLang = "ckb-IQ"; },
    (pages) => { pages[0].alternates[2].hrefLang = "en"; },
  ]) {
    const pages = translatedPages(); change(pages);
    assert.throws(() => renderDiscoverySitemap({ pages }), /alternate/);
  }
});
