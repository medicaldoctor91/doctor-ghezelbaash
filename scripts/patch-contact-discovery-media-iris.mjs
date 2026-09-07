import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/lib/projections/contact-discovery.mjs";
let source = await readFile(path, "utf8");

const oldSitemap = `  const clinicImageUrls = clinic.image.filter((value) => !logoIds.has(value?.["@id"])).map((value) =>\n    canonicalImageUrl(\n      typeof value === "string" ? value : requiredNode(\n        byId, requiredReferenceId(value, "clinic image"), "clinic image",\n      ).contentUrl,\n      "clinic image contentUrl",\n    ),\n  );`;
const newSitemap = `  const clinicImageUrls = clinic.image\n    .filter((value) => !logoIds.has(value?.["@id"]))\n    .map((value) => {\n      if (typeof value === "string")\n        return canonicalImageUrl(value, "clinic image resource");\n      const id = requiredReferenceId(value, "clinic image");\n      const node = byId.get(id);\n      return canonicalImageUrl(\n        node\n          ? requiredText(node.contentUrl, "clinic image node contentUrl")\n          : id,\n        node ? "clinic image node contentUrl" : "clinic image resource IRI",\n      );\n    });`;
if (source.split(oldSitemap).length - 1 !== 1)
  throw new Error("contact-discovery sitemap clinic-image anchor drift");
source = source.replace(oldSitemap, newSitemap);

const oldInventory = `  const clinicImageIds = clinic.image\n    .filter((value) => value && typeof value === "object")\n    .map((value, index) =>\n      requiredReferenceId(value, \`owned clinic image \${index + 1}\`),\n    );\n  for (const id of clinicImageIds)\n    requiredNode(byId, id, "owned clinic image");`;
const newInventory = `  const clinicImageIds = clinic.image.map((value, index) =>\n    typeof value === "string"\n      ? requiredText(value, \`owned clinic image \${index + 1}\`)\n      : requiredReferenceId(value, \`owned clinic image \${index + 1}\`),\n  );\n  const canonicalOrigin = new URL(release.canonicalUrl).origin;\n  for (const id of clinicImageIds) {\n    if (byId.has(id)) {\n      requiredNode(byId, id, "owned clinic image");\n      continue;\n    }\n    const resource = new URL(id, release.canonicalUrl);\n    if (resource.origin !== canonicalOrigin || resource.hash)\n      throw new Error(\n        \`Contact discovery: owned clinic image resource must be a first-party non-fragment IRI: \${id}\`,\n      );\n  }`;
if (source.split(oldInventory).length - 1 !== 1)
  throw new Error("contact-discovery owned-clinic image anchor drift");
source = source.replace(oldInventory, newInventory);

await writeFile(path, source);
console.log(JSON.stringify({ patched: path, mode: "graph-node-or-first-party-resource-iri" }, null, 2));
