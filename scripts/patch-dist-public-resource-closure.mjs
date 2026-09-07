import { readFile, writeFile } from "node:fs/promises";

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

const profilePath = "src/data/semantic/head-profile.json";
const profile = JSON.parse(await readFile(profilePath, "utf8"));
const clinicProfile = profile?.nodes?.[clinicId];
if (!clinicProfile || !clinicProfile.refAllow || !Array.isArray(clinicProfile.refAllow.image))
  throw new Error("Head-profile clinic image policy is missing");
if (clinicProfile.refAllow.image.length !== 0)
  throw new Error(`Head-profile clinic image policy baseline drift: ${JSON.stringify(clinicProfile.refAllow.image)}`);
clinicProfile.refAllow.image = [...cropImageUrls];
await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

const distPath = "scripts/validate-dist.mjs";
let source = await readFile(distPath, "utf8");
const oldImport = `import {\n  analyzeGraphClosure,\n  assertSameDocumentGraphUrlTargets,\n} from "./lib/graph-integrity.mjs";`;
const newImport = `import {\n  analyzeGraphClosure,\n  assertSameDocumentGraphUrlTargets,\n  collectPublicResourceIris,\n} from "./lib/graph-integrity.mjs";`;
if (source.split(oldImport).length - 1 !== 1)
  throw new Error("validate-dist graph-integrity import anchor drift");
source = source.replace(oldImport, newImport);

const oldClosure = `const graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n});`;
const newClosure = `const publicResourceIris = await collectPublicResourceIris({\n  root,\n  baseUrl: release.canonicalUrl,\n});\nconst graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n  allowedSameSiteIds: publicResourceIris,\n});`;
if (source.split(oldClosure).length - 1 !== 1)
  throw new Error("validate-dist graph closure anchor drift");
source = source.replace(oldClosure, newClosure);

const oldProjectionGate = `const coreClinic = inlineById.get(release.clinic.id),\n  coreClinicNames = arr(coreClinic?.name),\n  coreClinicImages = arr(coreClinic?.image);\nif (\n  coreClinicNames.length !== 1 ||\n  coreClinicNames[0]?.["@language"] !== "fa" ||\n  coreClinicNames[0]?.["@value"] !== "کلینیک زیبایی دکتر سعید قزلباش" ||\n  coreClinicImages.length < 6 ||\n  coreClinicImages.some(\n    (value) => typeof value !== "string" || !/^https:\\/\\//.test(value),\n  )\n)\n  fail("Google Organization/LocalBusiness name/image projection drift");`;
const newProjectionGate = `const coreClinic = inlineById.get(release.clinic.id),\n  coreClinicNames = arr(coreClinic?.name),\n  coreClinicImages = arr(coreClinic?.image),\n  expectedCoreClinicImageIds = [\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-1x1.38fa87daaf54.webp\`,\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-4x3.cf191f37bcdb.webp\`,\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-interior-kermanshah-16x9.1d9285d1dfd7.webp\`,\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-1x1.adef35b75d97.webp\`,\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-4x3.fdbc375592c3.webp\`,\n    \`${canonicalUrl}media/images/clinic/ghezelbash-clinic-reception-kermanshah-16x9.a49f74e53c0e.webp\`,\n  ],\n  coreClinicImageIds = coreClinicImages.map((value) =>\n    value && typeof value === "object" && typeof value["@id"] === "string"\n      ? value["@id"]\n      : null,\n  );\nif (\n  coreClinicNames.length !== 1 ||\n  coreClinicNames[0]?.["@language"] !== "fa" ||\n  coreClinicNames[0]?.["@value"] !== "کلینیک زیبایی دکتر سعید قزلباش" ||\n  coreClinicImageIds.length !== expectedCoreClinicImageIds.length ||\n  coreClinicImageIds.some((imageId, index) =>\n    imageId !== expectedCoreClinicImageIds[index] ||\n    !publicResourceIris.has(imageId),\n  )\n)\n  fail("Google Organization/LocalBusiness name/image projection drift");`;
if (source.split(oldProjectionGate).length - 1 !== 1)
  throw new Error("validate-dist Google clinic image projection anchor drift");
source = source.replace(oldProjectionGate, newProjectionGate);

await writeFile(distPath, source);
console.log(
  JSON.stringify(
    {
      patched: [profilePath, distPath],
      googleClinicImages: cropImageUrls.length,
      closure: "graph-node-or-materialized-public-resource",
    },
    null,
    2,
  ),
);
