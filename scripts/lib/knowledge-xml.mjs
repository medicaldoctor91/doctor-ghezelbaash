import { indexCanonicalGraph } from "../../src/lib/semantic-projection.mjs";

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
const requiredText = (value, label) => {
  const direct = text(value);
  if (!direct) throw new Error(`knowledge.xml: ${label} is required`);
  return direct;
};
const requiredId = (node, label) =>
  requiredText(node?.["@id"], `${label} @id`);
const requiredRefId = (value, label) => {
  const id = refId(value);
  if (!id) throw new Error(`knowledge.xml: ${label} reference is required`);
  return id;
};
const canonicalDownloadUrl = (node) => {
  const id = requiredId(node, "DataDownload");
  const urls = [node.contentUrl, node.url].filter(
    (value) => typeof value === "string" && value,
  );
  const uniqueUrls = [...new Set(urls)];
  if (uniqueUrls.length !== 1)
    throw new Error(
      `knowledge.xml: ${id} must resolve to one canonical download URL`,
    );
  return uniqueUrls[0];
};

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
  const tiers = evidenceRegistry.tiers;
  if (!tiers || typeof tiers !== "object" || Array.isArray(tiers))
    throw new Error("knowledge.xml: evidence tiers are required");
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

function canonicalMediaInventory(nodes, byId) {
  const videos = nodes.filter((node) => types(node).includes("VideoObject")),
    images = nodes.filter((node) => types(node).includes("ImageObject"));
  if (!videos.length || !images.length)
    throw new Error(
      "knowledge.xml: canonical video and image inventories are required",
    );
  const videoXml = videos
    .map((video) => {
      const id = requiredId(video, "VideoObject");
      if (!Array.isArray(video.hasPart) || !video.hasPart.length)
        throw new Error(`knowledge.xml: ${id} direct hasPart facts are required`);
      const clips = video.hasPart.map((value, index) => {
        const clipId = requiredRefId(value, `${id} hasPart ${index + 1}`);
        if (!byId.has(clipId))
          throw new Error(
            `knowledge.xml: ${id} references missing clip ${clipId}`,
          );
        return clipId;
      });
      const contentUrl = requiredText(video.contentUrl, `${id} contentUrl`);
      const duration = requiredText(video.duration, `${id} duration`);
      const language = requiredText(video.inLanguage, `${id} inLanguage`);
      const name = requiredText(video.name, `${id} name`);
      return `<video id="${xml(id)}" contentUrl="${xml(contentUrl)}" duration="${xml(duration)}" language="${xml(language)}"><name>${xml(name)}</name>${clips.map((clipId) => `<clip ref="${xml(clipId)}"/>`).join("")}</video>`;
    })
    .join("");
  const imageXml = images
    .map((image) => {
      const id = requiredId(image, "ImageObject");
      const contentUrl = requiredText(image.contentUrl, `${id} contentUrl`);
      const encodingFormat = requiredText(
        image.encodingFormat,
        `${id} encodingFormat`,
      );
      return `<image id="${xml(id)}" contentUrl="${xml(contentUrl)}" encodingFormat="${xml(encodingFormat)}"><name>${xml(text(image.name))}</name></image>`;
    })
    .join("");
  return `  <mediaInventory videoCount="${videos.length}" imageCount="${images.length}">${videoXml}${imageXml}</mediaInventory>`;
}

function canonicalQuestionFacts(questions, byId) {
  return questions.map((question) => {
    const id = requiredId(question, "Question");
    const url = requiredText(question.url, `${id} url`);
    const name = requiredText(question.name, `${id} name`);
    const answerId = requiredRefId(question.acceptedAnswer, `${id} acceptedAnswer`);
    const answer = byId.get(answerId);
    if (!answer || !types(answer).includes("Answer"))
      throw new Error(
        `knowledge.xml: ${id} references missing Answer ${answerId}`,
      );
    requiredText(answer.text, `${answerId} text`);
    return { id, url, name, answerId };
  });
}

function canonicalAnswerResources(questionFacts, canonicalUrl) {
  const units = questionFacts
    .map(
      ({ id, answerId, url }) =>
        `<unit questionRef="${xml(id)}" answerRef="${xml(answerId)}" source="${xml(url)}"/>`,
    )
    .join("");
  return `  <answerResources count="${questionFacts.length}" corpus="${xml(`${canonicalUrl}answers.txt`)}">${units}</answerResources>`;
}

export function compileKnowledgeXml({
  release,
  graph,
  evidenceRegistry,
  intentSource,
}) {
  const { nodes, byId } = indexCanonicalGraph(graph);
  if (!nodes.length) throw new Error("knowledge.xml: canonical graph is empty");
  const person = byId.get(release.primaryEntity.id);
  const clinic = byId.get(release.clinic.id);
  const dataset = byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
  if (!person || !clinic || !dataset)
    throw new Error(
      "knowledge.xml: canonical entity, clinic or Dataset node missing",
    );

  const officialAliases = release.primaryEntity.officialAliases;
  const reconciliationAliases = release.primaryEntity.reconciliationAliases;
  if (
    !Array.isArray(officialAliases) ||
    !officialAliases.length ||
    !Array.isArray(reconciliationAliases) ||
    !reconciliationAliases.length ||
    [...officialAliases, ...reconciliationAliases].some(
      (alias) => typeof alias !== "string" || !alias,
    )
  )
    throw new Error("knowledge.xml: canonical aliases are required");
  const aliases = [...officialAliases, ...reconciliationAliases];
  const distributions = nodes.filter((node) =>
    types(node).includes("DataDownload"),
  );
  const questions = nodes.filter((node) => types(node).includes("Question"));
  if (!questions.length)
    throw new Error(
      "knowledge.xml: canonical graph contains no Question nodes",
    );
  const questionFacts = canonicalQuestionFacts(questions, byId);

  const aliasXml = aliases
    .map((alias) => `<alias>${xml(alias)}</alias>`)
    .join("");
  const distributionXml = distributions
    .map((node) => {
      const id = requiredId(node, "DataDownload");
      const url = canonicalDownloadUrl(node);
      const formats = Object.hasOwn(node, "encodingFormat")
        ? Array.isArray(node.encodingFormat)
          ? node.encodingFormat
          : [node.encodingFormat]
        : [];
      if (
        (Object.hasOwn(node, "encodingFormat") && !formats.length) ||
        formats.some(
          (format) => typeof format !== "string" || !format.trim(),
        ) ||
        new Set(formats).size !== formats.length
      )
        throw new Error(
          `knowledge.xml: ${id} encodingFormat values must be nonempty and unique`,
        );
      const formatAttribute = formats.length
        ? ` format="${xml(formats.join(","))}"`
        : "";
      return `<distribution id="${xml(id)}" url="${xml(url)}"${formatAttribute}/>`;
    })
    .join("");
  const questionXml = questionFacts
    .map(
      ({ id, url, name }) =>
        `<question id="${xml(id)}" url="${xml(url)}">${xml(name)}</question>`,
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
    canonicalMediaInventory(nodes, byId),
    canonicalAnswerResources(questionFacts, release.canonicalUrl),
    "</knowledge>",
  ];
  return `${document.join("\n")}\n`;
}
