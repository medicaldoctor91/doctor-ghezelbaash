# Dr. Saeed Ghezelbash — static source

Static Astro source for <https://www.ghezelbaash.ir/>.

## Build

```bash
npm ci
npm run build
```

The build produces the complete static website in `dist/`, serializes the graph to RDF, exports readable and machine formats, and checks the finished files. It does not update external repositories or publish a release.

## The two canonical files

- `src/content-source/page.md` owns the page body, its inline JSON-LD and Microdata, head values, discovery links, resource registry, footer and search labels, intent destinations, retrieval settings, and the complete `llms.txt` guide.
- `src/data/semantic/knowledge-graph.jsonld` owns the entity facts, identifiers, media rights, Dataset version and distribution URLs, DOI history, distribution titles and profiles, and explicitly authored evidence assessments.

`src/lib/canonical-inputs.mjs` reads those files. Consumers select and format existing data; they do not keep parallel release, evidence, resource, retrieval, or page-graph policy files. Evidence observations are copied faithfully, including absent status or date values. A build does not claim a new external verification.

The current Dataset release label is `1.3.3`. Historical DOI records retain their actual versions and publication dates. Updating the current content does not automatically increment that label. Publication dates and the current Dataset revision date describe different events.

The page contains concrete authored values. There are no contact, release, image-size, or image-Microdata placeholders to inject at build time. When an authored fact changes, update the corresponding graph data and visible page text where applicable. The `llmsGuide` field is authored text and is maintained with the page.

Microdata is HTML markup. ImageObject attribution and licensing are stored directly on the canonical page's image figure. The image binaries are static assets; HTML Microdata is not inserted into them.

## Presentation and generated files

`src/styles/global.css` contains the complete static presentation, including the preserved chunk-size rules. Astro components provide layout and interaction. `public/` contains media and browser assets. Redirects, media aliases, HTTP-header templates and SHACL shapes are technical delivery or validation inputs.

Generated files live in `.generated/` and `dist/`. File hashes, RDF measurements, build identity and Content Security Policy hashes are measured from outputs and do not become canonical authoring requirements. No fixed graph, answer, passage or resource totals are required.

`npm run validate:dist` checks canonical head values, search destinations, image rights, exact graph publication, resource presence, faithful evidence projections and the absence of legacy placeholders. The normal build also checks HTML structure, authored JSON-LD preservation and descriptor integrity.

## Content paths

The authored graph uses path IRIs. Page headings, answers and linked elements have matching HTML IDs. The build derives a finite set of content paths from the finished document and emits Cloudflare Pages `200` aliases to the single `index.html`; it does not generate a separate copy of the page for each path or use a catchall. The browser navigates these paths with the History API, reveals the destination and moves keyboard focus. Direct path loads receive the same canonical document. Without JavaScript, its full content remains readable.

Legacy redirects point directly to the current content paths. HTML keeps the homepage canonical URL. A shared document CSP covers the path aliases and the existing 404 page; individual machine resources retain their own delivery metadata. This source produces a static distribution and does not deploy it.

Search intent destinations come from `page.md`. Their headings come from each canonical `Answer.url`, without assuming that the answer immediately follows its heading. When the existing detector recognizes an intent, its authored destination is the first result; other results retain the lexical ranking.
