import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { compileKnowledgeXml } from "../knowledge-xml.mjs";
import {
  nodeTypes,
  refIds,
  sha256,
  valueText,
} from "../projection-context.mjs";
import { exactLanguageLiteral } from "../../../src/lib/semantic-projection.mjs";
import { buildEntityFacts, serializeEntityFacts } from "../entity-facts.mjs";

export async function compileSemanticCorpus(context) {
  const {
    data,
    projections,
    release,
    graph,
    byId,
    sourceNodesForUrl,
    evidenceRefsForNode,
  } = context;

  const factRecords = await buildEntityFacts(context);
  await writeFile(
    path.join(projections, "entity-facts.csv"),
    serializeEntityFacts(factRecords),
  );

  const answerRecords = [];
  for (const question of graph["@graph"].filter((node) =>
    nodeTypes(node).includes("Question"),
  )) {
    const answerId = question.acceptedAnswer?.["@id"];
    if (typeof answerId !== "string" || !answerId)
      throw new Error(
        `Question lacks an accepted Answer ID: ${question["@id"]}`,
      );
    const answer = byId.get(answerId);
    if (
      !answer ||
      !nodeTypes(answer).includes("Answer") ||
      typeof answer.text !== "string" ||
      !answer.text.trim()
    )
      throw new Error(
        `Question references an invalid Answer: ${question["@id"]} -> ${answerId}`,
      );
    const sourceUrl = question.url;
    if (typeof sourceUrl !== "string" || !sourceUrl)
      throw new Error(
        `Question lacks a canonical source URL: ${question["@id"]}`,
      );
    if (
      typeof question.inLanguage !== "string" ||
      !question.inLanguage ||
      answer.inLanguage !== question.inLanguage
    )
      throw new Error(
        `Question/Answer language is missing or inconsistent: ${question["@id"]}`,
      );
    const sourceNodes = sourceNodesForUrl(sourceUrl);
    if (
      !sourceNodes?.includes(question) ||
      !sourceNodes.includes(answer)
    )
      throw new Error(
        `Question/Answer lack their direct source URL binding: ${question["@id"]}`,
      );
    const claimEvidenceIds = [
      ...new Set(sourceNodes.flatMap(evidenceRefsForNode)),
    ];
    const aboutEntityIds = refIds(question.about).filter(
      (id) => id === release.primaryEntity.id || id === release.clinic.id,
    );
    const entityEvidenceIds = [
      ...new Set(
        aboutEntityIds.flatMap((id) => evidenceRefsForNode(byId.get(id))),
      ),
    ];
    const evidenceIds = [
      ...new Set([...claimEvidenceIds, ...entityEvidenceIds]),
    ];
    const sourceHash = sha256(Buffer.from(valueText(answer.text)));
    const executiveSummary = valueText(answer.description);
    const executiveSummaryHash = executiveSummary
      ? sha256(Buffer.from(executiveSummary))
      : "";
    answerRecords.push({
      q: question,
      a: answer,
      sourceUrl,
      graphNodeIds: sourceNodes.map((node) => node["@id"]),
      evidenceIds,
      claimEvidenceIds,
      entityEvidenceIds,
      sourceHash,
      executiveSummary,
      executiveSummaryHash,
    });
  }
  const answers = answerRecords.map(
    ({
      q,
      a,
      sourceUrl,
      graphNodeIds,
      evidenceIds,
      claimEvidenceIds,
      entityEvidenceIds,
      sourceHash,
      executiveSummary,
      executiveSummaryHash,
    }) => `QUESTION_ID: ${q["@id"]}
QUESTION: ${valueText(q.name)}
ANSWER_ID: ${a["@id"]}
EXECUTIVE_SUMMARY: ${executiveSummary}
EXECUTIVE_SUMMARY_HASH_SHA256: ${executiveSummaryHash}
ANSWER: ${valueText(a.text)}
LANGUAGE: ${a.inLanguage}
SOURCE: ${sourceUrl}
GRAPH_NODE_IDS: ${graphNodeIds.join(" | ")}
SOURCE_HASH_SHA256: ${sourceHash}
ABOUT_IDS: ${valueText(q.about)}
EVIDENCE_IDS: ${evidenceIds.join(" | ")}
CLAIM_EVIDENCE_IDS: ${claimEvidenceIds.join(" | ")}
ENTITY_EVIDENCE_IDS: ${entityEvidenceIds.join(" | ")}
PROVENANCE_CLASS: first-party physician-reviewed canonical guidance
REVIEWED_BY: ${release.reviewedBy}
REVIEWED_AT: ${release.medicalReviewedAt}
VERSION: ${release.release}
`,
  );
  const person = byId.get(release.primaryEntity.id);
  if (!person) throw new Error("Answer corpus lacks the canonical physician");
  const personName = exactLanguageLiteral(
    person.name,
    "en",
    "Canonical physician name",
  );
  const honorific = exactLanguageLiteral(
    person.honorificPrefix,
    "en",
    "Canonical physician honorific prefix",
  );
  await writeFile(
    path.join(projections, "answers.txt"),
    `# Direct-answer corpus — ${honorific} ${personName}
# Release ${release.release}; medically reviewed ${release.medicalReviewedAt}; provenance-rich canonical answer records

${answers.join("\n---\n\n")}`,
  );

  const intentSource = await readFile(
    path.join(data, "templates/llms.template.txt"),
    "utf8",
  );
  const knowledge = compileKnowledgeXml({
    release,
    graph,
    evidenceRegistry: context.evidenceRegistry,
    intentSource,
  });
  await writeFile(path.join(projections, "knowledge.xml"), knowledge);

  return {
    rowsCount: factRecords.length,
    answersCount: answers.length,
    answerRecords,
  };
}
