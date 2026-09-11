# Dr. Saeed Ghezelbash — production source

Static-only Astro source for the canonical physician entity home at `https://www.ghezelbaash.ir/`. The build renders one public HTML mega-landing, a real 404 page and synchronized machine-readable representations of the same physician, clinic, medical content and provenance data. Cloudflare Pages serves static assets only; the clinic Google Maps rating and public review count are validated on a bounded six-hour GitHub Actions schedule and materialized into the initial HTML without a request-time Function or browser fetch.

## Direct source ownership

- `src/content-source/page.md`: canonical visible content and page metadata.
- `src/styles/global.css`: the only authored stylesheet.
- `src/data/semantic/knowledge-graph.jsonld`: canonical knowledge graph and the direct source of offered services and answers.
- `src/data/semantic/head-profile.json`: Google head projection selection, policies and byte limit.
- `src/data/semantic/support-profile.json`: Google support projection selection, policies and byte limit.
- `src/data/document-head.json`: Open Graph, Twitter and application presentation metadata.
- `src/data/release.json`: canonical URL, physician and clinic identifiers, current release and DOI lineage.
- `src/data/release-invariants.json`: explicit delivery and validation limits.
- `src/data/reputation-observation.json`: the clinic-scoped, last-known-good Google Places observation rendered into initial HTML.
- `src/data/machine-resources.json`: one registry for website, Hugging Face, Zenodo, head and footer projections.
- `src/data/redirects.json`: one registry for canonical aliases, Cloudflare host redirects and GitHub Pages bridges. The compiler emits both slash forms of each registered canonical directory alias with the same direct destination, rejects conflicting pairs and leaves unknown paths as 404.
- `src/data/retrieval/query-matrix-policy.json`: explicit intent-to-answer mappings, languages, scopes and evidence bounds.
- `src/data/evidence-registry.json`: canonical evidence source for the generated release snapshot.
- `src/data/render-calibration.json`: measured chunk geometry used to derive responsive calibration CSS.
- `public/media/`, `src/data/media-metadata.json` and `src/data/media-dimensions.tsv`: canonical media, standards-based authored metadata and intrinsic dimensions.

The physician uses one canonical ID with `Person` and `IndividualPhysician` types. The clinic, `ProfilePage`, 18 `WebPageElement` sections, medical procedures, answers, images, videos, credentials and external identifiers all reference that graph. DOM Microdata and both inline JSON-LD projections are derived from the same graph and projection profiles.

Mojavez record `19949827` is scoped to the physician's medical practice license, holder name and practice jurisdiction. The source observation and field-to-claim bindings are recorded in `.release/evidence/mojavez-19949827.json`; the historical evidence ID remains stable. This record does not explicitly establish ownership of the canonical Clinic. `npm run verify:mojavez` re-fetches the official record with no-cache headers and checks its visible labelled fields. It only reports; source or scope changes require a fresh review. A captured response can be checked with `npm run verify:mojavez -- --html /path/to/response.html`. Hermetic validators enforce the reviewed scope, subject, neutral title, URLs and projection selector; `npm run test:final-entity-contract` exercises their failure paths. These checks bind the observation to authored claims; CI does not independently certify the live source on every build.

The forbidden identifier guard inspects explicit canonical input families in `scripts/lib/active-identifier-contract.mjs`, including new authored files. Necessary validator/test literals have exact-path exceptions; migration history and release archives have explicit non-active boundaries. Generated files and dependencies are outside this authored-source check.

## Build flow

`npm run prepare:site` creates only the content, graph, and CSS assets Astro needs for local development and type checking. `npm run prepare:distribution` recreates the complete machine-readable distribution for builds and releases. Astro renders native static HTML directly, the registered static resources are materialized into `dist/`, and the deployment-header step derives CSP and response headers while validating the finished descriptor hashes. Generated files are not committed.

