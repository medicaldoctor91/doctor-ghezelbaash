import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { FOOTER_RESOURCES, machineResourceForPath } from "../src/lib/resources.mjs";
import { fetchRepresentationWithRetry } from "./lib/transient-retry.mjs";

const localOnly = process.argv.includes("--local");
const canonical = "https://www.ghezelbaash.ir/";
const datasetId = `${canonical}graph.jsonld#dataset`;
const physicianId = `${canonical}#saeed-ghezelbash`;
const webpageId = `${canonical}#webpage`;
const distributionPaths = ["graph.jsonld", "graph.ttl", "entity-facts.csv"];
const distributionIds = distributionPaths.map(
  (path) => `${canonical}${path}#download`,
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error(`DATASET_ACCEPTANCE_DRIFT ${message}`);
};
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const attr = (node, name) =>
  node.attrs?.find((item) => item.name === name)?.value ?? null;
const text = (node) =>
  (node.childNodes || [])
    .map((child) => (typeof child.value === "string" ? child.value : text(child)))
    .join("");
const walk = function* (node) {
  yield node;
  for (const child of node.childNodes || []) yield* walk(child);
  if (node.content) yield* walk(node.content);
};
const hasType = (node, type) => {
  const value = node?.["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
};
const mediaType = (value) => normalize(value).split(";", 1)[0].toLowerCase();

const indexBytes = await readFile("dist/index.html");
const html = indexBytes.toString("utf8");
const doc = parse(html);
const elements = [...walk(doc)].filter((node) => node.tagName);
const scripts = elements.filter(
  (node) =>
    node.tagName === "script" &&
    attr(node, "type") === "application/ld+json" &&
    attr(node, "id"),
);
if (scripts.length !== 2)
  fail(`expected exactly two JSON-LD blocks, found ${scripts.length}`);
const graphs = new Map();
for (const script of scripts) {
  const id = attr(script, "id");
  let parsed;
  try {
    parsed = JSON.parse(text(script));
  } catch (error) {
    fail(`invalid JSON-LD in ${id}: ${error.message}`);
  }
  graphs.set(id, parsed);
}
if (
  graphs.size !== 2 ||
  !graphs.has("entity-core") ||
  !graphs.has("entity-support")
)
  fail(`unexpected JSON-LD block ids: ${[...graphs.keys()].join(",")}`);

const coreNodes = graphs.get("entity-core")["@graph"] || [];
const supportNodes = graphs.get("entity-support")["@graph"] || [];
const allNodes = [...coreNodes, ...supportNodes];
const datasetMatches = allNodes.filter((node) => node?.["@id"] === datasetId);
if (datasetMatches.length !== 1)
  fail(`Dataset must occur exactly once, found ${datasetMatches.length}`);
if (coreNodes.some((node) => node?.["@id"] === datasetId))
  fail("Dataset leaked into entity-core");
const supportById = new Map(
  supportNodes.filter((node) => node?.["@id"]).map((node) => [node["@id"], node]),
);
const dataset = supportById.get(datasetId);
if (!dataset || !hasType(dataset, "Dataset"))
  fail("canonical Dataset missing from entity-support");
if (!normalize(dataset.name)) fail("Dataset name missing");
const description = normalize(dataset.description);
if (description.length < 50 || description.length > 5000)
  fail(`Dataset description length=${description.length}`);
if (dataset.url !== canonical) fail(`Dataset.url=${dataset.url}`);
if (dataset.creator?.["@id"] !== physicianId)
  fail(`Dataset.creator=${dataset.creator?.["@id"]}`);
if (dataset.publisher?.["@id"] !== physicianId)
  fail(`Dataset.publisher=${dataset.publisher?.["@id"]}`);
if (!normalize(dataset.license)) fail("Dataset license missing");
if (dataset.isAccessibleForFree !== true)
  fail("Dataset.isAccessibleForFree must be true");
const projectedDistributionIds = (dataset.distribution || []).map(
  (item) => item?.["@id"],
);
if (JSON.stringify(projectedDistributionIds) !== JSON.stringify(distributionIds))
  fail(`distribution drift=${JSON.stringify(projectedDistributionIds)}`);

for (let index = 0; index < distributionPaths.length; index += 1) {
  const path = distributionPaths[index];
  const id = distributionIds[index];
  const resource = machineResourceForPath(path);
  const node = supportById.get(id);
  if (!node || !hasType(node, "DataDownload"))
    fail(`missing DataDownload ${id}`);
  if (node.contentUrl !== `${canonical}${path}`)
    fail(`${id} contentUrl=${node.contentUrl}`);
  if (mediaType(node.encodingFormat) !== resource.mediaType.toLowerCase())
    fail(`${id} encodingFormat=${node.encodingFormat}`);
  if (node.isPartOf?.["@id"] !== datasetId)
    fail(`${id} isPartOf=${node.isPartOf?.["@id"]}`);
}

const profile = coreNodes.find((node) => node?.["@id"] === webpageId);
if (!profile || !hasType(profile, "ProfilePage"))
  fail("ProfilePage missing from entity-core");
if (profile.mainEntity?.["@id"] !== physicianId)
  fail(`ProfilePage.mainEntity=${profile.mainEntity?.["@id"]}`);

const disclosure = elements.find(
  (node) =>
    node.tagName === "p" &&
    String(attr(node, "class") || "")
      .split(/\s+/)
      .includes("footer-dataset-disclosure"),
);
if (!disclosure) fail("visible Dataset disclosure missing");
const disclosureText = normalize(text(disclosure));
if (
  !disclosureText.includes(normalize(dataset.name)) ||
  !disclosureText.includes(description)
)
  fail("visible Dataset disclosure does not match structured Dataset");

const footerByPath = new Map(FOOTER_RESOURCES.map((resource) => [resource.path, resource]));
for (const path of distributionPaths) {
  const resource = footerByPath.get(path);
  if (!resource) fail(`footer registry missing ${path}`);
  const link = elements.find(
    (node) =>
      node.tagName === "a" &&
      attr(node, "href") === `/${path}` &&
      attr(node, "rel") === resource.headRel &&
      attr(node, "type") === resource.contentType,
  );
  if (!link) fail(`typed footer link missing ${path}`);
}

const liveResults = [];
if (!localOnly) {
  const verifyLiveBytes = async (url, expectedBytes, expectedMediaType) => {
    const variants = [new URL(url), new URL(url)];
    variants[1].searchParams.set(
      "__dataset_acceptance",
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    const lanes = [];
    for (const [index, target] of variants.entries()) {
      const result = await fetchRepresentationWithRetry(target, {
        headers: {
          "user-agent": "ghezelbaash-dataset-acceptance/1.0",
          accept: "*/*",
          ...(index === 1 ? { "cache-control": "no-cache" } : {}),
        },
        timeoutMs: 60000,
      });
      if (result.r.status !== 200)
        fail(`${url} lane=${index} HTTP ${result.r.status}`);
      const actual = sha256(result.b);
      const expected = sha256(expectedBytes);
      if (actual !== expected)
        fail(`${url} lane=${index} byte=${actual}/${expected}`);
      if (
        expectedMediaType &&
        mediaType(result.r.headers.get("content-type")) !== expectedMediaType.toLowerCase()
      )
        fail(
          `${url} lane=${index} Content-Type=${result.r.headers.get("content-type")}`,
        );
      lanes.push({
        lane: index === 0 ? "ordinary" : "cacheBusted",
        status: result.r.status,
        sha256: actual,
        cfCacheStatus: result.r.headers.get("cf-cache-status"),
        age: result.r.headers.get("age"),
      });
    }
    return lanes;
  };

  liveResults.push({
    path: "index.html",
    lanes: await verifyLiveBytes(canonical, indexBytes, "text/html"),
  });
  for (const path of distributionPaths) {
    const resource = machineResourceForPath(path);
    const expectedBytes = await readFile(`dist/${path}`);
    liveResults.push({
      path,
      lanes: await verifyLiveBytes(
        `${canonical}${path}`,
        expectedBytes,
        resource.mediaType,
      ),
    });
  }
}

console.log(
  JSON.stringify(
    {
      datasetProductionAcceptance: "PASS",
      mode: localOnly ? "local-dist" : "live-production",
      dataset: datasetId,
      profileMainEntity: profile.mainEntity["@id"],
      distributions: distributionIds,
      visibleDisclosure: true,
      typedFooterLinks: distributionPaths,
      localIndexSha256: sha256(indexBytes),
      liveResults,
    },
    null,
    2,
  ),
);
