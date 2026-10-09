# Machine Knowledge, Provenance, and Page Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `experiment/source-preview` preserve its Person-first semantic architecture while restoring and surpassing Main's retrieval/provenance/evidence/fact portability, reducing focused-page semantic fan-out, and extending release lineage without weakening existing V2 contracts.

**Architecture:** Keep `src/canonical/source.mjs` as the single authored semantic truth. Add focused deterministic projection helpers for retrieval/provenance and evidence, keep machine-output orchestration thin, constrain route JSON-LD traversal in `src/pages/index.astro`, and extend release sealing with semantic lineage hashes before byte-level integrity sealing.

**Tech Stack:** Node.js ESM, Astro 7.2.8 static prerendering, JSON-LD 9, RDF/N3, PROV-O, CSVW, Croissant 1.1, DCAT/VoID, SHA-256, existing V2 verification harness.

**Spec:** `docs/superpowers/specs/2026-10-09-machine-knowledge-provenance-projection-design.md`

## Global Constraints

- DIST is the product; source changes are accepted only when generated DIST improves.
- Preserve the full canonical graph on Home and semantic-fingerprint equivalence with `SOURCE.graph`.
- Preserve all 72 canonical routes and current routing/video/rendering behavior.
- Do not invent external corroboration, issuer verification, or evidence classifications not derivable from canonical data.
- Do not create a second manually maintained fact/evidence registry.
- Keep `entity-facts.csv` RDF-lossless and one-row-per-unique-canonical-RDF-statement.
- All generated resources must remain deterministic for identical canonical inputs and dependency lockfile.
- No build timestamps may create nondeterministic output.
- Do not merge to `main` or alter production deployment configuration.
- Preserve current SRI, SBOM, integrity manifest, Content-Digest eligibility, and V2 release checks.

## File Structure

- Create `src/lib/retrieval-output.mjs` — shared retrieval record model, human-readable answer serialization, structured fact-map serialization, and passage-level provenance projection.
- Create `src/lib/evidence-output.mjs` — audit-oriented evidence/assessment projection with explicit verification/authority/independence dimensions.
- Modify `src/lib/machine-output.mjs` — import/re-export focused generators, enrich CSVW/Croissant/Data Package/DCAT/VoID metadata, keep RDF fact serialization unchanged.
- Modify `infrastructure/materialize-machine-resources.mjs` — materialize new shared projections deterministically and preserve generation ordering.
- Modify `src/pages/index.astro` — change focused-route semantic closure policy without changing Home canonical truth.
- Modify `infrastructure/seal-release.mjs` — add semantic/projection lineage hashes before final integrity manifest generation.
- Modify `infrastructure/run-v2-release.mjs` — surface lineage verification in V2 release report.
- Create `infrastructure/test-retrieval-provenance.mjs` — exact-source, hash, passage provenance, and projection-consistency regression tests.
- Create `infrastructure/test-evidence-output.mjs` — evidence assessment preservation and non-promotion tests.
- Create `infrastructure/test-page-projection.mjs` — representative focused-page relevance/fan-out tests.
- Modify `infrastructure/test-machine-resources.mjs` — CSVW/Croissant/Data Package/DCAT deterministic metadata contracts.
- Modify `infrastructure/test-integrity.mjs` — semantic lineage hash and sealing determinism checks.
- Modify `infrastructure/test-semantic-contract.mjs` — retain Home full-graph invariant while delegating focused-page anti-fan-out assertions to the dedicated projection test.
- Modify `package.json` — register the new tests in `test:machine`, `test:semantic`, and/or `test:integrity` without weakening existing commands.

## Review Focus

1. **Exact source precedence:** a Question with both a generic `mainEntityOfPage` and a route-specific `url` must resolve retrieval to the exact authored route/fragment, never generic `/webpage`.
2. **Evidence ambiguity:** authoritative/reachable evidence without issuer or independent corroboration must remain distinguishable from verified independent evidence.
3. **Projection leakage:** a focused Botox/filler page must not regain global fan-out through an indirect Person, Clinic, WebSite, membership, or service edge.
4. **Hash cycles:** semantic lineage hashes and byte manifests must have an explicit non-self-referential generation order and remain deterministic across repeated sealing.
5. **RDF portability:** richer metadata must not alter RDF statement identity, CSV reconstruction, native datatypes, language tags, blank-node stability, or existing semantic fingerprints.

---

### Task 1: Shared Retrieval Record Model and Exact Source Resolution

