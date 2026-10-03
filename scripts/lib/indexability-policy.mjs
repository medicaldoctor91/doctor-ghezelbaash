import { parseFragment } from "parse5";
import { reviewedRoutePurposes } from "./route-schema-policy.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const reviewedPaths = new Set(reviewedRoutePurposes.map(({ path }) => path));
const lowValuePaths = new Set(["/media-license", "/media-license-title"]);
const INDEX_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex, follow";

const inspectScope = (html) => {
  const document = parseFragment(String(html || ""));
  let text = "", headingCount = 0;
  const visit = (node) => {
    if (node.nodeName === "#text") text += " " + node.value;
    if (/^h[2-6]$/.test(node.tagName || "")) headingCount++;
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  const normalized = text.replace(/\s+/gu, " ").trim();
  return {
    textChars: normalized.length,
    wordCount: normalized ? normalized.split(/\s+/u).length : 0,
    headingCount,
  };
};

/**
 * Separate routability from indexability. The fixed corpus keeps stable direct
 * entries, while search discovery is intentionally limited to explicit entity
 * pages, reviewed editorial purposes and reviewed reciprocal translations.
 * Heading depth or arbitrary word-count thresholds never create new indexable
 * pages: derived excerpts remain crawlable NOINDEX views of stronger parents.
 */
export function applyIndexabilityPolicy(records) {
  if (!Array.isArray(records) || !records.length)
    throw new Error("Indexability policy requires route records");
  const paths = new Set(records.map(({ path }) => path));
  if (paths.size !== records.length) throw new Error("Indexability policy requires unique routes");

  return records.map((record) => {
    const nodes = record.document?.["@graph"] || [];
    const entity = nodes.find((node) => node?.["@id"] === record.entityId);
    const entityTypes = new Set(values(entity?.["@type"]));
    const metrics = inspectScope(record.bodyHtml);
    let indexable = false, reason = "derived-fragment-route";

    if (lowValuePaths.has(record.path)) {
      reason = "low-value-machine-disclosure";
    } else if (record.navigation?.equivalentTo && paths.has(record.navigation.equivalentTo)) {
      reason = "equivalent-heading-route";
    } else if (record.pageType === "ProfilePage" || entityTypes.has("Person")) {
      indexable = true; reason = "physician-profile";
    } else if (record.pageType === "ContactPage" || entityTypes.has("MedicalClinic") || entityTypes.has("PhysiciansOffice")) {
      indexable = true; reason = "clinic-contact";
    } else if (entityTypes.has("Question") && values(entity?.acceptedAnswer).length) {
      // Answers already live inside the comprehensive authored guide. Only the
      // explicitly reviewed reciprocal translations receive their own search
      // surface; all other question routes consolidate into their topic page.
      if (values(record.alternates).length) {
        indexable = true; reason = "reviewed-language-equivalent";
      } else {
        reason = "embedded-question-route";
      }
    } else if (reviewedPaths.has(record.path)) {
      indexable = true; reason = "reviewed-editorial-purpose";
    } else if (values(record.alternates).length) {
      indexable = true; reason = "reviewed-language-equivalent";
    }

    return {
      ...record,
      indexable,
      robots: indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS,
      indexability: Object.freeze({ decision: indexable ? "KEEP" : "NOINDEX", reason, ...metrics }),
    };
  });
}

const navigationLink = (record) => ({ path: record.path, title: record.title, lang: record.lang });

/**
 * Give promoted routes a second, crawl-focused native-link tree without
 * rewriting authored navigation. `navigation` remains the DOM/breadcrumb truth;
 * `indexNavigation` bypasses NOINDEX intermediaries only for promoted links.
 */
export function promoteIndexableNavigation(records) {
  if (!Array.isArray(records) || records.some((record) => !record.navigation || typeof record.indexable !== "boolean"))
    throw new Error("Promoted navigation requires classified routes with authored navigation");
  const byPath = new Map(records.map((record) => [record.path, record]));
  if (byPath.size !== records.length) throw new Error("Promoted navigation requires unique routes");
  const promoted = new Set(records.filter((record) => record.indexable).map((record) => record.path));
  const parentByPath = new Map();
  const childrenByPath = new Map([...promoted].map((path) => [path, []]));

  for (const record of records) {
    if (!record.indexable) continue;
    const parent = [...record.navigation.ancestors].reverse().find((entry) => promoted.has(entry.path));
    parentByPath.set(record.path, parent?.path);
    if (parent) childrenByPath.get(parent.path).push(record);
  }
  for (const children of childrenByPath.values())
    children.sort((left, right) => left.navigation.sourceOrder - right.navigation.sourceOrder || left.path.localeCompare(right.path));

  return records.map((record) => {
    if (!record.indexable) return record;
    const parentPath = parentByPath.get(record.path);
    const ancestors = record.navigation.ancestors.filter((entry) => promoted.has(entry.path));
    const indexNavigation = {
      ...(parentPath ? { parent: navigationLink(byPath.get(parentPath)) } : {}),
      children: childrenByPath.get(record.path).map(navigationLink),
      ancestors,
      sourceOrder: record.navigation.sourceOrder,
    };
    return { ...record, indexNavigation };
  });
}

export function applyIndexabilityMeta(html, record) {
  if (!record?.robots || typeof record.indexable !== "boolean")
    throw new Error("Indexability metadata requires a classified route");
  let replacements = 0;
  const output = String(html).replace(/<meta\b[^>]*name=["']robots["'][^>]*>/gi, () => {
    replacements++;
    return '<meta name="robots" content="' + record.robots + '">';
  });
  if (replacements !== 1)
    throw new Error(`Indexability metadata expected one robots tag for ${record.path}: ${replacements}`);
  return output;
}
