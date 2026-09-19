import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resourcesForTarget, sourceForDistribution } from "../../src/lib/resources.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const HUGGING_FACE_MANIFEST_FILE = "dist-sha256.json";
const HUGGING_FACE_AUXILIARY_FILES = Object.freeze(["README.md"]);
const HUGGING_FACE_REPOSITORY_METADATA = Object.freeze([".gitattributes"]);
const HUGGING_FACE_PACKAGE_FILE = "datapackage.json";
const VIEWER_PACKAGING = Object.freeze({
  schemaVersion: 1,
  revision: 1,
  manifestPath: "viewer/packaging.json",
  builder: "pyarrow",
  builderVersion: "25.0.1",
  derivatives: [
    { config: "entity_facts", source: "entity-facts.csv", path: "viewer/entity-facts.parquet" },
    { config: "query_matrix", source: "query-matrix.jsonl", path: "viewer/query-matrix.parquet" },
  ],
});
const canonicalJson = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);

// Historical tags intentionally have no packaging policy. Current packaging
// admits these exact derivatives only; it is not a wildcard inventory exception.
export const huggingFaceViewerPackaging = (hf) => {
  if (hf?.viewerPackaging === undefined) return null;
  must(canonicalJson(hf.viewerPackaging) === canonicalJson(VIEWER_PACKAGING),
    "Unsupported Hugging Face viewer packaging contract");
  const core = new Set(resourcesForTarget(hf.resourceTarget).map((resource) => resource.path));
  for (const row of hf.viewerPackaging.derivatives) {
    must(core.has(row.source), `HF viewer source is not a core resource: ${row.source}`);
    must(!core.has(row.path), `HF viewer derivative overlaps a frozen source: ${row.path}`);
    must(hf.configs.some((config) => config.name === row.config && config.path === row.path),
      `HF viewer derivative/config drift: ${row.config}`);
  }
  return hf.viewerPackaging;
};

export const huggingFaceViewerPackagingFiles = (hf) => {
  const policy = huggingFaceViewerPackaging(hf);
  return Object.freeze(policy ? [policy.manifestPath, ...policy.derivatives.map((row) => row.path)].sort() : []);
};

// A portable package resolves paths next to its descriptor. The registry owns
// core outputs; the descriptor also owns generated resources such as VTT tracks.
export const huggingFacePackageResources = (descriptor) => {
  must(
    descriptor && Array.isArray(descriptor.resources) && descriptor.resources.length > 0,
    "HF Data Package resources are missing",
  );
  const paths = new Set();
  return Object.freeze(descriptor.resources.map((resource) => {
    const file = resource?.path;
    must(
      typeof file === "string" && /^[a-z0-9][a-z0-9._/-]*$/i.test(file) &&
        file.split("/").every((segment) => segment && !segment.startsWith(".")) &&
        ![HUGGING_FACE_MANIFEST_FILE, HUGGING_FACE_PACKAGE_FILE,
          ...HUGGING_FACE_AUXILIARY_FILES, ...HUGGING_FACE_REPOSITORY_METADATA].includes(file),
      `HF Data Package requires a safe relative resource path: ${file}`,
    );
    must(!paths.has(file), `HF Data Package duplicate resource path: ${file}`);
    must(
      Number.isSafeInteger(resource.bytes) && resource.bytes >= 0 &&
        /^sha256:[0-9a-f]{64}$/.test(resource.hash),
      `HF Data Package resource requires bytes and SHA-256: ${file}`,
    );
    paths.add(file);
    return Object.freeze({ path: file, bytes: resource.bytes, sha256: resource.hash.slice(7) });
  }));
};

const verifyPackageResource = (resource, bytes) => {
  must(bytes.length === resource.bytes,
    `HF Data Package byte-count drift ${resource.path}: actual=${bytes.length} expected=${resource.bytes}`);
  must(sha256(bytes) === resource.sha256,
    `HF Data Package SHA-256 drift ${resource.path}`);
};

