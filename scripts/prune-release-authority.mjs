import { readFile, writeFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");
const write = (file, value) => writeFile(file, value, "utf8");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const ensureImport = (source, spec) =>
  source.includes(spec) ? source : `${spec}\n${source}`;

const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

const replaceAllRequired = (source, before, after, expected, label) => {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== expected)
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return source.split(before).join(after);
};

const update = async (file, mutate) => {
  const before = await read(file);
  const after = mutate(before);
  if (after === before) return false;
  await write(file, after);
  return true;
};

const loaderImport =
  'import { loadAuthoritativeRelease } from "./lib/authoritative-release.mjs";';
const contextImport =
  'import { loadAuthoritativeReleaseContext } from "./lib/authoritative-release.mjs";';

const changed = [];

const simplePatches = [
  [
    "scripts/validate-query-matrix.mjs",
    `const release = await readJson("src/data/release.json");`,
    `const release = await loadAuthoritativeRelease(root);`,
  ],
  [
    "scripts/write-release-attestation.mjs",
    `const release = JSON.parse(await readFile("src/data/release.json", "utf8"));`,
    `const release = await loadAuthoritativeRelease(root);`,
  ],
  [
    "scripts/generate-descriptors.mjs",
    `const release = await readJson("src/data/release.json");`,
    `const release = await loadAuthoritativeRelease(root);`,
  ],
  [
    "scripts/validate-schemaorg-vocabulary.mjs",
    `const release = JSON.parse(await readFile("src/data/release.json", "utf8"));`,
    `const release = await loadAuthoritativeRelease();`,
  ],
  [
    "scripts/generate-retrieval-projections.mjs",
    `const release = await readJson("src/data/release.json");`,
    `const release = await loadAuthoritativeRelease(root);`,
  ],
  [
    "scripts/validate-critical-ctas.mjs",
    `const release = JSON.parse(await readFile("src/data/release.json", "utf8"));`,
    `const release = await loadAuthoritativeRelease();`,
  ],
];
for (const [file, before, after] of simplePatches) {
  if (
    await update(file, (source) =>
      replaceOnce(ensureImport(source, loaderImport), before, after, file),
    )
  )
    changed.push(file);
}

if (
  await update("scripts/enrich-image-metadata.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `const release = JSON.parse(\n  await readFile(path.join(root, "src/data/release.json"), "utf8"),\n);`,
      `const release = await loadAuthoritativeRelease(root);`,
      "enrich-image-metadata release load",
    );
  })
)
  changed.push("scripts/enrich-image-metadata.mjs");

if (
  await update("scripts/validate-media.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `const release = JSON.parse(\n  await readFile(path.join(project, "src/data/release.json"), "utf8"),\n);`,
      `const release = await loadAuthoritativeRelease(project);`,
      "validate-media release load",
    );
  })
)
  changed.push("scripts/validate-media.mjs");

if (
  await update("scripts/validate-current-context.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `const release = JSON.parse(\n  await readFile(path.join(root, "src/data/release.json"), "utf8"),\n);`,
      `const release = await loadAuthoritativeRelease(root);`,
      "validate-current-context release load",
    );
  })
)
  changed.push("scripts/validate-current-context.mjs");

if (
  await update("scripts/validate-source.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `const release = await readJson("src/data/release.json"),`,
      `const release = await loadAuthoritativeRelease(root),`,
      "validate-source release load",
    );
  })
)
  changed.push("scripts/validate-source.mjs");

if (
  await update("scripts/validate-architecture.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `  readJson("src/data/release.json"),`,
      `  loadAuthoritativeRelease(root),`,
      "validate-architecture release load",
    );
  })
)
  changed.push("scripts/validate-architecture.mjs");

if (
  await update("scripts/validate-semantic-html.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `  readFile("src/data/release.json", "utf8").then(JSON.parse),`,
      `  loadAuthoritativeRelease(),`,
      "validate-semantic-html release load",
    );
  })
)
  changed.push("scripts/validate-semantic-html.mjs");

if (
  await update("scripts/reputation.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceAllRequired(
      source,
      `    readJson("src/data/release.json"),`,
      `    loadAuthoritativeRelease(),`,
      2,
      "reputation release loads",
    );
  })
)
  changed.push("scripts/reputation.mjs");

if (
  await update("scripts/platform-contract.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceOnce(
      source,
      `      readJson("src/data/release.json"),`,
      `      loadAuthoritativeRelease(),`,
      "platform-contract release load",
    );
  })
)
  changed.push("scripts/platform-contract.mjs");

if (
  await update("scripts/huggingface.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    return replaceAllRequired(
      source,
      `    readJson("src/data/release.json"),`,
      `    loadAuthoritativeRelease(),`,
      2,
      "huggingface release loads",
    );
  })
)
  changed.push("scripts/huggingface.mjs");

