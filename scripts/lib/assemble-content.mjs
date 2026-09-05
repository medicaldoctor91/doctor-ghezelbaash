import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { bindHeroPictureSizes } from "../../src/lib/hero-image-contract.mjs";
import { bindReleaseTokens } from "../../src/lib/release-tokens.mjs";
import { bindSiteTokens, deriveSiteData } from "../../src/lib/site-data.mjs";
import { bindClinicReputation } from "../../src/lib/reputation-observation.mjs";
import { indexCanonicalGraph } from "../../src/lib/semantic-projection.mjs";

const compactAuthoredHtmlLayout = (source) =>
  String(source).replace(/>\s*\r?\n\s*</g, "><");

export function physicianImageUrls(graph, release) {
  const { byId } = indexCanonicalGraph(graph);
  const person = byId.get(release.primaryEntity.id);
  if (!Array.isArray(person?.image) || !person.image.length)
    throw new Error("Canonical physician image references are missing");
  const urls = person.image.map((reference) => {
    const image = byId.get(reference?.["@id"]);
    const types = Array.isArray(image?.["@type"])
      ? image["@type"]
      : [image?.["@type"]];
    if (!types.includes("ImageObject") || typeof image.contentUrl !== "string")
      throw new Error(`Physician image must resolve to an ImageObject contentUrl: ${reference?.["@id"]}`);
    const url = new URL(image.contentUrl);
    if (url.origin !== new URL(release.canonicalUrl).origin || url.hash)
      throw new Error(`Physician image contentUrl must be a canonical image resource: ${url}`);
    return url.href;
  });
  if (new Set(urls).size !== urls.length)
    throw new Error("Canonical physician image contentUrls must be unique");
  return urls;
}

const bindPhysicianImages = (content, graph, release) => {
  const token = "{{PHYSICIAN_IMAGE_MICRODATA}}";
  if (content.split(token).length !== 2)
    throw new Error("Canonical content requires exactly one physician image token");
  const escapeAttribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return content.replace(token, physicianImageUrls(graph, release)
    .map((url) => `<link href="${escapeAttribute(url)}" itemprop="image">`)
    .join(""));
};

async function canonicalSourceNames(root = process.cwd()) {
  const sourceDir = path.join(root, "src/content-source");
  const names = (await readdir(sourceDir))
    .filter((name) => /\.(?:md|html)$/i.test(name))
    .sort();
  if (names.length !== 1 || names[0] !== "page.md")
    throw new Error(
      "Canonical page source contract drift: " + names.join(", "),
    );
  return names;
}

export async function assembleCanonicalContent({
  root = process.cwd(),
  graph,
} = {}) {
  if (!Array.isArray(graph?.["@graph"]))
    throw new Error(
      "assembleCanonicalContent requires the loaded canonical knowledge graph",
    );
  const names = await canonicalSourceNames(root);
  const [release, reputationObservation] = await Promise.all([
    readFile(path.join(root, "src/data/release.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(root, "src/data/reputation-observation.json"),
      "utf8",
    ).then(JSON.parse),
  ]);
  const site = deriveSiteData(release, graph);
  let content = await readFile(
    path.join(root, "src/content-source/page.md"),
    "utf8",
  );
  content = bindHeroPictureSizes(content);
  content = bindReleaseTokens(content, release);
  content = bindSiteTokens(content, site);
  content = bindPhysicianImages(content, graph, release);
  content = bindClinicReputation(content, {
    observation: reputationObservation,
    release,
    mapsUrl: site.mapsUrl,
  });
  return { content: compactAuthoredHtmlLayout(content), names };
}
