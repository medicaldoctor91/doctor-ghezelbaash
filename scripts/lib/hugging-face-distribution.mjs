import { createHash } from "node:crypto";
import path from "node:path";
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
  hf, dist, hub, root = process.cwd(),
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
    manifest.conceptDoi === release.dataset.zenodo.conceptDoi,
    "HF dist-sha256 Concept DOI drift",
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
  return Object.freeze({
    manifest,
    manifestBytes,
    files,
    repositoryFiles: expectedRepository,
  });
};

export const huggingFaceDatasetRepo = (release) => {
  const url = release?.dataset?.huggingFace?.dataset || "";
  const prefix = "https://huggingface.co/datasets/";
  if (!url.startsWith(prefix) || url.length <= prefix.length)
    throw new Error("Invalid Hugging Face dataset URL in release contract");
  return url.slice(prefix.length).replace(/\/$/, "");
};
