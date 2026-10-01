/** Render the canonical document and its media using sitemap protocol bounds. */
function renderDocumentSitemap({ canonicalUrl, lastmod, imageUrls, videos }, allowEmptyMedia = false) {
  const required = (value, label) => {
    if (typeof value !== "string" || !value.trim() || value !== value.trim())
      throw new Error("Sitemap requires normalized " + label);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value))
      throw new Error("Sitemap contains an invalid XML character: " + label);
    if (typeof value.isWellFormed === "function" && !value.isWellFormed())
      throw new Error("Sitemap contains an invalid Unicode sequence: " + label);
    return value;
  };
  const escape = (value) => String(value).replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const canonical = new URL(required(canonicalUrl, "canonical URL"));
  if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.hash || canonical.search)
    throw new Error("Sitemap canonical URL must be an absolute HTTPS document URL");
  if (canonical.href.length > 2048) throw new Error("Sitemap canonical URL exceeds 2048 characters");
  const mediaUrl = (value, label) => {
    const url = new URL(required(value, label));
    if (url.protocol !== "https:" || url.origin !== canonical.origin || url.hash || url.username || url.password)
      throw new Error("Sitemap media must use the canonical HTTPS origin: " + label);
    if (url.href.length > 2048) throw new Error("Sitemap media URL exceeds 2048 characters: " + label);
    return url.href;
  };
  const date = (value, label) => {
    required(value, label);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
      || !Number.isFinite(Date.parse(value))
      || new Date(value.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) !== value.slice(0, 10))
      throw new Error("Sitemap date is invalid: " + label);
    return value;
  };
  const duration = (value) => {
    const match = typeof value === "string" && value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
    const seconds = typeof value === "number" ? value : match && Math.round(
      Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0));
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 28800)
      throw new Error("Sitemap video duration must be between 1 and 28800 seconds");
    return seconds;
  };
  if (!Array.isArray(imageUrls) || (!allowEmptyMedia && !imageUrls.length) || imageUrls.length > 1000)
    throw new Error("Sitemap requires 1 to 1000 images for the canonical document");
  const images = imageUrls.map((value) => mediaUrl(value, "image URL"));
  if (new Set(images).size !== images.length) throw new Error("Sitemap contains duplicate image URLs");
  if (!Array.isArray(videos) || (!allowEmptyMedia && !videos.length)) throw new Error("Sitemap requires canonical videos");
  const contentUrls = new Set();
  const videoXml = videos.map((video) => {
    const thumbnail = mediaUrl(video.thumbnailUrl, "video thumbnail URL");
    const content = mediaUrl(video.contentUrl, "video content URL");
    if (contentUrls.has(content)) throw new Error("Sitemap contains duplicate video content URLs");
    contentUrls.add(content);
    const title = required(video.title, "video title"), description = required(video.description, "video description");
    if ([...title].length > 100 || [...description].length > 2048)
      throw new Error("Sitemap video title or description exceeds protocol limits");
    return [
      "    <video:video>",
      "<video:thumbnail_loc>" + escape(thumbnail) + "</video:thumbnail_loc>",
      "<video:title>" + escape(title) + "</video:title>",
      "<video:description>" + escape(description) + "</video:description>",
      "<video:content_loc>" + escape(content) + "</video:content_loc>",
      "<video:publication_date>" + escape(date(video.publicationDate, "video publication date")) + "</video:publication_date>",
      "<video:duration>" + duration(video.duration) + "</video:duration>",
      "</video:video>",
    ].join("");
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
    "  <url>",
    "    <loc>" + escape(canonical.href) + "</loc>",
    "    <lastmod>" + escape(date(lastmod, "document modification date")) + "</lastmod>",
    ...images.map((url) => "    <image:image><image:loc>" + escape(url) + "</image:loc></image:image>"),
    ...videoXml,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");
  if (new TextEncoder().encode(xml).byteLength > 50 * 1024 * 1024)
    throw new Error("Sitemap exceeds the uncompressed 50 MB protocol limit");
  return xml;
}

/** One canonical entry per direct-entry document, including text-only topics. */
export function renderDiscoverySitemap(input) {
  if (!("pages" in input)) return renderDocumentSitemap(input);
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > 50000)
    throw new Error("Sitemap requires 1 to 50000 pages");
  const seen = new Set(), origin = new URL(input.pages[0].canonicalUrl).origin;
  const documents = input.pages.map((record) => {
    const url = new URL(record.canonicalUrl);
    if (url.origin !== origin) throw new Error("Sitemap pages must share the canonical origin");
    if (seen.has(url.href)) throw new Error("Sitemap contains duplicate canonical pages");
    seen.add(url.href);
    return renderDocumentSitemap({ ...record, imageUrls: record.imageUrls || [], videos: record.videos || [] }, true);
  });
  const first = documents[0];
  const xml = first.slice(0, first.indexOf("  <url>")) + documents.map((document) =>
    document.slice(document.indexOf("  <url>"), document.indexOf("</urlset>"))).join("") + "</urlset>\n";
  if (new TextEncoder().encode(xml).byteLength > 50 * 1024 * 1024)
    throw new Error("Sitemap exceeds the uncompressed 50 MB protocol limit");
  return xml;
}
