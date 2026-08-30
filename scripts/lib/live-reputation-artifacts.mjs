import { createHash } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { resourcesForTarget } from "../../src/lib/resources.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const HUGGING_FACE_MANIFEST_FILE = "dist-sha256.json";
const HUGGING_FACE_AUXILIARY_FILES = Object.freeze([
  "README.md",
  "live_observations.csv",
  "live-observation-attestation.json",
]);
const HUGGING_FACE_REPOSITORY_METADATA = Object.freeze([".gitattributes"]);

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

export const huggingFaceManifestFiles = (hf) => {
  const files = [
    ...resourcesForTarget(hf.resourceTarget).map((resource) => resource.path),
    ...HUGGING_FACE_AUXILIARY_FILES,
  ].sort();
  must(
    new Set(files).size === files.length,
    "Duplicate Hugging Face distribution file",
  );
  return Object.freeze(files);
};

const huggingFaceRepositoryFiles = (hf) =>
  Object.freeze(
    [
      ...HUGGING_FACE_REPOSITORY_METADATA,
      ...huggingFaceManifestFiles(hf),
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

const validateHuggingFaceManifest = ({ manifest, release, hf }) => {
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
  const expected = huggingFaceManifestFiles(hf),
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
  const expectedRepository = huggingFaceRepositoryFiles(hf);
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
  const manifestFiles = validateHuggingFaceManifest({ manifest, release, hf });
  const files = new Map();
  for (const file of manifestFiles) {
    const bytes = await fetchBytes(file),
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

export const buildLiveReputationArtifacts = (release, volatile) => {
  const rating = Number(volatile?.rating),
    reviewCount = Number(volatile?.reviewCount),
    observedAt = volatile?.valueObservedAt;
  if (
    !(rating >= 1 && rating <= 5) ||
    !Number.isInteger(reviewCount) ||
    reviewCount < 0 ||
    volatile?.placeId !== release?.clinic?.placeId ||
    Number.isNaN(Date.parse(observedAt || ""))
  )
    throw new Error("Invalid live reputation source");
  const liveObservationId = `${release.canonicalUrl}live-observations.jsonld#clinic-google-reputation`;
  const jsonLd = {
    "@context": {
      "@vocab": "https://schema.org/",
      prov: "http://www.w3.org/ns/prov#",
    },
    "@id": liveObservationId,
    "@type": "DataFeedItem",
    item: {
      "@id": release.clinic.id,
      "@type": "MedicalClinic",
      identifier: [
        { propertyID: "Google Place ID", value: release.clinic.placeId },
      ],
      additionalProperty: [
        {
          "@type": "PropertyValue",
          propertyID: "Google Places rating",
          value: rating,
        },
        {
          "@type": "PropertyValue",
          propertyID: "Google Places userRatingCount",
          value: reviewCount,
        },
      ],
    },
    dateModified: observedAt,
    isPartOf: { "@id": release.dataset.id },
    provider: { "@type": "Organization", name: "Google Places API" },
    about: { "@id": release.clinic.id },
  };
  const csv = `entity,place_id,rating,userRatingCount,valueObservedAt,source,baseRelease\n"${release.clinic.id}","${release.clinic.placeId}",${rating},${reviewCount},"${observedAt}","Google Places API (New)","${release.release}"\n`;
  const attestation = {
    schemaVersion: "1.0",
    baseRelease: release.release,
    entity: release.clinic.id,
    placeId: release.clinic.placeId,
    rating,
    reviewCount,
    valueObservedAt: observedAt,
    source: "Google Places API (New)",
    canonicalObservationUrl: `${release.canonicalUrl}live-observations.jsonld`,
    csvSha256: sha256(csv),
  };
  return {
    rating,
    reviewCount,
    observedAt,
    liveObservationId,
    jsonLd,
    jsonLdJson: JSON.stringify(jsonLd, null, 2) + "\n",
    csv,
    attestation,
    attestationJson: JSON.stringify(attestation, null, 2) + "\n",
  };
};

export const writeLiveReputationArtifacts = async (
  directory,
  release,
  volatile,
) => {
  const artifacts = buildLiveReputationArtifacts(release, volatile);
  await Promise.all([
    writeFile(path.join(directory, "live_observations.csv"), artifacts.csv),
    writeFile(
      path.join(directory, "live-observation-attestation.json"),
      artifacts.attestationJson,
    ),
  ]);
  return artifacts;
};
