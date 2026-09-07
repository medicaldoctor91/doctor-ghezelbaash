import path from "node:path";
import { readdir } from "node:fs/promises";

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

export async function collectPublicResourceIris({
  root = process.cwd(),
  baseUrl,
} = {}) {
  if (typeof baseUrl !== "string" || !baseUrl)
    throw new Error("Public resource IRI collection requires a baseUrl");
  const canonical = new URL(baseUrl);
  canonical.hash = "";
  canonical.search = "";
  const publicRoot = path.join(root, "public");
  const files = [];
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  await walk(publicRoot);
  return new Set(
    files.map((file) => {
      const relative = path.relative(publicRoot, file).split(path.sep).join("/");
      const iri = new URL(relative, canonical).href;
      return iri;
    }),
  );
}

export function analyzeGraphClosure(
  graph,
  { baseUrl, allowedSameSiteIds = [] } = {},
) {
  const nodes = asArray(graph?.["@graph"]);
  const ids = nodes
    .map((node) => node?.["@id"])
    .filter((id) => typeof id === "string");
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicateIds = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
  const defined = new Set(ids);
  const allowed =
    allowedSameSiteIds instanceof Set
      ? allowedSameSiteIds
      : new Set(allowedSameSiteIds || []);
  const references = [];
  const walk = (value, owner, path) => {
    if (Array.isArray(value))
      return value.forEach((item, index) =>
        walk(item, owner, `${path}[${index}]`),
      );
    if (!value || typeof value !== "object") return;
    if (typeof value["@id"] === "string")
      references.push({ owner, path, id: value["@id"] });
    for (const [key, item] of Object.entries(value))
      if (key !== "@id") walk(item, owner, path ? `${path}.${key}` : key);
  };
  for (const node of nodes) {
    const owner = node?.["@id"] || null;
    for (const [key, value] of Object.entries(node || {}))
      if (key !== "@id") walk(value, owner, key);
  }
  const sameSiteReferences = references.filter(
    (ref) => typeof baseUrl === "string" && ref.id.startsWith(baseUrl),
  );
  const danglingSameSiteIds = [
    ...new Set(
      sameSiteReferences
        .filter((ref) => !defined.has(ref.id) && !allowed.has(ref.id))
        .map((ref) => ref.id),
    ),
  ].sort();
  return {
    nodeCount: nodes.length,
    definedIdCount: defined.size,
    duplicateIds,
    sameSiteReferenceCount: sameSiteReferences.length,
    danglingSameSiteIds,
    danglingSameSiteCount: danglingSameSiteIds.length,
    fullGraphClosed:
      duplicateIds.length === 0 && danglingSameSiteIds.length === 0,
  };
}

// Only a top-level Schema.org `url` is a page locator; abstract RDF `@id`
// values remain graph identifiers and intentionally do not require DOM targets.
export function assertSameDocumentGraphUrlTargets(
  graph,
  { canonicalUrl, htmlIds },
) {
  const canonicalDocument = new URL(canonicalUrl);
  canonicalDocument.hash = "";
  const ids = htmlIds instanceof Set ? htmlIds : new Set(htmlIds || []);
  const checked = [];
  const missing = [];
  for (const node of asArray(graph?.["@graph"])) {
    if (typeof node?.url !== "string") continue;
    let target;
    try {
      target = new URL(node.url);
    } catch {
      throw new Error(
        `Canonical graph node has an invalid direct URL: ${node?.["@id"] || "(missing ID)"}`,
      );
    }
    const targetDocument = new URL(target);
    targetDocument.hash = "";
    if (!target.hash || targetDocument.href !== canonicalDocument.href) continue;
    let fragment;
    try {
      fragment = decodeURIComponent(target.hash.slice(1));
    } catch {
      throw new Error(`Canonical graph URL has an invalid fragment: ${node.url}`);
    }
    const item = {
      id: node?.["@id"] || null,
      url: node.url,
      fragment,
    };
    checked.push(item);
    if (!fragment || !ids.has(fragment)) missing.push(item);
  }
  if (missing.length)
    throw new Error(
      `Same-document graph URL targets are absent: ${missing
        .map((item) => `${item.id || "(missing ID)"} -> #${item.fragment}`)
        .join(", ")}`,
    );
  return {
    checked: checked.length,
    resolved: checked.length,
    missing: 0,
  };
}