**Files:**
- Create: `src/lib/retrieval-output.mjs`
- Create: `infrastructure/test-retrieval-provenance.mjs`
- Modify: `src/lib/machine-output.mjs`
- Modify: `infrastructure/materialize-machine-resources.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SOURCE.graph`, `SOURCE.canonicalOrigin`, `SOURCE.edition`, authored Question/Answer nodes, existing route/HTML target semantics.
- Produces: `buildRetrievalRecords(source) -> RetrievalRecord[]`, `serializeAnswersText(records) -> string`, `buildFactMap(source, records) -> object`.
- `RetrievalRecord` fields: `questionId`, `answerId`, `question`, `answer`, `language`, `sourceUrl`, `htmlId`, `htmlUrl`, `passageId`, `aboutIds`, `graphNodeIds`, `evidenceIds`, `claimEvidenceIds`, `entityEvidenceIds`, `provenanceClass`, `reviewedBy`, `reviewedAt`, `release`, `sourceHashSha256`, `answerHashSha256`, `passageHashSha256`.

- [ ] **Step 1: Write failing exact-source and field-completeness tests**

In `infrastructure/test-retrieval-provenance.mjs`, assert that every current canonical Question/Answer record has stable IDs/hashes/release metadata and that records with a route-specific `question.url` do not resolve to `${SOURCE.canonicalOrigin}/webpage`.

Also assert:

