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

The homepage exposes a bounded 85-node initial JSON-LD projection. The complete 1,600-node canonical graph remains in its inert `canonical-entity-graph` JSON container and at `/graph.jsonld`. The 72 authored pages retain their own metadata and route-specific schemas, including dedicated `Article` entities on 63 clinical-guide pages. Structured-data recognition and search indexing are separate observations; this architecture makes no indexing guarantee.

## Source checkpoint

The cleaned source is frozen by annotated tag `source-frozen-2026-10-24`; `main` is the working branch. The pre-cleanup source, including removed internal reports, is recoverable from `archive/source-before-cleanup-20261024`.

A source tag identifies repository contents. It does not deploy the website, create a dataset version or change the source identity of published bytes. See [maintenance and recovery](docs/maintenance-release.md) for the exact public cohort and [DOI policy](docs/doi-policy.md) for identifier roles.

## Local build

Use the Node version in `.nvmrc` and the committed npm lockfile. For a future authorized local build:

```sh
npm ci
ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 npm run build
```

The output is generated under `dist/`; it is not committed. Preserve the published scientific archive source pin while recording any new website build source separately. Housekeeping does not rebuild, deploy or republish platform packages. Publication workflows are manual `workflow_dispatch` operations with their existing validation; no additional approval requirement is introduced.
