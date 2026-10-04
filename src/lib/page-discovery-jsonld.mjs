import { assertRichResultsDocument, markGoogleDiscoveryGenerationContext } from "./rich-results-contract.mjs";
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
export const browserContext = ["https://schema.org", {
  prov: "http://www.w3.org/ns/prov#", dcterms: "http://purl.org/dc/terms/", skos: "http://www.w3.org/2004/02/skos/core#",
}];
/** Keep retained source terms and prefixes in their authored RDF namespaces. */
export function browserContextFor(graph) {
  if (!graph?.["@context"]) throw new Error("Canonical graph requires @context");
  return markGoogleDiscoveryGenerationContext(["https://schema.org", ...values(structuredClone(graph["@context"]))
    .filter((context) => context !== "https://schema.org")]);
}
export function localizedText(value, language = "fa-IR") {
  const literals = values(value).filter((entry) => entry && typeof entry === "object" && "@value" in entry);
  if (!literals.length) return value;
  const base = language.split("-")[0];
  return (literals.find((entry) => entry["@language"] === language)
    ?? literals.find((entry) => entry["@language"]?.split("-")[0] === base)
    ?? literals.find((entry) => entry["@language"] === "en") ?? literals[0])["@value"];
}
/** Publish a route-aware homepage discovery graph while preserving the full canonical graph separately. */
export function projectPageJsonLd(graph, scriptId = "schema-core-mainentity") {
  const all = graph?.["@graph"];
  if (!Array.isArray(all)) throw new Error("Canonical graph requires @graph");
  const byId = new Map(all.map((node) => [node["@id"], node]));
  if (byId.size !== all.length) throw new Error("Duplicate authored entity");

  const home = byId.get("https://www.ghezelbaash.ir/webpage") ??
    all.find((node) => node.url === "https://www.ghezelbaash.ir/" &&
      values(node["@type"]).includes("MedicalWebPage"));
  if (!home || !values(home["@type"]).includes("ProfilePage") || !values(home["@type"]).includes("MedicalWebPage"))
    throw new Error("Primary physician ProfilePage with its medical portfolio is missing");
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
    return Object.fromEntries(Object.entries(value)
      .map(([property, entry]) => [property, clean(entry, property)]));
  };

  const disallowedCandidateTypes = new Set(["ProfilePage", "Event", "EducationEvent", "Review", "Dataset"]);
  const courseInstanceIds = new Set();
  const excluded = (node) => {
    if (node?.["@id"] === home["@id"]) return false;
    const types = values(node?.["@type"]);
    // Canonical documents remain linked through the homepage portfolio. Their
    // own page/FAQ graphs belong to their route, while the full downloadable
    // graph retains all definitions. Do not recursively import a clinic
    // document's child pages into the homepage discovery projection.
    if (typeof node?.url === "string" && node.url.startsWith(home.url) &&
        types.some((type) => ["WebPage", "MedicalWebPage", "ContactPage", "FAQPage"].includes(type))) return true;
    const courseInstance = courseInstanceIds.has(node?.["@id"]) && types.includes("CourseInstance") && types.includes("EducationEvent");
    return types.some((type) => disallowedCandidateTypes.has(type) &&
      !(courseInstance && ["Event", "EducationEvent"].includes(type)));
  };
  const website = all.find((node) => values(node["@type"]).includes("WebSite"));
  const person = byId.get(values(home.mainEntity)[0]?.["@id"]);
  if (!person || !values(person["@type"]).includes("Person"))
    throw new Error("Homepage mainEntity must resolve to the canonical Person");
  const clinic = all.find((node) =>
    values(node["@type"]).includes("MedicalClinic") &&
    (node.owner?.["@id"] === person["@id"] || node.founder?.["@id"] === person["@id"]));

  const primaryImageId = home.primaryImageOfPage?.["@id"] ?? person.image?.["@id"] ?? person.image;
  const primaryImage = byId.get(primaryImageId);
  const roots = [
    home, website, person, clinic, primaryImage,
    ...all.filter((node) => values(node["@type"]).some((type) =>
      ["Question", "Answer", "ImageObject", "VideoObject"].includes(type))),
  ].filter(Boolean);

  const relationKeys = [
    "mainEntity", "author", "publisher", "about", "mentions", "hasPart",
    "acceptedAnswer", "suggestedAnswer", "creator", "provider", "image", "logo",
    "primaryImageOfPage", "address", "geo", "location", "openingHoursSpecification", "contactPoint", "areaServed",
    "hasCredential", "memberOf", "worksFor", "affiliation", "alumniOf", "recognizedBy",
    "identifier", "hasOccupation", "medicalSpecialty", "knowsAbout", "potentialAction",
    "object", "agent", "target", "inDefinedTermSet", "containedInPlace", "spatialCoverage",
    "category", "dcterms:subject", "isBasedOn", "citation", "speakable",
    "hasCourseInstance", "instructor", "performer", "organizer", "audience", "recordedIn",
  ];

  const selected = new Map();
  const queue = [...roots];
  while (queue.length) {
    const source = queue.shift();
    if (!source || selected.has(source["@id"]) || excluded(source)) continue;
    const output = clean(source);
    if (source["@id"] === person["@id"]) {
      delete output.subjectOf;
      delete output.performerIn;
    }
    if (values(output["@type"]).some((type) => ["MedicalClinic", "LocalBusiness"].includes(type))) {
      delete output.review;
      delete output.aggregateRating;
    }
    selected.set(output["@id"], output);
    if (values(source["@type"]).includes("Course")) for (const ref of values(source.hasCourseInstance)) {
      const id = typeof ref === "string" ? ref : ref?.["@id"];
      const types = values(byId.get(id)?.["@type"]);
      if (types.includes("CourseInstance") && types.includes("EducationEvent")) courseInstanceIds.add(id);
    }
    for (const key of relationKeys) for (const ref of values(source[key])) {
      if (source["@id"] === home["@id"] && key === "hasPart") continue;
      if (key === "hasCourseInstance" && !values(source["@type"]).includes("Course")) continue;
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

  const document = { "@context": browserContextFor(graph), "@graph": projected };
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return [{ id: scriptId, document }];
}

export function validatePageJsonLd(scripts) {
  if (scripts.length !== 1) throw new Error("Canonical page requires one discovery graph");
  const document = scripts[0].document;
  const home = document?.["@graph"]?.find((node) => node["@id"] === "https://www.ghezelbaash.ir/webpage");
  if (!home || !values(home["@type"]).includes("ProfilePage") || !values(home["@type"]).includes("MedicalWebPage"))
    throw new Error("Primary physician ProfilePage with its medical portfolio is missing");
  assertRichResultsDocument(document, { primaryPageId: home["@id"] });
  return scripts;
}
