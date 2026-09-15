# Dr. Saeed Ghezelbash — production source

Static-only Astro source for the canonical physician entity home at `https://www.ghezelbaash.ir/`. The production architecture intentionally concentrates the human-facing website on one canonical mega-landing plus a genuine 404 while publishing synchronized machine-readable representations of the same physician, clinic, medical content and provenance data.

Cloudflare Pages serves static assets only. Generated files are build products and are not committed. The normative rules are the executable validators and policy files in this repository; this README describes those rules but does not override them.

## Canonical source ownership

- `src/content-source/page.md` — the single authored visible-body source, including final answer markup, page-scoped authored semantics, social-image alt/locale choices and footer governance copy.
- `src/data/content-source-contract.json` — exact reviewed byte identity for the canonical `page.md` source.
- `src/styles/global.css` — the only authored stylesheet.
- `src/data/semantic/knowledge-graph.jsonld` — canonical entity facts, relationships, lexical identity labels, first-party provenance, offered services and machine-readable answer semantics.
- `src/data/semantic/head-profile.json` and `src/data/semantic/support-profile.json` — explicit inline JSON-LD projection selection and byte budgets.
- `src/data/release.json` — release/distribution lifecycle, canonical URL and minimal entity pointers.
- `src/data/release-invariants.json` — delivery, crawl-envelope and performance budgets.
- `src/data/machine-resources.json` — website/Hugging Face/Zenodo machine-resource registry.
- `src/data/redirects.json` — canonical aliases and redirect policy.
- `src/data/retrieval/query-matrix-policy.json` — retrieval intent, language, scope and evidence bounds.
- `src/data/evidence-registry.json` — evidence source used to generate public evidence projections.
- `src/data/render-calibration.json` — measured render-chunk geometry and provenance.
- `src/data/media-metadata.json`, `src/data/media-dimensions.tsv` and `public/media/` — canonical media metadata, dimensions and assets.
- `.release/policy/authority-surface-contract.json` — authority roles for website, GitHub, Zenodo and Hugging Face.
- `.release/policy/platform-contract.json` — production branch, runtime/toolchain and Cloudflare Pages delivery contract.

`src/content-source/` is intentionally restricted to exactly one authored document: `page.md`. `src/styles/` is intentionally restricted to exactly one authored stylesheet: `global.css`. Repository-hygiene validation rejects tracked generated DIST artifacts, transient audit/patch files, extra content sources and transient workflows.

## Canonical page source freeze

The reviewed `page.md` is frozen as exact source bytes, not as a historical browser snapshot or as parser-specific text-node boundaries.

Current approved source identity:

- approved source commit: `ff91dacd6b6e9d360f7d42e9fa4d7c45ad5f20d1`
- Git blob SHA-1: `d54f3a997e160a4e93290a5ea391816d1d452c09`
- SHA-256: `807e07184a1f325f7e8723614ea1851b7b94661485f7d664e891e26853c58499`
- bytes: `1802868`

The approved source preserves the reviewed visible content from `31f26733a69a0ed3cb2008dc08c79b562eca6131`; its only later page-source change is the fingerprint rename of two portrait candidates after restoring their required XMP metadata without changing decoded pixels.

`npm run validate:content-source` executes the read-only exact-source gate in `scripts/validate-content-source.mjs`; `npm run test:content-source` proves that source mutations and contract drift fail closed. A build cannot rewrite or refresh this contract. An intentional future `page.md` change requires explicit review and an explicit update of `src/data/content-source-contract.json` in the same reviewed change.

The source freeze does **not** replace semantic or browser validation. It only answers one question: are the authored canonical page bytes exactly the reviewed bytes? DIST quality is independently enforced by current-state validators rather than by comparison with an obsolete historical HTML/browser baseline.

## Current-state DIST integrity

The production gates independently protect the properties that matter to search, extraction, accessibility and user behavior:

- `scripts/validate-architecture.mjs` enforces the single canonical content source, static route topology, canonical stylesheet ownership and projection architecture.
- `scripts/validate-semantic-html.mjs` rejects duplicate IDs, broken same-document fragments, invalid heading hierarchy, broken section/heading bindings, broken media-caption bridges, missing image alt text and invalid semantic structure.
- `scripts/lib/html-contract.mjs` validates actual HTML IDs, same-document fragment resolution, article/section structure and video markup.
- `scripts/test-answer-projection.mjs` requires authored answer text, IDs, placement and graph `Answer.text` mirrors to agree with the current `page.md`.
- `scripts/validate-google-structured-data.mjs`, Schema.org vocabulary validation and SHACL protect the graph/JSON-LD/Microdata projections.
- `scripts/validate-dist.mjs` and `scripts/validate-dist-production.mjs` validate the final DIST inventory, canonical HTML semantics, ARIA targets, accessible names, media properties, machine resources, graph targets, descriptors and publication context.
- `scripts/test-dist-interactions.mjs` tests the shipped search/dialog behavior, keyboard focus, accessible browser roles/names and native fragment navigation in Chromium.
- `scripts/test-css-accessibility.mjs` tests focus visibility, clipping/overflow, reduced motion, print behavior and high-contrast focus behavior.
- `scripts/test-render-navigation.mjs` tests real hash navigation and content-visibility/render-chunk behavior.
- `scripts/test-guide-navigator.mjs` exercises the actual shipped navigation runtime and its fragment/focus behavior.
- render-calibration tests bind measured chunk identities/order and geometry to the current assembled DOM.
- performance, Hero-delivery, CSS/HTML, media, video-range, redirect, release and live-verification gates remain independent.

