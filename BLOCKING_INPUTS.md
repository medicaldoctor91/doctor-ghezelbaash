# Final-content integration status

The content-independent production foundation is complete and passes the strict static build. The current repository copy remains a fallback corpus; it is not the final editorial package.

## Resolved technical foundation

- Astro emits exactly one indexable static route and no client-side JavaScript bundle.
- The physician is the sole page `mainEntity`; the clinic is represented as a separate supporting entity.
- Canonical external JSON-LD, its page-scoped inline projection, HTML fragment targets, FAQ nodes, media nodes, and release digests are validated together.
- The current fallback corpus contains 80 visible FAQ units, 31 baseline topic units, and 13 comparison tables. These counts do not constrain the final package except where the package contract explicitly requires them.
- All nine repository images render through responsive AVIF, WebP, and fallback sources.
- Eleven verified self-hosted video pairs are published with honest text alternatives. Missing Persian captions or verbatim transcripts are deferred enhancements and do not block release.
- The damaged mesoneedling video pair is excluded from playback, schema, and sitemap output.
- Security headers, caching, canonical redirects, retrieval artifacts, asset manifests, and Cloudflare release verification are generated and checked at build time.

## Remaining input

The only editorial dependency is one extracted `ghezelbaash-content-final` package that passes `npm run content:validate -- <package-path>`. After validation it can be staged with `npm run content:stage -- <package-path>`.

Staging validates and preserves the package without silently replacing the current renderer. The final integration must then map its approved facts, claims, visible modules, sources, topics, comparisons, FAQ data, and retrieval records into the existing typed render and graph layers. Optional captions and verbatim transcripts remain non-blocking.

Only after that integrated build passes every gate should `src/data/release.ts` move from `technical-foundation`/`contentFrozen: false` to `production-final`/`contentFrozen: true`.

## Deployment

The repository workflow validates and archives `dist` but does not deploy through GitHub Pages. Cloudflare Pages builds `main` with `npm run build`, publishes `dist`, and serves `www.ghezelbaash.ir`. After a `main` push, CI verifies that the production `release.json` exposes the same commit SHA.
