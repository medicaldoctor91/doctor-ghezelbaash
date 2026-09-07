import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const graphUrl = new URL("../src/data/semantic/knowledge-graph.jsonld", import.meta.url);
const releaseUrl = new URL("../src/data/release.json", import.meta.url);
const dimensionsUrl = new URL("../src/data/media-dimensions.tsv", import.meta.url);

const load = async () => {
  const [graph, release, dimensionsRaw] = await Promise.all([
    readFile(graphUrl, "utf8").then(JSON.parse),
    readFile(releaseUrl, "utf8").then(JSON.parse),
    readFile(dimensionsUrl, "utf8"),
  ]);
  assert.ok(Array.isArray(graph?.["@graph"]), "canonical graph must expose @graph");
  const byId = new Map(graph["@graph"].map((node) => [node?.["@id"], node]));
  assert.equal(byId.size, graph["@graph"].length, "canonical graph IDs must remain unique");
  const dimensions = new Map();
  for (const line of dimensionsRaw.split(/\r?\n/).filter(Boolean)) {
    const [path, width, height, ...extra] = line.split("|");
    assert.equal(extra.length, 0, `unexpected media-dimensions fields: ${line}`);
    assert.ok(path && Number.isInteger(Number(width)) && Number.isInteger(Number(height)), `invalid media-dimensions row: ${line}`);
    assert.ok(!dimensions.has(path), `duplicate media-dimensions path: ${path}`);
    dimensions.set(path, { width: Number(width), height: Number(height) });
  }
  return { graph, release, byId, dimensions };
};

const types = (node) => (Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]].filter(Boolean));

test("clinic crop images remain JSON-LD IRI references to real first-party media", async () => {
  const { release, byId } = await load();
  const base = release.canonicalUrl;
  const clinic = byId.get(`${base}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`);
  assert.ok(clinic && Array.isArray(clinic.image), "canonical clinic image array is required");

  const expected = [
    `${base}media/images/clinic/ghezelbash-clinic-interior-kermanshah-1x1.38fa87daaf54.webp`,
    `${base}media/images/clinic/ghezelbash-clinic-interior-kermanshah-4x3.cf191f37bcdb.webp`,
    `${base}media/images/clinic/ghezelbash-clinic-interior-kermanshah-16x9.1d9285d1dfd7.webp`,
    `${base}media/images/clinic/ghezelbash-clinic-reception-kermanshah-1x1.adef35b75d97.webp`,
    `${base}media/images/clinic/ghezelbash-clinic-reception-kermanshah-4x3.fdbc375592c3.webp`,
    `${base}media/images/clinic/ghezelbash-clinic-reception-kermanshah-16x9.a49f74e53c0e.webp`,
  ];

  for (const url of expected) {
    assert.equal(clinic.image.filter((value) => value === url).length, 0, `image URL must not regress to a JSON-LD literal: ${url}`);
    assert.equal(clinic.image.filter((value) => value?.["@id"] === url).length, 1, `image URL must occur exactly once as @id: ${url}`);
    const pathname = new URL(url).pathname;
    await access(new URL(`../public${pathname}`, import.meta.url));
  }
});

test("canonical 1600px physician image dimensions agree with the media inventory", async () => {
  const { release, byId, dimensions } = await load();
  const base = release.canonicalUrl;
  const cases = [
    {
      widthId: `${base}#image-saeed-ghezelbash-portrait-width`,
      heightId: `${base}#image-saeed-ghezelbash-portrait-height`,
      path: "public/media/images/physician/saeed-ghezelbash-portrait-1600.webp",
    },
    {
      widthId: `${base}#image-saeed-ghezelbash-clinical-examination-width`,
      heightId: `${base}#image-saeed-ghezelbash-clinical-examination-height`,
      path: "public/media/images/physician/saeed-ghezelbash-clinical-examination-1600.webp",
    },
    {
      widthId: `${base}#image-saeed-ghezelbash-clinic-team-width`,
      heightId: `${base}#image-saeed-ghezelbash-clinic-team-height`,
      path: "public/media/images/physician/saeed-ghezelbash-with-clinic-team-1600.webp",
    },
  ];

  for (const current of cases) {
    const expected = dimensions.get(current.path);
    assert.ok(expected, `media inventory row is required: ${current.path}`);
    const width = byId.get(current.widthId);
    const height = byId.get(current.heightId);
    for (const [label, node] of [["width", width], ["height", height]]) {
      assert.ok(node, `missing ${label} node for ${current.path}`);
      assert.equal(node["@type"], "QuantitativeValue");
      assert.equal(node.unitText, "px");
    }
    assert.equal(width.value, expected.width, `canonical width drift: ${current.path}`);
    assert.equal(height.value, expected.height, `canonical height drift: ${current.path}`);
  }
});

test("supplemental videos are parts of the physician page rather than competing main entities", async () => {
  const { release, byId } = await load();
  const base = release.canonicalUrl;
  const webpageId = `${base}#webpage`;
  const videoIds = [
    `${base}#video-jalupro-vs-profhilo`,
    `${base}#video-subcision-technique`,
    `${base}#video-thread-lift-workshop`,
    `${base}#video-kurdish-patient-experience`,
  ];

  for (const id of videoIds) {
    const video = byId.get(id);
    assert.ok(video && types(video).includes("VideoObject"), `canonical VideoObject is required: ${id}`);
    assert.equal(video?.isPartOf?.["@id"], webpageId, `VideoObject must remain part of #webpage: ${id}`);
    assert.equal(Object.hasOwn(video, "mainEntityOfPage"), false, `VideoObject must not claim mainEntityOfPage: ${id}`);
  }
});
