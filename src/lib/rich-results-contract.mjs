const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const hasType = (node, type) => values(node?.["@type"]).includes(type);
const fail = (message) => { throw new Error("Page rich-result contract: " + message); };
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

/**
 * Checks this site's published discovery graph, not Google's ranking or live
 * crawler access. Required ProfilePage/VideoObject/LocalBusiness fields and
 * the site's complete authored clinic address and image provenance must survive projection.
 */
export function assertRichResultsDocument(document, { primaryPageId } = {}) {
  if (!(document?.["@context"] === "https://schema.org" || Array.isArray(document?.["@context"]) && document["@context"].includes("https://schema.org")) || !Array.isArray(document["@graph"]))
    fail("one Schema.org discovery graph is required");
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
    for (const entry of Object.values(value)) walk(entry);
  };
  walk(nodes);
  const profiles = nodes.filter((node) => hasType(node, "ProfilePage"));
  const primary = primaryPageId ? byId.get(primaryPageId) : profiles.find((node) => node.url === "https://www.ghezelbaash.ir/") ?? profiles[0];
  if (primaryPageId && !primary) fail("primary page is missing");
  for (const profile of profiles) {
    const entity = resolve(profile.mainEntity, ["Person", "Organization"], "ProfilePage.mainEntity");
    text(entity.name, "ProfilePage.mainEntity.name");
    for (const property of ["dateCreated", "dateModified"])
      if (property in profile) instant(profile[property], "ProfilePage." + property);
  }
  if (primary && !profiles.includes(primary)) {
    const entities = values(primary.mainEntity).map((ref) => byId.get(ref?.["@id"]));
    if (!entities.length || entities.some((entity) => !entity || !values(entity["@type"]).length)) fail("page mainEntity must resolve to a typed entity");
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
