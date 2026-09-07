import { readFile, writeFile } from "node:fs/promises";

if (process.env.PIVOT_IMAGE_IRI_CONTEXT !== "1")
  throw new Error("This one-shot pivot helper requires PIVOT_IMAGE_IRI_CONTEXT=1");

const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const testPath = "scripts/test-canonical-media-semantics.mjs";
const canonicalUrl = "https://www.ghezelbaash.ir/";
const clinicId = `${canonicalUrl}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const cropImageUrls = [
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-1x1.38fa87daaf54.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-4x3.cf191f37bcdb.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-16x9.1d9285d1dfd7.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-1x1.adef35b75d97.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-4x3.fdbc375592c3.webp`,
  `${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-16x9.a49f74e53c0e.webp`,
];

const graph = JSON.parse(await readFile(graphPath, "utf8"));
if (!graph?.["@context"] || !Array.isArray(graph?.["@graph"]))
  throw new Error("Canonical graph/context missing");
if (Object.hasOwn(graph["@context"], "image"))
  throw new Error(`Canonical image context baseline drift: ${JSON.stringify(graph["@context"].image)}`);
const clinic = graph["@graph"].find((node) => node?.["@id"] === clinicId);
if (!clinic || !Array.isArray(clinic.image))
  throw new Error("Canonical clinic image array missing");
for (const url of cropImageUrls) {
  const iriIndexes = clinic.image
    .map((value, index) => (value?.["@id"] === url ? index : -1))
    .filter((index) => index >= 0);
  const literalCount = clinic.image.filter((value) => value === url).length;
  if (iriIndexes.length !== 1 || literalCount !== 0)
    throw new Error(`Clinic crop baseline drift: ${url}; refs=${iriIndexes.length}; literals=${literalCount}`);
  clinic.image[iriIndexes[0]] = url;
}
graph["@context"].image = {
  "@id": "https://schema.org/image",
  "@type": "@id",
};
await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

let test = await readFile(testPath, "utf8");
const oldImport = `import {\n  analyzeGraphClosure,\n  collectPublicResourceIris,\n} from "./lib/graph-integrity.mjs";\n`;
if (test.split(oldImport).length - 1 !== 1)
  throw new Error("Canonical media test graph-integrity import anchor drift");
test = test.replace(oldImport, "");
const firstStart = `test("clinic crop images remain JSON-LD IRI references to real first-party media", async () => {`;
const secondStart = `test("graph closure permits only materialized first-party resource IRIs", async () => {`;
const thirdStart = `test("canonical 1600px physician image dimensions agree with the media inventory", async () => {`;
const firstIndex = test.indexOf(firstStart);
const secondIndex = test.indexOf(secondStart);
const thirdIndex = test.indexOf(thirdStart);
if (!(firstIndex >= 0 && secondIndex > firstIndex && thirdIndex > secondIndex))
  throw new Error("Canonical media test E001 block anchors drift");
const replacement = `test("clinic crop image URLs remain Google-compatible strings with JSON-LD IRI coercion", async () => {\n  const { graph, release, byId } = await load();\n  const base = release.canonicalUrl;\n  assert.deepEqual(\n    graph["@context"]?.image,\n    { "@id": "https://schema.org/image", "@type": "@id" },\n    "Schema.org image values must be JSON-LD IRI-coerced",\n  );\n  const clinic = byId.get(\`${base}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah\`);\n  assert.ok(clinic && Array.isArray(clinic.image), "canonical clinic image array is required");\n\n  for (const url of clinicCropUrls(base)) {\n    assert.equal(clinic.image.filter((value) => value === url).length, 1, \`image URL must occur exactly once as an IRI-coerced string: \${url}\`);\n    assert.equal(clinic.image.filter((value) => value?.["@id"] === url).length, 0, \`direct media URL must not masquerade as an unresolved graph-node reference: \${url}\`);\n    const pathname = new URL(url).pathname;\n    await access(new URL(\`../public\${pathname}\`, import.meta.url));\n  }\n});\n\n`;
test = `${test.slice(0, firstIndex)}${replacement}${test.slice(thirdIndex)}`;
await writeFile(testPath, test);

console.log(
  JSON.stringify(
    {
      pivoted: true,
      graphPath,
      testPath,
      imageTerm: graph["@context"].image,
      iriCoercedStrings: cropImageUrls.length,
    },
    null,
    2,
  ),
);
