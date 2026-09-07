import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/validate-source.mjs";
let source = await readFile(path, "utf8");
const before = `const canonicalClinicNames = arr(clinic.name).map(\n    (value) => value?.["@value"] ?? value,\n  ),\n  canonicalClinicImages = arr(clinic.image);\nif (\n  !canonicalClinicNames.includes(primaryClinicName) ||\n  !canonicalClinicNames.includes("Dr. Saeed Ghezelbash Aesthetic Clinic") ||\n  canonicalClinicImages.filter((value) => typeof value === "string").length <\n    6 ||\n  !canonicalClinicImages.some(\n    (value) =>\n      id(value) ===\n      \`\${release.canonicalUrl}#image-doctor-ghezelbaash-clinic-logo\`,\n  )\n)\n  fail("Canonical multilingual Clinic name/image richness drift");`;
const after = `const canonicalClinicNames = arr(clinic.name).map(\n    (value) => value?.["@value"] ?? value,\n  ),\n  canonicalClinicImages = arr(clinic.image),\n  canonicalClinicResourceImageRefs = canonicalClinicImages.filter(\n    (value) =>\n      value &&\n      typeof value === "object" &&\n      typeof value["@id"] === "string" &&\n      publicResourceIris.has(value["@id"]),\n  );\nif (\n  !canonicalClinicNames.includes(primaryClinicName) ||\n  !canonicalClinicNames.includes("Dr. Saeed Ghezelbash Aesthetic Clinic") ||\n  canonicalClinicResourceImageRefs.length < 6 ||\n  !canonicalClinicImages.some(\n    (value) =>\n      id(value) ===\n      \`\${release.canonicalUrl}#image-doctor-ghezelbaash-clinic-logo\`,\n  )\n)\n  fail("Canonical multilingual Clinic name/image richness drift");`;
if (source.split(before).length - 1 !== 1)
  throw new Error("clinic image richness anchor drift");
source = source.replace(before, after);
await writeFile(path, source);
console.log(JSON.stringify({ patched: path, requirement: "six-materialized-resource-iri-images" }, null, 2));