CSS delivery is derived directly from `global.css` and `render-calibration.json`: critical rules remain inline and the rest is emitted as one fingerprinted stylesheet. HTML content stays readable in `page.md`; canonical assembly compacts only structural whitespace and binds release, site, language, image, semantic and clinic-reputation tokens. `.github/workflows/reputation-refresh.yml` performs exactly one minimal-field Google Places request every six hours, preserves the last-known-good observation on failure and publishes only a validated value change.

```bash
npm ci
npm run security:dependencies
npm run build
```

Useful commands:

```bash
npm run check
npm run security:dependencies
npm run validate:source
npm run validate:media
npm run render:calibration:update
npm run verify:production -- https://www.ghezelbaash.ir/
```

After changing layout, fonts or rendered chunk content, install the pinned browser with `npx playwright install --with-deps chromium`, then run `npm run render:calibration:update`. It builds an isolated candidate, loads its CSS and fonts, disables chunk skipping only for measurement, and measures every chunk at 360, 390, 430, 768, 1024 and 1440 CSS pixels. The JSON records actual content-box heights, document heights, final DOM identity/order, source fingerprints and the Chromium/font environment. Measurements describe that reference environment; other devices' system fonts can produce different heights.

Normal builds do not launch a browser. Source and final-DIST gates reject missing provenance, stale geometry inputs, wrong chunk identities/order or impossible heights. Generated calibration bytes are excluded from the source fingerprint to avoid a circular dependency. `npm run render:calibration:update -- path/to/chromium-measurements.json` imports only a measured artifact that passes the same source and compiled-DOM checks. The canonical JSON is replaced atomically after validation; an unsuccessful measurement preserves the previous artifact.

CI measures independently on Ubuntu 24.04 with the pinned Playwright Chromium, tests anchor navigation and remembered chunk geometry, and compares measured chunk heights with the committed artifact (1 CSS pixel tolerance). Its measured JSON is available as the `render-calibration-*` artifact when a geometry update is needed. The separate release job validates the committed JSON and never substitutes the CI measurement automatically. Run `npm run test:render-calibration` for invalid/stale-data regression tests and `npm run test:render-navigation` after a full build for browser navigation tests.

After a full build, `npm run test:video-deeplinks` checks the published Clip links at 7, 25 and 46 seconds against the actual `dist/` HTML and media. Its dedicated server provides correct 206 responses and a gated, gradual full-body 200 response that ignores Range. The 206 cases must reach a stable, paused destination and deliver its decoded frame; the 200 cases prove that the verifier rejects an unseekable player even when it reports ready data. In the pinned Chromium, this finite HTTP stream exposes only time zero as seekable, so retrying `currentTime` or increasing preload cannot repair that transport. These negative cases do not claim 200 compatibility or a reproduced production outage. The shipped runtime and the geometry server remain unchanged.

`npm run verify:video-production` requires the exact deployment's `dist/` locally. It checks a real 1024-byte Range from every published MP4/WebM against the local artifact, including 206 status, Content-Range and strong ETag, then verifies all three Clip links in Chromium against the exact deployed HTML. It runs after production convergence and fails on transport or browser drift. It performs no Cloudflare mutation; the existing full-representation digest verifier continues to reject partial responses. Neither verification command is included in the site's browser runtime.

## Release and deployment

```bash
npm run release
```

The website deploys a static-only `dist/` on Cloudflare Pages from `main`. The production contract requires `uses_functions === false`, no dynamic routes and no runtime bindings. Runtime, automation and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json`, CodeMeta and the scheduled reputation workflow.

The canonical Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset`. GitHub is its version-controlled source, Zenodo is its immutable DOI distribution, Hugging Face `main` is its current AI/retrieval distribution, and versioned Hugging Face tags preserve frozen release snapshots. Release promotion updates the release record, graph, package metadata and citation metadata as one transaction; the public evidence snapshot is derived from the evidence registry during generation, and external publication remains an explicit release operation.
