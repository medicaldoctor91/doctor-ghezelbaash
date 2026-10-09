# Machine Knowledge, Provenance, Retrieval, and Page Projection Design

Date: 2026-10-09
Branch: `experiment/source-preview`
Design baseline commit: `81a0f368e148372bad4a657111ca501c3eb7e8ea`
Status: approved design, implementation pending

## 1. Purpose

Strengthen the experimental branch so its generated DIST preserves the semantic and entity-first advantages of the current architecture while restoring and surpassing the retrieval, provenance, evidence-verification, fact-portability, and representation-integrity strengths previously present in Main.

The DIST is the product. Source changes are accepted only insofar as they improve deterministic generated output without introducing semantic drift or weakening existing V2 delivery, rendering, routing, video, integrity, or release contracts.

## 2. Success criteria

The implementation is successful only when all of the following are true:

1. Home remains the comprehensive canonical corpus and continues to expose the full canonical semantic truth.
2. Focused subpages emit route-relevant Person-centered JSON-LD projections instead of recursively reproducing large unrelated portions of the site-wide graph.
3. `answers.txt` and `fact-map.json` resolve every answer to an exact retrievable source location and carry stable provenance, evidence, review, release, and hash metadata.
4. `provenance.jsonld` provides passage-level and claim/evidence lineage rather than only selecting pre-existing Claim/PROV/OA nodes.
5. `evidence-snapshot.json` preserves verification metadata already represented in the canonical graph and never upgrades unverified or self-attributed claims into verified evidence.
6. `entity-facts.csv` remains a lossless RDF fact export while becoming substantially more portable and self-describing through richer CSVW/dataset/provenance metadata.
7. Croissant, Data Package, DCAT/VoID, Linkset, knowledge XML, LLM compatibility files, and integrity outputs are deterministic projections of the same canonical truth rather than parallel truth stores.
8. Release provenance connects source commit, canonical semantic fingerprint/hash, projected artifact hashes, package lock, SBOM, and final byte-integrity manifest.
9. Existing route corpus coverage is preserved. No sitemap URL is removed merely to reduce graph size.
10. Existing V2 test suites remain green, and new regression tests fail on the current regressions before implementation and pass after the fixes.

## 3. Non-goals

- Do not reduce graph size merely for cosmetic byte-count targets.
- Do not remove the full canonical graph from Home.
- Do not manufacture external corroboration or issuer verification that does not exist.
- Do not merge the experiment into `main` as part of this work.
- Do not alter deployment targets or production configuration unless a later explicit request authorizes it.
- Do not create a second manually maintained fact or evidence registry.
- Do not redesign unrelated UI, routing, video playback, or authored medical content.

## 4. Confirmed current regressions and constraints

### 4.1 Retrieval source collapse

The current `buildAnswersText()` chooses `mainEntityOfPage`/`isPartOf` before the exact answer route in some records, producing generic source locations such as `/webpage` rather than an exact route/fragment.

Current answer output also omits rich fields previously useful for machine retrieval and auditing: exact HTML anchor, graph/about IDs, evidence IDs, source hash, review metadata, provenance class, and release/version.

### 4.2 Thin fact map

The current `buildFactMap()` emits only the question, answer, source URL, and a flat evidence array. It no longer carries enough information to connect a retrieved answer to its route fragment, graph entities, evidence classes, passage identity, review state, or release hash.

### 4.3 Passage provenance loss

The current provenance materializer selects nodes already typed as Claim, PROV, or OA. This yields semantically rich but sparse provenance coverage. It does not create deterministic provenance entities for every answer/passage represented in the retrieval corpus.

### 4.4 Evidence metadata loss at projection time

The canonical graph already contains richer evidence/assessment semantics, including authority tier, support relationships, roles, verification/live state, timestamps, and expected markers for many records. The current `buildEvidenceSnapshot()` discards most of that information and emits only a shallow inventory.

### 4.5 Subpage graph fan-out

Focused pages correctly seed the canonical Person, but traversal currently follows broad site-wide Person/Clinic relations such as `subjectOf`, `availableService`, `knowsAbout`, credentials, memberships, and related global relationships. This causes focused pages to reproduce large unrelated portions of the global graph.

