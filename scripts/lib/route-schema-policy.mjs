const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const referenceId = (value) => typeof value === "string" ? value : value?.["@id"];

// These roles describe reviewed source regions, not words in URLs or titles.
// A narrower authored heading can override its clinical containing section.
const clinicalRoots = [
  "/botox", "/thread-lift", "/acne-pigmentation-and-scars",
  "/aesthetic-treatment-selection", "/aesthetic-treatment-candidacy", "/filler",
  "/aesthetic-treatment-failure-from-diagnostic-error", "/hair-loss",
  "/chin-jawline-and-facial-contouring", "/skin-rejuvenation",
  "/complications-aftercare-and-follow-up", "/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah",
  "/facial-aging-differential-diagnosis", "/diagnosis-before-aesthetic-treatment-selection",
  "/saeed-ghezelbash-diagnostic-philosophy",
  ...["en", "ar-iq", "ckb-iq"].map((language) =>
    "/best-facial-aesthetic-doctor-cosmetic-surgery-kermanshah-iran-" + language),
];
const languagePurposes = [
  ["advanced-aesthetic-education-for-physicians", "professional-education"],
  ["physician-researcher-academic-identity", "professional-biography"],
  ["aesthetic-physician-ratings-patient-satisfaction", "public-reputation"],
  ["dr-saeed-ghezelbash-aesthetic-clinic-information", "clinic-administration"],
  ["clinic-access-baghdad-erbil-sulaymaniyah-kirkuk", "visit-access"],
  ["who-is-dr-saeed-ghezelbash", "physician-identity"],
];
export const reviewedRoutePurposes = Object.freeze([
  ...clinicalRoots.map((path) => ({ path, purpose: "clinical-guide", pageType: "MedicalWebPage" })),
  ...languagePurposes.flatMap(([slug, purpose]) => ["en", "ar-iq", "ckb-iq"].map((language) =>
    ({ path: "/" + slug + "-" + language, purpose, pageType: "WebPage" }))),
  { path: "/saeed-ghezelbash-research-education-and-clinical-decisions", purpose: "professional-biography", pageType: "WebPage" },
  { path: "/medical-content-governance", purpose: "editorial-governance", pageType: "WebPage" },
  { path: "/medical-content-governance-title", purpose: "editorial-governance", pageType: "WebPage" },
  { path: "/historical-patient-origin-summary", purpose: "historical-evidence", pageType: "WebPage" },
  { path: "/international-and-iraqi-patient-information", purpose: "visit-access", pageType: "WebPage" },
  // Contact and profile specialization belong only to these dedicated scopes.
  { path: "/saeed-ghezelbash-clinic-contact-and-location", purpose: "clinic-contact", pageType: "ContactPage", exact: true },
  { path: "/saeed-ghezelbash", purpose: "physician-profile", pageType: "ProfilePage", exact: true },
].map(Object.freeze));

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
