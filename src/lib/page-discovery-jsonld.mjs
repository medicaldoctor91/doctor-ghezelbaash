const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const types = (node) => values(node?.["@type"]);
const referenceId = (value) => value?.["@id"];

// This is a browser discovery projection, not the downloadable RDF graph.
// Only entities describing this page and its visible media belong in it.
// External profile evidence, historical events and self-hosted reviews remain
// in graph.jsonld; they are not rich-result candidates for this document.
const fields = {
  WebSite: ["url", "name", "alternateName", "publisher", "inLanguage"],
  ProfilePage: ["url", "name", "description", "headline", "mainEntity", "author", "publisher", "isPartOf", "inLanguage", "primaryImageOfPage", "image", "about", "dateModified"],
  Person: ["url", "name", "givenName", "familyName", "alternateName", "description", "jobTitle", "sameAs", "image", "mainEntityOfPage", "worksFor", "address", "telephone", "memberOf"],
  MedicalClinic: ["url", "name", "alternateName", "description", "address", "telephone", "geo", "sameAs", "image", "logo", "openingHoursSpecification", "openingHours", "hasMap"],
  Organization: ["url", "name", "alternateName", "sameAs"],
  CollegeOrUniversity: ["url", "name", "sameAs"],
  PostalAddress: ["streetAddress", "addressLocality", "addressRegion", "addressCountry", "postalCode"],
  GeoCoordinates: ["latitude", "longitude"],
  OpeningHoursSpecification: ["dayOfWeek", "opens", "closes"],
  ImageObject: ["url", "name", "caption", "description", "contentUrl", "encodingFormat", "width", "height", "creator", "copyrightHolder", "creditText", "copyrightNotice", "license", "acquireLicensePage"],
  VideoObject: ["url", "name", "description", "thumbnailUrl", "contentUrl", "embedUrl", "uploadDate", "duration", "inLanguage"],
};

function localized(value, language) {
  if (!Array.isArray(value)) return value?.["@value"] ?? value;
  const literals = value.filter((entry) => entry && typeof entry === "object" && "@value" in entry);
  if (!literals.length) return value;
  if (literals.length !== value.length) throw new Error("Mixed language literals in browser projection");
  const base = language.split("-")[0];
  return (literals.find((entry) => entry["@language"] === language)
    ?? literals.find((entry) => entry["@language"]?.split("-")[0] === base)
    ?? literals.find((entry) => entry["@language"] === "en")
    ?? literals[0])["@value"];
}

export function projectPageJsonLd(scripts) {
  if (!scripts.length) throw new Error("Authored page JSON-LD missing");
  const core = scripts[0].document["@graph"];
  const all = scripts.flatMap((script) => script.document["@graph"]);
  const page = core.find((node) => types(node).includes("ProfilePage"));
  const personId = referenceId(page?.mainEntity);
  const person = core.find((node) => node["@id"] === personId && types(node).includes("Person"));
  if (!page || !person) throw new Error("Page projection requires its authored ProfilePage and Person");
  const language = values(page.inLanguage)[0] || "fa";
  const selected = core.filter((node) =>
    node === page || node === person ||
    types(node).some((type) => type !== "ProfilePage" && type !== "Person" && fields[type]));
  selected.push(...all.filter((node) => types(node).includes("VideoObject")));
  const ids = new Set(selected.map((node) => node["@id"]));
  const clean = (value) => {
    value = localized(value, language);
    if (Array.isArray(value)) {
      const entries = value.map(clean).filter((entry) => entry !== undefined);
      return entries.length ? entries : undefined;
    }
    if (value && typeof value === "object") {
      if (value["@id"]) return ids.has(value["@id"]) ? { "@id": value["@id"] } : undefined;
      if (types(value).includes("QuantitativeValue")) return value.value;
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clean(entry)])
        .filter(([, entry]) => entry !== undefined));
    }
    return value;
  };
  const projected = selected.map((node) => {
    const type = node === page ? "ProfilePage" : node === person ? "Person"
      : types(node).find((type) => fields[type]);
    const output = { "@id": node["@id"], "@type": type };
    for (const key of fields[type]) {
      if (!(key in node)) continue;
      // A known calendar date is not evidence of a modification instant.
      // ProfilePage dateModified is optional; never invent midnight/timezone.
      if (type === "ProfilePage" && key === "dateModified" &&
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(node[key])) continue;
      const value = clean(node[key]);
      if (value !== undefined) output[key] = value;
    }
    return output;
  });
  return [{ id: scripts[0].id, document: { "@context": "https://schema.org", "@graph": projected } }];
}
