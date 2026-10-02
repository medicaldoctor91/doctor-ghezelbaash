import { assertRichResultsDocument } from "./rich-results-contract.mjs";
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
export const browserContext = ["https://schema.org", {
  prov: "http://www.w3.org/ns/prov#", dcterms: "http://purl.org/dc/terms/", skos: "http://www.w3.org/2004/02/skos/core#",
}];
export function localizedText(value, language = "fa-IR") {
  const literals = values(value).filter((entry) => entry && typeof entry === "object" && "@value" in entry);
  if (!literals.length) return value;
  const base = language.split("-")[0];
  return (literals.find((entry) => entry["@language"] === language)
    ?? literals.find((entry) => entry["@language"]?.split("-")[0] === base)
    ?? literals.find((entry) => entry["@language"] === "en") ?? literals[0])["@value"];
}
const sourceNodes = (source) => Array.isArray(source)
  ? source.flatMap((script) => script?.document?.["@graph"] || [])
  : source?.["@graph"] || [];

/** Format every authored node for internal route derivation without mutating canonical data. */
export function formatBrowserGraph(source) {
  const all = sourceNodes(source);
  const byId = new Map(all.map((node) => [node["@id"], node]));
  if (byId.size !== all.length) throw new Error("Duplicate authored entity");
  const home = all.find((node) => values(node["@type"]).includes("ProfilePage") && node.url === "https://www.ghezelbaash.ir/");
  if (!home) throw new Error("Primary ProfilePage missing");
  const language = values(home.inLanguage)[0] || "fa-IR";
  const clean = (value, key) => {
    const localized = localizedText(value, language);
    if (localized !== value) return clean(localized, key);
    if (Array.isArray(value)) return value.map((entry) => clean(entry, key));
    if (!value || typeof value !== "object") return value;
    if (["width", "height"].includes(key)) {
      const quantity = byId.get(value["@id"]) ?? value;
      if (values(quantity["@type"]).includes("QuantitativeValue")) return quantity.value;
    }
    if (Object.keys(value).length === 1 && value["@id"] && !byId.has(value["@id"]) &&
        ["image", "sameAs", "gender", "credentialCategory", "knowsAbout"].includes(key)) return value["@id"];
    return Object.fromEntries(Object.entries(value).map(([property, entry]) => [property, clean(entry, property)]));
  };
  const currentDataset = all.find((node) => values(node["@type"]).includes("Dataset") && node.description);
  return all.map((node) => {
    const output = clean(node);
    if (values(output["@type"]).includes("ProfilePage")) {
      const entities = values(output.mainEntity);
      const subject = byId.get(entities[0]?.["@id"]);
      const googleProfileTypes = ["Person", "Organization"];
      const owner = byId.get(subject?.owner?.["@id"] ?? subject?.creator?.["@id"]);
      if (!values(subject?.["@type"]).some((type) => googleProfileTypes.includes(type)) &&
          values(owner?.["@type"]).some((type) => googleProfileTypes.includes(type))) {
        output.mainEntity = { "@id": owner["@id"] };
        output.about = [...values(output.about), ...entities];
      } else if (values(subject?.["@type"]).some((type) => googleProfileTypes.includes(type))) {
        output.mainEntity = entities[0];
        if (entities.length > 1) output.about = [...values(output.about), ...entities.slice(1)];
      } else {
        const remaining = values(output["@type"]).filter((type) => type !== "ProfilePage");
        output["@type"] = remaining.length === 1 ? remaining[0] : remaining.length ? remaining : "WebPage";
      }
      for (const key of ["dateCreated", "dateModified"])
        if (key in output && !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(output[key])) delete output[key];
    }
    if (values(output["@type"]).includes("Dataset") && !output.description && output.version && currentDataset)
      output.description = "Archived version " + output.version + " of " + localizedText(currentDataset.name, language) +
        ". Preserved release record: " + output.url + ".";
    return output;
  });
}
const refs = (value) => values(value).map((entry) => entry && typeof entry === "object" ? entry["@id"] : undefined).filter(Boolean);
const publicRelationKeys = [
  "mainEntity", "author", "publisher", "isPartOf", "primaryImageOfPage", "image", "logo", "creator",
  "address", "geo", "openingHoursSpecification", "contactPoint", "medicalSpecialty", "worksFor", "affiliation",
  "hasCredential", "memberOf", "alumniOf", "recognizedBy", "identifier", "thumbnail",
];

/**
 * The homepage publishes a compact identity graph for Search. The complete
 * authored knowledge graph remains byte-identical in graph.jsonld/RDF and is
 * also used to build focused routes, so Google-facing pruning never deletes evidence.
 */
export function projectPageJsonLd(scripts) {
  if (!scripts.length) throw new Error("Authored page JSON-LD missing");
  const formatted = formatBrowserGraph(scripts);
  const byId = new Map(formatted.map((node) => [node["@id"], node]));
  const home = formatted.find((node) => typed(node, "ProfilePage") && node.url === "https://www.ghezelbaash.ir/");
  if (!home) throw new Error("Primary ProfilePage missing after browser formatting");
  const personId = refs(home.mainEntity)[0];
  const rootIds = new Set([
    home["@id"], personId, ...refs(home.isPartOf), ...refs(home.primaryImageOfPage),
    ...formatted.filter((node) => typed(node, "MedicalClinic") || typed(node, "LocalBusiness") || typed(node, "VideoObject"))
      .map((node) => node["@id"]),
  ].filter(Boolean));
  const forbiddenTypes = new Set(["Dataset", "Review", "Event", "EducationEvent", "FAQPage"]);
  const selected = new Map(), queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift(), node = byId.get(id);
    if (!node || selected.has(id) || (id !== home["@id"] && values(node["@type"]).some((type) => forbiddenTypes.has(type)))) continue;
    if (typed(node, "ProfilePage") && id !== home["@id"]) continue;
    const output = structuredClone(node);
    if (id === home["@id"]) {
      delete output.mentions; delete output.citation; delete output.hasPart; delete output.subjectOf;
    }
    if (typed(output, "Person")) {
      delete output.subjectOf;
      delete output.knowsAbout;
    }
    if (typed(output, "MedicalClinic") || typed(output, "LocalBusiness")) {
      delete output.review; delete output.aggregateRating; delete output.subjectOf;
    }
    if (typed(output, "WebSite")) delete output.hasPart;
    selected.set(id, output);
    for (const key of publicRelationKeys) for (const ref of refs(output[key])) if (byId.has(ref)) queue.push(ref);
  }
  const document = { "@context": browserContext, "@graph": [...selected.values()] };
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return [{ id: scripts[0].id, document }];
}
