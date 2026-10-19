# Dataset DOI roles and release procedure

The sole policy source is `src/canonical/doi-policy.json`. Website graph/discovery generators, package cards, citations, release receipts, query projections, archive descriptors and publication tools read it. `src/lib/doi-policy.mjs` applies the policy before website generation; `.github/scripts/platform_bundle.py` renders platform projections.

| Role | Identifier | Meaning |
| --- | --- | --- |
| general | 10.5281/zenodo.18765168 | Public collection; entry point for latest version |
| current_exact | 10.5281/zenodo.23474664 | Reproducible 1.3.4+zenodo.3 archive |
| historical | Registry `historical` | Original release and source-code identifiers, with original version/provenance |
| download_binding | `/records/23474664/files/…` | Actual immutable archived file, never the concept resolver |

The canonical Dataset IRI, physician, clinic, collection DOI entity and exact archive DOI entity are separate resources. Use `dcat:hasCurrentVersion` and `dcterms:isVersionOf` for collection/archive relationships. Never make them `sameAs` a person or clinic. Source `GITHUB_SHA` is injected at build time and recorded in receipts, avoiding a self-referential commit hash.

The prior dataset 23463840 is immutable history. The necessary replacement was reserved once as 23474664 before generating final paths. Do not call `reserve` for routine rebuilds or retry an ambiguous creation or publication. Inspect the existing draft/record. `doi-release.yml` builds and validates the reviewed commit, uploads only to the reserved draft, publishes once, downloads every standalone file and ZIP, checks SHA256/MD5 and ZIP checksums, validates the archive again using actual public URLs, and checks that the previous record did not change.

The archive preserves old `upstream/` descriptors/receipts verbatim. Their original download paths and exact DOIs describe historical inputs. Original training messages retain their historical statements. All current `archive_version_doi` query fields are generated from the central exact DOI. The five root archive descriptors are regenerated to use the new record's actual file paths; the public collection URL is separately exposed in metadata and README. ZIP self-checksum is external in the publication receipt; the internal checksum list excludes itself.

Use only `coordinated-doi-release.yml` for this reserved release. The old sequence (archive publication followed by newly generated site/HF/Kaggle packages and a metadata finish) is superseded. The coordinated preflight builds the website, HF candidate and actual local Git commit, Kaggle version with that exact HF commit, final pinned notebook and Zenodo payload before any irreversible platform publication. All candidate bytes are recorded in `frozen-sha256.json`; publication reads those directories without rebuilding. Platform-specific descriptors/cards/receipts have an explicit difference inventory. Build provenance identifies the source commit; timestamped preflight and publication evidence remains external to payloads. The actual locally constructed HF Git object is pushed unchanged, avoiding a guessed future SHA or a self-referential package. Notebook execution evidence must match the expected public version/source and exact frozen input checksum, so an older COMPLETE status cannot establish success. No post-publication metadata finish is used.

Verification: Node source tests, Python DOI negative tests (stale current DOI and missing concept), platform bundle tests, graph JSON-LD/Turtle/CSV isomorphism, inline JSON-LD consistency, SHACL union, exact Croissant CSV extraction, all five Parquet source round trips, checksum inventories, public notebook COMPLETE and fresh public platform bytes. Added DOI metadata changes the graph from 22,149 to 22,221 triples; clinical passage/answer/query/message counts remain unchanged.

## Publication incident and necessary replacement

Record 23473947 (1.3.4+zenodo.2) was published while a GitHub cancellation request was pending. A final audit had detected one PropertyValue still labelled `Current preserved release DOI (1.3.3)`. The cancellation did not prevent publication. That immutable record is retained as historical; replacement 23474664 was separately reserved with its actual DOI, and the additional current-label validator now runs both during archive construction and immediately before upload/publication. No published payload was overwritten. The original intended single new version was therefore insufficient; the second version corrects this concrete detected defect.
