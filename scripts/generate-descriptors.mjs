import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { generatedWorkspace } from "./generated-workspace.mjs";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";
import { entityFactsTableSchema, entityFactsTableDialect, entityFactsRecordSet } from "./lib/entity-facts.mjs";
import {
  exactLanguageLiteral,
  indexCanonicalGraph,
} from "../src/lib/semantic-projection.mjs";

const root = process.cwd(),
  generated = generatedWorkspace(root),
  projections = generated.projections;
const outputDir = projections;
const readJson = async (p) =>
  JSON.parse(await readFile(path.join(root, p), "utf8"));
const release = await readJson("src/data/release.json");
const retrievalPolicy = await readJson(
  "src/data/retrieval/query-matrix-policy.json",
);
const rdfLock = await readJson(".generated/semantic/rdf-lock.json");
const graph = await readJson("src/data/semantic/knowledge-graph.jsonld");
await mkdir(outputDir, { recursive: true });
const { byId } = indexCanonicalGraph(graph);
const dataset = byId.get(release.dataset.id),
  person = byId.get(release.primaryEntity.id),
  clinic = byId.get(release.clinic.id);
if (!dataset || !person || !clinic)
  throw new Error("Descriptor generator missing canonical Dataset/Person/Clinic");
if (
  rdfLock.source !== "src/data/semantic/knowledge-graph.jsonld" ||
  !Number.isInteger(rdfLock.triples) ||
  rdfLock.triples < 1
)
  throw new Error("RDF measurement is missing before descriptor generation");
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const id = (v) => (typeof v === "string" ? v : v?.["@id"]);
const identityMe = arr(person.sameAs)
  .map(id)
  .filter(Boolean)
  .map((href) => ({ href }));
if (typeof dataset.name !== "string" || !dataset.name.trim())
  throw new Error("Canonical Dataset name is missing");
if (typeof dataset.description !== "string" || !dataset.description.trim())
  throw new Error("Canonical Dataset description is missing");
const datasetName = dataset.name;
const datasetDescription = dataset.description;
const personName = exactLanguageLiteral(
  person.name,
  "en",
  "Canonical Person name",
);
const practiceCity = byId.get(id(clinic.location));
if (!practiceCity)
  throw new Error("Descriptor generator missing canonical clinic city");
const practiceCityName = exactLanguageLiteral(
  practiceCity.name,
  "en",
  "Canonical clinic city",
);
const datasetLandingPage = dataset.url;
if (datasetLandingPage !== release.canonicalUrl)
  throw new Error("Canonical Dataset landing page must be the canonical human document");
const createdAt = dataset.dateCreated;
const datasetPublishedAt = dataset.datePublished;
const datasetModifiedAt = dataset.dateModified;
if (!datasetPublishedAt || !datasetModifiedAt)
  throw new Error("Canonical Dataset publication and modification dates are missing");
const datasetLicense = id(dataset.license);
if (!datasetLicense)
  throw new Error("Canonical Dataset license is missing");
