# Dataset DOI roles and release procedure

The sole policy source is `src/canonical/doi-policy.json`. Website graph/discovery generators, package cards, citations, release receipts, query projections, archive descriptors and publication tools read it. `src/lib/doi-policy.mjs` applies the policy before website generation; `.github/scripts/platform_bundle.py` renders platform projections.

| Role | Identifier | Meaning |
| --- | --- | --- |
| general | 10.5281/zenodo.18765168 | Public collection; entry point for latest version |
| current_exact | 10.5281/zenodo.23473947 | Reproducible 1.3.4+zenodo.2 archive |
| historical | Registry `historical` | Original release and source-code identifiers, with original version/provenance |
| download_binding | `/records/23473947/files/…` | Actual immutable archived file, never the concept resolver |

The canonical Dataset IRI, physician, clinic, collection DOI entity and exact archive DOI entity are separate resources. Use `dcat:hasCurrentVersion` and `dcterms:isVersionOf` for collection/archive relationships. Never make them `sameAs` a person or clinic. Source `GITHUB_SHA` is injected at build time and recorded in receipts, avoiding a self-referential commit hash.

The prior dataset 23463840 is immutable history. The necessary replacement was reserved once as 23473947 before generating final paths. Do not call `reserve` for routine rebuilds or retry an ambiguous creation or publication. Inspect the existing draft/record. `doi-release.yml` builds and validates the reviewed commit, uploads only to the reserved draft, publishes once, downloads every standalone file and ZIP, checks SHA256/MD5 and ZIP checksums, validates the archive again using actual public URLs, and checks that the previous record did not change.

The archive preserves old `upstream/` descriptors/receipts verbatim. Their original download paths and exact DOIs describe historical inputs. Original training messages retain their historical statements. All current `archive_version_doi` query fields are generated from the central exact DOI. The five root archive descriptors are regenerated to use the new record's actual file paths; the public collection URL is separately exposed in metadata and README. ZIP self-checksum is external in the publication receipt; the internal checksum list excludes itself.

After archive publication, deploy the same reviewed source through `machine-readable-interop.yml`, then publish HF/Kaggle with `platform-machine-readable-sync.yml`. Finally `doi-finish.yml` executes the packaged notebook, whose runtime assertions bind its input to the exact Kaggle version/HF SHA/website SHA, and edits only mutable metadata of the current archive. Historical Zenodo templates are not a current metadata source. `platform-convergence.yml` and the old in-place archive publisher are retired.

Verification: Node source tests, Python DOI negative tests (stale current DOI and missing concept), platform bundle tests, graph JSON-LD/Turtle/CSV isomorphism, inline JSON-LD consistency, SHACL union, exact Croissant CSV extraction, all five Parquet source round trips, checksum inventories, public notebook COMPLETE and fresh public platform bytes. Added DOI metadata changes the graph from 22,149 to 22,221 triples; clinical passage/answer/query/message counts remain unchanged.
