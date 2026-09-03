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
const isHomepageEventType = (type) =>
  typeof type === "string" &&
  (type === "Event" ||
    type.endsWith("Event") ||
    homepageEventTypeExceptions.has(type));
const isHomepageEventNode = (node) =>
  nodeTypes(node).some(isHomepageEventType);
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

export async function compileGraphProjections(context) {
  const { semantic, generatedSemantic, graph, byId } = context;
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

  // The canonical graph retains historical participation and workshop facts. The
  // homepage inline JSON-LD is an entity/profile projection, not an event landing
  // page, so Event-family nodes are deliberately excluded from that projection.
  const homepageEventIds = new Set(
    (graph["@graph"] || [])
      .filter(isHomepageEventNode)
      .map((node) => node["@id"])
      .filter((id) => typeof id === "string"),
  );
  const headEventIds = headIds.filter((id) => homepageEventIds.has(id));
  if (headEventIds.length)
    throw new Error(
      `Head homepage projection cannot select Event-family nodes: ${headEventIds.join(", ")}`,
    );
  const projectedSupportIds = supportIds.filter(
    (id) => !homepageEventIds.has(id),
  );

  await mkdir(generatedSemantic, { recursive: true });
  const projectionContext = projectSchemaContext(graph["@context"]);
  const supportSelected = new Set([...projectedSupportIds, ...headIds]);
  const graphIds = new Set(byId.keys());
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
        !supportSelected.has(value["@id"])
      )
        return undefined;
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

  const headNodes = [];
  for (const id of headIds) {
    const node = byId.get(id);
    if (!node) throw new Error(`Head selection missing ${id}`);
    headNodes.push(pruneInlineRefs(projectNode(node, headProfile.nodes?.[id])));
  }
  assertNoHomepageEventNodes(headNodes, "Head");
  const headDoc = { "@context": projectionContext, "@graph": headNodes };
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
        ? pruneInlineRefs(structuredClone(node))
        : pruneInlineRefs(projectNode(node, profileFor(node) || {})),
    );
  }
  assertNoHomepageEventNodes(supportNodes, "Support");
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
    headIds,
    supportIds: projectedSupportIds,
    headRaw,
    supportRaw,
  };
}
