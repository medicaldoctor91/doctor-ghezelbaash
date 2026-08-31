import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  canonicalSemanticSource,
  deriveCanonicalSemanticSets,
} from "../src/lib/semantic-projection.mjs";

const root = process.cwd();
const sourceTarget = path.resolve(
  root,
  ".generated/projections/query-matrix.jsonl",
);
const target = path.resolve(
  root,
  process.argv[2] || ".generated/projections/query-matrix.jsonl",
);
const readJson = async (file) =>
  JSON.parse(await readFile(path.resolve(root, file), "utf8"));
const fail = (message) => {
  throw new Error(message);
};
const arr = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const release = await readJson("src/data/release.json");
const policy = await readJson("src/data/retrieval/query-matrix-policy.json");
const graph = await readJson(canonicalSemanticSource(policy));
const { answers, services } = deriveCanonicalSemanticSets(graph, release);
const evidenceRegistry = await readJson("src/data/evidence-registry.json");

if (
  policy.retrievalPolicy !== "evidence_bound" ||
  policy.resolutionMode !== "canonical_entity_resolution"
)
  fail("Query Matrix policy must remain evidence-bound canonical resolution");

const raw = await readFile(target, "utf8");
const rows = raw
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`Invalid Query Matrix JSONL line ${index + 1}: ${error.message}`);
    }
  });
if (!rows.length) fail("Query Matrix is empty");

let releaseBoundary = "NOT_APPLICABLE";
if (target === sourceTarget) {
  const currentMatrix = await readJson(
    ".generated/projections/current-release-matrix.json",
  );
  for (const field of ["liveRevision", "sourceCommit", "generatedAt"])
    if (Object.hasOwn(currentMatrix, field))
      fail(`Source current-release matrix owns runtime field: ${field}`);
  releaseBoundary = "PASS";
}

const evidenceEntries = evidenceRegistry.evidence || [];
const evidenceIds = new Set(evidenceEntries.map((entry) => entry.id));
const baselineSupportKinds = arr(
  policy.evidencePolicy?.identityBaselineSupportKinds,
);
const baselineEvidence = baselineSupportKinds.map((supportKind) => {
  const matches = evidenceEntries.filter(
    (entry) => entry.tier === "A" && arr(entry.supports).includes(supportKind),
  );
  if (matches.length !== 1)
    fail(
      `Identity evidence support kind must resolve once: ${supportKind} (${matches.length})`,
    );
  return matches[0].id;
});
if (
  !baselineEvidence.length ||
  new Set(baselineEvidence).size !== baselineEvidence.length
)
  fail("Query Matrix identity evidence baseline is invalid");

const maxStableEvidenceRefs = Number(
  policy.evidencePolicy?.maxStableEvidenceRefsPerRow,
);
if (
  !Number.isInteger(maxStableEvidenceRefs) ||
  maxStableEvidenceRefs < baselineEvidence.length
)
  fail("Query Matrix stable evidence limit is invalid");

const answerIds = new Set(
  answers.map((entry) => entry.answerId),
);
const intentAnswerIds = policy.intentAnswerIds || {};
if (
  JSON.stringify(Object.keys(intentAnswerIds).sort()) !==
  JSON.stringify([...policy.intentFamilies].sort())
)
  fail("Intent answer mapping keys must exactly match intent families");
if (
  new Set(Object.values(intentAnswerIds)).size !== policy.intentFamilies.length
)
  fail("Intent answer mappings must be unique");
for (const [intent, answerId] of Object.entries(intentAnswerIds))
  if (!answerIds.has(answerId))
    fail(`Intent answer mapping is unresolved: ${intent}`);
const serviceIds = new Set(services.map((service) => service.id));
const uniqueRows = new Set();
const commonFields = [
  "answer_strategy",
  "canonical_subject",
  "canonical_subject_iri",
  "clinic_entity",
  "dataset_iri",
  "intent_family",
  "language",
  "practice_location",
  "query",
  "query_scope",
  "release",
  "resolution_mode",
  "retrieval_policy",
  "row_kind",
  "service_families",
  "service_ids",
  "stable_evidence_refs",
  "version_doi",
];
const exactFieldSet = (row, expected, key) => {
  const actual = Object.keys(row).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((field, index) => field !== canonical[index])
  )
    fail(`Query Matrix field contract drift ${key}`);
};

