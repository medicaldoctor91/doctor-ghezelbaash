import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashIdentityFingerprint } from "./release-identity.mjs";
import { generatedWorkspace } from "../generated-workspace.mjs";
import { indexCanonicalGraph } from "../../src/lib/semantic-projection.mjs";

export const nodeTypes = (node) =>
  Array.isArray(node?.["@type"])
    ? node["@type"]
    : [node?.["@type"]].filter(Boolean);
const refId = (value) =>
  value && typeof value === "object" && value["@id"] ? value["@id"] : null;
export const refIds = (value) =>
  (Array.isArray(value) ? value : [value]).map(refId).filter(Boolean);
export const valueText = (value) => {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (Array.isArray(value))
    return value.map(valueText).filter(Boolean).join(" | ");
  if (value["@value"] != null) return String(value["@value"]);
  if (value["@id"]) return value["@id"];
  return JSON.stringify(value);
};
export const csvCell = (value) => {
  const source = String(value ?? "");
  return /[",\n\r]/.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
};
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const evidenceAssessmentId = (release, evidenceId) => {
  const source = new URL(evidenceId);
  if (
    !evidenceId.startsWith(`${release.canonicalUrl}#evidence-`) ||
    !source.hash
  )
    throw new Error(
      `Evidence assessment requires a canonical source IRI: ${evidenceId}`,
    );
  return `${release.canonicalUrl}provenance.jsonld#assessment-${source.hash.slice(1)}`;
};
export const deriveEvidenceRegistry = (release, registry) => {
  const currentId = `${release.canonicalUrl}#evidence-zenodo-current-release`;
  return {
    ...registry,
    evidence: registry.evidence.map((source) => {
      if (source.id !== currentId) return { ...source };
      const { releaseBinding, verifiedRelease, ...entry } = source;
      if (releaseBinding !== "zenodo-version" || "url" in source)
        throw new Error(
          "Current release evidence URL must be derived from release metadata",
        );
      if (
        entry.tier !== "P" ||
        entry.role !== "first-party-release-preservation"
      )
        throw new Error(
          "Release preservation must not claim independent corroboration",
        );
      entry.url = `https://doi.org/${release.dataset.zenodo.versionDoi}`;
      if (verifiedRelease !== release.release) {
        delete entry.verifiedAt;
        entry.liveStatus = "not-verified-for-current-release";
      }
      return entry;
    }),
  };
};
export const deriveEvidenceSnapshot = (release, registry) => {
  const evidence = registry.evidence;
  if (!Array.isArray(evidence) || !evidence.length)
    throw new Error("Evidence registry is empty");
  for (const entry of evidence)
    if (
      (typeof entry.verifiedAt !== "string" || !entry.verifiedAt) &&
      entry.liveStatus !== "not-verified-for-current-release"
    )
      throw new Error(
        `Evidence entry lacks its canonical verification date: ${entry.id}`,
      );
  return {
    release: release.release,
    observedAt: registry.verifiedAt,
    primaryEntity: release.primaryEntity.id,
    entries: evidence.map((entry) => ({
      id: entry.id,
      tier: entry.tier,
      url: entry.url,
      status: entry.liveStatus,
      verifiedAt: entry.verifiedAt,
      role: entry.role,
      assessmentId: evidenceAssessmentId(release, entry.id),
      expectedMarkers: entry.expectedMarkers ?? [],
    })),
  };
};

export async function loadProjectionContext({ root = process.cwd() } = {}) {
  const data = path.join(root, "src/data");
  const semantic = path.join(data, "semantic");
  const generated = generatedWorkspace(root);
  const [release, invariants, rawEvidenceRegistry, graph] = await Promise.all([
    readFile(path.join(data, "release.json"), "utf8").then(JSON.parse),
    readFile(path.join(data, "release-invariants.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(path.join(data, "evidence-registry.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(path.join(semantic, "knowledge-graph.jsonld"), "utf8").then(
      JSON.parse,
    ),
  ]);
  const evidenceRegistry = deriveEvidenceRegistry(release, rawEvidenceRegistry);
  if (!Array.isArray(graph["@graph"]))
    throw new Error("Canonical graph lacks @graph");
  const evidenceEntries = evidenceRegistry.evidence;
  if (
    !Array.isArray(evidenceEntries) ||
    !evidenceEntries.length ||
    evidenceEntries.some(
      (entry) =>
        typeof entry?.id !== "string" ||
        !entry.id ||
        typeof entry.url !== "string" ||
        !entry.url,
    ) ||
    new Set(evidenceEntries.map((entry) => entry.id)).size !==
      evidenceEntries.length ||
    new Set(evidenceEntries.map((entry) => entry.url)).size !==
      evidenceEntries.length
  )
    throw new Error("Evidence registry requires unique direct IDs and URLs");
  const evidenceSnapshot = deriveEvidenceSnapshot(release, evidenceRegistry);

  const { byId, sourceNodesForUrl } = indexCanonicalGraph(graph);
  const evidenceById = new Map(evidenceEntries.map((item) => [item.id, item]));
  const evidenceByUrl = new Map(
    evidenceEntries.map((item) => [item.url, item.id]),
  );
  const tierAEvidenceIds = new Set(
    evidenceEntries.filter((item) => item.tier === "A").map((item) => item.id),
  );
  const refsFromNode = (node) => {
    if (!node || typeof node !== "object") return [];
    const found = [];
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        if (typeof value["@id"] === "string") found.push(value["@id"]);
        for (const nested of Object.values(value)) walk(nested);
      }
    };
    walk(node);
    return [...new Set(found)];
  };
  const evidenceRefsForNode = (node) => [
    ...new Set(
      refsFromNode(node)
        .map((id) => (evidenceById.has(id) ? id : evidenceByUrl.get(id)))
        .filter(Boolean),
    ),
  ];
  const nodeName = (node) => valueText(node?.name);

  return {
    root,
    data,
    semantic,
    generated,
    projections: generated.projections,
    generatedSemantic: generated.semantic,
    generatedPublic: generated.public,
    generatedContent: generated.content,
    generatedAssets: generated.assets,
    release,
    invariants,
    evidenceRegistry,
    evidenceSnapshot,
    graph,
    byId,
    sourceNodesForUrl,
    evidenceById,
    evidenceByUrl,
    tierAEvidenceIds,
    evidenceRefsForNode,
    nodeName,
    identityFingerprintSha256: hashIdentityFingerprint(release),
  };
}
