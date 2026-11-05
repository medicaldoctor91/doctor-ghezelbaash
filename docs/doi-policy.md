# DOI and provenance policy

The identifier policy is defined in `src/canonical/doi-policy.json`. Website generation reads it through `src/lib/doi-policy.mjs`; platform packaging reads it through `.github/scripts/platform_bundle.py`.

| Role | Identifier | Use |
| --- | --- | --- |
| Public collection | `10.5281/zenodo.18765168` | Persistent collection and latest-version entry point |
| Exact archive | `10.5281/zenodo.23965042` | Assigned release binding, packaging `1.3.5+zenodo.1`; availability is recorded in publication receipts |
| Record-specific download | `https://zenodo.org/records/23965042/files/…` | A named archive file, verified by checksum during staging and public verification |
| Previous archive | `10.5281/zenodo.23474664` | Historical packaging `1.3.4+zenodo.3`, with its own unchanged provenance and files |
| Canonical dataset | `https://www.ghezelbaash.ir/graph.jsonld/dataset` | Stable identity shared by dataset projections |

The physician, clinic, canonical dataset, collection and exact archive are distinct resources. Keep version relations such as `dcterms:hasVersion` and `dcterms:isVersionOf`; do not make a DOI `sameAs` the physician or clinic. General public links may use the collection DOI while reproducible citations select the exact archive and its packaging version.

## Source identities

The previous archive `23474664` records scientific source `ed767f6e6726e1453196e2ec2b312fcad00677e2` and technical delivery source `0f72c5e6ef832adef66d003069e3e3c189cf5079` as separate roles. Those historical values remain unchanged. The new edition derives its source from the exact reviewed management/build commit M in the external release plan. The live website's `release-provenance.json` and platform publication receipts identify actual deployed revisions; a historical delivery commit is not a claim about the current website.

A repository tag identifies source contents; publication is established separately. New-edition builds select the reviewed `RELEASE_PLAN_PATH`, leave `ARCHIVE_SOURCE_COMMIT` unset and set `PREPARE_RESERVED_DOI` to the real reserved record. Published maintenance selects that edition's reviewed maintenance plan and pins its recorded M, with preparing mode empty. Historical verification supplies the captured historical policy explicitly. Never inherit an older edition's scientific source pin into a new record. See [the three source contexts](coordinated-release-plan.md#three-source-contexts).

## Publication and preservation

Preserve historical citations, original scientific resources and `upstream/` provenance in their recorded scope. Keep original training messages intact. A technical same-record correction must preserve the DOI and scientific baseline, use a reviewed frozen target, and verify the actual public files after publication. Metadata corrections use the same record where supported. A genuinely new archive edition must reserve its real DOI before generating record-bound files.

Retained manually dispatched controllers cover coordinated releases, mutable distribution updates, same-DOI file correction and metadata maintenance. Select the appropriate operation after checking current public state; historical plan constants are not live-state evidence. Publication consumes verified frozen packages without rebuilding between platform steps. Public downloaded bytes, exact dataset revisions and actual notebook execution establish the resulting alignment.

Earlier housekeeping checkpoints retain their original source and publication meanings. The current application checkpoint and separate management child are recorded in [source freeze](source-freeze.md); historical recovery evidence remains in [maintenance and source freeze](maintenance-release.md).
