# Dr. Saeed Ghezelbash — production source

Canonical Astro source for <https://www.ghezelbaash.ir/>.

The repository builds a static-only website: one canonical human-facing mega-landing page, a genuine 404 page, and the machine-readable resources intentionally published alongside the site. Cloudflare Pages serves static assets only; there is no request-time application server.

## Architecture

The production build is deliberately small and deterministic:

1. reset the generated workspace;
2. generate the RDF serialization;
3. generate the website/distribution projections;
4. generate retrieval projections and dataset descriptors;
5. build Astro's static routes;
6. materialize registered static resources, redirects and stable media aliases;
7. materialize the IndexNow verification key;
8. derive deployment headers from the finished HTML and resource registry.

Validation experiments, historical development gates and browser calibration tooling are not part of the production build. Output-producing source is kept separate from operational verification and external publication workflows.

## Canonical source ownership

- `src/content-source/page.md` — authored visible mega-landing content.
- `src/styles/global.css` — authored stylesheet.
- `src/data/semantic/knowledge-graph.jsonld` — canonical entity graph and semantic facts.
- `src/data/semantic/head-profile.json` — inline head graph projection policy.
- `src/data/semantic/support-profile.json` — inline support graph projection policy.
- `src/data/semantic/shapes.ttl` — published SHACL resource; it is part of the distribution even though SHACL validation is not required by the normal build.
- `src/data/release.json` — release/distribution lifecycle and canonical entity pointers.
- `src/data/machine-resources.json` — authoritative registry of machine-readable resources and publication targets.
- `src/data/redirects.json` — redirect registry used by the static materializer and bridge tooling.
- `src/data/retrieval/query-matrix-policy.json` — retrieval projection policy.
- `src/data/evidence-registry.json` — evidence source used by generated projections.
- `src/data/render-calibration.json` — production input used to generate responsive calibration CSS. It is not merely a test snapshot and must remain synchronized with the shipped layout.
- `src/data/stable-media-aliases.json` and `public/media/` — stable media delivery aliases and the media files they expose.
- `src/data/templates/` — templates used to generate public machine/discovery resources and deployment headers.

Generated work belongs under `.generated/` or `dist/` and is not committed as authored source.

## Build

Prerequisites are pinned by `.nvmrc`, `package.json`, and `package-lock.json`.

```bash
npm ci
npm run build
```

The normal build does not launch a browser, mutate external services, publish a release, or deploy the site.

For local development and Astro checking:

```bash
npm run dev
npm run check
```

## Distribution invariance

Source maintenance is expected to preserve the emitted distribution unless a distribution change is explicitly intended. For refactors and cleanup work, compare the complete `dist/` file set and SHA-256 of every emitted file against the accepted baseline; a successful build alone is not proof of equivalence.

`src/data/render-calibration.json`, `src/data/semantic/shapes.ttl`, the machine-resource registry, generated RDF/projections, static materialization and deployment-header generation are all output-producing inputs and must not be removed merely because related validation tooling is unnecessary.

## Deployment and external surfaces

Production delivery uses the native Cloudflare Pages Git integration on the dedicated `production` branch. `main` is intentionally decoupled from live deployment, so source maintenance on `main` does not change the canonical website until an explicit release promotion advances `production`. Operational automation is kept in `.github/workflows/` and is intentionally separate from the static build:

- `github-pages-bridge.yml` — publishes the canonical GitHub Pages redirect bridge from the frozen `production` source.
- `hugging-face-authority.yml` — runs the shared read-only maintenance verification twice weekly, or explicitly publishes a coordinated new release.
- `authority-maintenance.yml` — proves complete DIST identity against frozen production, reconciles Cloudflare and the Hugging Face organization profile, and verifies the current immutable release. It runs when its operational source changes on `main`, through the shared scheduled verification, or manually (verification only unless `apply` is selected). It also verifies immutable deployment bytes and stable media aliases; a duplicate Cloudflare workflow is unnecessary. It never promotes `main` or creates a DOI.

Release, Zenodo and Hugging Face publication are explicit operations; `npm run build` does not perform them.

The release transaction reconciles the Cloudflare edge and purges stale release objects before checking public bytes. It also advances the organization profile's current Version DOI and submits the canonical URL to IndexNow after the public checks pass. These steps run within the release transaction because a `GITHUB_TOKEN` push does not trigger the separate production-push workflows.

## Release and provenance

The canonical human page, JSON-LD/RDF graph, retrieval resources and external release surfaces represent distinct but related artifacts. `src/data/release.json`, `CITATION.cff`, `codemeta.json`, the Git tag, Zenodo version DOI and Hugging Face release state must be reconciled when an actual release is promoted.

Useful operational commands include:

```bash
npm run security:dependencies
npm run validate:release-contract
npm run verify:production
npm run verify:public-discovery
npm run verify:mojavez
```

`npm run release` is an explicit release operation. Do not use it as a substitute for an ordinary production build.

## Entity scope

The physician is the primary canonical entity. The clinic is a distinct related entity and must not be merged semantically with the physician. Public structured data, machine-readable resources and external authority surfaces should remain consistent with the canonical graph and with visible claims.

`main` and `production` are protected against deletion and force-push. Normal maintenance remains possible on `main`; only an explicitly verified release advances `production`. Published release tags and assets remain immutable.

Repository metadata and first-party publication are provenance and identity signals; they are not presented as independent third-party corroboration.