export const stageHuggingFaceDistributionResources = async ({
  hf, dist, hub, release, root = process.cwd(),
}) => {
  const registry = resourcesForTarget(hf.resourceTarget);
  const descriptorResource = registry.find((resource) => resource.path === HUGGING_FACE_PACKAGE_FILE);
  must(descriptorResource, "HF registry must include the Data Package descriptor");
  const sources = new Map(registry.map((resource) => [
    resource.path, path.resolve(root, sourceForDistribution(resource, dist)),
  ]));
  const descriptorBytes = await readFile(sources.get(HUGGING_FACE_PACKAGE_FILE));
  const descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  const packageResources = huggingFacePackageResources(descriptor);
  const distRoot = await realpath(path.resolve(root, dist));
  for (const resource of packageResources) {
    if (sources.has(resource.path)) continue;
    const source = await realpath(path.join(distRoot, resource.path));
    const relative = path.relative(distRoot, source);
    must(relative && !relative.startsWith("..") && !path.isAbsolute(relative),
      `HF Data Package resource escapes dist: ${resource.path}`);
    sources.set(resource.path, source);
  }
  const packageByPath = new Map(packageResources.map((resource) => [resource.path, resource]));
  for (const [file, source] of sources) {
    const bytes = file === HUGGING_FACE_PACKAGE_FILE ? descriptorBytes : await readFile(source);
    if (packageByPath.has(file)) verifyPackageResource(packageByPath.get(file), bytes);
    const target = path.resolve(root, hub, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  if (huggingFaceViewerPackaging(hf)) {
    must(release?.release && release?.dataset?.zenodo?.versionDoi && release?.dataset?.id,
      "HF viewer staging requires the canonical release identity");
    const builder = fileURLToPath(new URL("../build-hf-viewer.py", import.meta.url));
    const result = spawnSync("python3", [builder,
      "--hub", path.resolve(root, hub), "--release", release.release,
      "--doi", release.dataset.zenodo.versionDoi, "--dataset", release.dataset.id,
    ], { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
    must(!result.error && result.status === 0,
      `HF viewer packaging failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return descriptor;
};

export const huggingFaceConfigs = (hf) => {
  must(
    Array.isArray(hf?.configs) && hf.configs.length > 0,
    "Hugging Face configs are missing",
  );
  const availableFiles = new Set([
    ...resourcesForTarget(hf.resourceTarget).map((resource) => resource.path),
    ...HUGGING_FACE_AUXILIARY_FILES,
    ...huggingFaceViewerPackagingFiles(hf),
  ]);
  const names = new Set(),
    paths = new Set();
  const configs = hf.configs.map((config, index) => {
    must(
      config && typeof config === "object" && !Array.isArray(config),
      `Invalid Hugging Face config at index ${index}`,
    );
    const keys = Object.keys(config).sort();
    must(
      JSON.stringify(keys) === JSON.stringify(["default", "name", "path"]),
      `Unexpected Hugging Face config fields at index ${index}`,
    );
    must(
      /^[a-z][a-z0-9_]*$/.test(config.name) && !names.has(config.name),
      `Invalid or duplicate Hugging Face config name: ${config.name}`,
    );
    must(
      typeof config.path === "string" &&
        /^[a-z0-9._/-]+$/i.test(config.path) &&
        !config.path.startsWith("/") &&
        !config.path.includes("..") &&
        !paths.has(config.path),
      `Invalid or duplicate Hugging Face config path: ${config.path}`,
    );
    must(
      typeof config.default === "boolean",
      `Hugging Face config default must be boolean: ${config.name}`,
    );
    must(
      availableFiles.has(config.path),
      `Hugging Face config path is outside the declared distribution: ${config.path}`,
    );
    names.add(config.name);
    paths.add(config.path);
    return Object.freeze({
      name: config.name,
      path: config.path,
      default: config.default,
    });
  });
  must(
    configs.filter((config) => config.default).length === 1,
    "Hugging Face must declare exactly one default config",
  );
  return Object.freeze(configs);
};

export const huggingFaceManifestFiles = (hf, descriptor) => {
  const registeredFiles = [
    ...resourcesForTarget(hf.resourceTarget).map((resource) => resource.path),
    ...HUGGING_FACE_AUXILIARY_FILES,
    ...huggingFaceViewerPackagingFiles(hf),
  ];
  must(
    new Set(registeredFiles).size === registeredFiles.length,
    "Duplicate Hugging Face distribution file",
  );
  const files = [...new Set([
    ...registeredFiles,
    ...huggingFacePackageResources(descriptor).map((resource) => resource.path),
  ])].sort();
  return Object.freeze(files);
};

const huggingFaceRepositoryFiles = (hf, descriptor) =>
  Object.freeze(
    [
      ...HUGGING_FACE_REPOSITORY_METADATA,
      ...huggingFaceManifestFiles(hf, descriptor),
      HUGGING_FACE_MANIFEST_FILE,
    ].sort(),
  );

const sameStrings = (left, right) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const inventoryError = (label, actual, expected) => {
  const actualSet = new Set(actual),
    expectedSet = new Set(expected);
  const missing = expected.filter((file) => !actualSet.has(file));
  const unexpected = actual.filter((file) => !expectedSet.has(file));
  return `${label}: missing=${missing.join(", ") || "none"} unexpected=${unexpected.join(", ") || "none"}`;
};

const validateHuggingFaceManifest = ({ manifest, release, hf, descriptor }) => {
  must(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "HF dist-sha256 manifest is not an object",
  );
  must(manifest.release === release.release, "HF dist-sha256 release drift");
  must(
    manifest.canonicalDatasetIri === release.dataset.id,
    "HF dist-sha256 Dataset IRI drift",
  );
  must(
    manifest.zenodoVersionDoi === release.dataset.zenodo.versionDoi,
    "HF dist-sha256 Version DOI drift",
  );
  must(
    manifest.files &&
      typeof manifest.files === "object" &&
      !Array.isArray(manifest.files),
    "HF dist-sha256 files map is missing",
  );
  const expected = huggingFaceManifestFiles(hf, descriptor),
    actual = Object.keys(manifest.files);
  must(
    sameStrings(actual, expected),
    inventoryError("HF dist-sha256 inventory drift", actual, expected),
  );
  for (const file of expected) {
    const row = manifest.files[file];
    must(
      row &&
        Number.isSafeInteger(row.bytes) &&
        row.bytes >= 0 &&
        /^[0-9a-f]{64}$/.test(row.sha256),
      `HF dist-sha256 row is invalid: ${file}`,
    );
  }
  return expected;
};

const validateViewerPackaging = ({ hf, release, files, manifest }) => {
  const policy = huggingFaceViewerPackaging(hf);
  if (!policy) return null;
  let packaging;
  try {
    packaging = JSON.parse(files.get(policy.manifestPath).toString("utf8"));
  } catch {
    throw new Error("HF viewer packaging manifest is not valid JSON");
  }
  must(packaging.schemaVersion === policy.schemaVersion &&
    packaging.packagingRevision === policy.revision &&
    packaging.role === "reversible-viewer-access-derivatives",
  "HF viewer packaging identity drift");
  must(packaging.release === release.release &&
    packaging.zenodoVersionDoi === release.dataset.zenodo.versionDoi &&
    packaging.canonicalDatasetIri === release.dataset.id,
  "HF viewer packaging source release/DOI/Dataset drift");
  must(packaging.builder?.name === policy.builder && packaging.builder?.version === policy.builderVersion,
    "HF viewer packaging builder drift");
  const expected = policy.derivatives.map((row) => row.path);
  must(packaging.files && sameStrings(Object.keys(packaging.files), expected),
    "HF viewer packaging derivative inventory drift");
  const schemaFields = {
    entity_facts: ["subject", "type", "name", "predicate", "value", "object", "object_name",
      "language", "datatype", "provenance", "dataset", "version", "modified", "row_id", "value_kind", "value_media_type"],
    query_matrix: ["row_kind", "query", "intent_family", "language", "query_scope", "practice_location",
      "canonical_subject", "canonical_subject_iri", "dataset_iri", "release", "version_doi", "retrieval_policy",
      "resolution_mode", "stable_evidence_refs", "answer_id", "answer_strategy", "service_ids", "service_families",
      "service_types", "_source_omitted_fields"],
  };
  const listFields = new Set(["stable_evidence_refs", "service_ids", "service_families", "service_types", "_source_omitted_fields"]);
  for (const derivative of policy.derivatives) {
    const entry = packaging.files[derivative.path];
    const derivativeHash = manifest.files[derivative.path];
    const sourceHash = manifest.files[derivative.source];
    must(entry?.config === derivative.config && entry?.format === "parquet" &&
      entry?.roundtrip === "exact-values-list-order-row-order-and-field-presence",
    `HF viewer packaging semantics drift: ${derivative.path}`);
    must(entry.bytes === derivativeHash.bytes && entry.sha256 === derivativeHash.sha256,
      `HF viewer derivative digest drift: ${derivative.path}`);
    must(entry.source?.path === derivative.source && entry.source?.bytes === sourceHash.bytes &&
      entry.source?.sha256 === sourceHash.sha256,
    `HF viewer source digest drift: ${derivative.path}`);
    must(Number.isSafeInteger(entry.rows) && entry.rows > 0,
      `HF viewer row count is invalid: ${derivative.path}`);
    const fields = schemaFields[derivative.config].map((name) => ({
      name,
      type: derivative.config === "query_matrix" && listFields.has(name) ? "list<string>" : "string",
      nullable: derivative.config === "query_matrix" && ["answer_id", "service_types"].includes(name),
    }));
    must(canonicalJson(entry.fields) === canonicalJson(fields),
      `HF viewer typed schema drift: ${derivative.path}`);
  }
  return packaging;
};

export const verifyHuggingFaceRemoteDistribution = async ({
  release,
  hf,
  metadata,
  fetchBytes,
}) => {
  must(typeof fetchBytes === "function", "HF remote byte fetcher is missing");
  const descriptorBytes = await fetchBytes(HUGGING_FACE_PACKAGE_FILE);
  let descriptor;
  try {
    descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  } catch {
    throw new Error("HF Data Package descriptor is not valid JSON");
  }
  const packageResources = huggingFacePackageResources(descriptor);
  const expectedRepository = huggingFaceRepositoryFiles(hf, descriptor);
  const siblings = (metadata?.siblings || []).map((row) => row?.rfilename);
  must(
    siblings.length > 0 &&
      siblings.every((file) => typeof file === "string" && file),
    "HF API sibling inventory is missing",
  );
  must(
    new Set(siblings).size === siblings.length,
    "HF API sibling inventory contains duplicates",
  );
  must(
    sameStrings(siblings, expectedRepository),
    inventoryError(
      "HF remote repository inventory drift",
      siblings,
      expectedRepository,
    ),
  );

  const manifestBytes = await fetchBytes(HUGGING_FACE_MANIFEST_FILE);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("HF dist-sha256 manifest is not valid JSON");
  }
  const manifestFiles = validateHuggingFaceManifest({ manifest, release, hf, descriptor });
  const files = new Map();
  for (const file of manifestFiles) {
    const bytes = file === HUGGING_FACE_PACKAGE_FILE ? descriptorBytes : await fetchBytes(file),
      row = manifest.files[file],
      actualSha256 = sha256(bytes);
    must(
      bytes.length === row.bytes,
      `HF remote byte-count drift ${file}: actual=${bytes.length} expected=${row.bytes}`,
    );
    must(
      actualSha256 === row.sha256,
      `HF remote SHA-256 drift ${file}: actual=${actualSha256} expected=${row.sha256}`,
    );
    files.set(file, bytes);
  }
  for (const resource of packageResources)
    verifyPackageResource(resource, files.get(resource.path));
  const viewerPackaging = validateViewerPackaging({ hf, release, files, manifest });
  return Object.freeze({
    manifest,
    manifestBytes,
    files,
    repositoryFiles: expectedRepository,
    viewerPackaging,
  });
};

export const huggingFaceDatasetRepo = (release) => {
  const url = release?.dataset?.huggingFace?.dataset || "";
  const prefix = "https://huggingface.co/datasets/";
  if (!url.startsWith(prefix) || url.length <= prefix.length)
    throw new Error("Invalid Hugging Face dataset URL in release contract");
  return url.slice(prefix.length).replace(/\/$/, "");
};