This separation is deliberate: changing an inline wrapper must not fail merely because a parser split one text node into several, while broken IDs, fragments, accessible names, answer semantics, structured data or geometry must still fail closed.

## Entity and semantic authority

The physician uses one canonical ID with `Person` and `IndividualPhysician` semantics. The clinic is subordinate and distinct. Canonical graph traversal is centralized in the graph/authority libraries; publication consumers derive facts from the graph and release lifecycle rather than maintaining competing copies.

Visible answers are authored in `page.md`; the graph keeps their machine-readable `Answer.text` mirror. The answer projection contract requires exact agreement and rejects missing, duplicated or misplaced answer markup.

The active identifier guard scans authored canonical inputs. Historical archives and generated files do not become active identity sources merely by containing old identifiers.

## Distribution surface

The build publishes the canonical root HTML and machine-readable resources registered in `src/data/machine-resources.json`, including JSON-LD/Turtle graph serializations, tabular facts and metadata, direct-answer/retrieval corpora, provenance/evidence projections, XML/Markdown representations, dataset descriptors, vCards, discovery files and standards metadata.

The project does not claim that a special AI file or proprietary markup is required for Google AI features. The canonical page remains indexable and snippet-eligible; machine representations improve explicit discovery, provenance and retrieval without creating competing human canonicals.

## Search and crawl envelope

The Googlebot Search HTML envelope is conservatively limited by `src/data/release-invariants.json`. The current project reserves response-header and safety budgets and caps generated HTML below the configured envelope. Compressed transfer size never substitutes for the decoded HTML budget.

The primary identity projection remains early in the document head. Machine-resource discovery is generated from the registry and validated against the finished DIST.

## Render calibration

`src/data/render-calibration.json` is retained because it protects real rendering behavior rather than historical prose. Its source fingerprint includes layout/CSS/component/font inputs and the assembled render-chunk DOM identity. The final DIST must agree with the measured chunk identities and DOM hash.

After an intentional layout, font or render-chunk-content change:

```bash
npx playwright install --with-deps chromium
npm run render:calibration:update
npm run test:render-calibration
npm run test:render-navigation
```

CI independently measures the candidate and compares it with the committed calibration. Normal builds do not silently substitute CI measurements.

## Build and validation

Typical local flow:

```bash
npm ci
npm run security:dependencies
npm run build
```

Full release proof:

```bash
npm run release
```

Useful focused gates:

```bash
npm run validate:content-source
npm run test:content-source
npm run validate:source
npm run validate:media
npm run validate:html-css
npm run test:dist-interactions
npm run test:css-accessibility
npm run verify:production -- https://www.ghezelbaash.ir/
```

`prepare:site` generates only the content/semantic/CSS products Astro needs. `prepare:distribution` regenerates the complete machine-readable distribution. Astro renders the static HTML; registered artifacts are materialized into `dist/`; headers and redirects are generated and validated; generated files remain untracked.

## Media, accessibility and browser behavior

Media validation checks intrinsic dimensions, references, exact aliases, metadata scope, fingerprints and video transport. Browser tests verify actual interaction/focus behavior and video deep links. These are current-state checks against the candidate being built, not stored browser screenshots or historical accessibility-name snapshots.

The clinic Google Maps rating/review count is a time-bounded graph observation refreshed by the scheduled workflow. The workflow performs no request-time website fetch and publishes only validated source changes.

## Release and deployment

Production is the `main` branch deployed as static assets on Cloudflare Pages. The platform contract requires no Functions, no dynamic routes and no production runtime bindings.

Release promotion and deployment validation are separate from the canonical page-source freeze. GitHub is version-controlled source; Zenodo is the immutable DOI distribution; Hugging Face is the AI/retrieval distribution. Release provenance, immutable snapshots and cross-surface byte identity remain governed by their dedicated release validators and workflows.

The canonical Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset` and the canonical human entity home remains `https://www.ghezelbaash.ir/`.