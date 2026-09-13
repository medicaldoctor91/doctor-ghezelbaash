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
- `src/data/visible-text-contract.json`: approved source, emitted HTML and actual Chromium text/name fingerprints; validation never refreshes this baseline.
- `public/media/`, `src/data/media-metadata.json` and `src/data/media-dimensions.tsv`: canonical media, standards-based authored metadata and intrinsic dimensions.

The physician uses one canonical ID with `Person` and `IndividualPhysician` types. The clinic, `ProfilePage`, 18 `WebPageElement` sections, medical procedures, answers, images, videos, credentials and external identifiers all reference that graph. DOM Microdata and both inline JSON-LD projections are derived from the same graph and projection profiles.

Mojavez record `19949827` is scoped to the physician's medical practice license, holder name and practice jurisdiction. The source observation and field-to-claim bindings are recorded in `.release/evidence/mojavez-19949827.json`; the historical evidence ID remains stable. This record does not explicitly establish ownership of the canonical Clinic. `npm run verify:mojavez` re-fetches the official record with no-cache headers and checks its visible labelled fields. It only reports; source or scope changes require a fresh review. A captured response can be checked with `npm run verify:mojavez -- --html /path/to/response.html`. Hermetic validators enforce the reviewed scope, subject, neutral title, URLs and projection selector; `npm run test:final-entity-contract` exercises their failure paths. These checks bind the observation to authored claims; CI does not independently certify the live source on every build.

The forbidden identifier guard inspects explicit canonical input families in `scripts/lib/active-identifier-contract.mjs`, including new authored files. Necessary validator/test literals have exact-path exceptions; migration history and release archives have explicit non-active boundaries. Generated files and dependencies are outside this authored-source check.

Professional Facebook and Instagram pages describe both the physician and clinic. Representations of the same professional Instagram URL have the same `mainEntity` set. Personal Facebook describes the physician only. These are subjects of a profile, not an assertion that the physician and clinic are the same entity; the homepage retains the physician as its primary entity.

## Closed visible-text contract

Preparation validates the approved source before generating files. The final HTML gate compares both the mega-landing and 404 with the original baseline: ordered NFC-normalized text nodes, reading text, title, description, existing accessible labels, resolved ARIA references and social presentation strings. Authored answer text and video cue text are also protected. Raw source and original HTML hashes bind the baseline to its starting commit. Generated fingerprints are compared, never substituted as a new baseline during a build.

`npm run test:visible-text-browser` additionally checks actual Chromium rendered text, generated CSS text and accessible names at mobile and desktop widths, with JavaScript enabled and disabled, with disclosures open, in search states, and on the 404. CI requires this check after the pinned browser is installed. The browser evidence is specific to its recorded version and states; it is not universal assistive-technology or WCAG certification.

An intentional text change requires separate review of a new baseline. This includes a scheduled change to the visible rating or review count: the closed-set gate will stop that candidate before publication. Do not exempt those strings or refresh the baseline automatically merely to make a scheduled build pass. Non-text graph and runtime changes must preserve the approved text and browser fingerprints.

## Distribution standards and consumer boundaries

The 2026-09-12 review keeps existing representations with distinct consumers. Version labels below identify the applicable public specifications, not a claim that every optional feature or consumer outcome has been achieved. Draft successors do not replace Recommendations merely because their version number is higher.

| Representation | Consumer and governing contract | Verification |
| --- | --- | --- |
| Root HTML and real 404 | HTML Living Standard; Schema.org 30.0 JSON-LD/Microdata; WCAG 2.2 and ARIA 1.2 apply to human interaction | HTML, semantic, source/dist text, browser focus and name gates; Nu and vocabulary validation in CI |
| Full JSON-LD and Turtle graph | JSON-LD 1.1, RDF 1.1/Turtle; RDF Dataset Canonicalization 1.0 | Full-graph vocabulary/domain/range checks, graph identity checks, SHACL and independent RDF byte/roundtrip proof |
| CSV and CSVW companion | RFC 4180 media registration; W3C CSVW metadata and declared dialect | Exact columns, typed rows, stable keys, dialect, RDF roundtrip; reciprocal `describedby` / `describes` discovery |
| DCAT, VoID, Croissant and Data Package | DCAT 3, VoID vocabulary, MLCommons Croissant 1.1, Data Package 2 | Shared Dataset/distribution IDs, native DCAT version/issue date, declared fields and actual resource hashes |
| Provenance, evidence and fact map | PROV-O / Schema.org plus explicit project field contracts | Evidence subject, source-role, observation and fragment/hash consistency; preservation is not independent corroboration |
| Linkset, robots and sitemaps | RFC 9264, RFC 9309 and Sitemaps 0.9 with applicable Google extensions | Registry-derived discovery, exact relation direction, route policy and parser checks |
| Markdown, retrieval text and knowledge XML | GFM/CommonMark, UTF-8 and XML; documented project retrieval contracts | Shared passages, source fragments, answer text, coverage and evidence bindings; no special Google AI eligibility claim |
| Contact cards and manifest | vCard 4.0 / RFC 6350; Web App Manifest | CRLF/card identity and authored manifest fields/media types |
| CSS, runtime JS and font | Applicable CSS modules, ECMAScript, WOFF2 | Independent CSS syntax/value/variable and selector checks; compiler limits; pinned browser geometry, no-JS and font delivery checks |
| Images, video, tracks and aliases | Their actual AVIF/WebP/JPEG/PNG/SVG, WebM/MP4 and WebVTT formats | Intrinsic dimensions, references, metadata scope, exact aliases, media probing and byte-range/browser seek tests; no claim of exhaustive codec certification |
| `_headers`, `_redirects`, IndexNow key | Cloudflare Pages public static configuration limits and IndexNow protocol | Expanded header line/rule limits, exact CSP, redirect registry, key/body policy; these configuration files are not extra human pages |

