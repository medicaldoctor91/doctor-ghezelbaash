# Platform metadata alignment implementation plan

> **Execution:** Implement inline in this session using the existing publication workflow and its secret bindings.

**Goal:** Correct the five verified metadata inconsistencies and verify the live website, Hugging Face, Zenodo and Kaggle distributions.

**Architecture:** Keep the canonical graph as the source of website metadata. Generate publication metadata from measured table counts and the exact source/Hub revisions. Preserve existing Zenodo DOIs, versions, filenames, authorship and clinical content.

**Tech stack:** Astro/Node, Python, RDF/SHACL, GitHub Actions and existing publication APIs.

## Constraints and review focus

- Keep person, clinic and dataset identities distinct.
- Keep DOI 22838416 for data, DOI 23289009 for source; label the concept DOI as a release-family pointer.
- Retain unrelated metadata and historical provenance without describing old revisions as current.
- Validate omitted/null/empty fields and every Parquet source-row round trip.
- Never print secret values or alter access permissions; use the existing secret bindings only.
- Fail before publication when observed source/HF/Kaggle versions differ from the reviewed baseline.

## Task 1: Canonical release semantics

Files: `src/canonical/source.mjs`, `tests/platform-provenance.test.mjs`.

- [x] Add regression assertions for equivalent modification predicates, DOI role separation and maintenance-aware preservation wording; observe failure.
- [x] Correct the dataset's stale DCT modification date and the three immutable-preservation descriptions; update the dataset citation in the historical source-review node to the explicit dataset DOI.
- [x] Run the Node suite and verify the generated RDF/catalog dates agree.

## Task 2: Publication metadata

Files: `.github/scripts/platform_bundle.py`, `.github/scripts/platform_publish.py`, `tests/platform-bundle-sync.test.py`, `tests/platform-publication.test.py`.

- [x] Reproduce stale Kaggle subtitle and contradictory Zenodo current-revision descriptions in tests.
- [x] Generate the Kaggle subtitle from measured table counts; replace conflicting Zenodo release paragraphs with one current receipt and explicit historical links.
- [x] Use the proven current Zenodo draft-file streaming transport for source ZIP corrections and verify checksum before publishing.
- [x] Add bounded public metadata verification preserving DOI/version and creator/license information.

## Task 3: Release and verification

File: `.github/workflows/platform-alignment.yml`.

- [x] Run all source tests, build, RDF/SHACL and package validators locally.
- [x] Add a branch-bound workflow using the four existing secret bindings, exact upstream preconditions and the same canonical build for every platform.
- [ ] Push reviewed branch through the GitHub connector, observe the workflow, and repair any evidenced publication failure.
- [ ] Fetch live metadata and payload hashes; report actual final source/Hub/Kaggle revisions and any remaining blocker.
- [ ] Prepare the repository change for integration under the applicable PR policy.

## Execution record

- Regression tests were observed failing before their fixes.
- Node suite: 18/18; Python package suite: 5/5; Python publication suite: 8/8.
- Complete build, RDF union, 65 SHACL shapes, Croissant ingestion and descriptor integrity validation passed.
- Clinical passages, fact-map, answers and physician expertise brief retain their original bytes.
- Independent whole-branch review found three important issues; all received regression tests and fixes: guarded same-run resume, bounded Kaggle metadata visibility, and public Zenodo metadata/creator/license verification.
- Ruling: publication was explicitly authorized by the user, so prepare and publish from the dedicated maintenance branch; default-branch integration remains subject to the applicable PR landing policy.
- Deferred minor: the historical bucket command helper and source-upload function name remain for compatibility; they do not alter the current draft-file transport.
