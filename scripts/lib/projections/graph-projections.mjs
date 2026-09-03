import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { projectNode } from "../../../src/lib/semantic-projection.mjs";
import { nodeTypes } from "../projection-context.mjs";

const appendUnique = (target, values) => {
  for (const value of values || [])
    if (!target.includes(value)) target.push(value);
};
const projectSchemaContext = (context) => {
  const projected = Object.fromEntries(
    Object.entries(context || {}).filter(([key, value]) => {
      if (key === "@version" || key === "@vocab" || key === "schema")
        return true;
      return (
        value &&
        typeof value === "object" &&
        typeof value["@id"] === "string" &&
        value["@id"].startsWith("https://schema.org/")
      );
    }),
  );
  if (
    projected["@version"] !== 1.1 ||
    projected["@vocab"] !== "https://schema.org/" ||
    projected.schema !== "https://schema.org/"
  )
    throw new Error("Canonical graph lacks the Schema.org projection context");
  return projected;
};
const mergeProjectionProfiles = (profiles) => {
  const active = (profiles || []).filter(
    (profile) => profile && typeof profile === "object",
  );
  if (!active.length) return null;
  if (active.some((profile) => !Array.isArray(profile.include))) return {};
  const merged = { include: [] };
  for (const profile of active) appendUnique(merged.include, profile.include);
  for (const policy of ["refAllow", "valueAllow"]) {
    const entries = {};
    for (const profile of active)
      for (const [key, values] of Object.entries(profile[policy] || {})) {
        entries[key] ??= [];
        appendUnique(entries[key], values);
      }
    if (Object.keys(entries).length) merged[policy] = entries;
  }
  return merged;
};

const homepageEventTypeExceptions = new Set([
  "CourseInstance",
  "EventSeries",
  "Festival",
  "Hackathon",
]);
const homepageArticleRichResultTypes = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
]);
const homepagePersonProviderOnlyProperties = new Set([
  "areaServed",
  "availableService",
  "medicalSpecialty",
  "practicesAt",
  "priceRange",
]);
const isHomepageEventType = (type) =>
  typeof type === "string" &&
  (type === "Event" ||
    type.endsWith("Event") ||
    homepageEventTypeExceptions.has(type));
const isHomepageEventNode = (node) =>
  nodeTypes(node).some(isHomepageEventType);
const isExternalUrl = (value, canonicalOrigin) => {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).origin !== canonicalOrigin;
  } catch {
    return false;
  }
};
const isHomepageExternalRichResultNode = (node, canonicalOrigin) => {
  if (!isExternalUrl(node?.url, canonicalOrigin)) return false;
  const types = nodeTypes(node);
  return (
    types.some((type) => homepageArticleRichResultTypes.has(type)) ||
    types.includes("Organization")
  );
};
const stripNonSchemaHomepageProperties = (value) => {
  if (Array.isArray(value)) return value.map(stripNonSchemaHomepageProperties);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!key.startsWith("@") && key.includes(":")) continue;
    out[key] = stripNonSchemaHomepageProperties(nested);
  }
  return out;
};
const normalizeHomepagePhysician = (node, physicianId) => {
  if (node?.["@id"] !== physicianId) return node;
  const out = structuredClone(node);
  // Google ProfilePage expects an individual mainEntity to be a Person. The
  // canonical graph can retain the richer IndividualPhysician typing, but that
  // Schema.org type inherits Organization/LocalBusiness/Place and therefore
  // would conflate the physician person with a business in homepage markup.
  out["@type"] = "Person";
  for (const property of homepagePersonProviderOnlyProperties)
    delete out[property];
  return out;
};
const collectPrefixedPropertyKeys = (value, path = "$") => {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      collectPrefixedPropertyKeys(item, `${path}[${index}]`),
    );
  if (!value || typeof value !== "object") return [];
  const offenders = [];
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (!key.startsWith("@") && key.includes(":")) offenders.push(nextPath);
    offenders.push(...collectPrefixedPropertyKeys(nested, nextPath));
  }
  return offenders;
};
const assertPureSchemaHomepageNodes = (nodes, label) => {
  const offenders = collectPrefixedPropertyKeys(nodes);
  if (offenders.length)
    throw new Error(
      `${label} homepage projection contains non-Schema prefixed properties without an inline context mapping: ${offenders.join(", ")}`,
    );
};
const assertHomepagePhysicianPerson = (nodes, physicianId) => {
  const physician = nodes.find((node) => node?.["@id"] === physicianId);
  if (!physician)
    throw new Error(`Head homepage projection is missing physician ${physicianId}`);
  const types = nodeTypes(physician);
  if (types.length !== 1 || types[0] !== "Person")
    throw new Error(
      `Homepage physician must be exactly Person, received ${types.join(", ") || "none"}`,
    );
  const providerOnly = [...homepagePersonProviderOnlyProperties].filter(
    (property) => Object.hasOwn(physician, property),
  );
  if (providerOnly.length)
    throw new Error(
      `Homepage Person carries provider-only properties: ${providerOnly.join(", ")}`,
    );
};
const assertNoHomepageEventNodes = (nodes, label) => {
  const offenders = nodes.flatMap((node) =>
    nodeTypes(node)
      .filter(isHomepageEventType)
      .map((type) => `${node["@id"] || "(anonymous)"} [${type}]`),
  );
  if (offenders.length)
    throw new Error(
      `${label} homepage projection must not expose Event-rich-result nodes: ${offenders.join(", ")}`,
    );
};
const assertNoHomepageExternalRichResultNodes = (
  nodes,
  label,
  canonicalOrigin,
) => {
  const offenders = nodes
    .filter((node) => isHomepageExternalRichResultNode(node, canonicalOrigin))
    .map(
      (node) =>
        `${node["@id"] || "(anonymous)"} [${nodeTypes(node).join(", ")}]`,
    );
  if (offenders.length)
    throw new Error(
      `${label} homepage projection must not expand external Article/Organization rich-result candidates: ${offenders.join(", ")}`,
    );
};

