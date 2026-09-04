import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { bindHeroPictureSizes } from "../../src/lib/hero-image-contract.mjs";
import { bindReleaseTokens } from "../../src/lib/release-tokens.mjs";
import { bindSiteTokens, deriveSiteData } from "../../src/lib/site-data.mjs";
import { bindClinicReputation } from "../../src/lib/reputation-observation.mjs";

const compactAuthoredHtmlLayout = (source) =>
  String(source).replace(/>\s*\r?\n\s*</g, "><");

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
  content = compactAuthoredHtmlLayout(content);
  content = bindHeroPictureSizes(content);
  content = bindReleaseTokens(content, release);
  content = bindSiteTokens(content, site);
  content = bindClinicReputation(content, {
    observation: reputationObservation,
    release,
    mapsUrl: site.mapsUrl,
  });
  return { content, names };
}
