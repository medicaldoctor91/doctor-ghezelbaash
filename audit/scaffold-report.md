# Static entity-page scaffold report

Status date: 2026-07-16

Base revision: `main@115ea581c47bb7c04d7c3954306bd7096b87edc8`

Release state: **scaffold only — not production-final**

## File changes

- Removed: legacy page routes, the former nine-stage homepage/content system, obsolete compilers/domain layers, browser tests, old validation scripts and reports, legacy Cloudflare/GitHub workflows, and duplicate package-manager locks.
- Added: the prescribed single-page Astro source tree, 19 visible-content slots, canonical graph/data generators, machine-readable artifact generators, media workspace and integrity report, production validators, Cloudflare account checklist, and one CI workflow.
- Changed: Astro/package/TypeScript configuration, ignore rules, security headers, redirects, robots policy, and the root page.
- Moved without content changes where possible: existing MP4 masters, thumbnails, image derivatives, brand derivatives, and legacy chapter-marker VTT files into `Media/` with their provenance retained.

## URL and deployment controls

- Source routes: only `src/pages/index.astro`.
- Canonical: `https://www.ghezelbaash.ir/`.
- Repository redirect: only `/index.html / 301`.
- Static 404: noindex, no canonical, no script; real edge-status behavior still requires Cloudflare verification.
- No `pages.dev` URL, SPA fallback, catch-all redirect, Worker, or Pages Function is emitted.
- Host, scheme, preview-protection, and unknown-path behavior remain account-side checks in `docs/cloudflare-required-settings.md`.

## Media status

- Images: existing derivatives support scaffold rendering; all nine originals plus seven prescribed brand/favicon sources remain required for production.
- Videos: 12 MP4 masters, 12 WebM alternatives, 12 thumbnails, and 12 WebP posters are present.
- Integrity: 11 MP4 masters pass full decode. The mesoneedling MP4 fails full decode, and its WebM is truncated relative to the master duration.
- Captions/transcripts: 0/12 verified Persian caption VTT files and 0/12 verbatim Persian transcript files. The retained three-cue VTT files are chapter markers only.
- Playback contract: the production component uses self-hosted WebM/MP4, `controls`, `preload="none"`, poster, caption track, explicit dimensions, and visible transcript; it emits no player until those required inputs exist.

## Semantic and machine-readable status

- Scaffold graph: 54 nodes generated from the same canonical graph used by inline JSON-LD and `/graph.jsonld`.
- Main entity: physician `https://www.ghezelbaash.ir/#doctor`; clinic remains an independent supporting entity.
- Physician/clinic identifiers and `sameAs` sets are separated and checked for leakage.
- Prohibited procedure-level commercial schema and data-layer flags are rejected.
- Dataset section and schema use the repository's existing Zenodo and Hugging Face records.
- `/llms.txt`, `/llms-full.txt`, all required data indexes, sitemap extensions, vCards, manifests, and release metadata are generated at build time.
- Scaffold chunks: 0, because visible copy is intentionally blank. Production requires 150–280 and fails outside that range.
- Scaffold release: `contentFrozen=false`; production switches it to `true` only after all gates pass.

## Current scaffold budgets

- HTML raw: about 45KB; HTML gzip: about 7KB; DOM: about 395 nodes.
- CSS gzip: about 2KB; client JavaScript: 0 bytes.
- Persian WOFF2: 111,152 bytes, within the required 80–180KB range.
- Scaffold LCP WebP: about 23KB; all videos are `preload="none"` and excluded from initial transfer.
- The production HTML/gzip floors cannot be evaluated until the final visible corpus is supplied.

## Validation result

- `npm run build:scaffold`: passes all 18 structural checks.
- `npm run build`: intentionally fails before artifact generation while visible copy, original media, captions, transcripts, and the damaged video pair remain unresolved.
- `npm run media:verify`: intentionally fails and records the damaged MP4/WebM pair; all other video files pass.
- `git diff --check`: passes.

The complete input gate is in `BLOCKING_INPUTS.md`; the visible-copy contract is in `CONTENT_INPUT_SPEC.md`.
