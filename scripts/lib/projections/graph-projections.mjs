import path from "node:path";
import { isDeepStrictEqual } from "node:util";
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
/** Retains only context terms used by this projection and their dependencies. */
export function projectSchemaContext(context, nodes) {
  if (
    context?.["@version"] !== 1.1 ||
    context?.["@vocab"] !== "https://schema.org/" ||
    context?.schema !== "https://schema.org/"
  )
    throw new Error("Canonical graph lacks the Schema.org projection context");
  const required = new Set([
    ...Object.keys(context).filter((key) => key.startsWith("@")),
    "schema",
  ]);
  const includeTerm = (term) => {
    if (typeof term !== "string") return;
    if (Object.hasOwn(context, term)) required.add(term);
    const colon = term.indexOf(":");
    if (colon > 0 && Object.hasOwn(context, term.slice(0, colon)))
      required.add(term.slice(0, colon));
  };
  const visit = (value, termValue = false) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, termValue);
    } else if (typeof value === "string") {
      if (termValue || value.includes(":")) includeTerm(value);
    } else if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        includeTerm(key);
        visit(nested, key === "@type" || context[key]?.["@type"] === "@vocab");
      }
    }
  };
  visit(nodes);
  // A term definition can itself use another term, prefix, or scoped context.
  // Iterate to closure so datatype/prefix dependencies never disappear.
  const visited = new Set();
  const visitDefinition = (value) => {
    if (typeof value === "string") includeTerm(value);
    else if (Array.isArray(value)) value.forEach(visitDefinition);
    else if (value && typeof value === "object")
      for (const [key, nested] of Object.entries(value)) {
        includeTerm(key);
        visitDefinition(nested);
      }
  };
  for (const term of required) {
    if (visited.has(term)) continue;
    visited.add(term);
    visitDefinition(context[term]);
  }
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => required.has(key)),
  );
}
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
const referenceIds = (value) =>
  [value].flat().map((item) => item?.["@id"]).filter(Boolean);
const sameField = (node, source, field) =>
  isDeepStrictEqual(node?.[field], source?.[field]);