const shaHex = (b) => createHash("sha256").update(b).digest("hex");
const ttlString = (s) =>
  `"${String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
const resourceByPath = new Map(
  MACHINE_RESOURCES.map((resource) => [resource.path, resource]),
);
const artifactAbs = (rel) => {
  const resource = resourceByPath.get(rel);
  if (!resource)
    throw new Error(
      `Descriptor resource is absent from machine registry: ${rel}`,
    );
  return path.join(root, resource.source);
};
const fileMeta = async (rel) => {
  const resource = resourceByPath.get(rel);
  if (
    typeof resource?.descriptorTitle !== "string" ||
    !resource.descriptorTitle.trim()
  )
    throw new Error(`Descriptor resource lacks a canonical title: ${rel}`);
  const bytes = await readFile(artifactAbs(rel));
  return {
    rel,
    bytes: bytes.length,
    sha256: shaHex(bytes),
    mediaType: resource.mediaType,
    distributionIri: resource.distributionIri,
    title: resource.descriptorTitle,
  };
};
const coreResources = MACHINE_RESOURCES.filter(
  (resource) => resource.descriptorRoles.includes("dcat"),
).map((resource) => resource.path);
const out = (rel) => path.join(outputDir, rel);

// The registry supplies the same relation semantics as HTML discovery. HTTP
// publishes a deliberately smaller subset, while the linkset records them all.
const resourceRelations = {};
for (const resource of MACHINE_RESOURCES) {
  if (!resource.head?.rel || !resource.targets.includes("website")) continue;
  for (const relation of resource.head.rel.split(/\s+/).filter(Boolean)) {
    resourceRelations[relation] ??= [];
    resourceRelations[relation].push({
      href: `${release.canonicalUrl}${resource.path}`,
      type: resource.contentType,
    });
  }
}

const linkset = {
  linkset: [
    {
      anchor: release.canonicalUrl,
      canonical: [{ href: release.canonicalUrl }],
      author: [{ href: release.primaryEntity.id }],
      about: [{ href: release.primaryEntity.id }, { href: release.clinic.id }],
      ...resourceRelations,
      license: [{ href: "https://creativecommons.org/licenses/by/4.0/" }],
      me: identityMe,
    },
  ],
};
await writeFile(out("linkset.json"), JSON.stringify(linkset, null, 2) + "\n");

const voidTtl = `${[
  "@prefix void: <http://rdfs.org/ns/void#> .",
  "@prefix dct: <http://purl.org/dc/terms/> .",
  "@prefix foaf: <http://xmlns.com/foaf/0.1/> .",
  "@prefix schema: <https://schema.org/> .",
  "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
  `<${release.canonicalUrl}graph.jsonld#dataset> a void:Dataset ;`,
  `  dct:title ${ttlString(datasetName)}@en ;`,
  `  dct:publisher <${release.primaryEntity.id}> ;`,
  `  dct:modified ${ttlString(datasetModifiedAt)}^^xsd:date ;`,
  `  dct:license <${datasetLicense}> ;`,
  `  foaf:homepage <${datasetLandingPage}> ;`,
  `  foaf:primaryTopic <${release.primaryEntity.id}> ;`,
  `  void:uriSpace ${ttlString(release.canonicalUrl)} ;`,
  `  void:triples ${rdfLock.triples} ;`,
  `  void:dataDump <${release.canonicalUrl}graph.jsonld>, <${release.canonicalUrl}graph.ttl> ;`,
  "  void:vocabulary <https://schema.org/>, <http://purl.org/dc/terms/>, <http://www.w3.org/ns/prov#> .",
  `<${release.primaryEntity.id}> a foaf:Person ; foaf:name ${ttlString(personName)}@en .`,
].join("\n")}\n`;
await writeFile(out("void.ttl"), voidTtl);

const dcatMeta = await Promise.all(coreResources.map(fileMeta));
const distributionIris = dcatMeta
  .map((m) => `<${m.distributionIri}>`)
  .join(", ");
const catalogTriple = [
  `<${release.canonicalUrl}#data-catalog> a dcat:Catalog ;`,
  `dct:title "${datasetName} — Data Catalog"@en ;`,
  `dct:publisher <${release.primaryEntity.id}> ;`,
  `dct:modified "${datasetModifiedAt}"^^xsd:date ;`,
  `dcat:dataset <${release.canonicalUrl}graph.jsonld#dataset> .`,
].join(" ");
const datasetTriple = [
  `<${release.canonicalUrl}graph.jsonld#dataset> a dcat:Dataset ;`,
  `dct:title ${ttlString(datasetName)}@en ;`,
  `dct:description ${ttlString(datasetDescription)}@en ;`,
  `dct:creator <${release.primaryEntity.id}> ;`,
  `dct:publisher <${release.primaryEntity.id}> ;`,
  `dct:modified "${datasetModifiedAt}"^^xsd:date ;`,
  `dct:license <${datasetLicense}> ;`,
  `dcat:landingPage <${datasetLandingPage}> ;`,
  `schema:version "${release.release}" ;`,
  `dcat:distribution ${distributionIris} .`,
].join(" ");
let dcat = `${[
  "@prefix dcat: <http://www.w3.org/ns/dcat#> .",
  "@prefix dct: <http://purl.org/dc/terms/> .",
  "@prefix spdx: <http://spdx.org/rdf/terms#> .",
  "@prefix schema: <https://schema.org/> .",
  "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
  "",
  catalogTriple,
  datasetTriple,
  "",
].join("\n")}\n`;
for (const m of dcatMeta) {
  const distributionTriple = [
    `<${m.distributionIri}> a dcat:Distribution ;`,
    `dct:title ${ttlString(m.title)}@en ;`,
    `dct:license <${datasetLicense}> ;`,
    `dcat:accessURL <${release.canonicalUrl}${m.rel}> ;`,
    `dcat:downloadURL <${release.canonicalUrl}${m.rel}> ;`,
    `dcat:mediaType <https://www.iana.org/assignments/media-types/${m.mediaType}> ;`,
    `dcat:byteSize "${m.bytes}"^^xsd:decimal ;`,
    "spdx:checksum [ a spdx:Checksum ;",
    "spdx:algorithm spdx:checksumAlgorithm_sha256 ;",
    `spdx:checksumValue "${m.sha256}"^^xsd:hexBinary ] .`,
  ].join(" ");
  dcat += `${distributionTriple}\n\n`;
}
await writeFile(out("dcat.ttl"), dcat);