```js
assert.equal(record.htmlUrl, record.htmlId ? `${record.sourceUrl}#${record.htmlId}` : record.sourceUrl);
assert.match(record.sourceHashSha256, /^[a-f0-9]{64}$/);
assert.match(record.answerHashSha256, /^[a-f0-9]{64}$/);
assert.match(record.passageHashSha256, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the new test and verify current behavior fails**

Run: `node infrastructure/test-retrieval-provenance.mjs`

Expected: FAIL on missing `buildRetrievalRecords`/rich retrieval fields or generic source resolution.

- [ ] **Step 3: Implement `buildRetrievalRecords(source)`**

In `src/lib/retrieval-output.mjs`, derive records from canonical Questions and accepted Answers with this source precedence:

1. exact authored `question.url` when it is an absolute canonical route URL;
2. exact authored Answer URL if explicitly present and route-owned;
3. route/page reference only when no exact authored URL exists;
4. generic Home WebPage relationship only as last fallback.

Derive `htmlId` from a fragment/route-owned canonical content target when available; otherwise leave it empty rather than inventing an anchor.

Use stable normalized UTF-8 strings and SHA-256; never use wall-clock time.

- [ ] **Step 4: Implement shared text and JSON projections**

`serializeAnswersText(records)` must emit the complete retrieval metadata in stable field order. `buildFactMap(source, records)` must contain top-level canonical/release/source-of-truth metadata and the same records without semantic divergence.

- [ ] **Step 5: Wire materialization to the shared record model**

In `infrastructure/materialize-machine-resources.mjs`, compute retrieval records once and use them for both `/answers.txt` and `/fact-map.json`.

`src/lib/machine-output.mjs` should no longer maintain a second independent implementation of answer/fact-map semantics.

- [ ] **Step 6: Re-run focused tests**

Run:

```bash
node infrastructure/test-retrieval-provenance.mjs
node infrastructure/test-machine-resources.mjs
```

Expected: PASS; repeated materialization remains byte-identical.

- [ ] **Step 7: Commit**

```bash
git add src/lib/retrieval-output.mjs src/lib/machine-output.mjs infrastructure/materialize-machine-resources.mjs infrastructure/test-retrieval-provenance.mjs package.json
git commit -m "feat: restore provenance-rich retrieval records"
```

---

### Task 2: Passage-Level Provenance Coverage

**Files:**
- Modify: `src/lib/retrieval-output.mjs`
- Modify: `src/lib/machine-output.mjs`
- Modify: `infrastructure/materialize-machine-resources.mjs`
- Modify: `infrastructure/test-retrieval-provenance.mjs`

**Interfaces:**
- Consumes: `RetrievalRecord[]` from Task 1 and existing canonical Claim/PROV/OA nodes.
- Produces: `buildProvenanceGraph(source, records) -> {'@context': object, '@graph': object[]}`.

- [ ] **Step 1: Add failing provenance-coverage tests**

For each retrieval record assert the generated provenance graph contains a deterministic passage entity whose ID is derived from `passageId`, links to the canonical Question/Answer, carries exact source URL and source/passage hashes, and uses PROV-O derivation semantics.

Also assert at least one existing OA/Claim/evidence-bundle node from the canonical graph survives unchanged in the projection.

- [ ] **Step 2: Run and verify failure**

Run: `node infrastructure/test-retrieval-provenance.mjs`

Expected: FAIL because current provenance only selects pre-existing Claim/PROV/OA nodes.

- [ ] **Step 3: Implement `buildProvenanceGraph(source, records)`**

Merge two deterministic layers:

1. existing authored provenance/Claim/OA/evidence-bundle nodes;
2. one generated passage/retrieval provenance bundle per `RetrievalRecord`.

Use stable canonical IRIs under the existing provenance namespace. Do not overwrite authored node IDs. Generated nodes must reference `questionId`, `answerId`, `sourceUrl/htmlUrl`, `evidenceIds`, release, and hashes.

- [ ] **Step 4: Materialize provenance from the same record set**

Change `/provenance.jsonld` generation to consume the already-built `RetrievalRecord[]`; do not re-derive answer/source identity independently.

- [ ] **Step 5: Verify coverage and determinism**

Run:

```bash
node infrastructure/test-retrieval-provenance.mjs
node infrastructure/test-machine-resources.mjs
```

Expected: PASS; provenance record count is at least the number of retrieval records plus preserved authored provenance nodes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/retrieval-output.mjs src/lib/machine-output.mjs infrastructure/materialize-machine-resources.mjs infrastructure/test-retrieval-provenance.mjs
git commit -m "feat: materialize passage-level provenance"
```

---

### Task 3: Evidence Verification and Corroboration Projection

**Files:**
- Create: `src/lib/evidence-output.mjs`
- Create: `infrastructure/test-evidence-output.mjs`
- Modify: `src/lib/machine-output.mjs`
- Modify: `infrastructure/materialize-machine-resources.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical Person evidence relationships, evidence nodes, assessment/verification nodes, Claim support relationships.
- Produces: `buildEvidenceSnapshot(source) -> {schemaVersion, subject, observedAt, evidence}`.

- [ ] **Step 1: Write failing evidence-preservation tests**

Find canonical assessment records that expose fields such as authority tier, support relation, role, `liveStatus`/verification state, `verifiedAt`, and expected markers. Assert those same values survive in the snapshot for the linked evidence item.

Add a negative test: evidence with no issuer/independence/verification assessment must not acquire `verificationStatus: 'verified'`, `independence: 'independent'`, or equivalent inferred promotion.

- [ ] **Step 2: Run and verify current shallow snapshot fails**

Run: `node infrastructure/test-evidence-output.mjs`

Expected: FAIL because current output keeps only ID/type/name/URL/dateModified.

- [ ] **Step 3: Implement assessment-aware `buildEvidenceSnapshot(source)`**

For each evidence item, emit only values actually derivable from canonical nodes:

- evidence ID/type/name/URL;
- issuer/source identity when present;
- source ownership/corroboration classification only when explicitly derivable;
- authority tier;
- verification/live status;
- `verifiedAt`/`observedAt`;
- evidence role;
- assessment ID;
- expected/observed markers;
- supported claim IDs;
- existing source/content hashes when present.

Represent missing assessment data explicitly as unassessed/unknown rather than guessing.

- [ ] **Step 4: Wire the dedicated evidence generator**

Replace the shallow evidence snapshot implementation in `machine-output.mjs` with the dedicated module and keep output ordering deterministic.

- [ ] **Step 5: Verify evidence and machine-resource suites**

Run:

```bash
node infrastructure/test-evidence-output.mjs
node infrastructure/test-machine-resources.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/evidence-output.mjs src/lib/machine-output.mjs infrastructure/materialize-machine-resources.mjs infrastructure/test-evidence-output.mjs package.json
git commit -m "feat: preserve evidence verification semantics"
```

---

### Task 4: Fact Portability and Standards Metadata

**Files:**
- Modify: `src/lib/machine-output.mjs`
- Modify: `infrastructure/test-machine-resources.mjs`

**Interfaces:**
- Consumes: unchanged `graphFactRows(graph)` fact identity and current `source.machineResources` registry.
- Produces: richer `buildCsvMetadata(source)`, `buildCroissant(source)`, `buildDataPackage(source, stats)`, `buildDcatTurtle(source)`, and `buildVoidTurtle(source, tripleCount)` outputs.

- [ ] **Step 1: Add failing CSVW/catalog metadata tests**

Keep existing semantic-fingerprint assertions and additionally require:

- CSVW `tableSchema.primaryKey` equals `row_id`;
- dataset identity/version/release metadata exists;
- each CSV column has a deterministic description/semantic role;
- metadata links to canonical graph/provenance/fact-map resources;
- Data Package restores descriptive dataset metadata while retaining byte/hash stats;
- Croissant 1.1 retains `conformsTo`, creator/publisher/license/version and file checksums/sizes;
- DCAT/VoID use stable named dataset/distribution IRIs and provenance/version links.

- [ ] **Step 2: Run and verify metadata tests fail while RDF equivalence still passes**

Run: `node infrastructure/test-machine-resources.mjs`

Expected: FAIL only on new metadata assertions; current RDF/CSV fingerprint assertions remain green.

- [ ] **Step 3: Enrich CSVW without changing CSV fact rows**

Do not add non-RDF metadata columns to `entity-facts.csv`. Put portability metadata in CSVW and linked deterministic resources so `csvFingerprint(csv) === semanticFingerprint(source.graph)` remains true.

- [ ] **Step 4: Strengthen Croissant/Data Package/DCAT/VoID**

Follow Croissant 1.1 version/checksum/provenance conventions and existing local `croissant-context.mjs`. Use PROV-O/DCAT links already represented in the canonical vocabulary where possible. Keep compatibility outputs as views, not new truth stores.

- [ ] **Step 5: Verify standards output and determinism**

Run:

```bash
node infrastructure/test-machine-resources.mjs
npm run test:machine
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/machine-output.mjs infrastructure/test-machine-resources.mjs
git commit -m "feat: strengthen portable dataset metadata"
```

---

### Task 5: Focused Page Person-Centered Topical Projection

**Files:**
- Create: `infrastructure/test-page-projection.mjs`
- Modify: `src/pages/index.astro`
- Modify: `infrastructure/test-semantic-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical Home graph, route resource metadata, route main entity, topic references, visible Q&A/media, existing `schemaOnlyNode`/`browserNode` helpers.
- Produces: focused route JSON-LD documents with `canonical Person kernel + route/topic closure` while Home stays full canonical truth.

- [ ] **Step 1: Write failing representative anti-fan-out tests**

Use at least `/botox`, `/filler`, and one multilingual/guide route. For each focused document assert:

- canonical Person exists;
- route WebPage and mainEntity exist;
- route-visible Q&A/media and directly referenced topical nodes exist;
- known unrelated service/topic nodes reachable only through global Person/Clinic inventories are absent;
- direct route-specific credentials/evidence remain present when genuinely connected.

Also preserve the existing assertion:

```js
assert.equal(await semanticFingerprint(homeInline), await semanticFingerprint(SOURCE.graph));
```

- [ ] **Step 2: Run and verify current focused graph fan-out fails**

Run: `node infrastructure/test-page-projection.mjs`

Expected: FAIL on unrelated global Person/Clinic traversal.

- [ ] **Step 3: Introduce relation classes in focused-page closure**

Inside the existing `pageDiscoveryJsonld`/`independentPages` logic, replace the broad global traversal behavior with explicit classes:

- identity-kernel relations;
- page relations;
- visible content relations;
- topical relations rooted in route-specific `about`/`mentions`/mainEntity nodes;
- global relations excluded by default.

The canonical Person seed must be a shallow identity kernel. Do not recursively follow broad `subjectOf`, all `availableService`, all `knowsAbout`, all memberships/credentials, or full Clinic/WebSite inventories merely because the Person is present.

- [ ] **Step 4: Preserve directly relevant chains**

Allow route-selected service/procedure/claim/evidence/credential nodes to bring their own directly connected evidence/citation/issuer relationships when they originate from the route topic/mainEntity closure.

- [ ] **Step 5: Verify focused routes and Home contract**

Run:

```bash
node infrastructure/test-page-projection.mjs
node infrastructure/test-semantic-contract.mjs
npm run test:semantic
```

Expected: PASS. No arbitrary node-count ceiling is asserted.

- [ ] **Step 6: Build DIST and inspect representative JSON-LD**

Run: `npm run build`

Check `/dist/index.html`, `/dist/botox.html`, `/dist/filler.html`, and the selected multilingual route. Home must remain semantically complete; focused pages must retain relevant Person/topic semantics without site-wide fan-out.

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro infrastructure/test-page-projection.mjs infrastructure/test-semantic-contract.mjs package.json
git commit -m "feat: scope focused page semantic projections"
```

---

### Task 6: Release Semantic Lineage and Integrity

**Files:**
- Modify: `infrastructure/seal-release.mjs`
- Modify: `infrastructure/test-integrity.mjs`
- Modify: `infrastructure/run-v2-release.mjs`

**Interfaces:**
- Consumes: final materialized canonical graph and projection files before integrity-manifest creation.
- Produces: enriched `release-provenance.json` with semantic/projection hashes and unchanged final `integrity-manifest.json` byte sealing.

- [ ] **Step 1: Write failing semantic-lineage tests**

Require `release-provenance.json` to contain stable hashes for:

- canonical graph semantic representation/fingerprint or canonical graph bytes;
- `answers.txt`;
- `fact-map.json`;
- `provenance.jsonld`;
- `entity-facts.csv`;
- existing package-lock/SBOM/source commit data.

Assert the integrity manifest still excludes itself and accurately hashes `release-provenance.json` after lineage has been finalized.

- [ ] **Step 2: Run and verify failure**

Run: `node infrastructure/test-integrity.mjs`

Expected: FAIL on missing semantic lineage fields.

- [ ] **Step 3: Implement non-self-referential generation order**

In `sealRelease()`:

1. finalize SRI/SBOM and projection files;
2. compute semantic/projection lineage hashes;
3. write final `release-provenance.json`;
4. compute final file-byte inventory;
5. write `integrity-manifest.json`, excluding only itself.

Do not include a hash inside a file that depends on hashing that same file.

- [ ] **Step 4: Surface lineage in V2 report**

`run-v2-release.mjs` should verify the release provenance object and include concise lineage status/counts in the machine verification report without changing live-only gate semantics.

- [ ] **Step 5: Verify sealing determinism**

Run:

```bash
node infrastructure/test-integrity.mjs
npm run test:integrity
```

Expected: PASS; repeated sealing of identical inputs produces stable semantic lineage/SBOM bytes and correct final manifest hashes.

- [ ] **Step 6: Commit**

```bash
git add infrastructure/seal-release.mjs infrastructure/test-integrity.mjs infrastructure/run-v2-release.mjs
git commit -m "feat: add semantic lineage to release sealing"
```

---

### Task 7: Full Regression Gate and DIST Acceptance

**Files:**
- Modify only if a test exposes a real regression in files owned by Tasks 1-6.
- Optional metrics/report update only if an existing repository convention requires committed baseline metrics.

**Interfaces:**
- Consumes: all implementations from Tasks 1-6.
- Produces: verified branch state and a fresh V2 DIST artifact/report.

- [ ] **Step 1: Run targeted new tests together**

Run:

```bash
node infrastructure/test-retrieval-provenance.mjs
node infrastructure/test-evidence-output.mjs
node infrastructure/test-page-projection.mjs
node infrastructure/test-machine-resources.mjs
node infrastructure/test-integrity.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run full source/semantic/machine suites**

Run:

```bash
npm run test:semantic
npm run test:source
npm run test:machine
npm run test:integrity
```

Expected: all PASS with zero regressions.

- [ ] **Step 3: Run complete V2 test gate**

Run: `npm run test:v2`

Expected: PASS.

- [ ] **Step 4: Build and verify generated DIST**

Run:

```bash
npm run build
npm run verify
npm run verify:dist
```

Expected: PASS.

- [ ] **Step 5: Run the full release pipeline**

Run: `npm run release:v2`

Expected: PASS with fresh `release/verification-report.json` and `release/verification-report-fa.md` reporting 72 canonical routes, preserved rendering/video contracts, valid SBOM/integrity manifest, and new semantic-lineage fields.

- [ ] **Step 6: Compare final DIST against acceptance criteria**

Measure and record:

- sitemap canonical URL count;
- Home graph semantic equivalence;
- focused-route node/type composition for Botox/filler/multilingual sample;
- retrieval record count and exact-source coverage;
- passage provenance coverage;
- evidence assessment metadata coverage;
- CSV row/RDF semantic equivalence;
- Croissant/Data Package/CSVW/version/checksum fields;
- integrity manifest file count and release lineage hashes.

Do not declare improvement from raw byte/node count alone; acceptance is semantic/retrieval/auditability based.

- [ ] **Step 7: Review diff against the approved spec**

Check every numbered requirement in `docs/superpowers/specs/2026-10-09-machine-knowledge-provenance-projection-design.md`. Any unmet requirement is a blocker or must be explicitly documented as externally impossible (for example, creating independent third-party corroboration cannot be solved by source code).

- [ ] **Step 8: Commit any final test-only correction, then stop before merge/deploy**

```bash
git status --short
git log --oneline --decorate -n 12
```

No merge to `main` and no production deployment in this plan.
