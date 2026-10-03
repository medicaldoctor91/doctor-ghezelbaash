import { parseFragment } from "parse5";
import { reviewedRoutePurposes } from "./route-schema-policy.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const reviewedPaths = new Set(reviewedRoutePurposes.map(({ path }) => path));
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
 * Separate routability from indexability. The fixed corpus can keep stable,
 * directly addressable fragments without asking search engines to index every
 * heading-derived document. Decisions are based on authored entity role,
 * reviewed editorial purpose, genuine translation relationships and corpus
 * substance—not URL shape alone.
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
    let indexable = false, reason = "fragment-route";

    if (record.pageType === "ProfilePage" || entityTypes.has("Person")) {
      indexable = true; reason = "physician-profile";
    } else if (record.pageType === "ContactPage" || entityTypes.has("MedicalClinic") || entityTypes.has("PhysiciansOffice")) {
      indexable = true; reason = "clinic-contact";
    } else if (entityTypes.has("Question") && values(entity?.acceptedAnswer).length) {
      indexable = true; reason = "authored-question-answer";
    } else if (reviewedPaths.has(record.path)) {
      indexable = true; reason = "reviewed-editorial-purpose";
    } else if (values(record.alternates).length) {
      indexable = true; reason = "reviewed-language-equivalent";
    } else if (
      record.pageType === "MedicalWebPage" &&
      record.scopeKind === "complete-region" &&
      metrics.textChars >= 3000 &&
      metrics.wordCount >= 500 &&
      metrics.headingCount >= 2
    ) {
      indexable = true; reason = "substantive-medical-region";
    }

    return {
      ...record,
      indexable,
      robots: indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS,
      indexability: Object.freeze({ decision: indexable ? "KEEP" : "NOINDEX", reason, ...metrics }),
    };
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
