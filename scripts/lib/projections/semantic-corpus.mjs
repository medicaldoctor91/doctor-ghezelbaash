import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { compileKnowledgeXml } from "../knowledge-xml.mjs";
import {
  refIds,
  sha256,
  valueText,
} from "../projection-context.mjs";
import { exactLanguageLiteral } from "../../../src/lib/semantic-projection.mjs";
import {
  buildEntityFacts,
  entityFactsCsvwMetadata,
  serializeEntityFacts,
} from "../entity-facts.mjs";
import { deriveCanonicalAnswerProjection } from "../../../src/lib/answer-projection.mjs";

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
  const answerProjection = deriveCanonicalAnswerProjection(graph, release);
  await writeFile(
    path.join(projections, "entity-facts.csv"),
    serializeEntityFacts(factRecords),
  );
  await writeFile(
    path.join(projections, "entity-facts.csv-metadata.json"),
    `${JSON.stringify(entityFactsCsvwMetadata(), null, 2)}\n`,
  );

  const answerRecords = [];
  for (const projection of answerProjection.answers) {
    const question = byId.get(projection.questionId);
    const answer = byId.get(projection.answerId);
    const sourceNodes = sourceNodesForUrl(projection.sourceUrl);
    if (
      !sourceNodes?.includes(question) ||
      !sourceNodes.includes(answer)
    )
      throw new Error(
        `Question/Answer lack their direct source URL binding: ${projection.questionId}`,
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
      sourceUrl: projection.sourceUrl,
      projection,
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

  const factMap = {
    schemaVersion: "1.0",
    type: "CanonicalFactMap",
    canonicalUrl: release.canonicalUrl,
    release: release.release,
    sourceOfTruth: answerProjection.source,
    authority: {
      graph: "src/data/semantic/knowledge-graph.jsonld",
      answerText: "Answer.text",
      visibleHtml: ".answer-projection[id]",
      jsonLd: "graph.jsonld#answer-*",
      retrieval: "answers.txt::ANSWER",
    },
    records: answerRecords.map((record) => ({
      questionId: record.projection.questionId,
      answerId: record.projection.answerId,
      question: record.projection.questionText,
      answer: record.projection.answerText,
      language: record.projection.language,
      sourceUrl: record.projection.sourceUrl,
      htmlId: record.projection.htmlId,
      htmlUrl: record.projection.htmlUrl,
      aboutIds: record.projection.aboutIds,
      graphNodeIds: record.graphNodeIds,
      evidenceIds: record.evidenceIds,
      claimEvidenceIds: record.claimEvidenceIds,
      entityEvidenceIds: record.entityEvidenceIds,
      sourceHashSha256: record.sourceHash,
    })),
  };
  await writeFile(
    path.join(projections, "fact-map.json"),
    `${JSON.stringify(factMap, null, 2)}\n`,
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
    answerProjection,
  };
}
