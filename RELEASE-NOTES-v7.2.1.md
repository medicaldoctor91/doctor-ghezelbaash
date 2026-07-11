# Release notes — v7.2.1

## Scope
Focused corrective release for URL architecture, video graph identity, repository cleanup, and Cloudflare Pages MIME/cache policy.

## Changes

### Service URL architecture
- Removed five experimental service/clinic redirects and all active entity/evidence references to them.
- Replaced heading-keyword URL discovery with an explicit 16-procedure canonical registry.
- Added stable semantic fragments using `#service-{procedure-id}` while preserving the single-page architecture.
- Added rendered alias anchors at the relevant editorial sections.

### Homepage video graph
- Unified each VideoObject IRI across homepage, watch page, media catalogue, authority map, and graph shards.
- Unified Clip IRIs under each canonical watch page.
- Connected videos to `/videos/#webpage` rather than the raw hub URL.
- Normalized VTT-derived chapter indexes to 1..N.

### Repository cleanup
- Removed `examples/d1/` and `drizzle/meta/` together with their now-empty parent directories.

### MIME and cache policy
- Removed overlapping Content-Type declarations.
- Added explicit MIME rules for JSON, JSON-LD, NDJSON, XML, WebVTT, MP4, and webmanifest resources.
- Restricted `Accept-Ranges: bytes` to MP4 files.
- Kept long-lived immutable caching for media assets while forcing `/videos/` HTML and watch-page HTML to revalidate.

### Regression protection
- Added `validate:architecture` and included it in the production build pipeline.
- Validator rejects unstable service URLs, duplicate video identities, legacy URL reintroduction, MIME conflicts, immutable HTML, and non-MP4 range headers.

## Validation
- Astro pages: 16
- Output resources: 216
- Canonical services: 16
- Canonical video pages: 12
- Retrieval queries: 200
- Recall@3: 1.00
- MRR: 0.99
- Severe cross-service errors: 0
- Unsupported direct answers: 0