The problem is semantic closure policy, not graph size itself.

### 4.6 Fact portability regression

The current CSV is RDF-lossless, which must be preserved. However, the current CSVW metadata is minimal and no longer carries enough dataset/version/provenance/label semantics for portable downstream interpretation.

### 4.7 Integrity is already a strength

The experiment already has deterministic materialization, release sealing, SBOM generation, per-file SHA-256 integrity, SRI, and a byte-level integrity manifest. These are preserved and extended, not replaced.

## 5. Architectural decision

Adopt one canonical semantic truth and derive all public machine-readable outputs from it through deterministic projection functions.

The architecture is:

`canonical authored graph + authored HTML`

→ `semantic normalization / route ownership / evidence assessment`

→ `deterministic projections`

→ `retrieval + provenance + facts + page JSON-LD + dataset metadata`

→ `release lineage`

→ `byte sealing / integrity manifest`

No generated representation may become an independently maintained source of truth.

## 6. Retrieval contract

Introduce a shared retrieval-record builder used by both `answers.txt` and `fact-map.json`.

Each answer record must resolve or derive:

- `questionId`
- `answerId`
- `question`
- `answer`
- `language`
- `sourceUrl`
- `htmlId`
- `htmlUrl` (exact URL including fragment when a fragment exists)
- `passageId`
- `aboutIds`
- `graphNodeIds`
- `evidenceIds`
- `claimEvidenceIds`
- `entityEvidenceIds`
- `provenanceClass`
- `reviewedBy`
- `reviewedAt`
- `release`
- `sourceHashSha256`
- `answerHashSha256`
- `passageHashSha256`

Resolution priority must prefer the answer/question's exact authored route and canonical HTML target rather than a generic parent WebPage relationship.

Hashes must be deterministic and based on stable normalized content, not build timestamps.

`answers.txt` is a human/agent-readable projection of this record model. `fact-map.json` is the structured projection. Their semantics must not diverge.

## 7. Passage-level provenance contract

For every retrieval record, materialize deterministic provenance entities describing at minimum:

- the source passage entity;
- the generated retrieval record entity;
- the canonical question and answer entities;
- derivation relationships;
- the exact source URL/fragment;
- source/retrieval hashes;
- associated evidence/claim references;
- release/version identity.

Use PROV-O semantics where appropriate (`prov:Entity`, `prov:wasDerivedFrom`, `prov:specializationOf`, generation/attribution relationships). Preserve existing semantically richer OA/Claim/evidence bundles and merge them with the new broad passage coverage rather than replacing either layer.

Expected outcome: Main-like breadth of passage coverage with Experiment-like claim/evidence semantics.

## 8. Evidence and corroboration contract

`evidence-snapshot.json` becomes an audit-oriented projection, not a shallow list.

For each evidence item, export available values for:

- evidence ID/type/name/URL;
- issuer/source identity;
- source ownership class;
- `first-party`, `issuer-controlled`, `platform-hosted`, or `independent` classification when this can be derived explicitly;
- authority tier;
- verification/live status;
- `verifiedAt` and/or `observedAt`;
- evidence role;
- assessment ID;
- expected/observed markers;
- supported claim IDs;
- relevant content or source hashes where already available.

Three dimensions must remain distinct:

1. source authority;
2. verification status;
3. independence/corroboration class.

A source can be authoritative but not independently corroborating, and a first-party source can be reachable without verifying a strong external credential claim.

Strong self-attributed claims without issuer-controlled or independent evidence must remain explicitly unverified/self-attributed. No generator may silently promote them to verified claims.

## 9. Fact export and CSVW contract

Preserve the current fact CSV's defining invariant: reconstructing its RDF semantics must equal the canonical graph's semantic fingerprint.

Do not mix claim-level metadata into every RDF fact row in a way that destroys one-row-per-canonical-RDF-statement semantics.

Instead:

- retain the canonical RDF statement columns;
- enrich CSVW metadata with dataset identity, version, modified/release information, key definition, column descriptions, semantic meaning, and links to provenance/retrieval resources;
- expose object labels/types or higher-level claim/evidence joins through linked deterministic metadata/projection resources when they cannot be added without changing RDF statement identity.

