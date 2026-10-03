import { deriveIndependentPages } from "./independent-pages.mjs";
import { attachTopicNavigation, deriveTopicBreadcrumbItems } from "./topic-navigation.mjs";
import { applyTranslationAlternates } from "./translation-alternates.mjs";
import { applyRouteSchemaPolicy } from "./route-schema-policy.mjs";
import { localizedText } from "../../src/lib/page-discovery-jsonld.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const normalized = (value) => String(value).replace(/\s+/g, " ").trim();

/** One source-derived document record shared by HTML, sitemap and breadcrumbs. */
export function deriveRouteDiscovery(homeHtml, graph, discoveryPolicy, canonicalUrl) {
  const records = deriveIndependentPages(homeHtml, graph, canonicalUrl,
    { focusedViews: discoveryPolicy.focusedViews || [] });
  const topics = attachTopicNavigation(records, homeHtml, canonicalUrl);
  const translated = applyTranslationAlternates(topics, discoveryPolicy.translationGroups || [],
    { canonicalUrl, graph });
  const output = applyRouteSchemaPolicy(translated, graph, { canonicalUrl });
  const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const home = graph["@graph"].find((node) => node["@id"] === canonicalUrl + "webpage" &&
    values(node["@type"]).includes("MedicalWebPage"));
  const physician = byId.get(values(home?.mainEntity)[0]?.["@id"]);
  if (!physician) throw new Error("Route discovery requires its canonical physician");
  const groups = new Map(), contextualParents = new Map();
  for (const record of output) {
    const parent = [...record.navigation.ancestors].reverse().find((entry) => normalized(entry.title) !== normalized(record.title));
    if (!parent) continue;
    contextualParents.set(record.path, parent);
    const key = record.lang + "|" + normalized(record.title);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(normalized(parent.title));
  }
  for (const record of output) {
    const doctorName = localizedText(physician.name, record.lang);
    const parent = contextualParents.get(record.path);
    const contexts = groups.get(record.lang + "|" + normalized(record.title));
    // Repeated labels across different authored topics need their real context.
    // Do not append guessed keywords or repeat the same context for aliases.
    if (parent && contexts?.size > 1) {
      record.metadataContext = parent;
      record.contextTitle = (record.contextTitle || record.title) + " | " + parent.title;
      record.documentTitle = record.contextTitle.includes(doctorName) ? record.contextTitle : record.contextTitle + " | " + doctorName;
    }
    // Short question labels can be clear inside the guide but lack their
    // medical topic in search results. Use an actual same-language ancestor
    // only in the document title; visible headings and entity names stay authored.
    if (values(record.entityTypes).some((type) => ["Question", "Answer"].includes(type))) {
      const questionParent = [...record.navigation.ancestors].reverse().find((entry) =>
        entry.lang.toLowerCase() === record.lang.toLowerCase() &&
        normalized(entry.title) !== normalized(record.title));
      if (questionParent) {
        const subjectTitle = record.contextTitle || record.title;
        const parentTitle = questionParent.title;
        const repeatsParent = normalized(subjectTitle).includes(normalized(parentTitle));
        const repeatsPhysician = subjectTitle.includes(doctorName) && parentTitle.includes(doctorName);
        if (!repeatsParent && !repeatsPhysician) {
          const contextualTitle = subjectTitle + " | " + parentTitle;
          const documentTitle = contextualTitle.includes(doctorName)
            ? contextualTitle : contextualTitle + " | " + doctorName;
          // Preserve a long authored medical title rather than truncating it.
          if (documentTitle.length <= 150) {
            record.documentTitle = documentTitle;
            record.metadataContext = questionParent;
          }
        }
      }
    }
    const page = record.document["@graph"].find((node) => node["@id"] === record.canonicalUrl + "#webpage");
    const breadcrumb = record.document["@graph"].find((node) => node["@id"] === page?.breadcrumb?.["@id"]);
    if (!breadcrumb) throw new Error("Route discovery lost its breadcrumb: " + record.path);
    page.name = record.contextTitle || record.title;
    breadcrumb.itemListElement = deriveTopicBreadcrumbItems(record, output, { canonicalUrl, homeTitle: doctorName });
    assertRichResultsDocument(record.document, { primaryPageId: page["@id"] });
  }
  return output;
}
