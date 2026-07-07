# Ghezelbaash Astro site

Static Astro site for `ghezelbaash.ir`, built with Astro Content Collections, Astro endpoints, page-scoped JSON-LD, and a generated canonical entity graph.

## Source-of-truth model

- Human pages: `src/content/pages/*.md` rendered through `src/pages/[...slug].astro`
- Page UI data: `src/content/page-ui/*.json`
- Page schema embeds: `src/content/page-schema/*.json`
- Canonical graph inputs: `src/content/graph-sources/*.json` + `src/content/page-structured-data/*.json`
- Data feeds: `src/content/aeo-data/*.json` rendered through `src/pages/data/[id].json.ts`
- LLM navigation text: `src/content/llms/*.json` → `/llms.txt` and `/llms-full.txt`
- Site settings/contact data: `src/content/site-settings/site.json` + `src/content/site/contact.json`
- Page media metadata: `src/content/page-media/*.json`

Runtime/static outputs are produced by Astro pages and endpoints. The primary human pages are generated from Content Collections through a single Astro rest-parameter route; video watch pages remain technical support pages for VideoObject and video sitemap coverage.

## Commands

```bash
npm ci
npm run check
npm run build
```

## Cloudflare Pages

Use GitHub integration with:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `22.12.0` or newer

See `docs/cloudflare-pages-github-deploy.md`.

## Cloudflare edge files

`public/_headers` is committed for Cloudflare Pages. It keeps generated JSON/XML/text feeds cache-controlled, static media assets immutable without freezing HTML watch pages, preview `*.pages.dev` domains noindexed, and the `/search/` utility page noindexed through `X-Robots-Tag`. Canonical URLs are produced directly by Astro with `trailingSlash: 'always'` and canonicalized Content Collections data.
