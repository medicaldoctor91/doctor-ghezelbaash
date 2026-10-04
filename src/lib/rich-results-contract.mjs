import { validCalendarDate } from "./graph-dates.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const hasType = (node, type) => values(node?.["@type"]).includes(type);
const fail = (message) => { throw new Error("Page rich-result contract: " + message); };
const GOOGLE_SCHEMA_CONTEXT = "https://schema.org";
const GENERATION_CONTEXT_MARKER = Symbol.for("ghezelbaash.google-discovery-generation-context");
const text = (value, label) => {
  if (typeof value !== "string" || !value.trim()) fail(label + " must be nonempty Text");
  return value;
};
const webUrl = (value, label) => {
  text(value, label);
  let url;
  try { url = new URL(value); } catch { fail(label + " must be an absolute URL"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || value !== value.trim())
    fail(label + " must be a public HTTP(S) URL");
  return value;
};
const instant = (value, label) => {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) !== value.slice(0, 10))
    fail(label + " must be a real ISO timestamp with timezone");
};
const duration = (value, label) => {
  text(value, label);
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  const seconds = match && Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 +
      Number(match[3] || 0) * 60 + Number(match[4] || 0);
  if (!match || value.endsWith("T") || !Number.isFinite(seconds) || seconds <= 0)
    fail(label + " must be a positive ISO duration");
};

const schemaIri = (value) => typeof value === "string" &&
  (value === GOOGLE_SCHEMA_CONTEXT || value === GOOGLE_SCHEMA_CONTEXT + "/" || value.startsWith(GOOGLE_SCHEMA_CONTEXT + "/"));
const contextKinds = (context) => {
  const kinds = new Map();
  for (const entry of values(context)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    for (const [term, definition] of Object.entries(entry)) {
      if (term.startsWith("@")) continue;
      const iri = typeof definition === "string" ? definition : definition?.["@id"];
      if (typeof iri === "string") kinds.set(term, schemaIri(iri) ? "schema" : "custom");
    }
  }
  return kinds;
};
const googleType = (value, kinds) => {
  if (typeof value !== "string") return undefined;
  if (value.startsWith(GOOGLE_SCHEMA_CONTEXT + "/")) return value.slice((GOOGLE_SCHEMA_CONTEXT + "/").length);
  if (/^https?:\/\//.test(value)) return undefined;
  const colon = value.indexOf(":");
  if (colon > 0)
    return kinds.get(value.slice(0, colon)) === "schema" ? value.slice(colon + 1) : undefined;
  if (kinds.get(value) === "custom") return undefined;
  return value;
};
const googleValue = (value, kinds) => {
  if (Array.isArray(value)) return value.map((entry) => googleValue(entry, kinds)).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "@context") continue;
    if (key === "@type") {
      const types = values(entry).map((type) => googleType(type, kinds)).filter(Boolean);
      if (types.length) output[key] = Array.isArray(entry) ? types : types[0];
      continue;
    }
    if (key.startsWith("@")) {
      output[key] = googleValue(entry, kinds);
      continue;
    }
    const colon = key.indexOf(":");
    if (colon > 0) {
      if (kinds.get(key.slice(0, colon)) === "schema")
        output[key.slice(colon + 1)] = googleValue(entry, kinds);
      continue;
    }
    if (kinds.get(key) === "custom") continue;
    output[key] = googleValue(entry, kinds);
  }
  return output;
};

/** Mark a rich canonical context as generation-only without serializing the marker. */
export function markGoogleDiscoveryGenerationContext(context) {
  if (!Array.isArray(context)) fail("generation context must be an array");
  Object.defineProperty(context, GENERATION_CONTEXT_MARKER, { value: true, enumerable: false });
  return context;
}

/**
 * Normalize only an in-memory generation document at the publication boundary.
 * Canonical RDF keeps its authored namespaces; serialized HTML exposes one compact
 * Schema.org context and removes canonical-only ontology terms/types.
 */
export function normalizeGoogleDiscoveryDocument(document) {
  const context = document?.["@context"];
  if (!(context === GOOGLE_SCHEMA_CONTEXT || Array.isArray(context) && context.includes(GOOGLE_SCHEMA_CONTEXT)) ||
      !Array.isArray(document?.["@graph"]))
    fail("one Schema.org discovery graph is required");
  if (context === GOOGLE_SCHEMA_CONTEXT) return document;
  if (!context[GENERATION_CONTEXT_MARKER])
    fail("published JSON-LD must use the public Schema.org context");
  const kinds = contextKinds(context);
  const graph = document["@graph"].map((node) => googleValue(node, kinds))
    .filter((node) => node && values(node["@type"]).length);
  document["@context"] = GOOGLE_SCHEMA_CONTEXT;
  document["@graph"] = graph;
  return document;
}

/**
 * Checks this site's published discovery graph, not Google's ranking or live
 * crawler access. Generation-only marked contexts are normalized before serialization;
 * unmarked parsed/published array contexts are rejected rather than repaired.
 */