/** One role contract shared by generation and validation of the delivered HTML. */
export function assertHomepageAuthorityRoles({
  nodes,
  canonicalNodes,
  profiles,
  physicianId,
  canonicalOrigin,
}) {
  const selected = new Map(nodes.map((node) => [node["@id"], node]));
  const canonical = new Map(canonicalNodes.map((node) => [node["@id"], node]));
  const physician = canonical.get(physicianId);
  const projectedPhysician = selected.get(physicianId);
  const policies = new Map();
  const roleNames = new Set([
    "credentialIssuer",
    "physicianCoverage",
    "physicianAuthoredWork",
  ]);
  for (const profile of profiles)
    for (const [id, policy] of Object.entries(profile.idProfiles || {})) {
      if (!policy.authorityRole) continue;
      if (
        !roleNames.has(policy.authorityRole) ||
        !profile.ids.includes(id) ||
        !selected.has(id) ||
        policies.has(id)
      )
        throw new Error(`Invalid or unselected homepage authority role: ${id}`);
      policies.set(id, policy);
    }
  for (const node of nodes)
    if (
      isHomepageExternalRichResultNode(node, canonicalOrigin) &&
      !policies.has(node["@id"])
    )
      throw new Error(
        `External homepage authority node requires a supported relationship role: ${node["@id"]}`,
      );
  const portraitIds = new Set(referenceIds(physician?.image));
  const portraitUrls = new Set(
    [...portraitIds].flatMap((id) => {
      const image = canonical.get(id);
      return [image?.url, image?.contentUrl].filter(Boolean);
    }),
  );
  const usesPhysicianPortrait = (value) => {
    if (Array.isArray(value)) return value.some(usesPhysicianPortrait);
    if (typeof value === "string")
      return portraitIds.has(value) || portraitUrls.has(value);
    return value && typeof value === "object"
      ? Object.values(value).some(usesPhysicianPortrait)
      : false;
  };
  const hasVisibleSection = (id) => nodes.some((section) =>
    nodeTypes(section).includes("WebPageElement") &&
    ["citation", "mentions"].some((property) =>
      referenceIds(section[property]).includes(id) &&
      referenceIds(canonical.get(section["@id"])?.[property]).includes(id),
    ),
  );
  for (const [id, policy] of policies) {
    const node = selected.get(id);
    const source = canonical.get(id);
    const role = policy.authorityRole;
    if (
      !source ||
      !sameField(node, source, "@type") ||
      !sameField(node, source, "name") ||
      !sameField(node, source, "url") ||
      !isExternalUrl(node.url, canonicalOrigin)
    )
      throw new Error(`Homepage authority identity differs from its canonical source: ${id}`);
    if (role === "credentialIssuer") {
      const memberOf = referenceIds(physician?.memberOf).includes(id) &&
        referenceIds(projectedPhysician?.memberOf).includes(id);
      const recognizedBy = referenceIds(physician?.hasCredential).some((credentialId) =>
        referenceIds(canonical.get(credentialId)?.recognizedBy).includes(id) &&
        referenceIds(selected.get(credentialId)?.recognizedBy).includes(id),
      );
      if (!nodeTypes(node).includes("Organization") || (!memberOf && !recognizedBy))
        throw new Error(`Credential issuer lacks a physician membership or credential relationship: ${id}`);
      continue;
    }
    if (!nodeTypes(node).some((type) => homepageArticleRichResultTypes.has(type)))
      throw new Error(`Physician work role requires an Article: ${id}`);
    if (
      usesPhysicianPortrait(node.image) ||
      usesPhysicianPortrait(source.image) ||
      (node.mainEntityOfPage && !sameField(node, source, "mainEntityOfPage"))
    )
      throw new Error(`Physician work cannot borrow portrait imagery or page identity: ${id}`);
    if (role === "physicianCoverage") {
      if (
        !referenceIds(physician?.subjectOf).includes(id) ||
        !referenceIds(projectedPhysician?.subjectOf).includes(id) ||
        !referenceIds(node.about).includes(physicianId) ||
        !referenceIds(node.mainEntity).includes(physicianId) ||
        !sameField(node, source, "about") ||
        !sameField(node, source, "mainEntity") ||
        referenceIds(source.author).includes(physicianId) ||
        referenceIds(node.author).includes(physicianId)
      )
        throw new Error(`Physician coverage must preserve its subject without inventing authorship: ${id}`);
    } else {
      if (
        !referenceIds(source.author).includes(physicianId) ||
        !sameField(node, source, "author") ||
        !hasVisibleSection(id)
      )
        throw new Error(`Physician-authored work lacks its author or visible-section relationship: ${id}`);
      const doi = node.url.startsWith("https://doi.org/")
        ? node.url.slice("https://doi.org/".length)
        : null;
      if (
        doi &&
        (![source.identifier].flat().includes(`DOI:${doi}`) ||
          !sameField(node, source, "identifier"))
      )
        throw new Error(`Physician-authored DOI work lost its canonical DOI identifier: ${id}`);
      if (
        !sameField(node, source, "creativeWorkStatus") ||
        (source.creativeWorkStatus &&
          (!sameField(node, source, "isPartOf") ||
            !sameField(node, source, "dateCreated") ||
            !sameField(node, source, "datePublished")))
      )
        throw new Error(`Physician-authored work lost its publication status: ${id}`);
    }
  }
}

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
  const homepageSelected = new Set([...headIds, ...supportIds]);
  const projectLane = (profile, label) => {
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
    return nodes;
  };
  const homepageHeadNodes = projectLane(headProfile, "Head");
  const supportNodes = projectLane(supportProfile, "Support");
  assertNoHomepageEventNodes(homepageHeadNodes, "Head");
  assertNoHomepageEventNodes(supportNodes, "Support");
  assertHomepageAuthorityRoles({
    nodes: [...homepageHeadNodes, ...supportNodes],
    canonicalNodes: graph["@graph"],
    profiles: [headProfile, supportProfile],
    physicianId: release.primaryEntity.id,
    canonicalOrigin,
  });
  assertPureSchemaHomepageNodes(homepageHeadNodes, "Head");
  assertPureSchemaHomepageNodes(supportNodes, "Support");
  assertHomepagePhysicianPerson(homepageHeadNodes, release.primaryEntity.id);
  const headDoc = {
    "@context": projectSchemaContext(graph["@context"], homepageHeadNodes),
    "@graph": homepageHeadNodes,
  };
  const headRaw = `${JSON.stringify(headDoc)}\n`;
  if (Buffer.byteLength(headRaw) > headProfile.maxBytes)
    throw new Error(
      `Head graph ${Buffer.byteLength(headRaw)} exceeds ${headProfile.maxBytes}`,
    );
  const supportDoc = {
    "@context": projectSchemaContext(graph["@context"], supportNodes),
    "@graph": supportNodes,
  };
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