let intentAliasRows = 0;
let serviceAliasRows = 0;
for (const row of rows) {
  const key = `${row.language}|${row.query}`;
  if (uniqueRows.has(key)) fail(`Duplicate Query Matrix row ${key}`);
  uniqueRows.add(key);

  if (!row.query || !row.language || !row.query_scope)
    fail(`Incomplete Query Matrix row ${key}`);
  if (/کرمانشاه\s+لە\s+(?:کرماشان|ئێران)/u.test(row.query))
    fail(`Mixed Persian/Kurdish service expansion ${key}`);
  if (/[پچژگکی]/u.test(row.query) && /\sفي\s/u.test(row.query))
    fail(`Mixed Persian/Arabic service expansion ${key}`);
  if (
    row.canonical_subject !== release.primaryEntity.wikidata ||
    row.canonical_subject_iri !== release.primaryEntity.id ||
    row.clinic_entity !== release.dataset.supportingClinicWikidata ||
    row.dataset_iri !== release.dataset.id
  )
    fail(`Canonical entity authority drift ${key}`);
  if (
    row.release !== release.release ||
    row.version_doi !== release.dataset.zenodo.versionDoi
  )
    fail(`Release/DOI drift ${key}`);
  if (
    row.retrieval_policy !== policy.retrievalPolicy ||
    row.resolution_mode !== policy.resolutionMode
  )
    fail(`Retrieval policy drift ${key}`);
  const stableEvidence = arr(row.stable_evidence_refs);
  if (
    policy.evidencePolicy?.requireStableEvidenceOnEveryRow &&
    stableEvidence.length === 0
  )
    fail(`Stable evidence missing ${key}`);
  if (new Set(stableEvidence).size !== stableEvidence.length)
    fail(`Duplicate stable evidence in ${key}`);
  if (stableEvidence.length > maxStableEvidenceRefs)
    fail(
      `Stable evidence limit exceeded ${key}: ${stableEvidence.length}/${maxStableEvidenceRefs}`,
    );
  for (const evidenceId of baselineEvidence)
    if (!stableEvidence.includes(evidenceId))
      fail(`Identity evidence baseline missing ${evidenceId} in ${key}`);
  for (const evidenceId of stableEvidence)
    if (!evidenceIds.has(evidenceId))
      fail(`Unresolved stable evidence ${evidenceId} in ${key}`);

  const targets = arr(row.service_ids);
  if (new Set(targets).size !== targets.length)
    fail(`Duplicate service target in ${key}`);
  for (const serviceId of targets)
    if (!serviceIds.has(serviceId))
      fail(`Unknown service target ${serviceId} in ${key}`);

  if (row.row_kind === "intent_alias") {
    exactFieldSet(row, [...commonFields, "answer_id"], key);
    intentAliasRows++;
    if (!policy.intentFamilies.includes(row.intent_family))
      fail(`Intent family drift ${key}`);
    if (row.answer_strategy !== "resolve_to_canonical_answer_atom")
      fail(`Intent answer resolution drift ${key}`);
    if (row.answer_id !== intentAnswerIds[row.intent_family])
      fail(`Intent answer mapping drift ${key}`);
  } else if (row.row_kind === "service_alias") {
    exactFieldSet(row, [...commonFields, "service_types"], key);
    serviceAliasRows++;
    if (!targets.length) fail(`Service alias row lacks service target ${key}`);
    if (row.intent_family !== "service")
      fail(`Service alias intent family drift ${key}`);
    const expectedTypes = [
      ...new Set(
        targets.flatMap(
          (serviceId) =>
            services.find((service) => service.id === serviceId)
              ?.types || [],
        ),
      ),
    ];
    if (
      JSON.stringify([...arr(row.service_types)].sort()) !==
      JSON.stringify(expectedTypes.sort())
    )
      fail(`Service type projection drift ${key}`);
    if (row.answer_strategy !== "resolve_to_service_entity")
      fail(`Service answer resolution drift ${key}`);
  } else {
    fail(`Unknown row kind ${row.row_kind} in ${key}`);
  }
}

for (const language of policy.languages)
  if (
    !rows.some(
      (row) => row.row_kind === "intent_alias" && row.language === language,
    )
  )
    fail(`Intent layer language missing ${language}`);
for (const scope of policy.scopes)
  if (
    !rows.some(
      (row) => row.row_kind === "intent_alias" && row.query_scope === scope,
    )
  )
    fail(`Intent layer scope missing ${scope}`);
for (const intent of policy.intentFamilies)
  if (
    !rows.some(
      (row) => row.row_kind === "intent_alias" && row.intent_family === intent,
    )
  )
    fail(`Intent family missing ${intent}`);

const minimumIntentRows =
  policy.languages.length * policy.scopes.length * policy.intentFamilies.length;
if (intentAliasRows < minimumIntentRows)
  fail(`Intent alias coverage sparse ${intentAliasRows}/${minimumIntentRows}`);

if (policy.serviceAliasCoverage?.enabled) {
  for (const service of services) {
    const serviceRows = rows.filter((row) =>
      arr(row.service_ids).includes(service.id),
    );
    if (!serviceRows.length)
      fail(`Offered-service coverage missing ${service.id}`);
    for (const alias of service.aliases)
      if (!serviceRows.some((row) => row.query === alias))
        fail(`Exact service retrieval label missing ${service.id}: ${alias}`);
  }
}

const coveredServices = new Set(rows.flatMap((row) => arr(row.service_ids)));
if (
  policy.serviceAliasCoverage?.enabled &&
  coveredServices.size !== services.length
)
  fail(
    `Offered-service coverage drift ${coveredServices.size}/${services.length}`,
  );

console.log(
  JSON.stringify(
    {
      valid: true,
      file: path.relative(root, target),
      release: release.release,
      rows: rows.length,
      intentAliasRows,
      serviceAliasRows,
      servicesWithAliasCoverage: coveredServices.size,
      expectedServicesWithAliases: services.length,
      expectedOfferedServices: services.length,
      identityBaselineEvidenceRefs: baselineEvidence.length,
      maximumStableEvidenceRefs: Math.max(
        ...rows.map((row) => arr(row.stable_evidence_refs).length),
      ),
      stableEvidenceLimit: maxStableEvidenceRefs,
      rowsWithStableEvidence: rows.filter(
        (row) => arr(row.stable_evidence_refs).length > 0,
      ).length,
      stableEvidenceRegistrySize: evidenceIds.size,
      releaseBoundary,
      workspace: target === sourceTarget ? ".generated" : "external",
      integrity: "PASS",
    },
    null,
    2,
  ),
);
