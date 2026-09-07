import { readFile, writeFile } from "node:fs/promises";

const mediaPath = "scripts/lib/media-inventory.mjs";
const testPath = "scripts/test-media-inventory.mjs";
const canonicalTestPath = "scripts/test-canonical-media-semantics.mjs";

let media = await readFile(mediaPath, "utf8");
const oldBlock = `      for (const scalar of values(value)) if (typeof scalar === "string")\n        for (const file of mediaUrls(scalar, canonicalUrl)) add(file, \`graph:\${id}:\${key}\`);`;
const newBlock = `      for (const scalar of values(value)) {\n        const mediaValue =\n          typeof scalar === "string"\n            ? scalar\n            : scalar && typeof scalar === "object" && typeof scalar["@id"] === "string"\n              ? scalar["@id"]\n              : null;\n        if (!mediaValue) continue;\n        for (const file of mediaUrls(mediaValue, canonicalUrl))\n          add(file, \`graph:\${id}:\${key}\`);\n      }`;
if (media.split(oldBlock).length - 1 !== 1)
  throw new Error("media consumer anchor drift");
media = media.replace(oldBlock, newBlock);
await writeFile(mediaPath, media);

let test = await readFile(testPath, "utf8");
const oldVars = `  const poster = media("poster.555555555555.webp");\n  const video = media("clip.666666666666.mp4");`;
const newVars = `  const poster = media("poster.555555555555.webp");\n  const directGraphImage = media("clinic-crop.121212121212.webp");\n  const video = media("clip.666666666666.mp4");`;
if (test.split(oldVars).length - 1 !== 1) throw new Error("fixture variable anchor drift");
test = test.replace(oldVars, newVars);

const oldPerson = `    { "@id": iri("person"), "@type": "Person", image: { "@id": iri("image-portrait") } },`;
const newPerson = `    { "@id": iri("person"), "@type": "Person", image: [{ "@id": iri("image-portrait") }, { "@id": new URL(directGraphImage, canonicalUrl).href }] },`;
if (test.split(oldPerson).length - 1 !== 1) throw new Error("fixture Person anchor drift");
test = test.replace(oldPerson, newPerson);

const oldPaths = `    physicalPaths: new Set([jpg, webp, fallback, responsive, poster, video, track, sourceInput, font]),`;
const newPaths = `    physicalPaths: new Set([jpg, webp, fallback, responsive, poster, directGraphImage, video, track, sourceInput, font]),`;
if (test.split(oldPaths).length - 1 !== 1) throw new Error("fixture physicalPaths anchor drift");
test = test.replace(oldPaths, newPaths);
await writeFile(testPath, test);

let contract = await readFile(canonicalTestPath, "utf8");
const logicalPaths = [
  ["saeed-ghezelbash-portrait-1600.webp", "saeed-ghezelbash-portrait-1600.webp"],
  ["saeed-ghezelbash-clinical-examination-1600.webp", "saeed-ghezelbash-clinical-examination-1600.webp"],
  ["saeed-ghezelbash-with-clinic-team-1600.webp", "saeed-ghezelbash-with-clinic-team-1600.webp"],
];
for (const [needleName] of logicalPaths) {
  const oldValue = `      path: "${["public", "media", "images", "physician", needleName].join("/")}",`;
  const newValue = `      path: ["public", "media", "images", "physician", "${needleName}"].join("/"),`;
  if (contract.split(oldValue).length - 1 !== 1)
    throw new Error(`canonical media test path anchor drift: ${needleName}`);
  contract = contract.replace(oldValue, newValue);
}
await writeFile(canonicalTestPath, contract);

console.log(JSON.stringify({ patched: [mediaPath, testPath, canonicalTestPath] }, null, 2));
