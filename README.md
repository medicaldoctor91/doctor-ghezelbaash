# Dr. Saeed Ghezelbash — production source

Static-only Astro source for the canonical physician entity home at `https://www.ghezelbaash.ir/`. The build renders one public HTML mega-landing, a real 404 page and synchronized machine-readable representations of the same physician, clinic, medical content and provenance data. Cloudflare Pages serves static assets only; the clinic Google Maps rating and public review count are validated on a bounded six-hour GitHub Actions schedule and materialized into the initial HTML without a request-time Function or browser fetch.

## Direct source ownership

The repository structure itself is authoritative; it is not reconstructed from a second topology manifest or from corrective overlays.

- `src/content-source/page.md`: canonical visible content and page metadata.
- `src/styles/global.css`: the only shared authored stylesheet for the canonical page; the genuine 404 may keep route-scoped component styling.
- `src/data/semantic/knowledge-graph.jsonld`: canonical knowledge graph and the direct source of offered services and answers.
- `src/data/semantic/head-profile.json`: Google head projection selection, policies and byte limit.
- `src/data/semantic/support-profile.json`: Google support projection selection, policies and byte limit.
- `src/data/document-head.json`: Open Graph, Twitter and application presentation metadata.
- `src/data/release.json`: canonical URL, physician and clinic identifiers, current release and DOI lineage.
- `src/data/release-invariants.json`: explicit delivery and validation limits.
- `src/data/reputation-observation.json`: the clinic-scoped, last-known-good Google Places observation rendered into initial HTML.
- `src/data/machine-resources.json`: one registry for website, Hugging Face, Zenodo, head and footer projections.
- `src/data/redirects.json`: one registry for canonical aliases, Cloudflare host redirects and GitHub Pages bridges.
- `src/data/retrieval/query-matrix-policy.json`: explicit intent-to-answer mappings, languages, scopes and evidence bounds.
- `src/data/evidence-registry.json`: canonical evidence source for the generated release snapshot.
- `src/data/render-calibration.json`: measured chunk geometry used to derive responsive calibration CSS.
- `public/media/`, `src/data/media-metadata.json` and `src/data/media-dimensions.tsv`: canonical media, standards-based authored metadata and intrinsic dimensions.

The physician uses one canonical ID with `Person` and `IndividualPhysician` types. The clinic, `ProfilePage`, 18 `WebPageElement` sections, medical procedures, answers, images, videos, credentials and external identifiers all reference that graph. DOM Microdata and both inline JSON-LD projections are derived from the same graph and projection profiles.

## Build flow

`npm run prepare:site` creates only the content, graph, and CSS assets Astro needs for local development and type checking. `npm run prepare:distribution` recreates the complete machine-readable distribution for builds and releases. Astro renders native static HTML directly, the registered static resources are materialized into `dist/`, and the deployment-header step derives CSP and response headers while validating the finished descriptor hashes. Generated files are not committed.

CSS delivery is derived directly from `global.css` and `render-calibration.json`: critical rules remain inline and the rest is emitted as one fingerprinted stylesheet. HTML content stays readable in `page.md`; canonical assembly compacts only structural whitespace and binds release, site, language, image, semantic and clinic-reputation tokens. `.github/workflows/reputation-refresh.yml` performs exactly one minimal-field Google Places request every six hours, preserves the last-known-good observation on failure and publishes only a validated value change.

Dependency restoration and dependency advisory review are separate first-class stages. `dependencies:install` restores the exact lockfile without an implicit advisory request; `security:dependencies` performs the single explicit fail-closed high-severity audit.

```bash
npm run dependencies:install
npm run security:dependencies
npm run build
```

Useful commands:

```bash
npm run check
npm run security:dependencies
npm run validate:source
npm run validate:media
npm run render:calibration:update -- path/to/chromium-measurements.json
npm run verify:production -- https://www.ghezelbaash.ir/
```

## Release and deployment

```bash
npm run release
```

The website deploys a static-only `dist/` on Cloudflare Pages from `main`. The production contract requires `uses_functions === false`, no dynamic routes and no runtime bindings. Runtime, automation and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json`, CodeMeta and the scheduled reputation workflow.
