import { deriveCanonicalAnswerProjection, validateProjectedAnswerHtml } from "../../src/lib/answer-projection.mjs";
import { indexCanonicalGraph } from "../../src/lib/graph-core.mjs";
import { derivePublicationData } from "../../src/lib/canonical-authority.mjs";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";

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

export async function assembleCanonicalContent({
  root = process.cwd(),
  graph,
} = {}) {
  if (!Array.isArray(graph?.["@graph"]))
    throw new Error(
      "assembleCanonicalContent requires the loaded canonical knowledge graph",
    );
  const { lifecycle, pageBody } = readCanonicalInputs(root);
  const content = renderCanonicalPageHtml(pageBody, graph);
  const release = derivePublicationData(lifecycle, graph);
  if (/{{[A-Z][A-Z0-9_]*}}/.test(content))
    throw new Error("Canonical page contains an unresolved legacy token");
  const answerProjection = deriveCanonicalAnswerProjection(graph, release);
  validateProjectedAnswerHtml(content, answerProjection);
  return {
    content,
    answerProjection,
  };
}