if (
  await update("scripts/test-contracts.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    source = replaceOnce(
      source,
      `      readFile("src/data/release.json", "utf8").then(JSON.parse),`,
      `      loadAuthoritativeRelease(),`,
      "test-contracts canonical semantic release load",
    );
    source = replaceAllRequired(
      source,
      `  const release = JSON.parse(await readFile("src/data/release.json", "utf8"));`,
      `  const release = await loadAuthoritativeRelease();`,
      2,
      "test-contracts semantic release loads",
    );
    return source;
  })
)
  changed.push("scripts/test-contracts.mjs");

if (
  await update("scripts/verify-live.mjs", (source) => {
    source = ensureImport(source, loaderImport);
    source = replaceOnce(
      source,
      `    readFile("src/data/release.json", "utf8").then(JSON.parse),`,
      `    loadAuthoritativeRelease(),`,
      "verify-live current release load",
    );
    source = replaceOnce(
      source,
      `  const release = JSON.parse(\n      await readFile(path.join(root, "src/data/release.json"), "utf8"),\n    ),`,
      `  const release = await loadAuthoritativeRelease(root),`,
      "verify-live discovery release load",
    );
    return source;
  })
)
  changed.push("scripts/verify-live.mjs");

if (
  await update("scripts/validate-release-contract.mjs", (source) => {
    source = ensureImport(source, contextImport);
    source = replaceOnce(
      source,
      `const release = await readJson("src/data/release.json");`,
      `const { rawRelease, graph: canonicalGraph, release } =\n  await loadAuthoritativeReleaseContext(root);`,
      "validate-release-contract authoritative context",
    );
    source = replaceOnce(
      source,
      `const graph = await readJson("src/data/semantic/knowledge-graph.jsonld");`,
      `const graph = canonicalGraph;`,
      "validate-release-contract graph reuse",
    );
    const anchor = `const Z = release.dataset?.zenodo;\nassertIdentityFingerprintSource(release);`;
    const contract = `const Z = release.dataset?.zenodo;\nexactKeys(\n  rawRelease,\n  [\n    "release",\n    "dateModified",\n    "canonicalUrl",\n    "primaryEntity",\n    "clinic",\n    "dataset",\n    "datasetRevisionDate",\n    "currentSource",\n  ],\n  "release lifecycle",\n);\nexactKeys(rawRelease.primaryEntity, ["id"], "release primaryEntity pointer");\nexactKeys(rawRelease.clinic, ["id"], "release clinic pointer");\nexactKeys(\n  rawRelease.dataset,\n  ["id", "license", "github", "zenodo", "huggingFace"],\n  "release dataset lifecycle",\n);\nassertIdentityFingerprintSource(release);`;
    source = replaceOnce(
      source,
      anchor,
      contract,
      "validate-release-contract raw release schema",
    );
    return source;
  })
)
  changed.push("scripts/validate-release-contract.mjs");

if (
  await update("scripts/promote-release.mjs", (source) =>
    replaceOnce(
      source,
      `    webpage.lastReviewed === release.medicalReviewedAt,`,
      `    validRevisionDate(webpage.lastReviewed),`,
      "promote-release medical review graph ownership",
    ),
  )
)
  changed.push("scripts/promote-release.mjs");

const releaseFile = "src/data/release.json";
const rawRelease = JSON.parse(await read(releaseFile));
const prunedRelease = {
  release: rawRelease.release,
  dateModified: rawRelease.dateModified,
  canonicalUrl: rawRelease.canonicalUrl,
  primaryEntity: { id: rawRelease.primaryEntity.id },
  clinic: { id: rawRelease.clinic.id },
  dataset: {
    id: rawRelease.dataset.id,
    license: rawRelease.dataset.license,
    github: rawRelease.dataset.github,
    zenodo: rawRelease.dataset.zenodo,
    huggingFace: rawRelease.dataset.huggingFace,
  },
  datasetRevisionDate: rawRelease.datasetRevisionDate,
  currentSource: rawRelease.currentSource,
};
if (JSON.stringify(rawRelease) !== JSON.stringify(prunedRelease)) {
  await write(releaseFile, json(prunedRelease));
  changed.push(releaseFile);
}

console.log(
  JSON.stringify(
    {
      releaseAuthorityPruned: true,
      release: prunedRelease.release,
      retainedTopLevelKeys: Object.keys(prunedRelease),
      retainedPrimaryEntityKeys: Object.keys(prunedRelease.primaryEntity),
      retainedClinicKeys: Object.keys(prunedRelease.clinic),
      retainedDatasetKeys: Object.keys(prunedRelease.dataset),
      changed,
    },
    null,
    2,
  ),
);
