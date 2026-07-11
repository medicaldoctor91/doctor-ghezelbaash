# Ghezelbaash Goal-First v7.3.0

Release date: 2026-07-11
Base: v7.2.2-source-rechecked

## Release decision

v7.3.0 fixes the remaining machine-semantic defects in the answer-first layer and reduces the homepage structured-data payload without removing any watch page, video asset, transcript summary, clip chapter, or media cache policy.

## P0 fixes

### Canonical authored-answer registry

- Added `src/domain/answer-hub.mjs` as the authoritative semantic registry for the answer-first hub.
- Replaced keyword-order inference for 11 authored sections with exact mappings.
- Each authored answer now has explicit concepts, procedures, primary entities, primary intents, query variants, and dimension.
- Cross-service mappings such as hair loss → lip filler, thread lift → cheek filler, and submental liposuction → platysma botox are eliminated.

### Machine-artifact consistency

The exact authored mapping is propagated to:

- `/answers/answers-000.jsonl`
- `/search/chunks-*.jsonl`
- `/faq.json`
- `/ai/faq.json`

A dedicated validator fails the build on drift in concepts, procedures, primary intents, query aliases, or cross-service contamination.

### Real retrieval benchmark

- Replaced the former reverse-index self-check with BM25-style lexical retrieval.
- Scoring uses visible headings, authored query aliases, and visible text.
- Intent IDs and concept IDs are excluded from scoring.
- 200 balanced intent queries are evaluated against the generated corpus.
- 30 authored high-value local queries are evaluated separately.
- All 30 authored queries resolve to the correct answer section at Top-1.

### Homepage video graph normalization

- Removed 12 full `VideoObject` and 36 `Clip` nodes from homepage JSON-LD.
- Added one compact `ItemList` referencing all 12 canonical watch pages.
- Full `VideoObject` and `Clip` graphs remain on every watch page and in `/graph/media.jsonld`.
- Removed invalid `embedUrl` values that pointed to ordinary watch pages rather than embeddable players.
- Video files, VTT files, watch pages, byte-range support, and cache policy are unchanged.

### MIME advertisement correction

- `/graph-summary.json` is now advertised as `application/json` in both site layouts.
- Server header policy and HTML discovery metadata now agree.

## Build-system improvement

- Added deterministic in-process caches for search chunks and the intent registry.
- Clean full build, artifact generation, and all validators complete in approximately 12 seconds in the verification environment.

## Verified output

- 16 HTML pages
- 217 output resources
- 12 watch pages
- 12 valid VTT tracks
- 12 valid clip sets
- 0 broken local resources
- 0 broken navigational fragments
- 0 duplicate DOM IDs
- 0 invalid JSON, JSON-LD, JSONL, or XML documents
- 0 npm audit vulnerabilities

## Homepage payload change from v7.2.2

| Metric | v7.2.2 | v7.3.0 | Change |
|---|---:|---:|---:|
| HTML | 741,108 B | 682,787 B | -58,321 B |
| Inline JSON-LD | 125,923 B | 67,605 B | -58,318 B |
| Gzip HTML | 136,735 B | 132,130 B | -4,605 B |
| Brotli HTML | 91,672 B | 89,055 B | -2,617 B |
| Full `VideoObject` on homepage | 12 | 0 | removed from homepage only |
| `Clip` on homepage | 36 | 0 | removed from homepage only |
| Watch pages | 12 | 12 | preserved |

## Retrieval verification

- Lexical corpus documents: 328
- Balanced intent queries: 200
- Recall@3: 0.885
- MRR: 0.7830595238
- Authored local queries: 30
- Authored Top-1 accuracy: 1.0
- Authored Recall@3: 1.0
- Authored failures: 0

The lower aggregate Recall/MRR values compared with v7.2.2 are not a regression: v7.2.2 measured a circular reverse-index lookup against itself. v7.3.0 measures actual lexical retrieval over the generated corpus.

## Reproducibility

The clean source ZIP was extracted into an empty directory, installed with `npm ci`, rebuilt, and compared file-by-file against the delivered `dist`. All 217 generated files matched by SHA-256.
