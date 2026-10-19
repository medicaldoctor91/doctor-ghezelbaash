# Dataset DOI roles and release procedure

The sole policy source is `src/canonical/doi-policy.json`. Website graph/discovery generators, package cards, citations, release receipts, query projections, archive descriptors and publication tools read it. `src/lib/doi-policy.mjs` applies the policy before website generation; `.github/scripts/platform_bundle.py` renders platform projections.

| Role | Identifier | Meaning |
| --- | --- | --- |
| general | 10.5281/zenodo.18765168 | Public collection; entry point for latest version |
| current_exact | 10.5281/zenodo.23474664 | Reproducible 1.3.4+zenodo.3 archive |
| historical | Registry `historical` | Original release and source-code identifiers, with original version/provenance |
| download_binding | `/records/23474664/files/…` | Actual immutable archived file, never the concept resolver |

The canonical Dataset IRI, physician, clinic, collection DOI entity and exact archive DOI entity are separate resources. Use `dcterms:hasVersion` and `dcterms:isVersionOf` for release bindings. Do not assert `dcat:hasCurrentVersion` or verified availability for an unpublished reserved archive. Frozen text describes the release binding and remains true before and after publication; external receipts establish availability. Never make them `sameAs` a person or clinic. Source `GITHUB_SHA` is injected at build time and recorded in receipts, avoiding a self-referential commit hash.

The prior dataset 23463840 is immutable history. The necessary replacement was reserved once as 23474664 before generating final paths. Do not call `reserve` for routine rebuilds or retry an ambiguous creation or publication. Inspect the existing draft/record. The legacy standalone publishing workflow is retired; only the coordinated candidate path may be used.

The archive preserves old `upstream/` descriptors/receipts verbatim. Their original download paths and exact DOIs describe historical inputs. Original training messages retain their historical statements. All current `archive_version_doi` query fields are generated from the central exact DOI. The five root archive descriptors are regenerated to use the new record's actual file paths; the public collection URL is separately exposed in metadata and README. ZIP self-checksum is external in the publication receipt; the internal checksum list excludes itself.

Use only `coordinated-doi-release.yml` for this reserved release. The old sequence (archive publication followed by newly generated site/HF/Kaggle packages and a metadata finish) is superseded. The coordinated preflight builds the website, HF candidate and actual local Git commit, Kaggle version with that exact HF commit, final pinned notebook and Zenodo payload before any irreversible platform publication. All candidate bytes are recorded in `frozen-sha256.json`; publication reads those directories without rebuilding. Platform-specific descriptors/cards/receipts have an explicit difference inventory. Build provenance identifies the source commit; timestamped preflight and publication evidence remains external to payloads. The actual locally constructed HF Git object is pushed unchanged, avoiding a guessed future SHA or a self-referential package. Notebook execution evidence must match the expected public version/source and exact frozen input checksum, so an older COMPLETE status cannot establish success. No post-publication metadata finish is used.

Verification: Node source tests, Python DOI negative tests (stale current DOI and missing concept), platform bundle tests, graph JSON-LD/Turtle/CSV isomorphism, inline JSON-LD consistency, SHACL union, exact Croissant CSV extraction, all five Parquet source round trips, checksum inventories, public notebook COMPLETE and fresh public platform bytes. Added DOI metadata changes the graph from 22,149 to 22,221 triples; clinical passage/answer/query/message counts remain unchanged.

## Publication incident and necessary replacement

Record 23473947 (1.3.4+zenodo.2) was published while a GitHub cancellation request was pending. A final audit had detected one PropertyValue still labelled `Current preserved release DOI (1.3.3)`. The cancellation did not prevent publication. That immutable record is retained as historical; replacement 23474664 was separately reserved with its actual DOI, and the additional current-label validator now runs both during archive construction and immediately before upload/publication. No published payload was overwritten. The original intended single new version was therefore insufficient; the second version corrects this concrete detected defect.

## Reviewed candidate protocol (schema 2)

The replacement candidate uses HF parent `5d9cdf066a6cb63b59fc27c4d2ef70a44bceed06`, Kaggle public 22 → planned 23 and notebook public 8 → planned 9. Input baselines identify historical source inputs, not a claim of newly published output. Preflight never uploads payloads or publishes the reserved draft. Schema-1/source-14304eb candidates are rejected before publication.

CSV writers emit LF before checksumming. vCard CRLF is preserved with `*.vcf -text`. After `git add`, every staged index path is compared against frozen stage bytes. LFS pointer SHA256/size and local object content are checked against logical payload; a pointer is not compared to the Parquet/media bytes as if it were the payload. No path/hash mismatch exception is permitted. The Git transport attributes are part of the candidate manifest.

For the coordinated candidate, `buildSource`/`build_source_*` identify source inputs; `releaseCohort` identifies the exact reserved DOI. Publication-run fields are absent until real external publication receipts exist. `publicationScope` is the intended cohort, `archivedSnapshotsUpdated=false` means no historical published snapshot is rewritten, and `archiveBindingStatus` explicitly states reserved binding, not verified publication. Historical software archives remain historical. No later receipt is inserted into frozen bytes.

This implementation checkpoint permits source changes, tests and a frozen preflight artifact only. Public publication remains disabled pending review of that concrete candidate.
