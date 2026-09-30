import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const defaultRoot = process.cwd();
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const id = (value) => typeof value === "string" ? value : value?.["@id"];
const text = (value) => value?.["@value"] ?? value;
const types = (node) => values(node?.["@type"]);

/** Read the two authored inputs. All other files are projections or assets. */
export function readCanonicalInputs(root = defaultRoot) {
  const pageSource = readFileSync(path.join(root, "src/content-source/page.md"), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(pageSource);
  if (!match) throw new Error("Canonical page requires YAML frontmatter");
  const pageFrontmatter = load(match[1]);
  const pageBody = pageSource.slice(match[0].length);
  const graph = JSON.parse(readFileSync(path.join(root, "src/data/semantic/knowledge-graph.jsonld"), "utf8"));
  if (!Array.isArray(graph["@graph"])) throw new Error("Canonical graph requires @graph");
  const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const dataset = byId.get(pageFrontmatter.knowledgeGraph.datasetId);
  if (!dataset || !types(dataset).includes("Dataset")) throw new Error("Canonical Dataset pointer is missing");
  const canonicalUrl = dataset.url;
  const related = (references) => values(references).map((ref) => byId.get(id(ref))).filter(Boolean);
  const one = (candidates, label) => {
    if (candidates.length !== 1) throw new Error(`Canonical graph requires one ${label}`);
    return candidates[0];
  };
  const clinic = values(dataset.about).map((ref) => byId.get(id(ref)))
    .find((candidate) => types(candidate).includes("MedicalClinic"));
  if (!clinic) throw new Error("Canonical Dataset requires its clinic about relation");
  const github = one(related(dataset.isBasedOn).filter((entry) => types(entry).includes("SoftwareSourceCode")), "source repository");
  const distributions = related(dataset.distribution);
  const zenodo = one(distributions.filter((entry) => entry.url?.startsWith("https://doi.org/10.5281/zenodo.") && entry.version === dataset.version), "preserved release");
  const huggingFace = one(distributions.filter((entry) => entry.url?.startsWith("https://huggingface.co/datasets/")), "Hugging Face distribution");
  const doi = (release) => values(release.identifier).find((item) => item?.propertyID === "Zenodo Version DOI")?.value
    ?? new URL(release.url).pathname.slice(1);
  const releaseHistory = values(dataset.citation).map((ref) => byId.get(id(ref)))
    .filter((entry) => types(entry).includes("Dataset") && entry.version && entry.url?.startsWith("https://doi.org/10.5281/zenodo."))
    .map((entry) => ({ release: entry.version, recordId: doi(entry).split(".").at(-1), versionDoi: doi(entry), publicationDate: entry.datePublished }));
  const lifecycle = {
    release: dataset.version,
    dateModified: zenodo.datePublished,
    canonicalUrl,
    primaryEntity: { id: id(dataset.mainEntity ?? dataset.creator) },
    clinic: { id: clinic["@id"] },
    dataset: {
      id: dataset["@id"], license: id(dataset.license),
      github: { role: "source", repository: github.codeRepository ?? github.url },
      zenodo: { role: "preservation", versionDoi: doi(zenodo), recordId: doi(zenodo).split(".").at(-1), releaseHistory },
      huggingFace: { role: "ai-distribution", dataset: huggingFace.url, distributionMode: "ai-retrieval" },
    },
    datasetRevisionDate: dataset.dateModified,
    currentSource: { dateModified: github.dateModified ?? dataset.dateModified },
  };
  const retrievalPolicy = {
    ...pageFrontmatter.retrieval,
    languages: values(dataset.inLanguage),
    intentFamilies: Object.keys(pageFrontmatter.intentTargets),
    intentAnswerIds: pageFrontmatter.intentTargets,
  };
  const registryNode = one(graph["@graph"].filter((entry) => values(entry.hasPart).some((ref) => byId.get(id(ref))?.["prov:hadMember"])), "evidence assessment collection");
  const assessmentNodes = values(registryNode.hasPart).map((ref) => byId.get(id(ref))).filter((entry) => entry?.["prov:hadMember"]);
  const evidence = assessmentNodes.map((assessment) => {
    if (!assessment) throw new Error("Canonical evidence assessment reference is missing");
    const properties = Object.fromEntries(values(assessment["prov:hadMember"]).map((property) => [property.propertyID, text(property.value)]));
    const sourceId = id(assessment.about);
    const source = byId.get(sourceId);
    const url = source?.url ?? (sourceId?.startsWith(canonicalUrl) ? undefined : sourceId);
    if (!url) throw new Error(`Canonical evidence source has no URL: ${sourceId}`);
    return { ...properties, id: sourceId, url, assessmentId: assessment["@id"] };
  });
  const tierNodes = [...new Set(assessmentNodes.flatMap((entry) => values(entry.mentions).map(id)))].map((iri) => byId.get(iri));
  if (tierNodes.some((entry) => !entry?.name || !entry?.description)) throw new Error("Canonical evidence tier definition is missing");
  const tiers = Object.fromEntries(tierNodes.map((entry) => [entry.name, entry.description]));
  const evidenceRegistry = { verifiedAt: registryNode.dateModified, tiers, evidence, assessmentNodes, tierNodes, registryNode };
  const pageJsonLd = [...pageBody.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => /type=["']application\/ld\+json["']/i.test(match[1]))
    .map((match) => ({ id: /\bid=["']([^"']+)["']/i.exec(match[1])?.[1], document: JSON.parse(match[2]) }));
  return { pageSource, pageFrontmatter, pageBody, graph, lifecycle, retrievalPolicy, evidenceRegistry, pageJsonLd };
}

const inputs = readCanonicalInputs();
export const pageFrontmatter = inputs.pageFrontmatter;
export const canonicalGraph = inputs.graph;
export const canonicalLifecycle = inputs.lifecycle;
export const retrievalPolicy = inputs.retrievalPolicy;
export const canonicalEvidenceRegistry = inputs.evidenceRegistry;
export const pageJsonLd = inputs.pageJsonLd;
