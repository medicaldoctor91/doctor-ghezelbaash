# Release notes — v7.2.2

## Scope
Independent regression audit of v7.2.1 plus a corrective Video Graph consistency patch.

## Correction
- Preserved the canonical VideoObject and Clip IRIs introduced in v7.2.1.
- Normalized every watch-page Clip `name` to the same value used by the homepage graph and `graph/media.jsonld`.
- Eliminated 36 cross-graph property conflicts affecting the 36 canonical Clip entities.
- Strengthened `validate:architecture` to compare Clip identity, name, timing, and URL across homepage, watch pages, and the media graph.

## Revalidation scope
- Clean archive extraction and integrity check.
- Fresh `npm ci` with zero reported vulnerabilities.
- Full Astro production build and all project validators.
- Independent internal-link and fragment crawl.
- Parsing of every JSON, JSON-LD, JSONL, and XML output.
- Duplicate DOM ID check.
- Canonical Service URL and forbidden legacy URL scan.
- Cloudflare Pages `_headers` inheritance simulation against every generated resource.
- Cross-graph VideoObject and Clip property consistency audit.
