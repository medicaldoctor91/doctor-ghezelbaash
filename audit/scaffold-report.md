# Content-independent foundation report

Status date: 2026-07-16

Release state: **technical foundation complete; final editorial package pending**

## Runtime and URL contract

- Source routes: only `src/pages/index.astro`.
- Canonical: `https://www.ghezelbaash.ir/`.
- Output: static Astro files for Cloudflare Pages; no SSR, Worker, Pages Function, API, session, database, or client JavaScript bundle.
- Canonical redirects: `/index.html` and `/index` to `/`; legacy `/graph.jsonld` to `/knowledge-graph.jsonld`.
- Static 404 is `noindex`; Cloudflare account-level host, preview, and unknown-path checks remain documented in `docs/cloudflare-required-settings.md`.

## Render and media foundation

- Technical manifests and entity-maintenance prose are excluded from the visible page.
- Visible HTML has one H1, semantic section anchors, keyboard-accessible comparison regions, and graph-addressable FAQ answers.
- All nine repository images render with responsive AVIF, WebP, and fallback variants.
- Eleven verified self-hosted WebM/MP4 pairs render with `preload="none"`, posters, dimensions, and honest text alternatives.
- The damaged mesoneedling pair is excluded. Missing captions and verbatim transcripts are non-blocking deferred enhancements.
- Current Google evidence remains normalized as 5/5 from 163 reviews with its observation date; it has not been removed or reduced.

## Entity and retrieval foundation

- The physician is the sole `MedicalWebPage.mainEntity`.
- The clinic is an independent supporting `MedicalClinic`; physician and clinic identifiers remain separated.
- The canonical graph is `/knowledge-graph.jsonld`; inline JSON-LD is a page-scoped projection rather than a duplicate full graph.
- Every same-site graph fragment resolves to visible HTML or another graph node. Procedure, condition, and informational-term types are not conflated.
- `/llms.txt`, `/llms-full.txt`, retrieval chunks, data indexes, sitemap extensions, release metadata, and SHA-256 digests are generated from the same source state.

## Measured build

- Routes: 1.
- Client JavaScript: 0 bytes.
- HTML: 205,318 bytes raw; 41,046 bytes gzip; 1,802 DOM nodes.
- Retrieval chunks: 121.
- Canonical graph: 253 nodes, 253 unique IDs, 0 dangling same-site references, 0 invisible fragment targets.
- Astro diagnostics: 0 errors, 0 warnings, 0 hints across 36 files.
- Content-package contract: valid synthetic handoff accepted; a 79-item FAQ mutation rejected by the intended gate.

## Final-content boundary

The current visible corpus is a buildable fallback, not the final editorial authority. The final ZIP must pass `scripts/validate-content-package.mjs` and is staged separately before a deliberate adapter maps its approved facts, claims, modules, sources, topics, comparisons, FAQs, and retrieval records into the renderer and canonical graph.

The package contract is in `CONTENT_INPUT_SPEC.md`; the remaining integration state is in `BLOCKING_INPUTS.md`.
