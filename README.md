# Dr. Saeed Ghezelbash — dist-first static source

Static Astro source for <https://www.ghezelbaash.ir/>.

## Build

```bash
npm ci
npm run build
```

Use Node 24.19+ within major 24 and npm 11.9+ within major 11. `scripts/build.mjs` is the single build entry: it produces the complete static website in `dist/`, serializes the graph to RDF, exports the authored readable and machine formats, and checks the finished files. It also verifies that neither canonical file changed during the build.

This is a finite static distribution: a comprehensive home, focused direct-entry HTML for every authored content path, a 404 fallback, assets and machine formats. Cloudflare's connected Git integration publishes main. No runtime server or bot-specific response is required. Direct entry keeps its focused topic visible until the visitor requests the complete guide, another topic, or search. Navigation and expansion stay within one document.

## The two canonical files

- `src/content-source/page.md` owns the page body, its inline JSON-LD and Microdata, head values, discovery links, resource registry, footer and search labels, intent destinations, retrieval settings, and the complete `llms.txt` guide.
- `src/data/semantic/knowledge-graph.jsonld` owns the entity facts, identifiers, media rights, Dataset version and distribution URLs, DOI history, distribution titles and profiles, and explicitly authored evidence assessments.

`src/lib/canonical-inputs.mjs` reads those files. Consumers select and format existing data; they do not keep parallel release, evidence, resource, retrieval, or page-graph policy files. Evidence observations are copied faithfully, including absent status or date values. A build does not claim a new external verification.

The current Dataset release label is `1.3.3`. Historical DOI records retain their actual versions and publication dates. Updating the current content does not automatically increment that label. Publication dates and the current Dataset revision date describe different events.

The page contains concrete authored values. There are no contact, release, image-size, or image-Microdata placeholders to inject at build time. When an authored fact changes, update the corresponding graph data and visible page text where applicable. The `llmsGuide` field is authored text and is maintained with the page.

Microdata is HTML markup. ImageObject attribution and licensing are stored directly on the canonical page's image figure. The image binaries are static assets; HTML Microdata is not inserted into them.

## Presentation and generated files

The canonical body is already HTML. `index.astro` renders it directly through `canonical-page-html.mjs`; there is no generated Markdown copy or second front matter parse. The projection retains all authored entity IDs and types in the homepage browser JSON-LD and adds its visible FAQ relationship. It escapes `<` for safe HTML embedding, formats multilingual literals as text, and omits optional ProfilePage timestamps when only a calendar date is known. Historical events, self-hosted reviews and external profile evidence remain in both browser data and the complete, byte-identical `graph.jsonld` and RDF exports. Medical text and whitespace are preserved. The image creator uses a typed Person in Microdata; the page uses JSON-LD without a competing URL-valued ProfilePage Microdata scope.

`src/styles/global.css` contains the static presentation and finite chunk-height estimates. Content visibility defers offscreen layout and remembers measured heights; estimates vary with device fonts and viewport. Astro components provide layout. The small progressively enhanced search/navigation runtime lives in `src/scripts/guide-runtime.js` and is minified at build time into one inline script with an exact CSP hash. `public/` contains media and browser assets. Static route aliases, media aliases, HTTP-header templates and SHACL shapes are technical delivery or validation inputs.

Generated files live in `.generated/` and `dist/`. File hashes, RDF measurements, build identity and Content Security Policy hashes are measured from outputs and do not become canonical authoring requirements. No fixed graph, answer, passage or resource totals are required.

`npm run validate:dist` checks canonical head values, search destinations, image rights, exact graph publication, actual internal links and media resources, metadata routes, faithful evidence projections and the absence of legacy placeholders. The normal build also checks HTML structure, the browser discovery projection, descriptor integrity and Cloudflare's static rule limits. Passage provenance records only explicitly known source revisions and includes the actual answer sources; it does not substitute an archived release date for an unknown revision.

## Content paths

Every finite authored content path has its own physical HTML file, self canonical, title, description and page node with a typed mainEntity. Named entities and questions reuse their graph identifiers; other headings derive WebPageElement identities from the actual visible content. Video entry points use their VideoObject, and question pages use FAQPage with the authored accepted Answer. Readable answer paragraphs keep their own scope instead of inheriting an entire parent section. Empty aliases inherit their actual adjacent content region. Breadcrumbs describe the real home and current path. Each path relates to the comprehensive home and WebSite; the shared physician keeps the authored homepage URL, mainEntityOfPage, verified identity links and known qualifications. Each route names the same doctor as author and publisher; typed credential, identifier, membership, medical-practice and education nodes preserve the authored semantic relationships. Broad homepage content relationships are not pulled into focused views. The sitemap lists home and all direct entries once, with visible media scoped to each entry.

The interface stays one page. Direct entry serves meaningful topic HTML and initializes its scoped reader without fetching or injecting the complete home. An explicit “Show the complete guide” link expands it in place, as does deliberate topic navigation or search focus. The complete guide is fetched once, without changing the current route's canonical or entity metadata. Existing video elements are reused to preserve playback. The runtime refreshes search, media posters and navigation after expansion. Clicking another topic uses History API and scrolls in the existing document while synchronizing language, direction, canonical, title, social metadata and JSON-LD. Native home fragment links work in the same reader. Back/Forward preserves native saved scroll. Crawlers and readers receive identical HTML and scripts; there is no user-agent branching. Without JavaScript, native links remain usable; failed guide expansion retains the focused topic and offers retry.

Content and legacy paths use exact finite 200 rewrites to physical files, with no generated 3xx. Legacy aliases preserve their requested URL and retain the target document's canonical. Machine graph/provenance subjects remain machine aliases rather than HTML pages. Static build file format keeps the authored slashless paths. Hosting-level normalization must still be verified independently.

Self canonical and distinct initial topic documents support separate discovery; Google decides indexing and ranking. Full-guide expansion occurs after explicit reader interaction, reducing automatic rendered duplication without serving different content to crawlers. Schema relationships preserve the homepage identity; they do not guarantee rankings or prevent every canonical consolidation. A comprehensive shared reader cannot guarantee that every small heading becomes a separate search result. Retaining semantic Event, Review, Dataset or Course types also does not guarantee a rich feature. The patient rating (5/5) and workshop day (2025-02-04, 16 Bahman 1403) are user-confirmed authored facts and are shown visibly. Reviews about a clinic on its own site remain subject to Google's self-serving-review policy.

No artificial pageviews or requests are emitted for other paths. Fetching the home as a reader resource is not a separate analytics pageview or a Google search click. Real route navigation and section visibility can be measured by an explicitly configured analytics provider; this distribution does not fabricate activity or add third-party tracking.

## Reviewable build output

CI runs the browser discovery regression tests and the full build, then retains the validated `dist/` and `.generated/dist-manifest.json` with SHA-256 hashes for every final file. Build identity records the checked-out commit (a PR merge ref in PR CI), not proof of a production deployment. Back/Forward reloads skip initial deep-link scrolling so the browser can restore its saved position without BFCache. Production redirect, CSP and Google URL Inspection results still require verification against the deployed final commit; a successful build does not make that claim.

## Sitemap scope

The sitemap publishes home and every independently rendered content path once, with its authored revision and visible media. Legacy aliases, media timestamp query variants and machine graph subjects are not extra HTML sitemap entries. Media URLs, video text limits, durations and publication dates are checked during generation; final validation confirms each media resource exists. A successful source build does not guarantee a particular search ranking.