This preserves mathematical fact equivalence while making the export easier for downstream systems to understand.

## 10. Page JSON-LD projection policy

### 10.1 Home

Home remains the broad Person authority/canonical truth surface. Its inline JSON-LD must continue to be semantically equivalent to the canonical graph under the existing semantic fingerprint contract.

### 10.2 Focused subpages

A focused route must project a route-specific semantic closure built from:

- the route WebPage/MedicalWebPage descriptor;
- canonical Person kernel;
- route main entity;
- exact topical `about`/`mentions` references;
- visible route Q&A and accepted answers;
- visible/relevant media;
- relevant service/procedure entities;
- clinic/location only where required by page semantics;
- credentials, claims, publications, evidence, or role nodes only when directly connected to the route topic or page-specific entity relationships.

The canonical Person kernel may retain stable identity properties such as canonical URL/name/identifiers, essential profession/occupation identity, primary clinic relationship, primary image, and selected externally identifying references. It must not recursively import the Person's entire site-wide `subjectOf`, service catalog, `knowsAbout`, credential, membership, or broad content inventories.

### 10.3 Relevance closure

Use relation classes rather than one global traversal allow-list:

- **identity kernel relations**: stable Person identity only;
- **page relations**: page/mainEntity/breadcrumb/about/mentions;
- **content relations**: acceptedAnswer, visible media, citations;
- **topical relations**: only edges rooted in route-specific topic nodes;
- **global relations**: excluded by default on focused pages unless explicitly required by a selected route node.

Do not set a target node count. Tests must assert topical relevance and absence of known unrelated global fan-out, not arbitrary graph-size ceilings.

## 11. Machine discovery and dataset metadata

### Croissant 1.1

Preserve Croissant and strengthen it as a first-class dataset description. The current standard supports machine-actionable provenance via PROV-O, versioning, file checksums, semantic interoperability, and record-level structure.

Croissant output should include, where supported by the local dataset model:

- stable dataset identity;
- version/release;
- creator/publisher;
- license;
- date published/modified semantics;
- distribution checksums and sizes;
- RecordSet/Field definitions for exported tables;
- provenance/derivation links to canonical graph and retrieval/fact resources.

### Data Package

Preserve the richer integrity stats already added in Experiment and restore useful descriptive metadata. It remains a deterministic catalog view, not an authority-ranking mechanism.

### DCAT / VoID

Keep as standards-based dataset/catalog projections. Prefer named stable IRIs for major dataset/distribution entities. Link release/version/provenance where appropriate.

### Linkset / knowledge XML / `index.md`

Keep only as deterministic compatibility/discovery views. They may not own independent facts.

### `llms.txt` / `llms-full.txt`

Keep as compatibility/agent-retrieval surfaces because they are cheap to generate, but do not treat them as a primary Google/Search ranking lever. They must derive from the same retrieval/canonical corpus and cannot drift from it.

## 12. Representation and release integrity

Extend release lineage so a sealed release can answer:

- Which source commit generated this release?
- Which canonical graph semantic fingerprint/hash was used?
- Which retrieval/provenance/fact projections were generated from it?
- Which exact bytes were finally published?

The release contract should include:

- source commit;
- release date/version;
- canonical semantic fingerprint/hash;
- retrieval corpus hash(es);
- fact-map hash;
- provenance graph hash;
- canonical fact export hash;
- package lock hash;
- SBOM reference;
- byte-level integrity manifest.

Avoid self-referential hashing cycles by establishing an explicit generation order and excluding a manifest from hashing itself where necessary.

## 13. Determinism

For identical source commit, dependency lockfile, and release inputs:

- repeated materialization must produce byte-identical deterministic resources where current contracts require it;
- semantic fingerprints must remain stable;
- no generated timestamp may introduce build-to-build drift unless it represents canonical authored data;
- ordering of nodes, records, evidence, fields, and catalog resources must be deterministic.

## 14. Testing strategy

Implementation follows test-driven development for the new behaviors.

### 14.1 Retrieval regression tests

Add failing tests that prove current output is insufficient, then implement until they pass:

- exact answer source URL must not collapse to the generic home `/webpage` when a route-specific URL exists;
- every answer/fact-map record has a stable passage/source identity and hashes;
- text and JSON projections agree on IDs/source/release semantics;
- repeated materialization is deterministic.

