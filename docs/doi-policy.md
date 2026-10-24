# DOI and provenance policy

The identifier policy is defined in `src/canonical/doi-policy.json`. Website generation reads it through `src/lib/doi-policy.mjs`; platform packaging reads it through `.github/scripts/platform_bundle.py`.

| Role | Identifier | Use |
| --- | --- | --- |
| Public collection | `10.5281/zenodo.18765168` | Persistent collection and latest-version entry point |
| Exact archive | `10.5281/zenodo.23474664` | Published record, packaging `1.3.4+zenodo.3` |
| Record-specific download | `https://zenodo.org/records/23474664/files/…` | A named archive file, verified by checksum |
| Canonical dataset | `https://www.ghezelbaash.ir/graph.jsonld/dataset` | Stable identity shared by dataset projections |

The physician, clinic, canonical dataset, collection and exact archive are distinct resources. Keep version relations such as `dcterms:hasVersion` and `dcterms:isVersionOf`; do not make a DOI `sameAs` the physician or clinic. General public links may use the collection DOI while reproducible citations select the exact archive and its packaging version.

## Source identities

The published scientific archive source is `ed767f6e6726e1453196e2ec2b312fcad00677e2`. The current website payload source is `0f72c5e6ef832adef66d003069e3e3c189cf5079`; later technical distribution corrections retain the original scientific provenance. Each platform package records its own source and public revision. See [the frozen cohort](maintenance-release.md) for the exact Hugging Face and Kaggle identities.

A repository tag or housekeeping commit identifies source contents, not a platform publication. Future builds must set `ARCHIVE_SOURCE_COMMIT` to the published scientific source while recording their actual build source separately. `PREPARE_RESERVED_DOI` belongs to first-publication preparation and must not relabel this published archive.

## Publication and preservation

Preserve historical citations, original scientific resources and `upstream/` provenance in their recorded scope. Keep original training messages intact. A technical same-record correction must preserve the DOI and scientific baseline, use a reviewed frozen target, and verify the actual public files after publication. Metadata corrections use the same record where supported. A genuinely new archive edition must reserve its real DOI before generating record-bound files.

Retained manually dispatched controllers cover coordinated releases, mutable distribution updates, same-DOI file correction and metadata maintenance. Select the appropriate operation after checking current public state; historical plan constants are not live-state evidence. Publication consumes verified frozen packages without rebuilding between platform steps. Public downloaded bytes, exact dataset revisions and actual notebook execution establish the resulting alignment.

The `source-frozen-2026-10-24` housekeeping checkpoint creates no new DOI, dataset version or publication claim. Its recovery and maintenance rules are in [maintenance and source freeze](maintenance-release.md).
