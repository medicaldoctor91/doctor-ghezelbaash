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

**Live 1.3.6 production architecture:** the homepage preserves the complete authored long-form content and publishes **all 1,916 canonical entities as one active** `<script id="canonical-entity-graph" type="application/ld+json">` in the document `HEAD` **before its title and visible text**. This active RDF is validated for semantic equivalence to `/graph.jsonld`. The 72 canonical page URLs retain their own metadata and route-specific schemas. Clinical guides have dedicated `Article` entities, and the physician-owned practice has a separate practice profile. The reviewed graph bytes also anchor the coordinated Hugging Face and Kaggle distributions; historical Zenodo archives remain immutable. Structured-data recognition, URL indexing and success of third-party validator tools are different measurements.

**Release source selection:** the currently published full-RDF site is produced from the reviewed `codex/full-rdf-jsonld-homepage-first-1-3-6` release line, not necessarily the repository default `main` branch. Before any deployment, read the live `/release-provenance.json`, check the exact deployed source commit, independently review the new source commit, and supply both SHAs to the explicit publication workflow. Automatic Cloudflare Git deployments stay disabled. A validator that refuses documents exceeding its own 2.5 MB input limit does not by itself establish invalid RDF or authorize reducing the long-form homepage or removing canonical entities. For lossless validation, use the RDF equivalence tests and the standalone `/graph.jsonld` resource.

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
