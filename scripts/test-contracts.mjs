import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { commitTextFiles } from "./lib/file-transaction.mjs";
import {
  evaluateGoogleReputation,
  composeChangedReputation,
} from "./lib/reputation-observation.mjs";
import { assertDocumentContract } from "./lib/html-contract.mjs";
import {
  canonicalSemanticSource,
  deriveCanonicalSemanticSets,
  directLanguageLiterals,
  exactLanguageLiteral,
  indexCanonicalGraph,
} from "../src/lib/semantic-projection.mjs";
async function file_transaction() {
  const must = (condition, message) => {
      if (!condition) throw new Error(message);
    },
    dir = await mkdtemp(path.join(os.tmpdir(), "doctor-ghezelbaash-txn-")),
    a = path.join(dir, "a.txt"),
    b = path.join(dir, "b.txt");
  try {
    await writeFile(a, "old-a\n");
    await writeFile(b, "old-b\n");
    let injected = false;
    try {
      await commitTextFiles(
        [
          { file: a, content: "new-a\n" },
          { file: b, content: "new-b\n" },
        ],
        {
          transactionId: "rollback-proof",
          beforeCommit: ({ index }) => {
            if (index === 1) throw new Error("intentional transaction fault");
          },
        },
      );
    } catch (error) {
      injected = error.message === "intentional transaction fault";
    }
    must(injected, "Rollback test did not observe injected failure");
    must(
      (await readFile(a, "utf8")) === "old-a\n",
      "Rollback failed to restore first committed file",
    );
    must(
      (await readFile(b, "utf8")) === "old-b\n",
      "Rollback changed uncommitted second file",
    );
    must(
      !(await readdir(dir)).some((name) => name.includes(".txn-")),
      "Rollback left transaction residue",
    );
    const success = await commitTextFiles(
      [
        { file: a, content: "new-a\n" },
        { file: b, content: "new-b\n" },
      ],
      { transactionId: "commit-proof" },
    );
    must(
      success.committed.length === 2,
      "Successful transaction committed wrong file count",
    );
    must(
      (await readFile(a, "utf8")) === "new-a\n" &&
        (await readFile(b, "utf8")) === "new-b\n",
      "Successful transaction content mismatch",
    );
    must(
      !(await readdir(dir)).some((name) => name.includes(".txn-")),
      "Successful transaction left residue",
    );
    let duplicateRejected = false;
    try {
      await commitTextFiles(
        [
          { file: a, content: "x" },
          { file: a, content: "y" },
        ],
        { transactionId: "duplicate-proof" },
      );
    } catch (error) {
      duplicateRejected = /Duplicate transaction target/.test(error.message);
    }
    must(duplicateRejected, "Duplicate transaction target was not rejected");
    console.log(
      JSON.stringify(
        {
          stage: "FILE_TRANSACTION",
          rollback: "PASS",
          commit: "PASS",
          residue: "NONE",
          duplicateTargetRejection: "PASS",
          integrity: "PASS",
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function release_promotion() {
  const execFileAsync = promisify(execFile),
    must = (condition, message) => {
      if (!condition) throw new Error(message);
    },
    targets = [
      "src/data/release.json",
      "package.json",
      "package-lock.json",
      "src/data/volatile-facts.json",
      "src/data/semantic/knowledge-graph.jsonld",
      "CITATION.cff",
      "codemeta.json",
    ],
    snapshot = async () =>
      new Map(
        await Promise.all(
          targets.map(async (file) => [file, await readFile(file)]),
        ),
      );
  const before = await snapshot(),
    { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        "scripts/promote-release.mjs",
        "--version=999.999.999",
        "--date=2099-12-31",
        "--zenodo-record=999999999",
        "--zenodo-doi=10.5281/zenodo.999999999",
        "--dry-run=true",
      ],
      { maxBuffer: 4 * 1024 * 1024 },
    );
  must(!stderr.trim(), `Promotion dry-run wrote to stderr: ${stderr.trim()}`);
  const result = JSON.parse(stdout);
  must(
    result.promoted === false &&
      result.dryRun === true &&
      result.prepared === true,
    "Promotion dry-run did not complete candidate preparation",
  );
  must(
    result.releaseBoundNodes > 0,
    "Promotion dry-run did not select current release-bound graph nodes",
  );
  must(
    Array.isArray(result.files) &&
      result.files.length === targets.length &&
      targets.every((file) => result.files.includes(file)),
    "Promotion dry-run target set drift",
  );
  const after = await snapshot();
  for (const file of targets)
    must(
      before.get(file).equals(after.get(file)),
      `Promotion dry-run mutated ${file}`,
    );
  console.log(
    JSON.stringify(
      {
        stage: "RELEASE_PROMOTION_DRY_RUN",
        candidatePrepared: "PASS",
        releaseBoundNodes: result.releaseBoundNodes,
        targetFiles: targets.length,
        sourceMutation: false,
        integrity: "PASS",
      },
      null,
      2,
    ),
  );
}
async function reputation_observation() {
  const [release, current] = await Promise.all([
      readFile("src/data/release.json", "utf8").then(JSON.parse),
      readFile("src/data/volatile-facts.json", "utf8").then(JSON.parse),
    ]),
    expectedPlaceId = release.clinic.placeId,
    unchangedPlace = {
      id: expectedPlaceId,
      rating: current.rating,
      userRatingCount: current.reviewCount,
      businessStatus: "OPERATIONAL",
    },
    unchanged = evaluateGoogleReputation({
      place: unchangedPlace,
      current,
      expectedPlaceId,
    });
  assert.equal(unchanged.changed, false);
  assert.equal(
    JSON.stringify(current),
    JSON.stringify(
      JSON.parse(await readFile("src/data/volatile-facts.json", "utf8")),
    ),
    "Unchanged fixture mutated canonical volatile source",
  );
  const changedPlace = {
      ...unchangedPlace,
      userRatingCount: Number(current.reviewCount) + 1,
    },
    changed = evaluateGoogleReputation({
      place: changedPlace,
      current,
      expectedPlaceId,
    });
  assert.equal(changed.changed, true);
  const observedAt = "2026-08-14T12:34:56.000Z",
    next = composeChangedReputation({
      current,
      evaluation: changed,
      observedAt,
      release,
    });
  assert.equal(next.reviewCount, Number(current.reviewCount) + 1);
  assert.equal(next.rating, Number(current.rating));
  assert.equal(next.valueObservedAt, observedAt);
  assert.equal(next.release, release.release);
  assert.equal(next.entity, release.clinic.id);
  assert.equal(next.placeId, expectedPlaceId);
  assert.equal(
    next.facts.find((x) => x.property === "ratingValue")?.entity,
    release.clinic.id,
  );
  assert.equal(
    next.facts.find((x) => x.property === "reviewCount")?.value,
    Number(current.reviewCount) + 1,
  );
  assert.equal(
    current.valueObservedAt,
    JSON.parse(await readFile("src/data/volatile-facts.json", "utf8"))
      .valueObservedAt,
    "Synthetic changed fixture leaked into canonical source",
  );
  assert.throws(
    () =>
      evaluateGoogleReputation({
        place: { ...unchangedPlace, id: "wrong-place" },
        current,
        expectedPlaceId,
      }),
    /identity drift/,
  );
  assert.throws(
    () =>
      evaluateGoogleReputation({
        place: { ...unchangedPlace, movedPlace: "places/new" },
        current,
        expectedPlaceId,
      }),
    /moved\/merged/,
  );
  assert.throws(
    () =>
      evaluateGoogleReputation({
        place: { ...unchangedPlace, rating: null },
        current,
        expectedPlaceId,
      }),
    /Malformed/,
  );
  assert.throws(
    () =>
      evaluateGoogleReputation({
        place: { ...unchangedPlace, businessStatus: "CLOSED_PERMANENTLY" },
        current,
        expectedPlaceId,
      }),
    /businessStatus/,
  );
  assert.throws(
    () =>
      composeChangedReputation({
        current,
        evaluation: unchanged,
        observedAt,
        release,
      }),
    /unchanged/,
  );
  console.log(
    JSON.stringify({
      reputationObservationFixtures: "PASS",
      unchangedNoMutation: true,
      syntheticChanged: true,
      wrongPlaceAbort: true,
      movedAbort: true,
      malformedAbort: true,
      clinicTarget: release.clinic.id,
    }),
  );
}
function semantic_article_contract() {
  const valid =
      '<!doctype html><html><body><main id="main-content"><article class="medical-guide"><section id="diagnosis" class="content-section"></section></article></main></body></html>',
    result = assertDocumentContract(valid, { expectedContentSections: 1 });
  assert.equal(result.mains.length, 1);
  assert.equal(result.guideArticles.length, 1);
  assert.equal(result.contentContainer, result.guideArticles[0]);
  assert.throws(
    () =>
      assertDocumentContract(
        '<!doctype html><html><body><main id="main-content"><article class="medical-guide"><div><section id="diagnosis" class="content-section"></section></div></article></main></body></html>',
        { expectedContentSections: 1 },
      ),
    /direct canonical content-container children/,
  );
  assert.throws(
    () =>
      assertDocumentContract(
        '<!doctype html><html><body><main id="main-content"><section id="diagnosis" class="content-section"></section></main></body></html>',
        { expectedContentSections: 1 },
      ),
    /Canonical article structure failed/,
  );
  assert.equal(
    assertDocumentContract(
      '<section id="diagnosis" class="content-section"></section>',
      { wrapMain: true, expectedContentSections: 1 },
    ).contentSections.length,
    1,
  );
  console.log(
    JSON.stringify(
      {
        stage: "SEMANTIC_ARTICLE_CONTRACT",
        mainArticleHierarchy: "PASS",
        nestedSectionRejection: "PASS",
        missingArticleRejection: "PASS",
        wrappedFragmentCompatibility: "PASS",
        integrity: "PASS",
      },
      null,
      2,
    ),
  );
}
async function canonical_semantic_derivation_contract() {
  const [release, policy] = await Promise.all([
      readFile("src/data/release.json", "utf8").then(JSON.parse),
      readFile("src/data/retrieval/query-matrix-policy.json", "utf8").then(
        JSON.parse,
      ),
    ]),
    semanticSource = canonicalSemanticSource(policy),
    graph = JSON.parse(await readFile(semanticSource, "utf8")),
    derived = deriveCanonicalSemanticSets(graph, release),
    graphNodes = graph["@graph"],
    questions = graphNodes.filter((node) =>
      [node["@type"]].flat().includes("Question"),
    ),
    services = graphNodes.filter((node) =>
      [node["@type"]].flat().includes("Service"),
    );
  assert.equal(derived.answers.length, questions.length);
  assert.equal(derived.services.length, services.length);
  assert.equal(
    exactLanguageLiteral(
      [{ "@language": "en", "@value": "Canonical" }],
      "en",
      "Test literal",
    ),
    "Canonical",
  );
  assert.deepEqual(
    directLanguageLiterals(
      [
        { "@language": "fa", "@value": "عنوان یک" },
        { "@language": "fa", "@value": "عنوان دو" },
      ],
      "fa",
      "Test literals",
    ),
    ["عنوان یک", "عنوان دو"],
  );
  assert.throws(
    () =>
      exactLanguageLiteral(
        [
          { "@language": "en", "@value": "One" },
          { "@language": "en", "@value": "Two" },
        ],
        "en",
        "Ambiguous literal",
      ),
    /exactly one en literal/,
  );

  const sharedAnswer = structuredClone(graph),
    sharedQuestions = sharedAnswer["@graph"].filter((node) =>
      [node["@type"]].flat().includes("Question"),
    );
  sharedQuestions[1].acceptedAnswer = structuredClone(
    sharedQuestions[0].acceptedAnswer,
  );
  sharedQuestions[1].url = sharedQuestions[0].url;
  sharedQuestions[1].inLanguage = sharedQuestions[0].inLanguage;
  assert.throws(
    () => deriveCanonicalSemanticSets(sharedAnswer, release),
    /Question\/Answer topology is not one-to-one/,
  );

  const providerDrift = structuredClone(graph),
    service = providerDrift["@graph"].find((node) =>
      [node["@type"]].flat().includes("Service"),
    );
  service.provider = { "@id": release.clinic.id };
  assert.throws(
    () => deriveCanonicalSemanticSets(providerDrift, release),
    /canonical physician provider/,
  );

  const aliasDrift = structuredClone(graph),
    aliaslessService = aliasDrift["@graph"].find((node) =>
      [node["@type"]].flat().includes("Service"),
    );
  delete aliaslessService.alternateName;
  assert.throws(
    () => deriveCanonicalSemanticSets(aliasDrift, release),
    /nonempty direct alternateName/,
  );

  const pathDrift = structuredClone(graph),
    pathQuestion = pathDrift["@graph"].find((node) =>
      [node["@type"]].flat().includes("Question"),
    ),
    pathAnswerId = pathQuestion.acceptedAnswer["@id"],
    pathAnswer = pathDrift["@graph"].find(
      (node) => node["@id"] === pathAnswerId,
    ),
    noncanonicalSource = new URL(pathQuestion.url);
  noncanonicalSource.pathname = "/parallel";
  pathQuestion.url = noncanonicalSource.href;
  pathAnswer.url = noncanonicalSource.href;
  assert.throws(
    () => deriveCanonicalSemanticSets(pathDrift, release),
    /outside the canonical document/,
  );

  const anonymousService = structuredClone(graph);
  anonymousService["@graph"].push({ "@type": "Service" });
  assert.throws(
    () => deriveCanonicalSemanticSets(anonymousService, release),
    /top-level node without @id/,
  );

  const duplicateNode = structuredClone(graph);
  duplicateNode["@graph"].push(structuredClone(duplicateNode["@graph"][0]));
  assert.throws(
    () => deriveCanonicalSemanticSets(duplicateNode, release),
    /Duplicate canonical graph ID/,
  );

  const question = graph["@graph"].find((node) =>
      [node["@type"]].flat().includes("Question"),
    ),
    answer = graph["@graph"].find(
      (node) => node["@id"] === question.acceptedAnswer["@id"],
    ),
    directUrlMatches = indexCanonicalGraph(graph).nodesByUrl.get(question.url);
  assert.ok(directUrlMatches.includes(question));
  assert.ok(directUrlMatches.includes(answer));
  const sourceUrl = "https://example.test/#source",
    collisionIndex = indexCanonicalGraph({
      "@graph": [
        { "@id": sourceUrl },
        { "@id": "https://example.test/#question", url: sourceUrl },
        { "@id": "https://example.test/#answer", url: sourceUrl },
      ],
    });
  assert.deepEqual(
    collisionIndex.sourceNodesForUrl(sourceUrl).map((node) => node["@id"]),
    [
      sourceUrl,
      "https://example.test/#question",
      "https://example.test/#answer",
    ],
  );

  assert.throws(
    () =>
      canonicalSemanticSource({
        ...policy,
        serviceAliasCoverage: {
          ...policy.serviceAliasCoverage,
          unexpected: true,
        },
      }),
    /Service alias policy fields are not canonical/,
  );
  console.log(
    JSON.stringify(
      {
        stage: "CANONICAL_SEMANTIC_DERIVATION",
        source: semanticSource,
        answers: derived.answers.length,
        services: derived.services.length,
        sharedAnswerRejection: "PASS",
        providerDriftRejection: "PASS",
        missingDirectServiceAliasRejection: "PASS",
        ambiguousLanguageLiteralRejection: "PASS",
        pathDriftRejection: "PASS",
        anonymousServiceRejection: "PASS",
        duplicateGraphIdRejection: "PASS",
        directUrlMultimapPreservation: "PASS",
        policyShapeRejection: "PASS",
        integrity: "PASS",
      },
      null,
      2,
    ),
  );
}
await file_transaction();
await release_promotion();
await reputation_observation();
semantic_article_contract();
await canonical_semantic_derivation_contract();
console.log(
  JSON.stringify({
    stage: "CONTRACT_TEST_SUITE",
    contracts: 5,
    integrity: "PASS",
  }),
);
