import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { nodeTypes, valueText } from "../projection-context.mjs";
import { assembleCanonicalContent, physicianImageUrls } from "../assemble-content.mjs";
import { inspectHtml } from "../html-contract.mjs";
import {
  directLanguageLiterals,
  exactLanguageLiteral,
} from "../../../src/lib/semantic-projection.mjs";

const vEsc = (value) =>
  String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const foldVCard = (line) => {
  const out = [];
  let buffer = "";
  for (const char of line) {
    const next = buffer + char;
    if (Buffer.byteLength(next, "utf8") > 73) {
      out.push(buffer);
      buffer = " " + char;
    } else buffer = next;
  }
  if (buffer) out.push(buffer);
  return out.join("\r\n");
};
const vCard = (lines) => lines.map(foldVCard).join("\r\n") + "\r\n";
const xmlEsc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const isoDurationSeconds = (value) => {
  const match = String(value ?? "").match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/,
  );
  if (!match) return null;
  return Math.round(
    Number(match[1] || 0) * 3600 +
      Number(match[2] || 0) * 60 +
      Number(match[3] || 0),
  );
};
const requiredText = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Contact discovery: ${label} is required`);
  return value;
};
const requiredNode = (byId, id, label) => {
  requiredText(id, `${label} @id`);
  const node = byId.get(id);
  if (!node) throw new Error(`Contact discovery: ${label} node missing: ${id}`);
  return node;
};
const requiredReferenceId = (value, label) =>
  requiredText(value?.["@id"], `${label} reference`);

export function deriveSitemapImageUrls({ content, graph, byId, release }) {
  const canonicalImageUrl = (value, label) => {
    const url = new URL(requiredText(value, label), release.canonicalUrl);
    if (url.origin !== new URL(release.canonicalUrl).origin || url.hash)
      throw new Error(`Contact discovery: ${label} must be a canonical image resource: ${url}`);
    return url.href;
  };
  const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
  const visibleImageUrls = inspectHtml(content, { wrapMain: true }).elements
    .filter((node) => node.tagName === "img")
    .map((node) => {
      const fallback = canonicalImageUrl(attr(node, "src"), "visible image src");
      const extension = path.extname(new URL(fallback).pathname);
      const candidates = [{ url: fallback, width: Number(attr(node, "width")) || 0 }];
      const sources = node.parentNode?.tagName === "picture"
        ? node.parentNode.childNodes.filter((child) => child.tagName === "source")
        : [node];
      for (const source of sources)
        for (const candidate of (attr(source, "srcset") || "").split(",")) {
          const match = candidate.trim().match(/^(\S+)\s+(\d+)w$/);
          if (!match) continue;
          const url = canonicalImageUrl(match[1], "visible responsive image");
          if (path.extname(new URL(url).pathname) === extension)
            candidates.push({ url, width: Number(match[2]) });
        }
      // Publish one high-resolution representation of each visible picture,
      // preserving its fallback format instead of listing every delivery size.
      return candidates.sort((left, right) => right.width - left.width)[0].url;
    });
  if (!visibleImageUrls.length)
    throw new Error("Contact discovery: visible images are required");
  const clinic = requiredNode(byId, release.clinic.id, "owned clinic");
  const logoIds = new Set([clinic.logo].flat().map((value) => value?.["@id"]).filter(Boolean));
  const clinicImageUrls = clinic.image.filter((value) => !logoIds.has(value?.["@id"])).map((value) =>
    canonicalImageUrl(
      typeof value === "string" ? value : requiredNode(
        byId, requiredReferenceId(value, "clinic image"), "clinic image",
      ).contentUrl,
      "clinic image contentUrl",
    ),
  );
  return [...new Set([
    ...visibleImageUrls,
    ...physicianImageUrls(graph, release),
    ...clinicImageUrls,
  ])];
}

export async function compileContactDiscovery(context) {
  const { generatedPublic, projections, release, graph, byId } = context;
  if (!Array.isArray(graph?.["@graph"]) || !(byId instanceof Map))
    throw new Error(
      "Contact discovery requires the canonical graph and its node index",
    );
  const person = requiredNode(
    byId,
    release.primaryEntity.id,
    "primary physician",
  );
  const clinic = requiredNode(byId, release.clinic.id, "owned clinic");
  const addressNode = requiredNode(
    byId,
    requiredReferenceId(clinic.address, "owned clinic address"),
    "owned clinic address",
  );
  const personPortrait = requiredNode(
    byId,
    `${release.canonicalUrl}#image-saeed-ghezelbash-portrait-master`,
    "primary physician portrait",
  );
  if (!Array.isArray(clinic.image) || !clinic.image.length)
    throw new Error("Contact discovery: owned clinic image facts are required");
  const clinicImageIds = clinic.image
    .filter((value) => value && typeof value === "object")
    .map((value, index) =>
      requiredReferenceId(value, `owned clinic image ${index + 1}`),
    );
  for (const id of clinicImageIds)
    requiredNode(byId, id, "owned clinic image");
  const clinicPhoto = requiredNode(
    byId,
    `${release.canonicalUrl}#image-ghezelbaash-clinic-interior`,
    "owned clinic contact photo",
  );
  if (!clinicImageIds.includes(clinicPhoto["@id"]))
    throw new Error(
      "Contact discovery: owned clinic contact photo is not linked from the clinic",
    );
  const doctorName = exactLanguageLiteral(
    person.name,
    "fa",
    "Canonical physician name",
  );
  const doctorGivenName = exactLanguageLiteral(
    person.givenName,
    "fa",
    "Canonical physician given name",
  );
  const doctorFamilyName = exactLanguageLiteral(
    person.familyName,
    "fa",
    "Canonical physician family name",
  );
  const doctorTitles = directLanguageLiterals(
    person.jobTitle,
    "fa",
    "Canonical physician job titles",
  );
  const doctorHonorific = exactLanguageLiteral(
    person.honorificPrefix,
    "fa",
    "Canonical physician honorific prefix",
  );
  if (
    doctorName !==
    `${doctorHonorific} ${doctorGivenName} ${doctorFamilyName}`
  )
    throw new Error(
      "Contact discovery: Persian physician name components are inconsistent",
    );
  const clinicName = exactLanguageLiteral(
    clinic.name,
    "fa",
    "Canonical clinic name",
  );
  const telephone = requiredText(clinic.telephone, "clinic telephone");
  const streetAddress = requiredText(
    addressNode.streetAddress,
    "clinic street address",
  );
  const addressLocality = requiredText(
    addressNode.addressLocality,
    "clinic address locality",
  );
  const addressRegion = requiredText(
    addressNode.addressRegion,
    "clinic address region",
  );
  const postalCode = requiredText(addressNode.postalCode, "clinic postal code");
  const addressCountry = requiredText(
    addressNode.addressCountry,
    "clinic address country",
  );
  const personPortraitUrl = requiredText(
    personPortrait.contentUrl,
    "primary physician portrait contentUrl",
  );
  const clinicPhotoUrl = requiredText(
    clinicPhoto.contentUrl,
    "owned clinic contact photo contentUrl",
  );
  const rev = `${release.dateModified.replaceAll("-", "")}T000000Z`;
  await mkdir(generatedPublic, { recursive: true });

  const doctorVcf = vCard(
    [
      "BEGIN:VCARD",
      "VERSION:4.0",
      `PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
      `UID:${release.primaryEntity.id}`,
      `FN:${doctorName}`,
      `N:${doctorFamilyName};${doctorGivenName};;${doctorHonorific};`,
      ...doctorTitles.map((title) => `TITLE:${title}`),
      `TEL;TYPE=work,voice:${telephone}`,
      `ADR;TYPE=work:;;${vEsc(streetAddress)};${vEsc(addressLocality)};${vEsc(addressRegion)};${vEsc(postalCode)};${vEsc(addressCountry)}`,
      `URL:${release.canonicalUrl}`,
      `SOURCE:${release.canonicalUrl}doctor.vcf`,
      `PHOTO;MEDIATYPE=image/jpeg:${personPortraitUrl}`,
      `X-GOOGLE-KG-ID:${release.primaryEntity.googleKnowledgeGraphId}`,
      `X-WIKIDATA:${release.primaryEntity.wikidata}`,
      `X-IRIMC:${release.primaryEntity.irimc}`,
      `X-ORCID:${release.primaryEntity.orcid}`,
      `X-OWNED-CLINIC:${release.clinic.id}`,
      `X-ENTITY-VERSION:${release.release}`,
      `REV:${rev}`,
      "END:VCARD",
    ].filter(Boolean),
  );
  const clinicVcf = vCard(
    [
      "BEGIN:VCARD",
      "VERSION:4.0",
      `PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
      `UID:${release.clinic.id}`,
      `FN:${clinicName}`,
      `ORG:${clinicName}`,
      `TEL;TYPE=work,voice:${telephone}`,
      `ADR;TYPE=work:;;${vEsc(streetAddress)};${vEsc(addressLocality)};${vEsc(addressRegion)};${vEsc(postalCode)};${vEsc(addressCountry)}`,
      `URL:${release.canonicalUrl}`,
      `SOURCE:${release.canonicalUrl}clinic.vcf`,
      `PHOTO;MEDIATYPE=image/webp:${clinicPhotoUrl}`,
      `X-GOOGLE-KG-ID:${release.clinic.googleLocalKgmid}`,
      `X-GOOGLE-PLACE-ID:${release.clinic.placeId}`,
      `X-GOOGLE-MAPS-CID:${release.clinic.cid}`,
      `X-WIKIDATA:${release.dataset.supportingClinicWikidata}`,
      `X-OWNER:${release.primaryEntity.id}`,
      `X-PRICE-RANGE:${release.clinic.priceRange}`,
      `X-HOURS:${release.clinic.hours}`,
      `X-ENTITY-VERSION:${release.release}`,
      `REV:${rev}`,
      "END:VCARD",
    ].filter(Boolean),
  );
  await writeFile(path.join(generatedPublic, "doctor.vcf"), doctorVcf);
  await writeFile(path.join(generatedPublic, "clinic.vcf"), clinicVcf);

  const { content } = await assembleCanonicalContent({ root: context.root, graph });
  const imageLocs = deriveSitemapImageUrls({ content, graph, byId, release });
  const videos = graph["@graph"].filter((node) =>
    nodeTypes(node).includes("VideoObject"),
  );
  if (!videos.length)
    throw new Error("Contact discovery: canonical video facts are required");
  let sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
    "  <url>",
    `    <loc>${release.canonicalUrl}</loc>`,
    `    <lastmod>${release.dateModified}</lastmod>`,
    "",
  ].join("\n");
  for (const url of imageLocs)
    sitemap += `    <image:image><image:loc>${xmlEsc(url)}</image:loc></image:image>\n`;
  for (const video of videos) {
    const videoId = requiredText(video["@id"], "video @id");
    const thumb = requiredText(
      video.thumbnailUrl,
      `${videoId} thumbnailUrl`,
    );
    const content = requiredText(video.contentUrl, `${videoId} contentUrl`);
    const title = requiredText(valueText(video.name), `${videoId} name`);
    const description = requiredText(
      valueText(video.description),
      `${videoId} description`,
    );
    const date = requiredText(video.uploadDate, `${videoId} uploadDate`);
    const duration = isoDurationSeconds(
      requiredText(video.duration, `${videoId} duration`),
    );
    if (!Number.isInteger(duration) || duration < 1)
      throw new Error(`Contact discovery: ${videoId} duration is invalid`);
    sitemap += `${[
      "    <video:video>",
      `<video:thumbnail_loc>${xmlEsc(thumb)}</video:thumbnail_loc>`,
      `<video:title>${xmlEsc(title)}</video:title>`,
      `<video:description>${xmlEsc(description)}</video:description>`,
      `<video:content_loc>${xmlEsc(content)}</video:content_loc>`,
      `<video:publication_date>${xmlEsc(date)}</video:publication_date>`,
      `<video:duration>${duration}</video:duration>`,
      "</video:video>",
    ].join("")}\n`;
  }
  sitemap += "  </url>\n</urlset>\n";
  await writeFile(path.join(projections, "sitemap.xml"), sitemap);
  return { imageCount: imageLocs.length, videoCount: videos.length };
}
