import path from "node:path";
import { createHash } from "node:crypto";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { hashIdentityFingerprint } from "./release-identity.mjs";
import { generatedWorkspace } from "../generated-workspace.mjs";
import { indexCanonicalGraph } from "../../src/lib/semantic-projection.mjs";
import { derivePublicationData } from "../../src/lib/canonical-authority.mjs";

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
export const deriveEvidenceSnapshot = (release, registry) => {
  const evidence = registry.evidence;
  if (!Array.isArray(evidence) || !evidence.length)
    throw new Error("Evidence registry is empty");
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
      assessmentId: entry.assessmentId,
      expectedMarkers: entry.expectedMarkers ?? [],
    })),
  };
};

export async function loadProjectionContext({ root = process.cwd() } = {}) {
  const data = path.join(root, "src/data");
  const semantic = path.join(data, "semantic");
  const generated = generatedWorkspace(root);
  const { lifecycle: rawRelease, graph, evidenceRegistry, retrievalPolicy } = readCanonicalInputs(root);
  if (!Array.isArray(graph["@graph"]))
    throw new Error("Canonical graph lacks @graph");
  const release = derivePublicationData(rawRelease, graph);
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
    rawRelease,
    retrievalPolicy,
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
