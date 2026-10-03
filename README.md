# Dr. Saeed Ghezelbash — finite static source

Static Astro source for <https://www.ghezelbaash.ir/>. The current corpus publishes **72 canonical HTML resources: the primary physician homepage and 71 focused clinical, language, contact, research, historical-evidence and media entries**. Other authored headings remain useful fragments within these resources rather than automatically becoming indexable pages. [Architecture decisions](docs/architecture-2026.md) explain the final model.

## Build

```bash
npm ci
npm run build
```

Use Node 24.19+ within major 24 and npm 11.9+ within major 11. `scripts/build.mjs` is the single build entry: derive RDF and machine projections, compile Astro, materialize static files, generate delivery headers, validate the actual `dist/`, and write its hash manifest. It verifies that authored content, graph, editorial guidance and implementation policies did not change during compilation. Cloudflare's connected Git integration publishes main; no runtime server or bot-specific response is required.

## Authoritative inputs

- `src/content-source/page.md` owns the authored HTML body: visible headings, links, media, Microdata and one empty browser JSON-LD placeholder. It has no YAML frontmatter or configuration registry.
- `src/data/semantic/knowledge-graph.jsonld` owns entity facts, identifiers, relationships, semantic distributions, Dataset versions, DOI history, image rights and explicitly authored evidence observations.
- `src/data/url-architecture.json` owns the reviewed finite publication policy: retained resources, permanent redirect decisions and canonical owners for authored HTML IDs. It does not invent entity facts.
- `src/config/site-policy.mjs` owns individual rendering, UI, discovery and retrieval policies. Its explicit `datasetId` selects the current Dataset without guessing among historical records. The homepage description, physician identity, social image, release and review facts come from the graph; display title, social regions and the compact hero preload remain presentation choices.
- `src/config/machine-resources.mjs` owns delivery/materialization paths, source artifacts, head/footer labels and exceptions. `resources.mjs` resolves graph-owned distribution media types, semantic titles and profiles from the canonical graph.
- `src/content-source/llms-guide.md` is separately authored retrieval guidance, published unchanged as `llms.txt`. It is neither visible page content nor another factual graph.

`canonical-inputs.mjs` reads the two factual/content sources and derives lifecycle, evidence and browser JSON-LD without YAML parsing or a shared page-metadata object. Consumers select and format existing facts instead of persisting parallel truth. Evidence observations retain their actual status, precision and dates, including absent values. A build is not a new external verification.

The current Dataset release label remains `1.3.3`; changing current content does not automatically increment it. Historical DOI versions and publication dates retain their own meaning. Source calendar dates, including typed `xsd:date` literals, are preserved at their authored precision; format adapters unwrap them where a serializer requires a scalar. No fabricated midnight or timezone is added to make a date resemble a timestamp. ProfilePage dates are not discarded merely because only a calendar date is known.

When a factual value changes, update the corresponding graph and visible prose where applicable. The sole semantic build-time placeholder is the browser JSON-LD script. Microdata image attribution/licensing is authored on the HTML figure, not inserted into image binaries. Build-time heading navigation attributes come from the shared URL policy.

## Identity, URLs and internal linking

The homepage is the primary `ProfilePage` and also a `MedicalWebPage` containing the physician's authored clinical portfolio. Its page IRI is `https://www.ghezelbaash.ir/webpage`; its main entity is the persistent `https://www.ghezelbaash.ir/saeed-ghezelbash` (`Person` and `IndividualPhysician`). The physician's `url` is the homepage and `mainEntityOfPage` points to that homepage page IRI. The entity IRI stays stable when document URLs change. `/saeed-ghezelbash` permanently redirects to `/#saeed-ghezelbash`; it is not a second physician ProfilePage.

The URL policy currently declares 72 KEEP decisions and 1,057 permanent redirects, with final owners for all 1,455 authored HTML IDs, including the expertise and review disclosures. A kept path has physical HTML, a self canonical, a distinct initial content scope and contextual native links. A merged path redirects directly to its retained owner's actual fragment. `url-architecture.mjs` validates coverage, resource uniqueness, retired paths and fragments, and resolves content references for all consumers. Adding a heading does not grant it an independent page.

