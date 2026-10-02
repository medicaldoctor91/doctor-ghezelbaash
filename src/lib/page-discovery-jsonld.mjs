import { assertRichResultsDocument } from "./rich-results-contract.mjs";
import { canonicalGraph } from "./canonical-inputs.mjs";
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
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
/** Publish a route-aware homepage discovery graph while preserving the full canonical graph separately. */
export function projectPageJsonLd(scripts) {
  if (!scripts.length) throw new Error("Authored page JSON-LD missing");
  const all = scripts.flatMap((script) => script.document["@graph"]);
  const byId = new Map(all.map((node) => [node["@id"], node]));
  const canonicalById = new Map(canonicalGraph["@graph"].map((node) => [node["@id"], node]));
  if (byId.size !== all.length) throw new Error("Duplicate authored entity");

  const home = byId.get("https://www.ghezelbaash.ir/webpage") ??
    all.find((node) => node.url === "https://www.ghezelbaash.ir/" &&
      values(node["@type"]).includes("MedicalWebPage"));
  if (!home || !values(home["@type"]).includes("MedicalWebPage"))
    throw new Error("Primary MedicalWebPage missing");
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
        ["image", "sameAs", "gender", "credentialCategory", "knowsAbout"].includes(key))
      return value["@id"];
    return Object.fromEntries(Object.entries(value)
      .map(([property, entry]) => [property, clean(entry, property)]));
  };

  const disallowedCandidateTypes = new Set(["ProfilePage", "Event", "EducationEvent", "Review", "Dataset"]);
  const excluded = (node) => node !== home &&
    values(node?.["@type"]).some((type) => disallowedCandidateTypes.has(type));
  const website = all.find((node) => values(node["@type"]).includes("WebSite"));
  const person = byId.get(values(home.mainEntity)[0]?.["@id"]);
  if (!person || !values(person["@type"]).includes("Person"))
    throw new Error("Homepage mainEntity must resolve to the canonical Person");
  const clinic = all.find((node) =>
    values(node["@type"]).includes("MedicalClinic") &&
    (node.owner?.["@id"] === person["@id"] || node.founder?.["@id"] === person["@id"]));

  const roots = [
    home, website, person, clinic,
    ...all.filter((node) => values(node["@type"]).some((type) =>
      ["Question", "Answer", "ImageObject", "VideoObject"].includes(type))),
  ].filter(Boolean);

  const relationKeys = [
    "mainEntity", "author", "publisher", "about", "mentions", "hasPart",
    "acceptedAnswer", "suggestedAnswer", "creator", "provider", "image", "logo",
    "primaryImageOfPage", "address", "geo", "location", "openingHoursSpecification",
    "hasCredential", "memberOf", "worksFor", "affiliation", "alumniOf", "recognizedBy",
    "identifier", "hasOccupation", "medicalSpecialty", "knowsAbout", "potentialAction",
    "object", "agent", "target", "inDefinedTermSet", "containedInPlace", "spatialCoverage",
    "category", "dcterms:subject", "isBasedOn", "citation",
  ];

  const selected = new Map();
  const queue = [...roots];
  while (queue.length) {
    const source = queue.shift();
    if (!source || selected.has(source["@id"]) || excluded(source)) continue;
    const output = clean(source);
    if (source["@id"] === home["@id"]) {
      const canonicalHome = canonicalById.get(home["@id"]);
      output["@type"] = "MedicalWebPage";
      if (canonicalHome?.dateModified) output.dateModified = canonicalHome.dateModified;
      delete output.hasPart;
    }
    if (source["@id"] === person["@id"]) {
      const canonicalPerson = canonicalById.get(person["@id"]);
      if (canonicalPerson?.url) output.url = canonicalPerson.url;
      if (canonicalPerson?.mainEntityOfPage) output.mainEntityOfPage = clean(canonicalPerson.mainEntityOfPage);
      delete output.subjectOf;
      delete output.performerIn;
    }
    if (values(output["@type"]).some((type) => ["MedicalClinic", "LocalBusiness"].includes(type))) {
      delete output.review;
      delete output.aggregateRating;
    }
    selected.set(output["@id"], output);
    for (const key of relationKeys) for (const ref of values(source[key])) {
      const id = typeof ref === "string" ? ref : ref?.["@id"];
      const target = byId.get(id);
      if (target && !excluded(target)) queue.push(target);
    }
  }

  const projected = [...selected.values()];
  const questions = projected.filter((node) =>
    values(node["@type"]).includes("Question") && node.acceptedAnswer);
  if (questions.length) projected.push({
    "@id": home.url + "#questions",
    "@type": "FAQPage",
    url: home.url,
    name: "پرسش‌ها و پاسخ‌های راهنمای پزشکی زیبایی دکتر سعید قزلباش",
    isPartOf: { "@id": home["@id"] },
    mainEntity: questions.map((node) => ({ "@id": node["@id"] })),
  });

  const document = { "@context": browserContext, "@graph": projected };
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return [{ id: scripts[0].id, document }];
}