const descriptorResources = MACHINE_RESOURCES.filter(
  (resource) => resource.descriptorRoles.some((role) => ["data-package", "croissant"].includes(role)),
).map((resource) => resource.path);
const descriptorMeta = await Promise.all(descriptorResources.map(fileMeta));
async function walkFiles(dir, prefix = "") {
  let files = [];
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const abs = path.join(dir, e.name),
      rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...(await walkFiles(abs, rel)));
    else if (e.isFile()) files.push({ abs, rel });
  }
  return files;
}
const vttBase = path.join(root, "public");
const vttMeta = [];
for (const f of (await walkFiles(vttBase)).filter((x) =>
  x.rel.endsWith(".vtt"),
)) {
  const b = await readFile(f.abs);
  const kind = f.rel.includes(".captions.") ? "caption" : "chapter";
  vttMeta.push({
    rel: f.rel,
    bytes: b.length,
    sha256: shaHex(b),
    mediaType: "text/vtt",
    distributionIri: `${release.canonicalUrl}${f.rel}#croissant-file`,
    title:
      kind === "caption"
        ? "Persian WebVTT caption track for a self-hosted physician video."
        : "WebVTT chapter track for a self-hosted physician video.",
  });
}
const resources = [...descriptorMeta, ...vttMeta];
const resourcesForDescriptor = (role) => resources.filter((resource) =>
  resource.rel.endsWith(".vtt") || resourceByPath.get(resource.rel).descriptorRoles.includes(role),
);
const slug = (s) =>
  s
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const fullSlug = (s) =>
  s
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const baseNameCounts = new Map();
for (const resource of resources) {
  const name = slug(resource.rel);
  baseNameCounts.set(name, (baseNameCounts.get(name) || 0) + 1);
}
const resourceName = (rel) => {
  const base = slug(rel);
  return baseNameCounts.get(base) > 1 ? fullSlug(rel) : base;
};
const dataPackageResources = resourcesForDescriptor("data-package")
  .map((m) => ({
    $schema: "https://datapackage.org/profiles/2.0/dataresource.json",
    id: m.distributionIri,
    name: resourceName(m.rel),
    path: m.rel,
    title: m.title,
    format: m.rel.endsWith(".vtt") ? "vtt" : undefined,
    mediatype: m.mediaType,
    bytes: m.bytes,
    hash: `sha256:${m.sha256}`,
    description: m.rel.endsWith(".vtt") ? m.title : undefined,
    ...(m.rel === "entity-facts.csv" ? {
      profile: "tabular-data-resource",
      type: "table",
      format: "csv",
      encoding: "utf-8",
      dialect: entityFactsTableDialect(),
      schema: entityFactsTableSchema(),
    } : {}),
  }))
  .map((o) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)),
  );
const resourceNames = dataPackageResources.map((resource) => resource.name),
  resourcePaths = dataPackageResources.map((resource) => resource.path);
if (new Set(resourceNames).size !== resourceNames.length)
  throw new Error("Data Package resource names must be unique");
if (new Set(resourcePaths).size !== resourcePaths.length)
  throw new Error("Data Package resource paths must be unique");
for (const name of resourceNames)
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name))
    throw new Error(`Invalid Data Package resource name: ${name}`);
