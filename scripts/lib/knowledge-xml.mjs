const types = (node) =>
  Array.isArray(node?.["@type"])
    ? node["@type"]
    : [node?.["@type"]].filter(Boolean);
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : "";
const text = (value) => {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" | ");
  if (typeof value === "object") {
    if (value["@value"] != null) return String(value["@value"]);
    if (typeof value["@id"] === "string") return value["@id"];
  }
  return "";
};
const xml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function canonicalIntentClusters(intentSource) {
  const marker = "## Canonical search-intent clusters";
  const start = intentSource.indexOf(marker);
  if (start < 0)
    throw new Error("knowledge.xml: canonical intent-cluster source missing");
  const rest = intentSource.slice(start + marker.length),
    next = rest.search(/\n##\s+/),
    section = next >= 0 ? rest.slice(0, next) : rest;
  const intents = [
    ...section.matchAll(
      /^- \[([^\]]+)\]\((https:\/\/www\.ghezelbaash\.ir\/#([^)]+))\)\s*$/gm,
    ),
  ].map((match) => ({ label: match[1], url: match[2], anchor: match[3] }));
  if (!intents.length)
    throw new Error("knowledge.xml: no canonical intent clusters were parsed");
  return `  <intentClusters count="${intents.length}">${intents.map((item) => `<intent id="${xml(item.anchor)}" url="${xml(item.url)}"><label>${xml(item.label)}</label></intent>`).join("")}</intentClusters>`;
}

function canonicalEvidence(evidenceRegistry) {
  const tiers = evidenceRegistry.tiers || {};
  for (const tier of ["A", "B", "C"])
    if (typeof tiers[tier] !== "string" || !tiers[tier])
      throw new Error(
        `knowledge.xml: evidence tier ${tier} definition missing`,
      );
  const evidence = Array.isArray(evidenceRegistry.evidence)
    ? evidenceRegistry.evidence
    : [];
  if (!evidence.length)
    throw new Error("knowledge.xml: evidence registry is empty");
  const tierXml = ["A", "B", "C"]
    .map((tier) => `<tier id="${tier}">${xml(tiers[tier])}</tier>`)
    .join("");
  const itemXml = evidence
    .map((item) => {
      const supports = Array.isArray(item.supports)
        ? item.supports.map(text).filter(Boolean)
        : [];
      return `<item id="${xml(item.id)}" tier="${xml(item.tier)}" url="${xml(item.url)}" liveStatus="${xml(item.liveStatus)}" verifiedAt="${xml(item.verifiedAt)}">${supports.map((value) => `<supports>${xml(value)}</supports>`).join("")}</item>`;
    })
    .join("");
  return `  <evidence count="${evidence.length}"><tiers>${tierXml}</tiers>${itemXml}</evidence>`;
}

function canonicalMediaInventory(nodes) {
  const videos = nodes.filter((node) => types(node).includes("VideoObject")),
    images = nodes.filter((node) => types(node).includes("ImageObject"));
  const videoXml = videos
    .map((video) => {
      const clips = (
        Array.isArray(video.hasPart) ? video.hasPart : [video.hasPart]
      )
        .map(refId)
        .filter(Boolean);
      return `<video id="${xml(video["@id"])}" contentUrl="${xml(text(video.contentUrl || video.url))}" duration="${xml(text(video.duration))}" language="${xml(text(video.inLanguage))}"><name>${xml(text(video.name))}</name>${clips.map((id) => `<clip ref="${xml(id)}"/>`).join("")}</video>`;
    })
    .join("");
  const imageXml = images
    .map(
      (image) =>
        `<image id="${xml(image["@id"])}" contentUrl="${xml(text(image.contentUrl || image.url))}" encodingFormat="${xml(text(image.encodingFormat))}"><name>${xml(text(image.name))}</name></image>`,
    )
    .join("");
  return `  <mediaInventory videoCount="${videos.length}" imageCount="${images.length}">${videoXml}${imageXml}</mediaInventory>`;
}

function canonicalAnswerResources(questions, canonicalUrl) {
  const units = questions
    .map(
      (question) =>
        `<unit questionRef="${xml(question["@id"])}" answerRef="${xml(refId(question.acceptedAnswer))}" source="${xml(text(question.url || question["@id"]))}"/>`,
    )
    .join("");
  return `  <answerResources count="${questions.length}" corpus="${xml(`${canonicalUrl}answers.txt`)}">${units}</answerResources>`;
}

export function compileKnowledgeXml({
  release,
  graph,
  evidenceRegistry,
  intentSource,
}) {
  const nodes = Array.isArray(graph?.["@graph"]) ? graph["@graph"] : [];
  if (!nodes.length) throw new Error("knowledge.xml: canonical graph is empty");

  const byId = new Map(
    nodes
      .filter((node) => typeof node?.["@id"] === "string")
      .map((node) => [node["@id"], node]),
  );
  const person = byId.get(release.primaryEntity.id);
  const clinic = byId.get(release.clinic.id);
  const dataset = byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
  if (!person || !clinic || !dataset)
    throw new Error(
      "knowledge.xml: canonical entity, clinic or Dataset node missing",
    );

  const aliases = [
    ...release.primaryEntity.officialAliases,
    ...(release.primaryEntity.reconciliationAliases || []),
  ];
  const distributions = nodes.filter((node) =>
    types(node).includes("DataDownload"),
  );
  const questions = nodes.filter((node) => types(node).includes("Question"));
  if (!questions.length)
    throw new Error(
      "knowledge.xml: canonical graph contains no Question nodes",
    );

  const aliasXml = aliases
    .map((alias) => `<alias>${xml(alias)}</alias>`)
    .join("");
  const distributionXml = distributions
    .map(
      (node) =>
        `<distribution id="${xml(node["@id"])}" url="${xml(node.contentUrl || node.url)}" format="${xml(node.encodingFormat)}"/>`,
    )
    .join("");
  const questionXml = questions
    .map(
      (question) =>
        `<question id="${xml(question["@id"])}" url="${xml(text(question.url || question["@id"]))}">${xml(text(question.name))}</question>`,
    )
    .join("");
  const ownedClinicXml = [
    `  <ownedClinic id="${xml(clinic["@id"])}"`,
    ` googleLocalKg="${xml(release.clinic.googleLocalKgmid)}"`,
    ` placeId="${xml(release.clinic.placeId)}"`,
    ` cid="${xml(release.clinic.cid)}"`,
    ` postalCode="${xml(release.clinic.postalCode)}">`,
    `<hours>${xml(release.clinic.hours)}</hours>`,
    `<owner ref="${xml(release.primaryEntity.id)}"/>`,
    "</ownedClinic>",
  ].join("");
  const document = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<knowledge release="${xml(release.release)}" modified="${xml(release.dateModified)}" canonical="${xml(release.canonicalUrl)}">`,
    `  <primaryEntity id="${xml(person["@id"])}" googleKg="${xml(release.primaryEntity.googleKnowledgeGraphId)}" wikidata="${xml(release.primaryEntity.wikidata)}"><name>${xml(release.primaryEntity.name)}</name>${aliasXml}</primaryEntity>`,
    ownedClinicXml,
    `  <dataset id="${xml(dataset["@id"])}" version="${xml(release.release)}" creator="${xml(release.primaryEntity.id)}" publisher="${xml(release.primaryEntity.id)}">${distributionXml}</dataset>`,
    `  <answers count="${questions.length}">${questionXml}</answers>`,
    canonicalIntentClusters(intentSource),
    canonicalEvidence(evidenceRegistry),
    canonicalMediaInventory(nodes),
    canonicalAnswerResources(questions, release.canonicalUrl),
    "</knowledge>",
  ];
  return `${document.join("\n")}\n`;
}