Source links, TOC targets, breadcrumbs, canonical metadata, sitemap entries, JSON-LD URLs, machine citations and redirect destinations use this same model. Persistent entity IRIs remain distinct from navigable document URLs. Parent documents omit retained child documents' full initial scopes and expose accessible child navigation with readable excerpts instead; the full corpus remains available in the shared reader. This reduces redundant indexable text without hiding content or losing links to the child resources.

Document types follow reviewed content purpose: diagnosis, treatment, candidacy and safety use `MedicalWebPage`; research history, historical evidence and visit administration use `WebPage`; clinic contact uses `ContactPage`; actual media targets select `VideoObject`. Text containing a video keeps its own primary subject and the player as a supporting part. Only the homepage owns the physician `ProfilePage`.

Retained guides include only their visible scoped Questions and authored accepted Answers. A bounded companion `FAQPage` describes these questions without turning each short answer into another indexable document. [Google retired FAQ rich results on May 7, 2026](https://developers.google.com/search/updates#deprecating-the-faq-rich-result-feature); this semantic typing does not claim that feature. All authored medical Answer paragraphs remain in the full source.

The complete Arabic, English and Sorani guides are reviewed URL-level equivalents at `/aesthetic-guide-ar-iq`, `/aesthetic-guide-en` and `/aesthetic-guide-ckb-iq`. They emit reciprocal, self-inclusive hreflang in HTML and sitemap. Sorani uses precise `ckb-IQ` in HTML/RDF and supported two-letter Kurdish `ku-IQ` in hreflang (`ku_IQ` for Open Graph). The broader Persian homepage and untranslated guides do not claim equivalents. Route navigation updates language, direction and these metadata links together.

Browser graphs reuse stable authored entities and retain relevant medical concepts, credentials, identifiers, portrait rights and clinic contact relationships. They do not import a whole catalog or unrelated page/event/review/Dataset candidates into each document. The homepage retains its documented Course instance/workshop and speakable selectors as bounded relationships. None of these types guarantees rich-result eligibility, independent credential verification, entity recognition, indexing or ranking. Self-hosted clinic reviews remain subject to Google's self-serving-review policy.

## Shared reader and presentation

Direct entry serves substantive topic HTML before JavaScript runs. Its bounded article remains the primary content inside the main landmark after expansion. The reader automatically fetches the complete home guide and places its other visible content in complementary regions before and after main, preserving continuous scrolling without replacing the primary article with the whole corpus. Compiled DOM boundaries remove that article's source text from the surrounding context; a source signature rejects mixed revisions. No guide button click is needed on a successful load. Native navigation swaps the primary article and its contextual regions together with title, canonical, language, social metadata and JSON-LD. Existing video elements are reused to preserve playback. Back/Forward respects saved position, and a reader who interacts while loading is not forced to a new scroll position.

Without JavaScript, native canonical and fragment links work. A failed expansion leaves the focused content readable and exposes retry. Guide and metadata requests have a 15-second deadline, including response-body reading; search/navigation still initialize after a timeout. Crawlers and readers receive the same HTML and scripts. No artificial pageviews or third-party tracking are emitted.

`index.astro` renders the canonical HTML through `canonical-page-html.mjs`; there is no generated Markdown copy. The renderer injects the projected browser graph and escapes `<` for safe embedding. The placeholder follows the introduction so streamed HTML can paint the heading and portrait first. The surrounding reader and shared UI retain Persian language/direction while each primary article keeps its own authored language/direction; Arabic, English and Sorani sections have explicit boundaries and English terms inside RTL prose use narrow bidi isolation.

`src/styles/global.css` owns presentation and finite chunk-height estimates. Content visibility defers offscreen layout; estimates depend on fonts and viewport. The desktop introduction uses the portrait beside text, tablet/mobile use a single column, and medical prose fills the bounded page width. Mobile tables retain readable column widths, a scroll hint and keyboard access. The search/navigation runtime in `src/scripts/guide-runtime.js` is minified into one inline script with an exact CSP hash. Focused pages preload only media present in their initial content. Static assets live in `public/`.

After changing layout dimensions:

```bash
npm run build
BROWSER_EXECUTABLE=/path/to/chromium npm run calibrate:layout
npm run build
```

Calibration measures the built page and loaded fonts at six viewport widths, updates render-chunk estimates and writes `.generated/layout-calibration.json`. It requires locally installed Chromium and does not change authored prose.

## Machine formats and delivery

Machine outputs are compiled from the shared graph, visible corpus and URL policy: JSON-LD/RDF, descriptors, retrieval passages and answers, contact discovery, manifests and sitemap. The full `graph.jsonld` is byte-identical to the canonical graph; browser projections are purpose-specific subsets. Language-aware passage extraction preserves direct prose, H1–H6 ancestry and actual Answer sources. Citation URLs point to final documents or real fragments, never synthesized pages for arbitrary IDs. Source revisions and historical release dates are not interchangeable.

The sitemap includes only the 72 retained canonical HTML resources and their scoped visible media. Redirected headings, legacy aliases, timestamp queries and machine subjects are not extra HTML entries. Content pages use Cloudflare Pages native clean URLs for their physical `.html` files, avoiding rewrite/normalization loops. Content aliases use permanent redirects to final owners, not 200 copies of HTML.

Five bounded machine namespaces retain 200 representation rewrites: `/graph.jsonld/*`, `/provenance.jsonld/*`, `/ontology/*`, `/shapes/*` and `/annotation/*`. Exact graph subject aliases also resolve to their authoritative machine representation. MIME types, charset, Link headers and caching come from the same resource registry; rewritten request paths receive their representation headers rather than HTML headers. The generators validate Pages rule/line limits, rule order and redirect cycles.

The external Cloudflare host/protocol normalization rule currently preserves legacy paths. Legacy URLs requested on HTTP or the apex host therefore pass through the canonical host before the Pages redirect to the final document. Combining those steps requires a zone-level redirect change, which is outside the repository build; the canonical HTTPS www content aliases already have direct final destinations.

The 404 remains 404 and `noindex`. Its ordered CSS is extracted into a fingerprinted same-origin asset so an upstream CSP with stale inline-style hashes cannot suppress the fallback's presentation. Extraction rejects imports, conditional styles and relative resources that could change meaning; `.generated/not-found-css.json` records original digests. CSP is not weakened.

## Validation and reviewable output

`npm run validate:dist` audits emitted HTML, graph publication, machine descriptors and delivery rules rather than relying on a successful compiler exit. It checks final canonicals, URL-policy/anchor coverage, internal links, native reachability, breadcrumbs, scoped graph/Answer references, language alternates, image rights and media existence, redirects, headers and legacy-placeholder absence. `.generated/schema-inventory.json` and `.csv` record actual page types, entities, source-purpose evidence and content-scope hashes; validation compares them with the physical documents. They are internal review artifacts, not extra public pages or factual sources.

CI runs regression/source-ownership tests, the full build, rendered-reader validation and actual SHACL validation, then retains `dist/`, its SHA-256 manifest, schema inventory and validation reports. The Chromium reader check compares every focused article with its initial physical HTML after expansion, verifies all source IDs and language boundaries, and exercises canonical navigation, mounted search, horizontal sizing and history restoration. Run it locally with `node scripts/validate-reader.mjs` after installing Chromium through `npx playwright-core install chromium`, or set `BROWSER_EXECUTABLE` to an existing executable. Its local static server applies the generated redirect/header rules and blocks external requests; it does not certify production Cloudflare behavior. `codex/normalize-canonical-*` migration branches additionally build base/head under the same CI identity and compare every dist file with `compare-dist.mjs`. `compare-canonical-content.mjs` independently checks body, graph and editorial-guide bytes against the baseline; only that migration comparator understands the retired content header. Architecture tests prevent YAML dependencies, legacy metadata objects and redundant semantic wrappers returning.

Generated files belong in `.generated/` and `dist/`; do not patch them as authoritative content. Build identity identifies the compiled commit, not a production deployment. Live status/redirect behavior, Cloudflare cache and CSP, compression, responsive rendering, performance and Google URL Inspection must be checked against the deployed final commit. A local dist pass cannot certify those external systems or guarantee a search feature.

The build compiles `shapes.ttl` from graph-owned SHACL definitions and the authored `src/data/semantic/shapes-supplement.ttl`. CI also validates the final graph/DCAT/provenance RDF union against these shapes with six negative controls. To run that offline check locally, install `scripts/requirements-shacl.txt` in an isolated Python environment and run `python scripts/validate-shacl.py --regression-checks`. Its measured report stays in `.generated/`; Python is a validation dependency, not a website runtime.