const dataPackage = {
  $schema: "https://datapackage.org/profiles/2.0/datapackage.json",
  profile: "data-package",
  name: "dr-saeed-ghezelbash-public-knowledge-graph",
  title: `${datasetName} — Data Package`,
  description: datasetDescription,
  homepage: datasetLandingPage,
  id: `${release.canonicalUrl}datapackage.json`,
  version: release.release,
  // Data Package requires a timestamp; preserve a recorded creation time only.
  ...(createdAt?.includes("T") ? { created: createdAt } : {}),
  lastUpdated: datasetModifiedAt,
  licenses: [
    {
      name: "CC-BY-4.0",
      path: datasetLicense,
      title: "Creative Commons Attribution 4.0",
    },
  ],
  contributors: [
    {
      title: personName,
      path: release.primaryEntity.id,
      roles: [
        ["author", "author"], ["creator", "creator"],
        ["publisher", "publisher"], ["copyrightHolder", "rightsHolder"],
      ].filter(([property]) => arr(dataset[property]).some((value) => id(value) === release.primaryEntity.id))
        .map(([, role]) => role),
    },
  ],
  resources: dataPackageResources,
};
await writeFile(
  out("datapackage.json"),
  JSON.stringify(dataPackage, null, 2) + "\n",
);
const croissant = {
  "@context": {
    "@language": "en",
    "@base": release.canonicalUrl,
    "@vocab": "https://schema.org/",
    sc: "https://schema.org/",
    cr: "http://mlcommons.org/croissant/",
    dct: "http://purl.org/dc/terms/",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    // Croissant consumers expect scalar URLs. anyURI preserves their RDF
    // datatype without converting the JSON values into nested node objects.
    url: { "@id": "sc:url", "@type": "xsd:anyURI" },
    license: { "@id": "sc:license", "@type": "xsd:anyURI" },
    contentUrl: { "@id": "sc:contentUrl", "@type": "xsd:anyURI" },
    datePublished: { "@id": "sc:datePublished", "@type": "xsd:date" },
    dateCreated: { "@id": "sc:dateCreated", "@type": "xsd:date" },
    dateModified: { "@id": "sc:dateModified", "@type": "xsd:date" },
    conformsTo: "dct:conformsTo",
    column: "cr:column",
    dataType: { "@id": "cr:dataType", "@type": "@vocab" },
    extract: "cr:extract",
    field: "cr:field",
    fileObject: "cr:fileObject",
    isLiveDataset: "cr:isLiveDataset",
    key: "cr:key",
    recordSet: "cr:recordSet",
    source: "cr:source",
  },
  "@id": `${release.canonicalUrl}graph.jsonld#dataset`,
  "@type": "sc:Dataset",
  conformsTo: resourceByPath.get("croissant.json").profileIri,
  name: datasetName,
  description: datasetDescription,
  url: datasetLandingPage,
  license: datasetLicense,
  version: release.release,
  datePublished: datasetPublishedAt,
  ...(createdAt ? { dateCreated: createdAt } : {}),
  dateModified: datasetModifiedAt,
  creator: {
    "@id": release.primaryEntity.id,
    "@type": "sc:Person",
    name: personName,
  },
  publisher: {
    "@id": release.primaryEntity.id,
    "@type": "sc:Person",
    name: personName,
  },
  keywords: [
    personName,
    ...release.primaryEntity.officialAliases.slice(0, 2),
    "physician knowledge graph",
    "aesthetic medicine",
    practiceCityName,
    "entity data",
    "linked data",
    "query matrix",
    "multilingual retrieval",
  ],
  inLanguage: retrievalPolicy.languages,
  isLiveDataset: false,
  recordSet: [entityFactsRecordSet(release.canonicalUrl, resourceByPath.get("entity-facts.csv").distributionIri)],
  distribution: resourcesForDescriptor("croissant")
    .map((m) => ({
      "@type": "cr:FileObject",
      "@id": m.distributionIri,
      name: path.basename(m.rel),
      contentUrl: `${release.canonicalUrl}${m.rel}`,
      contentSize: String(m.bytes),
      encodingFormat: m.mediaType,
      sha256: m.sha256,
      description: m.rel.endsWith(".vtt") ? m.title : undefined,
    }))
    .map((o) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)),
    ),
};
await writeFile(
  out("croissant.json"),
  JSON.stringify(croissant, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      descriptorsGenerated: true,
      release: release.release,
      coreResources: coreResources.length,
      resources: resources.length,
      datasetName,
      outputDir: path.relative(root, outputDir) || ".",
    },
    null,
    2,
  ),
);