export function assertRichResultsDocument(document, { primaryPageId } = {}) {
  const incomingContext = document?.["@context"];
  if (Array.isArray(incomingContext) && incomingContext[GENERATION_CONTEXT_MARKER])
    normalizeGoogleDiscoveryDocument(document);
  if (document?.["@context"] !== GOOGLE_SCHEMA_CONTEXT || !Array.isArray(document?.["@graph"]))
    fail("published JSON-LD must use the public Schema.org context");
  const nodes = document["@graph"], byId = new Map();
  for (const node of nodes) {
    webUrl(node?.["@id"], "entity @id");
    if (byId.has(node["@id"])) fail("duplicate entity @id: " + node["@id"]);
    byId.set(node["@id"], node);
  }
  const resolve = (value, expected, label) => {
    const node = value && typeof value === "object" && !Array.isArray(value)
      ? (byId.get(value["@id"]) ?? value) : null;
    if (!node || !expected.some((type) => hasType(node, type)))
      fail(label + " must resolve to " + expected.join(" or "));
    return node;
  };
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    if (value["@id"] && Object.keys(value).length === 1 && !byId.has(value["@id"]) &&
        !/^https?:\/\//.test(value["@id"]))
      fail("unresolved entity reference: " + value["@id"]);
    if ("@value" in value) fail("RDF value objects must be formatted for browser discovery");
    for (const [key, entry] of Object.entries(value)) {
      if (!key.startsWith("@") && key.includes(":"))
        fail("published JSON-LD contains a non-Schema prefixed property: " + key);
      if (key === "@type") for (const type of values(entry))
        if (typeof type === "string" && (type.includes(":") || /^https?:\/\//.test(type)))
          fail("published JSON-LD contains a non-Schema type: " + type);
      walk(entry);
    }
  };
  walk(nodes);
  const profiles = nodes.filter((node) => hasType(node, "ProfilePage"));
  const primary = primaryPageId ? byId.get(primaryPageId) : profiles.find((node) => node.url === "https://www.ghezelbaash.ir/") ?? profiles[0];
  if (primaryPageId && !primary) fail("primary page is missing");
  for (const profile of profiles) {
    const entity = resolve(profile.mainEntity, ["Person", "Organization"], "ProfilePage.mainEntity");
    text(entity.name, "ProfilePage.mainEntity.name");
    for (const property of ["dateCreated", "dateModified"])
      if (property in profile && !validCalendarDate(profile[property]))
        instant(profile[property], "ProfilePage." + property);
  }
  if (primary && !profiles.includes(primary)) {
    const entities = values(primary.mainEntity).map((ref) => byId.get(ref?.["@id"]));
    if (!entities.length || entities.some((entity) => !entity || !values(entity["@type"]).length))
      fail("page mainEntity must resolve to a typed entity");
    for (const entity of entities)
      if (hasType(entity, "Person") || hasType(entity, "Organization"))
        text(entity.name, "page mainEntity.name");
  }
  for (const faq of nodes.filter((node) => hasType(node, "FAQPage"))) {
    const questions = values(faq.mainEntity);
    if (!questions.length) fail("FAQPage.mainEntity must include a Question");
    for (const ref of questions) {
      const question = resolve(ref, ["Question"], "FAQPage.mainEntity");
      text(question.name, "FAQPage.Question.name");
      const answers = values(question.acceptedAnswer);
      if (answers.length !== 1) fail("FAQPage.Question.acceptedAnswer must include one Answer");
      const answer = resolve(answers[0], ["Answer"], "FAQPage.Question.acceptedAnswer");
      text(answer.text, "FAQPage.Answer.text");
    }
  }
  const clinics = nodes.filter((node) => hasType(node, "MedicalClinic") || hasType(node, "LocalBusiness"));
  for (const clinic of clinics) {
    text(clinic.name, "LocalBusiness.name");
    const address = resolve(clinic.address, ["PostalAddress"], "LocalBusiness.address");
    for (const property of ["streetAddress", "addressLocality", "addressRegion", "addressCountry", "postalCode"])
      text(address[property], "Published clinic address." + property);
  }
  const images = nodes.filter((node) => hasType(node, "ImageObject"));
  for (const image of images) {
    webUrl(image.contentUrl, "ImageObject.contentUrl");
    const creator = resolve(image.creator, ["Person", "Organization"], "ImageObject.creator");
    text(creator.name ?? creator.alternateName, "ImageObject.creator.name");
    for (const property of ["license", "acquireLicensePage"])
      if (property in image) webUrl(image[property], "ImageObject." + property);
    for (const property of ["width", "height"])
      if (property in image && (!Number.isFinite(image[property]) || image[property] <= 0))
        fail("ImageObject." + property + " must be a positive number");
  }
  const videos = nodes.filter((node) => hasType(node, "VideoObject"));
  for (const video of videos) {
    text(video.name, "VideoObject.name");
    if (!values(video.thumbnailUrl).length) fail("VideoObject.thumbnailUrl is required");
    for (const thumbnail of values(video.thumbnailUrl)) webUrl(thumbnail, "VideoObject.thumbnailUrl");
    instant(video.uploadDate, "VideoObject.uploadDate");
    if (!video.contentUrl && !video.embedUrl) fail("published video needs a playable contentUrl or embedUrl");
    for (const property of ["contentUrl", "embedUrl"])
      if (property in video) webUrl(video[property], "VideoObject." + property);
    if ("description" in video) text(video.description, "VideoObject.description");
    if ("duration" in video) duration(video.duration, "VideoObject.duration");
  }
  const incompleteCandidates = [];
  for (const node of nodes) {
    const missing = [];
    if (hasType(node, "Review") && !node.reviewRating) missing.push("reviewRating");
    if (hasType(node, "Event") || hasType(node, "EducationEvent")) {
      if (!node.startDate) missing.push("startDate");
      const location = byId.get(node.location?.["@id"]) ?? node.location;
      if (!location?.name) missing.push("location.name");
      const address = byId.get(location?.address?.["@id"]) ?? location?.address;
      if (!address || !hasType(address, "PostalAddress")) missing.push("location.address");
    }
    if (hasType(node, "Dataset") && !node.description) missing.push("description");
    if (missing.length) incompleteCandidates.push({ id: node["@id"], types: values(node["@type"]), missing });
  }
  return { profiles: profiles.length, localBusinesses: clinics.length, images: images.length, videos: videos.length, incompleteCandidates };

}