Current normative references include [Schema.org releases](https://schema.org/docs/releases.html), [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/), [Turtle](https://www.w3.org/TR/turtle/), [RDF canonicalization](https://www.w3.org/TR/rdf-canon/), [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/), [CSVW](https://www.w3.org/TR/tabular-metadata/), [Croissant 1.1](https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html), [Data Package](https://datapackage.org/standard/data-package/), [IANA link relations](https://www.iana.org/assignments/link-relations/link-relations.xhtml) and [Cloudflare static headers](https://developers.cloudflare.com/pages/configuration/headers/). The asset formats retain the technical profile appropriate to their existing media; no image or clinical copy is invented to fill optional metadata.

Googlebot's Search HTML envelope uses a conservative 2,000,000 uncompressed bytes, following the [March 2026 crawler documentation](https://developers.google.com/search/blog/2026/03/crawler-blog-post). The compiler reserves 20,000 bytes for response headers and 30,000 for safety, limiting HTML to 1,950,000 bytes. Live checks count decoded body bytes and raw response-header fields with framing; compressed transfer size cannot stand in for the crawl envelope. The primary identity graph remains early in the head. The earlier 2,100,000-byte assumption is not an allowable budget.

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

Calibration CSS stores the six measured heights once per chunk as unitless
`--cis-0` through `--cis-5` values. Seven shared media rules interpolate those
values using number/length `calc()` arithmetic. Inclusive `min-width`/`max-width`
ranges cover fractional viewport widths without 0.01px gaps; both formulas agree
at every shared endpoint. This syntax works with the pinned minifier, and a
delivery gate rejects silently dropped calibration rules. The original measurements,
deferred delivery, remembered-size behavior and 2800px fallback remain intact;
this reduces repeated CSS, not the size of the HTML document or the delay before
the deferred calibration becomes available.
After a full build, `npm run test:render-calibration-browser` checks all chunk
intrinsic lengths computed from the minified stylesheet at thirteen reference,
intermediate and out-of-range widths; this complements the arithmetic unit tests.

`npm run validate:css` checks authored CSS, every HTML style block and style
attribute (including templates), and all linked/preloaded/noscript DIST stylesheets.
Orphan or remote CSS fails the inventory. The pinned CSS-tree 3.2.1 parser and
lexer check syntax, property/descriptor values and supported query features;
truncated input and parser recovery fail. Root custom-property tokens are resolved
before value checks, including fallbacks and cycles. Calibration formulas are
checked against every six-height profile; actual computed dimensions remain the
responsibility of the calibration browser test. New at-rules, query features or
custom-property scopes require explicit validation coverage, not silent acceptance.

`npm run validate:html-css` adds pinned Chromium selector and resolved-value checks
(including calculation dimensions and font descriptors), and Nu 26.8.30
HTML validation. Nu's CSS parser lacks container-query support and has no switch
to disable only that parser. After the original CSS passes, this command creates
temporary HTML projections that mask only CSS value ranges while preserving
HTML tokens and offsets; it never serializes/rebuilds HTML or modifies DIST.
Nu checks those projections without error filters, and reports bind original HTML,
original CSS and projection hashes. The full file inventory and hashes are checked
again before success. This is combined independent CSS and Nu HTML
validation, not a claim that unmodified HTML passed Nu's CSS checker. The existing
Safari-only `::-webkit-details-marker` spelling is checked explicitly and its
selector host is checked using the standard `::marker` counterpart; this is not a
cross-browser rendering certification. The existing iOS `-webkit-overflow-scrolling`
extension is checked against Apple's documented `auto | touch` grammar and reported
separately because Chromium does not implement it (see the
[Safari CSS reference](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariCSSRef/Articles/StandardCSSProperties.html)).
`npm run test:css-validation` proves that
broken CSS, selector typos, HTML conformance errors and misplaced style elements
still fail. CI and deployment verification require the combined check; normal
builds run the static CSS check without launching a browser or Java.

After a full build, `npm run test:video-deeplinks` checks the published Clip links at 7, 25 and 46 seconds against the actual `dist/` HTML and media. Its dedicated server provides correct 206 responses and a gated, gradual full-body 200 response that ignores Range. The 206 cases must reach a stable, paused destination and deliver its decoded frame; the 200 cases prove that the verifier rejects an unseekable player even when it reports ready data. In the pinned Chromium, this finite HTTP stream exposes only time zero as seekable, so retrying `currentTime` or increasing preload cannot repair that transport. These negative cases do not claim 200 compatibility or a reproduced production outage. The shipped runtime and the geometry server remain unchanged.

`npm run verify:video-production` requires the exact deployment's `dist/` locally. It checks a real 1024-byte Range from every published MP4/WebM against the local artifact, including 206 status, Content-Range and strong ETag, then verifies all three Clip links in Chromium against the exact deployed HTML. It runs after production convergence and fails on transport or browser drift. It performs no Cloudflare mutation; the existing full-representation digest verifier continues to reject partial responses. Neither verification command is included in the site's browser runtime.

## Performance measurement boundary

After a full build, `npm run test:performance` measures three cold, isolated
navigations per profile: mobile at 412 × 823 CSS pixels / DPR 1.75, and desktop at
1440 × 936 / DPR 1. Each profile must independently meet the release budgets,
including FCP ≤ 1800 ms; a fast desktop cannot compensate for a slow mobile run.
The report identifies the browser, profile, cache policy and document
encoded/decoded/transfer sizes. Initial page resources are recorded before the
separate forced-font and search-interaction checks. Missing required metrics
fail closed. `npm run test:performance-gate` tests these failure boundaries.

This is an **unthrottled, observed local regression gate**, served without
compression. It is not a PSI score, a Slow 4G simulation, field Core Web Vitals,
or Lighthouse TBT measurement. A live mobile improvement requires repeated comparable Lighthouse
or PSI runs against the deployed response; passing this gate does not establish
mobile 100.

The responsive HTML preload and picture share the Hero image candidate contract.
Deployment headers do not preload a fixed portrait size: that can download an
unused 960-pixel image when a small mobile viewport selects the 640-pixel image.
After a build, `node scripts/test-hero-delivery.mjs` serves the generated headers
and requires one matching portrait request in cold 360/412-pixel mobile and
1350-pixel desktop contexts. This checks response-header delivery, not a live
Cloudflare 103 response or a Lighthouse score.

`npm run test:critical-caption` holds the deferred stylesheet until the critical
components have rendered, then requires identical caption, hero, action, dock
and consultation-icon geometry at nine phone and desktop widths, including
viewport/container breakpoints. Generic article disclosures exclude
`.caption-disclosure`, and generic navigation spacing excludes `.quick-actions`.
Component geometry has one critical owner, with no corrective deferred override.

`npm run test:css-accessibility` verifies keyboard focus in the scrolling search
results and at the selected heading, mobile overflow, print and reduced-motion
behavior. Search-result outlines stay inside their scrollport; article sections
do not broadly clip heading focus, while wide tables keep local scrolling.
Render chunks retain paint containment with an 8px overflow clip margin so
nested heading focus is not cut off, including the high-contrast outline.

The optional canonical-HTML compression experiment uses Cloudflare's native
[Compression Rules](https://developers.cloudflare.com/rules/compression-rules/settings/),
not a Worker or precompressed sidecar. Preview its exact rule offline with
`python scripts/configure-cloudflare-edge.py --plan-html-compression`. It matches
only canonical-host GET/HEAD `/`, status 200 and `text/html`, preferring gzip with
`auto` negotiation fallback. Captured equivalent live responses were 434,067
bytes with gzip versus 449,558 with Brotli; this observation is deployment-specific,
not a universal preference for gzip or proof of a PSI gain.

The separate `--apply-html-compression` and `--rollback-html-compression` modes
require `--rollback-snapshot /absolute/path/to/snapshot.json` and the existing
scoped Cloudflare environment. Apply creates a new snapshot exclusively before
mutation; rollback rejects scope or owned-rule drift and preserves other rules,
including machine-resource compression. These modes are never invoked by a
normal build, general `--apply`, or CI. Production application requires explicit
authorization, followed by decoded SHA equality, negotiated response-byte checks
and repeated comparable mobile PSI tests; roll back if the improvement is absent.

## Release and deployment

```bash
npm run release
```

The website deploys a static-only `dist/` on Cloudflare Pages from `main`. The production contract requires `uses_functions === false`, no dynamic routes and no runtime bindings. Runtime, automation and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json`, CodeMeta and the scheduled reputation workflow.

The canonical Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset`. GitHub is its version-controlled source, Zenodo is its immutable DOI distribution, Hugging Face `main` is its current AI/retrieval distribution, and versioned Hugging Face tags preserve frozen release snapshots. Release promotion updates the release record, graph, package metadata and citation metadata as one transaction; the public evidence snapshot is derived from the evidence registry during generation, and external publication remains an explicit release operation.

Cloudflare preflight is a read-only check using an existing credential. It refuses writes, token creation and automatic drift repair. A configured credential needs direct Zone Read and Zone Settings Read; missing permissions or live drift fail the check. The explicit authorized `configure-cloudflare-edge.py --apply` operation remains responsible for reconciliation. A build without the API token skips the optional live check and does not imply that production settings were independently verified.