### 14.2 Provenance tests

- every retrieval record resolves to at least one passage provenance entity;
- every passage provenance entity resolves back to the canonical question/answer and exact source;
- hashes in provenance and fact map agree;
- existing Claim/OA/evidence-bundle semantics remain present.

### 14.3 Evidence tests

- assessment metadata that exists in the canonical graph survives into the evidence snapshot;
- tier, support relation, role, verification/live status, timestamp, and expected markers are preserved when present;
- unassessed evidence remains unassessed;
- self-attributed strong claims cannot pass a test asserting issuer/independent verification unless such evidence exists.

### 14.4 CSV/RDF tests

Keep the current semantic fingerprint equality contract. Add richer CSVW contract tests for version, dataset identity, primary key, column descriptions, and provenance links.

### 14.5 Focused JSON-LD tests

For representative routes such as Botox, filler, and a multilingual/guide route:

- canonical Person is present;
- page/main entity/topic/visible Q&A/media are present;
- the page does not recursively include unrelated site-wide services/content merely through global Person fan-out;
- route-specific evidence/credential nodes remain present when directly relevant;
- Home still equals the full canonical graph semantically.

### 14.6 Release integrity tests

- canonical semantic hash/fingerprint and projection hashes are present in release provenance;
- sealed byte hashes remain correct;
- rerunning seal/materialization on the same inputs remains deterministic;
- no integrity manifest hashes itself.

### 14.7 Full verification gate

At minimum, completion requires successful execution of the existing relevant scripts, including the V2 suite, build, finalization/sealing path, and DIST verification. Any existing regression introduced by this work is a blocker.

## 15. Implementation boundaries

Primary expected touch points:

- `src/lib/machine-output.mjs`
- route/page discovery and JSON-LD projection logic in `src/pages/index.astro`
- `infrastructure/materialize-machine-resources.mjs`
- `infrastructure/seal-release.mjs`
- machine/provenance/semantic/integrity test files
- canonical source only when required to expose existing semantics cleanly; avoid duplicating facts

Do not perform broad unrelated refactors of the multi-megabyte canonical source during this change. A future decomposition can be planned separately after semantic behavior is stable.

## 16. Migration order

1. Add regression tests for retrieval source/provenance/evidence and focused-page fan-out.
2. Introduce shared deterministic retrieval records.
3. Rebuild `answers.txt` and `fact-map.json` on the shared records.
4. Expand passage-level provenance and merge with existing claim/evidence semantics.
5. Upgrade evidence snapshot projection using existing verification/assessment data.
6. Enrich CSVW and dataset metadata without breaking RDF equivalence.
7. Replace focused-page global relation traversal with route/topical relevance closure while preserving the Person kernel.
8. Extend Croissant/Data Package/DCAT/release lineage.
9. Run full semantic, machine, rendering, routing, integrity, release, build, seal, and DIST verification.
10. Compare the resulting DIST against both the pre-change experiment DIST and Main on the exact previously identified metrics.

## 17. Acceptance review

The change is not accepted merely because tests pass. The final generated DIST must also be inspected directly for:

- answer/fact-map provenance richness;
- provenance graph breadth and semantics;
- evidence-verification fidelity;
- fact portability;
- topical focused-page graph quality;
- absence of representation drift;
- unchanged route corpus coverage;
- deterministic integrity/version lineage.

The final comparison must explicitly report where the new Experiment exceeds both its pre-change state and Main, and identify any remaining bottleneck that cannot be solved by first-party code alone, particularly missing issuer-controlled or independent corroboration for strong authority claims.

## 18. External technical basis

The design aligns with current Astro static/prerender build behavior: deterministic route-specific projections belong at build/prerender time rather than depending on runtime mutation.

Croissant 1.1 explicitly supports dataset versioning, file checksums, PROV-O provenance, semantic interoperability, and machine-actionable lineage. DCAT 3 likewise distinguishes datasets from distributions and supports versioning/provenance via complementary PROV-O/VoID semantics. These standards justify strengthening the existing dataset/catalog outputs while keeping them subordinate to one canonical truth.
