import { readFile, writeFile } from "node:fs/promises";

const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const canonicalUrl = "https://www.ghezelbaash.ir/";
const webpageId = `${canonicalUrl}#webpage`;
const clinicId = `${canonicalUrl}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;

const graph = JSON.parse(await readFile(graphPath, "utf8"));
if (!Array.isArray(graph?.["@graph"])) throw new Error("Canonical graph lacks @graph");
const byId = new Map();
for (const node of graph["@graph"]) {
  if (typeof node?.["@id"] !== "string" || !node["@id"])
    throw new Error("Canonical graph node without @id");
  if (byId.has(node["@id"])) throw new Error(`Duplicate @id: ${node["@id"]}`);
  byId.set(node["@id"], node);
}

const fail = (message) => {
  throw new Error(message);
};
const expectNode = (id) => byId.get(id) || fail(`Missing canonical node: ${id}`);

const clinic = expectNode(clinicId);
if (!Array.isArray(clinic.image)) fail("Clinic image must be an array");
const cropImageUrls = [
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-1x1.38fa87daaf54.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-4x3.cf191f37bcdb.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-16x9.1d9285d1dfd7.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-1x1.adef35b75d97.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-4x3.fdbc375592c3.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-16x9.a49f74e53c0e.webp`,
];
let convertedImageIris = 0;
for (const url of cropImageUrls) {
  const literalIndexes = clinic.image
    .map((value, index) => (value === url ? index : -1))
    .filter((index) => index >= 0);
  const iriIndexes = clinic.image
    .map((value, index) => (value?.["@id"] === url ? index : -1))
    .filter((index) => index >= 0);
  if (literalIndexes.length !== 1 || iriIndexes.length !== 0)
    fail(`Clinic image IRI baseline drift for ${url}: literals=${literalIndexes.length}, iris=${iriIndexes.length}`);
  clinic.image[literalIndexes[0]] = { "@id": url };
  convertedImageIris++;
}

const imageHeightIds = [
  `${canonicalUrl}#image-saeed-ghezelbash-portrait-height`,
  `${canonicalUrl}#image-saeed-ghezelbash-clinical-examination-height`,
  `${canonicalUrl}#image-saeed-ghezelbash-clinic-team-height`,
];
let correctedImageHeights = 0;
for (const id of imageHeightIds) {
  const node = expectNode(id);
  if (node?.["@type"] !== "QuantitativeValue" || node.value !== 1068 || node.unitText !== "px")
    fail(`Image height baseline drift: ${id}`);
  node.value = 1067;
  correctedImageHeights++;
}

const videoIds = [
  `${canonicalUrl}#video-jalupro-vs-profhilo`,
  `${canonicalUrl}#video-subcision-technique`,
  `${canonicalUrl}#video-thread-lift-workshop`,
  `${canonicalUrl}#video-kurdish-patient-experience`,
];
let correctedVideoOwnership = 0;
for (const id of videoIds) {
  const node = expectNode(id);
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (!types.includes("VideoObject")) fail(`Video baseline type drift: ${id}`);
  if (node?.mainEntityOfPage?.["@id"] !== webpageId)
    fail(`Video mainEntityOfPage baseline drift: ${id}`);
  if (Object.hasOwn(node, "isPartOf")) fail(`Video already has isPartOf: ${id}`);
  const index = graph["@graph"].findIndex((candidate) => candidate?.["@id"] === id);
  const entries = Object.entries(node).map(([key, value]) =>
    key === "mainEntityOfPage" ? ["isPartOf", { "@id": webpageId }] : [key, value],
  );
  const replacement = Object.fromEntries(entries);
  graph["@graph"][index] = replacement;
  byId.set(id, replacement);
  correctedVideoOwnership++;
}

if (convertedImageIris !== 6 || correctedImageHeights !== 3 || correctedVideoOwnership !== 4)
  fail("Semantic recovery cardinality drift");

for (const url of cropImageUrls) {
  if (clinic.image.some((value) => value === url)) fail(`Literal clinic image URL survived: ${url}`);
  if (clinic.image.filter((value) => value?.["@id"] === url).length !== 1)
    fail(`Clinic image IRI projection count drift: ${url}`);
}
for (const id of imageHeightIds) {
  if (expectNode(id).value !== 1067) fail(`Corrected image height did not persist: ${id}`);
}
for (const id of videoIds) {
  const node = expectNode(id);
  if (Object.hasOwn(node, "mainEntityOfPage")) fail(`Video mainEntityOfPage survived: ${id}`);
  if (node?.isPartOf?.["@id"] !== webpageId) fail(`Video isPartOf missing: ${id}`);
}

await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: true,
      graphPath,
      convertedImageIris,
      correctedImageHeights,
      correctedVideoOwnership,
    },
    null,
    2,
  ),
);
