# Maintenance and source freeze

The source checkpoint is annotated tag `source-frozen-2026-10-24`. The pre-cleanup tree, including removed internal audit material, is retained at `archive/source-before-cleanup-20261024`. Keep these refs unchanged; use a new checkpoint for future work. `main` is the sole retained working branch after cleanup.

## Published cohort at the freeze

| Component | Published identity |
| --- | --- |
| Website | <https://www.ghezelbaash.ir/> |
| Website payload source | `0f72c5e6ef832adef66d003069e3e3c189cf5079` |
| Cloudflare Pages deployment | `a86aa67c-5d7d-426d-87b2-b11ce8bdef7f` |
| Hugging Face | `doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data` at `3cc04302a7adf0f8972d47a994cc48ce141ba6d1` |
| Kaggle dataset | `saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data`, version 32 |
| Kaggle notebook | `saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter`, version 16 |
| Zenodo archive | [10.5281/zenodo.23474664](https://doi.org/10.5281/zenodo.23474664), packaging `1.3.4+zenodo.3` |
| Zenodo collection | [10.5281/zenodo.18765168](https://doi.org/10.5281/zenodo.18765168) |
| Original scientific archive source | `ed767f6e6726e1453196e2ec2b312fcad00677e2` |

The source-cleanup commit and tag do not replace the website payload source or original scientific archive source. The same-record Zenodo technical correction preserves that scientific baseline and the existing DOI. Publication and execution receipts remain in their original GitHub Actions runs and pre-cleanup history.

At the freeze, primary Hugging Face Viewer flows and converted tables were verified; search/filter requests still had an unresolved provider-service failure. This source checkpoint is not a universal service-health or indexing guarantee.

## Preserve the delivery contract

Preserve authored content, stable Person/Clinic/Dataset identities, multilingual graph values, all positioning examples and the original 47 training-message arrays. Tests keep the original-message baseline under `tests/fixtures/`.

The homepage retains its bounded 85-node initial search projection and complete 1,600-node graph in inert JSON and `/graph.jsonld`. The 72 authored pages, their metadata and 63 clinical-guide Article schemas remain intact. Do not substitute the full graph for the initial projection without a separate verified compatibility change.

Housekeeping changes documentation, internal artifacts and Git refs only. It does not regenerate `dist/`, alter publication bytes or publish a new platform version. Cloudflare Git automatic deployment is disabled at this checkpoint. Re-read deployment controls before future pushes that could affect delivery.

## Recover and maintain

Inspect the frozen source or pre-cleanup material without moving the tags:

```sh
git show source-frozen-2026-10-24:README.md
git show archive/source-before-cleanup-20261024:README.md
```

Use existing frozen publication artifacts for exact restoration and verify their manifests before use. A new build records a new source identity and is not an exact restoration. Check GitHub artifact availability before planning recovery; a retained source tag does not retain expiring Actions artifacts.

Future builds use the pinned archive source:

```sh
ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 npm run build
```

Retained maintenance and release workflows run only through explicit `workflow_dispatch`. Keep their exact-source, checksum, public-revision and execution checks. Coordinate any necessary site/Hugging Face/Kaggle/Zenodo update using a reviewed frozen package and actual public verification. Source cleanup introduces no manual approval gate and changes no secrets, permissions, protections or publication controls.
