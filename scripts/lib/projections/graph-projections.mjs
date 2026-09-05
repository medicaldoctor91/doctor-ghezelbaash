import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  indexCanonicalGraph,
  projectNode,
} from "../../../src/lib/semantic-projection.mjs";
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
  "ScholarlyArticle",
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
    throw new Error(
      `Head homepage projection is missing physician ${physicianId}`,
    );
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
  citedScholarlyWorkIds = new Set(),
) => {
  const offenders = nodes
    .filter(
      (node) =>
        isHomepageExternalRichResultNode(node, canonicalOrigin) &&
        !citedScholarlyWorkIds.has(node["@id"]),
    )
    .map(
      (node) =>
        `${node["@id"] || "(anonymous)"} [${nodeTypes(node).join(", ")}]`,
    );
  if (offenders.length)
    throw new Error(
      `${label} homepage projection must not expand external Article/Organization rich-result candidates: ${offenders.join(", ")}`,
    );
};

/** Builds exactly the two final HTML graphs. No filesystem mutation or fallback projection. */
export function deriveGraphProjections({
  graph,
  release,
  headProfile,
  supportProfile,
}) {
  const { byId } = indexCanonicalGraph(graph);
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
  const citedScholarlyWorkIds = new Set(
    supportProfile.citedScholarlyWorkIds || [],
  );
  if (
    citedScholarlyWorkIds.size !== supportProfile.citedScholarlyWorkIds?.length
  )
    throw new Error(
      "Cited scholarly work allowlist must be explicit and unique",
    );
  for (const id of citedScholarlyWorkIds) {
    const work = byId.get(id);
    const authorIds = [work?.author].flat().map((author) => author?.["@id"]);
    const citingSections = graph["@graph"].filter(
      (node) =>
        nodeTypes(node).includes("WebPageElement") &&
        [node.citation].flat().some((citation) => citation?.["@id"] === id),
    );
    if (
      !supportIds.includes(id) ||
      nodeTypes(work).length !== 1 ||
      nodeTypes(work)[0] !== "ScholarlyArticle" ||
      !authorIds.includes(release.primaryEntity.id) ||
      !isExternalUrl(work?.url, canonicalOrigin) ||
      !work.url.startsWith("https://doi.org/") ||
      ![work.identifier]
        .flat()
        .includes(`DOI:${work.url.slice("https://doi.org/".length)}`) ||
      !citingSections.some(
        (section) =>
          supportIds.includes(section["@id"]) &&
          supportProfile.idProfiles?.[section["@id"]]?.include?.includes(
            "citation",
          ),
      )
    )
      throw new Error(
        `Cited scholarly work lacks its physician, DOI or visible-section relationship: ${id}`,
      );
    const profile = supportProfile.idProfiles?.[id];
    const fields = [
      "@id",
      "@type",
      "name",
      "headline",
      "url",
      "identifier",
      "datePublished",
      "author",
    ];
    if (
      !profile?.include ||
      profile.include.length !== fields.length ||
      fields.some((field) => !profile.include.includes(field))
    )
      throw new Error(
        `Cited scholarly work must use the minimal authorship projection: ${id}`,
      );
  }

  const projectionContext = projectSchemaContext(graph["@context"]);
  const homepageSelected = new Set([...headIds, ...supportIds]);
  const externalReferencesFor = (profile, label) => {
    const ids = profile.externalReferenceIds;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length)
      throw new Error(
        `${label} external reference IDs must be explicit and unique`,
      );
    return new Map(
      ids.map((id) => {
        const target = byId.get(id);
        if (
          !target ||
          homepageSelected.has(id) ||
          !isExternalUrl(target.url, canonicalOrigin)
        )
          throw new Error(
            `${label} external reference must resolve to an unselected source with its own canonical URL: ${id}`,
          );
        return [id, target.url];
      }),
    );
  };
  const projectLane = (profile, label) => {
    const aliases = externalReferencesFor(profile, label);
    const usedAliases = new Set();
    const specificProfiles = profile.nodes ?? profile.idProfiles ?? {};
    for (const id of Object.keys(specificProfiles))
      if (!profile.ids.includes(id))
        throw new Error(
          `${label} has a field policy for an unselected node: ${id}`,
        );
    const resolveReferences = (value, trail) => {
      if (Array.isArray(value))
        return value.map((item, index) =>
          resolveReferences(item, `${trail}[${index}]`),
        );
      if (!value || typeof value !== "object") return value;
      const id = value["@id"];
      if (id && !homepageSelected.has(id)) {
        if (aliases.has(id)) {
          if (Object.keys(value).length !== 1)
            throw new Error(
              `${trail} cannot replace an embedded source with an external reference`,
            );
          usedAliases.add(id);
          return { "@id": aliases.get(id) };
        }
        if (byId.has(id) || id.startsWith(release.canonicalUrl))
          throw new Error(
            `${trail} has an unresolved required inline reference: ${id}`,
          );
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          resolveReferences(nested, `${trail}.${key}`),
        ]),
      );
    };
    const nodes = profile.ids.map((id) => {
      const node = byId.get(id);
      if (!node) throw new Error(`${label} selection missing ${id}`);
      const spec =
        profile.nodes?.[id] ??
        profile.idProfiles?.[id] ??
        mergeProjectionProfiles(
          nodeTypes(node).map((type) => profile.typeProfiles?.[type]),
        );
      if (
        !Array.isArray(spec?.include) ||
        !spec.include.includes("@id") ||
        !spec.include.includes("@type")
      )
        throw new Error(
          `${label} selection requires an explicit field profile: ${id}`,
        );
      if (new Set(spec.include).size !== spec.include.length)
        throw new Error(`${label} profile fields must be unique: ${id}`);
      for (const policy of ["refAllow", "valueAllow"])
        for (const property of Object.keys(spec[policy] || {}))
          if (!spec.include.includes(property))
            throw new Error(
              `${label} ${policy} cannot configure an excluded field: ${id}.${property}`,
            );
      return resolveReferences(projectNode(node, spec), id);
    });
    for (const id of aliases.keys())
      if (!usedAliases.has(id))
        throw new Error(
          `${label} declares an unused external reference policy: ${id}`,
        );
    return nodes;
  };
  const homepageHeadNodes = projectLane(headProfile, "Head");
  const supportNodes = projectLane(supportProfile, "Support");
  assertNoHomepageEventNodes(homepageHeadNodes, "Head");
  assertNoHomepageEventNodes(supportNodes, "Support");
  assertNoHomepageExternalRichResultNodes(
    homepageHeadNodes,
    "Head",
    canonicalOrigin,
  );
  assertNoHomepageExternalRichResultNodes(
    supportNodes,
    "Support",
    canonicalOrigin,
    citedScholarlyWorkIds,
  );
  assertPureSchemaHomepageNodes(homepageHeadNodes, "Head");
  assertPureSchemaHomepageNodes(supportNodes, "Support");
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
  const supportDoc = { "@context": projectionContext, "@graph": supportNodes };
  const supportRaw = `${JSON.stringify(supportDoc)}\n`;
  if (Buffer.byteLength(supportRaw) > supportProfile.maxBytes)
    throw new Error(
      `Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`,
    );
  return {
    headIds: [...headIds],
    supportIds: [...supportIds],
    headDoc,
    supportDoc,
    headRaw,
    supportRaw,
  };
}

export async function compileGraphProjections(context) {
  const { semantic, generatedSemantic, graph, release } = context;
  const [headProfile, supportProfile] = await Promise.all([
    readFile(path.join(semantic, "head-profile.json"), "utf8").then(JSON.parse),
    readFile(path.join(semantic, "support-profile.json"), "utf8").then(
      JSON.parse,
    ),
  ]);
  const result = deriveGraphProjections({
    graph,
    release,
    headProfile,
    supportProfile,
  });
  await mkdir(generatedSemantic, { recursive: true });
  await writeFile(
    path.join(generatedSemantic, "head-graph.json"),
    result.headRaw,
  );
  await writeFile(
    path.join(generatedSemantic, "support-graph.json"),
    result.supportRaw,
  );
  return result;
}
