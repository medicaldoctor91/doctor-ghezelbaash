import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRasterInventory,
  htmlGraphReferences,
  htmlMediaUrls,
  mediaUrls,
  parseRasterDimensions,
  validateMediaUsage,
  validateStableAliases,
} from "./lib/media-inventory.mjs";

const canonicalUrl = "https://example.test/";
const media = (name) => "/" + "media/" + name;
const iri = (name) => `${canonicalUrl}#${name}`;
const fixture = () => {
  const jpg = media("portrait.111111111111.jpg");
  const webp = media("portrait.222222222222.webp");
  const fallback = media("portrait-small.333333333333.webp");
  const responsive = media("portrait-small.444444444444.avif");
  const poster = media("poster.555555555555.webp");
  const video = media("clip.666666666666.mp4");
  const track = media("clip.777777777777.vtt");
  const sourceInput = media("symbol.888888888888.png");
  const font = "/" + "fonts/body.999999999999.woff2";
  const markup = `<picture id="image-portrait-webp"><source srcset="${responsive} 640w"><img src="${fallback}"></picture><video data-src="${video}" data-poster="${poster}"><track src="${track}"></video>`;
  const graph = { "@graph": [
    { "@id": iri("webpage"), "@type": "ProfilePage", mainEntity: { "@id": iri("person") } },
    { "@id": iri("person"), "@type": "Person", image: { "@id": iri("image-portrait") } },
    { "@id": iri("image-portrait"), "@type": "ImageObject", contentUrl: new URL(media("portrait.jpg"), canonicalUrl).href, encoding: { "@id": iri("image-portrait-webp") } },
    { "@id": iri("image-portrait-webp"), "@type": "ImageObject", contentUrl: new URL(media("portrait.webp"), canonicalUrl).href, about: { "@id": iri("person") } },
  ] };
  return {
    canonicalUrl,
    physicalPaths: new Set([jpg, webp, fallback, responsive, poster, video, track, sourceInput, font]),
    rootIds: [iri("webpage")],
    graph,
    aliases: [
      { path: media("portrait.jpg").slice(1), target: jpg.slice(1), imageId: iri("image-portrait") },
      { path: media("portrait.webp").slice(1), target: webp.slice(1), imageId: iri("image-portrait-webp") },
    ],
    consumers: [
      { source: "canonical HTML", paths: htmlMediaUrls(markup, canonicalUrl), graphIds: htmlGraphReferences(markup, canonicalUrl) },
      { source: "imported stylesheet", paths: mediaUrls(`url("${font}")`, canonicalUrl) },
      { source: "favicon endpoint source input", paths: new Set([sourceInput]) },
    ],
  };
};

test("reachable graph encodings, aliases, responsive media, lazy video, tracks, font and generator input are consumed", () => {
  const input = fixture();
  const result = validateMediaUsage(input);
  for (const file of input.physicalPaths) assert.ok(result.uses.has(file), file);
  assert.equal(result.reachableGraphNodes, 4);
});

test("registering a physical raster and disconnected ImageObject does not make an orphan consumed", () => {
  const input = fixture();
  const orphan = media("unused.aaaaaaaaaaaa.webp");
  const dimensions = parseRasterDimensions(`public${media("unused.webp")}|1200|900`);
  assertRasterInventory([`/project/public${orphan}`], dimensions, "/project");
  input.physicalPaths.add(orphan);
  input.graph["@graph"].push({ "@id": iri("unused"), "@type": "ImageObject", contentUrl: new URL(orphan, canonicalUrl).href, about: { "@id": iri("person") } });
  assert.throws(() => validateMediaUsage(input), /Orphan media/);
});

test("broken actual HTML references fail", () => {
  const input = fixture();
  input.consumers[0].paths.add(media("missing.aaaaaaaaaaaa.avif"));
  assert.throws(() => validateMediaUsage(input), /Missing first-party media reference/);
});

test("an alias cannot silently point to another valid raster", () => {
  const input = fixture();
  input.aliases[1].target = media("portrait-small.333333333333.webp").slice(1);
  assert.throws(() => validateMediaUsage(input), /logical target mismatch/);
});

test("an alias must agree with its canonical ImageObject", () => {
  const input = fixture();
  input.aliases[1].imageId = iri("image-portrait");
  assert.throws(() => validateMediaUsage(input), /ImageObject mismatch/);
});

test("registry entry and matching DOM id cannot substitute for a reachable graph reference", () => {
  const input = fixture();
  delete input.graph["@graph"][2].encoding;
  assert.throws(() => validateMediaUsage(input), /no reachable ImageObject/);
});

test("actual Microdata image references can introduce separately described images", () => {
  const input = fixture();
  delete input.graph["@graph"][2].encoding;
  input.consumers[0].graphIds = htmlGraphReferences(`<link itemprop="image" href="${iri("image-portrait-webp")}">`, canonicalUrl);
  assert.doesNotThrow(() => validateMediaUsage(input));
});

test("comments, DOM ids and arbitrary data attributes are not media consumption", () => {
  const url = media("unconsumed.aaaaaaaaaaaa.webp");
  assert.deepEqual([...htmlMediaUrls(`<!-- <img src="${url}"> --><div id="${url}" data-inventory="${url}"></div>`, canonicalUrl)], []);
  assert.deepEqual([...htmlGraphReferences(`<picture id="image-portrait-webp"></picture>`, canonicalUrl)], []);
  assert.deepEqual([...mediaUrls(`https://external.test${url}`, canonicalUrl)], []);
});

test("a missing font consumer exposes the physical font as an orphan", () => {
  const input = fixture();
  input.consumers = input.consumers.filter(({ source }) => source !== "imported stylesheet");
  assert.throws(() => validateMediaUsage(input), /Orphan media/);
});

test("manifest inventory is derived and rejects missing, extra and duplicate rasters", () => {
  const logical = `public${media("sample.webp")}`;
  const dimensions = parseRasterDimensions(`${logical}|640|427`);
  assert.equal(dimensions.size, 1);
  assertRasterInventory([`/project/public${media("sample.aaaaaaaaaaaa.webp")}`], dimensions, "/project");
  assert.throws(() => assertRasterInventory([], dimensions, "/project"), /boundary violation/);
  assert.throws(() => assertRasterInventory([`/project/public${media("different.aaaaaaaaaaaa.webp")}`], dimensions, "/project"), /boundary violation/);
  assert.throws(() => parseRasterDimensions(`${logical}|640|427\n${logical}|640|427`), /Duplicate logical raster/);
});

test("stable alias validation rejects duplicate destinations and path traversal", () => {
  const { aliases } = fixture();
  assert.throws(() => validateStableAliases([aliases[0], aliases[0]]), /Duplicate stable media alias/);
  assert.throws(() => validateStableAliases([{ ...aliases[0], path: "../outside.jpg" }]), /Unsafe stable media alias/);
});