export async function compileGraphProjections(context) {
  const { semantic, generatedSemantic, graph, byId, release } = context;
  const [headProfile, supportProfile] = await Promise.all([
    readFile(path.join(semantic, "head-profile.json"), "utf8").then(JSON.parse),
    readFile(path.join(semantic, "support-profile.json"), "utf8").then(
      JSON.parse,
    ),
  ]);
  const headIds = headProfile.ids;
  const supportIds = supportProfile.ids;
  if (!Array.isArray(headIds) || !Array.isArray(supportIds))
    throw new Error("Projection profile IDs are missing");
  if (
    new Set(headIds).size !== headIds.length ||
    new Set(supportIds).size !== supportIds.length
  )
    throw new Error("Projection profile IDs must be unique");
  const overlap = supportIds.filter((id) => headIds.includes(id));
  if (overlap.length)
    throw new Error(
      `Head/support projection IDs must be disjoint: ${overlap.join(", ")}`,
    );

  const canonicalOrigin = new URL(release.canonicalUrl).origin;

  // Historical event/workshop facts remain in the canonical knowledge graph.
  // The homepage is an entity/profile projection, not a dedicated event page,
  // so Event-family nodes are excluded only from its inline Google projection.
  const homepageEventIds = new Set(
    (graph["@graph"] || [])
      .filter(isHomepageEventNode)
      .map((node) => node["@id"])
      .filter((id) => typeof id === "string"),
  );

  // External articles and external organizations remain first-class canonical
  // graph evidence, but the physician homepage is not the canonical page for
  // their Article/Organization rich-result markup. Keep the relationships by
  // collapsing references to each source's own canonical URL instead.
  const homepageExternalRichResultIds = new Set(
    (graph["@graph"] || [])
      .filter((node) =>
        isHomepageExternalRichResultNode(node, canonicalOrigin),
      )
      .map((node) => node["@id"])
      .filter((id) => typeof id === "string"),
  );
  const homepageExcludedIds = new Set([
    ...homepageEventIds,
    ...homepageExternalRichResultIds,
  ]);
  const headEventIds = headIds.filter((id) => homepageEventIds.has(id));
  if (headEventIds.length)
    throw new Error(
      `Head homepage projection cannot select Event-family nodes: ${headEventIds.join(", ")}`,
    );
  const projectedHeadIds = headIds.filter(
    (id) => !homepageExcludedIds.has(id),
  );
  const projectedSupportIds = supportIds.filter(
    (id) => !homepageExcludedIds.has(id),
  );

  await mkdir(generatedSemantic, { recursive: true });
  const projectionContext = projectSchemaContext(graph["@context"]);
  const homepageSelected = new Set([
    ...projectedSupportIds,
    ...projectedHeadIds,
  ]);
  const graphIds = new Set(byId.keys());
  const homepageReferenceAliases = new Map(
    [...homepageExternalRichResultIds]
      .map((id) => [id, byId.get(id)?.url])
      .filter(([, url]) => isExternalUrl(url, canonicalOrigin)),
  );
  const profileFor = (node) =>
    supportProfile.idProfiles?.[node["@id"]] ??
    mergeProjectionProfiles(
      nodeTypes(node).map((type) => supportProfile.typeProfiles?.[type]),
    );
  const pruneInlineRefs = (value) => {
    if (Array.isArray(value))
      return value.map(pruneInlineRefs).filter((item) => item !== undefined);
    if (value && typeof value === "object") {
      if (
        value["@id"] &&
        graphIds.has(value["@id"]) &&
        !homepageSelected.has(value["@id"])
      ) {
        const alias = homepageReferenceAliases.get(value["@id"]);
        return alias ? { "@id": alias } : undefined;
      }
      const out = {};
      for (const [key, nested] of Object.entries(value)) {
        if (key === "performerIn") continue;
        const next = pruneInlineRefs(nested);
        if (next !== undefined && (!Array.isArray(next) || next.length))
          out[key] = next;
      }
      return out;
    }
    return value;
  };
  const finalizeHomepageNode = (node) =>
    normalizeHomepagePhysician(
      stripNonSchemaHomepageProperties(pruneInlineRefs(node)),
      release.primaryEntity.id,
    );

  const headNodes = [];
  for (const id of headIds) {
    const node = byId.get(id);
    if (!node) throw new Error(`Head selection missing ${id}`);
    headNodes.push(projectNode(node, headProfile.nodes?.[id]));
  }
  const homepageHeadNodes = headNodes
    .filter((node) => !homepageExcludedIds.has(node["@id"]))
    .map(finalizeHomepageNode);
  assertNoHomepageEventNodes(homepageHeadNodes, "Head");
  assertNoHomepageExternalRichResultNodes(
    homepageHeadNodes,
    "Head",
    canonicalOrigin,
  );
  assertPureSchemaHomepageNodes(homepageHeadNodes, "Head");
  assertHomepagePhysicianPerson(homepageHeadNodes, release.primaryEntity.id);
  const headDoc = {
    "@context": projectionContext,
    "@graph": homepageHeadNodes,
  };
  const headRaw = `${JSON.stringify(headDoc)}\n`;
  if (Buffer.byteLength(headRaw) > headProfile.maxBytes)
    throw new Error(
      `Head graph ${Buffer.byteLength(headRaw)} exceeds ${headProfile.maxBytes}`,
    );
  await writeFile(path.join(generatedSemantic, "head-graph.json"), headRaw);

  const supportNodes = [];
  for (const id of projectedSupportIds) {
    const node = byId.get(id);
    if (!node) throw new Error(`Support selection missing ${id}`);
    supportNodes.push(
      supportProfile.mode === "full"
        ? finalizeHomepageNode(structuredClone(node))
        : finalizeHomepageNode(projectNode(node, profileFor(node) || {})),
    );
  }
  assertNoHomepageEventNodes(supportNodes, "Support");
  assertNoHomepageExternalRichResultNodes(
    supportNodes,
    "Support",
    canonicalOrigin,
  );
  assertPureSchemaHomepageNodes(supportNodes, "Support");
  const supportDoc = { "@context": projectionContext, "@graph": supportNodes };
  const supportRaw = `${JSON.stringify(supportDoc)}\n`;
  if (Buffer.byteLength(supportRaw) > supportProfile.maxBytes)
    throw new Error(
      `Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`,
    );
  await writeFile(
    path.join(generatedSemantic, "support-graph.json"),
    supportRaw,
  );

  return {
    headIds: projectedHeadIds,
    supportIds: projectedSupportIds,
    headRaw,
    supportRaw,
  };
}
