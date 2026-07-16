# Cloudflare Pages account-side settings

Apply these settings to the existing Pages project after the production build passes and before merging the release branch.

1. Production branch: `main`; build command: `npm run build`; output directory: `dist`.
2. Primary custom domain: `www.ghezelbaash.ir`.
3. Redirect `http://www.ghezelbaash.ir/*` to `https://www.ghezelbaash.ir/$1` with status 301.
4. Redirect both schemes of `ghezelbaash.ir/*` to `https://www.ghezelbaash.ir/$1` with status 301.
5. Enable Pages preview access protection where available. Independently verify that preview responses carry `X-Robots-Tag: noindex, nofollow` or equivalent protection.
6. Do not configure a catch-all redirect to `/` or `/index.html`.
7. Verify that unknown page paths return origin status 404, `/index.html` and `/index` return 301 to `/`, and the legacy `/graph.jsonld` path redirects to `/knowledge-graph.jsonld`.
8. Verify that no `*.pages.dev` URL is emitted by the production HTML, JSON-LD, sitemap, LLMS files, manifests, or data indexes.

No Worker or Pages Function is part of this design.
