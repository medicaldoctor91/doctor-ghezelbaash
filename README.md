# Dr. Saeed Ghezelbash — dist-first static source

Static Astro source for <https://www.ghezelbaash.ir/>.

## Build

```bash
npm ci
npm run build
```

Use Node 24.19+ within major 24 and npm 11.9+ within major 11. `scripts/build.mjs` is the single build entry: it produces the complete static website in `dist/`, serializes the graph to RDF, exports the authored readable and machine formats, and checks the finished files. It also verifies that neither canonical file changed during the build.

This is a finite distribution: one principal document, its existing 404 fallback, assets and published data formats. There is no page-generation framework, runtime server, Worker, client router framework or deployment automation. Upload the contents of a validated `dist/` to Cloudflare Pages; the source does not publish them.

## The two canonical files

- `src/content-source/page.md` owns the page body, its inline JSON-LD and Microdata, head values, discovery links, resource registry, footer and search labels, intent destinations, retrieval settings, and the complete `llms.txt` guide.
- `src/data/semantic/knowledge-graph.jsonld` owns the entity facts, identifiers, media rights, Dataset version and distribution URLs, DOI history, distribution titles and profiles, and explicitly authored evidence assessments.

`src/lib/canonical-inputs.mjs` reads those files. Consumers select and format existing data; they do not keep parallel release, evidence, resource, retrieval, or page-graph policy files. Evidence observations are copied faithfully, including absent status or date values. A build does not claim a new external verification.

The current Dataset release label is `1.3.3`. Historical DOI records retain their actual versions and publication dates. Updating the current content does not automatically increment that label. Publication dates and the current Dataset revision date describe different events.

The page contains concrete authored values. There are no contact, release, image-size, or image-Microdata placeholders to inject at build time. When an authored fact changes, update the corresponding graph data and visible page text where applicable. The `llmsGuide` field is authored text and is maintained with the page.

Microdata is HTML markup. ImageObject attribution and licensing are stored directly on the canonical page's image figure. The image binaries are static assets; HTML Microdata is not inserted into them.

## Presentation and generated files

The canonical body is already HTML. `index.astro` renders it directly through `canonical-page-html.mjs`; there is no generated Markdown copy or second front matter parse. The projection compacts the two JSON-LD scripts and escapes `<` for safe HTML embedding while preserving their decoded values and the medical text's whitespace.

`src/styles/global.css` contains the static presentation and finite chunk-height estimates. Content visibility defers offscreen layout and remembers measured heights; estimates vary with device fonts and viewport. Astro components provide layout. The small progressively enhanced search/navigation runtime lives in `src/scripts/guide-runtime.js` and is minified at build time into one inline script with an exact CSP hash. `public/` contains media and browser assets. Redirects, media aliases, HTTP-header templates and SHACL shapes are technical delivery or validation inputs.

Generated files live in `.generated/` and `dist/`. File hashes, RDF measurements, build identity and Content Security Policy hashes are measured from outputs and do not become canonical authoring requirements. No fixed graph, answer, passage or resource totals are required.

`npm run validate:dist` checks canonical head values, search destinations, image rights, exact graph publication, actual internal links and media resources, metadata routes, faithful evidence projections and the absence of legacy placeholders. The normal build also checks HTML structure, authored JSON-LD preservation, descriptor integrity and Cloudflare's static rule limits. Passage provenance records only explicitly known source revisions and includes the actual answer sources; it does not substitute an archived release date for an unknown revision.

## Content paths

The authored graph uses path IRIs. Page headings, answers and linked elements have matching HTML IDs. The build derives a finite set of content paths from the finished document and emits Cloudflare Pages `200` aliases to the single `index.html`; it does not generate a separate copy of the page for each path or use a catchall. The browser navigates these paths with the History API, reveals the destination and moves keyboard focus. Chapter query parameters seek the video without reloading the document. Direct path loads receive the same canonical document and are positioned before slow media finish loading. Without JavaScript, its full content remains readable; the skip link and native table-of-contents fallback use local HTML fragments, without changing entity identities.

Legacy redirects point directly to valid content paths or assets. Defined subjects inside the graph/provenance namespaces, plus semantic subjects advertised by the HTML, use exact `303` redirects to their canonical graph description. Other RDF entity identifiers remain identifiers in the published graph; this distribution does not turn every graph node into a separate web page.

HTML keeps the homepage canonical URL. A shared hash-based CSP covers content aliases and unknown 404 requests; machine resources retain their delivery metadata. Responsive hero preload stays in HTML, without a competing fixed-size HTTP preload. Search supports keyboard navigation, Escape, IME composition and Ctrl/Meta+K; without enhancement its launcher is a native guide link.

Search intent destinations come from `page.md`. Their headings come from each canonical `Answer.url`, without assuming that the answer immediately follows its heading. When the existing detector recognizes an intent, its authored destination is the first result; other results retain the lexical ranking.
