import { URL_ARCHITECTURE } from "../../src/lib/url-architecture.mjs";
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const referenceId = (value) => typeof value === "string" ? value : value?.["@id"];

// Each retained resource has an audited content purpose in the URL policy.
// Types describe that purpose rather than the wording of the path or title.
const nonclinical = new Map([
  ["/saeed-ghezelbash-research-education-and-clinical-decisions", "professional-biography"],
  ["/historical-patient-origin-summary", "historical-evidence"],
  ["/out-of-town-aesthetic-patients-iran", "visit-access"],
]);
export const reviewedRoutePurposes = Object.freeze(URL_ARCHITECTURE.resources
  .filter((resource) => resource.path !== "/")
  .map((resource) => Object.freeze({
    path: resource.path,
    purpose: resource.scope === "profile" ? "physician-profile"
      : resource.scope === "contact" ? "clinic-contact"
      : resource.scope === "media" ? "authored-media"
      : nonclinical.get(resource.path) || "clinical-guide",
    pageType: resource.scope === "profile" ? "ProfilePage"
      : resource.scope === "contact" ? "ContactPage"
      : resource.scope === "media" || nonclinical.has(resource.path) ? "WebPage" : "MedicalWebPage",
    ...(["profile", "contact"].includes(resource.scope) ? { exact: true } : {}),
  })));

const medicalTypes = new Set([
  "MedicalProcedure", "SurgicalProcedure", "MedicalTherapy", "DiagnosticProcedure",
  "MedicalCondition", "MedicalTest", "Drug", "AnatomicalStructure",
]);
const medicalRegistries = ["biomedical-concept-registry", "aesthetic-topic-registry"];
const pageTypes = new Set(["MedicalWebPage", "WebPage", "ContactPage", "ProfilePage"]);

/**
 * Classifies only focused discovery wrappers. Authored entities, comprehensive
 * home, visible content, metadata text and source graphs remain untouched.
 */
export function applyRouteSchemaPolicy(records, graph, {
  canonicalUrl, sourcePurposes = reviewedRoutePurposes,
} = {}) {
  const canonical = new URL(canonicalUrl);
  if (canonical.pathname !== "/" || canonical.search || canonical.hash)
    throw new Error("Route schema policy requires the canonical homepage URL");
  const byPath = new Map(records.map((record) => [record.path, record]));
  if (byPath.size !== records.length) throw new Error("Route schema policy requires unique routes");
  const purposes = new Map();
  for (const role of sourcePurposes) {
    if (!byPath.has(role.path)) throw new Error("Reviewed source-purpose route is missing: " + role.path);
    if (purposes.has(role.path) || !pageTypes.has(role.pageType) || !role.purpose ||
        ["ContactPage", "ProfilePage"].includes(role.pageType) && role.exact !== true)
      throw new Error("Invalid reviewed source-purpose declaration: " + role.path);
    purposes.set(role.path, role);
  }
  const authoredById = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const registryIds = new Set(medicalRegistries.map((slug) => new URL(slug, canonical).href));
  return records.map((record) => {
    if (!record.navigation?.ancestors) throw new Error("Route schema policy requires authored topic ancestry: " + record.path);
    const pageId = record.canonicalUrl + "#webpage";
    const nodes = record.document["@graph"], byId = new Map(nodes.map((node) => [node["@id"], node]));
    const page = byId.get(pageId), entity = byId.get(record.entityId);
    if (!page || !entity) throw new Error("Route schema policy requires its page and main entity: " + record.path);
    const ancestry = [record.path, ...record.navigation.ancestors.map((entry) => entry.path).reverse()];
    const role = ancestry.map((path) => purposes.get(path)).find((entry) =>
      entry && (!entry.exact || entry.path === record.path));
    let pageType, schemaClassification;
    if (role?.pageType === "ProfilePage") {
      if (!typed(entity, "Person")) throw new Error("Dedicated physician profile must retain its Person: " + record.path);
      pageType = "ProfilePage";
      schemaClassification = { reason: "dedicated-profile", purpose: role.purpose,
        sourceRoleIds: [new URL(role.path, canonical).href] };
    } else if (typed(entity, "VideoObject") || typed(entity, "ImageObject")) {
      pageType = "WebPage";
      schemaClassification = { reason: "media-target", sourceRoleIds: [entity["@id"]] };
    } else if (role) {
      pageType = role.pageType;
      schemaClassification = { reason: "reviewed-source-purpose", purpose: role.purpose,
        sourceRoleIds: [new URL(role.path, canonical).href] };
    } else {
      // Only direct topic references count. Physician specialty, organization
      // identity and arbitrary DefinedTerm sets are not medical-content proof.
      const references = [...new Set([...values(entity.about), ...values(page.about)]
        .map(referenceId).filter(Boolean))];
      const topicNodes = references.map((id) => authoredById.get(id) ?? byId.get(id)).filter(Boolean);
      const medical = topicNodes.filter((node) => values(node["@type"]).some((type) => medicalTypes.has(type)));
      const terms = topicNodes.filter((node) => typed(node, "DefinedTerm") &&
        values(node.inDefinedTermSet).some((ref) => registryIds.has(referenceId(ref))));
      const evidence = medical.length ? medical : terms;
      pageType = evidence.length ? "MedicalWebPage" : "WebPage";
      schemaClassification = { reason: medical.length ? "medical-about" : terms.length ? "medical-registry-term" : "unclassified-content",
        sourceRoleIds: evidence.map((node) => node["@id"]) };
    }
    const withAnswer = typed(entity, "Question") && values(entity.acceptedAnswer).length > 0;
    const classifiedPage = { ...page, "@type": withAnswer ? [pageType, "FAQPage"] : pageType };
    return { ...record, pageType, schemaClassification, document: { ...record.document,
      "@graph": nodes.map((node) => node === page ? classifiedPage : node) } };
  });
}
