# Saeed Ghezelbash — website and dataset source

This repository contains the authored website for **Saeed Ghezelbash / سعید قزلباش**, its canonical linked data, and the tools that maintain its coordinated Hugging Face, Kaggle and Zenodo distributions.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/canonical/` | Authored content, complete graph, query corpus, platform templates and central DOI policy |
| `src/lib/` | HTML, search-schema, machine-resource and dataset projections |
| `src/pages/` | Astro routes and discovery endpoints |
| `public/` | Licensed media, fonts, icons and static assets |
| `build/` | Materialize resources, finalize delivery headers and seal output checksums |
| `.github/scripts/` | Package construction, validation and coordinated publication |
| `.github/workflows/` | Explicitly dispatched maintenance and publication entrypoints |
| `tests/` | Source, schema, package, provenance and preservation contracts |

The homepage exposes a bounded initial JSON-LD projection. The complete canonical graph is available in its inert `canonical-entity-graph` JSON container and at `/graph.jsonld`. The 72 authored pages retain their own metadata and route-specific schemas. Clinical guides have dedicated `Article` entities, and the physician-owned practice has a separate practice profile. Structured-data recognition and search indexing are separate observations.

## Source checkpoint

Read the selected Dataset/source version, archive packaging version and exact DOI from the approved release plan’s `policy.currentArchive` fields. The protected positioning corpus has its own version, recorded in `positioningCorpusRelease`. The application checkpoint and its separate management/build child are recorded in [source freeze](docs/source-freeze.md); release builds use the exact reviewed management tag and external plan. A default-branch merge is not relabelled as that build source. Earlier frozen and archive refs retain their original contents.

A source tag identifies repository contents. Platform publication and execution receipts establish live availability. See the [coordinated release contract](docs/coordinated-release-plan.md), [historical maintenance and recovery](docs/maintenance-release.md) and [DOI policy](docs/doi-policy.md) for the separate source, collection, snapshot and provider-version roles.

## Local build

Use the Node version in `.nvmrc`, the committed npm lockfile and the exact reviewed management checkout selected by the real reserved-edition plan:

```sh
npm ci
unset ARCHIVE_SOURCE_COMMIT
export RELEASE_PLAN_PATH=/absolute/path/to/approved-release-plan.json
python3 .github/scripts/release_plan.py --check-checkout
PREPARE_RESERVED_DOI="$(python3 -c 'import json, os; print(json.load(open(os.environ["RELEASE_PLAN_PATH"]))["reservation"]["reservedRecord"])')"
export PREPARE_RESERVED_DOI
npm run build
```

The output is generated under `dist/`; it is not committed. The plan validates the real DOI, C/M lineage, exact source/tool inventory and measured counts. Never inherit a previous archive's source pin into a new reserved edition. After publication, maintenance uses the published edition's reviewed `published-maintenance` plan and its recorded source pin, with preparing mode empty. The old scientific source remains historical provenance. Publication workflows are manual `workflow_dispatch` operations; see the release contract for their ordered validation and recovery.
