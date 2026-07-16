# Production finalization status

The production build no longer depends on placeholder content, synthetic payload floors, or unfinished transcript work.

## Resolved

- All 19 visible Markdown inputs contain approved, user-visible copy.
- The FAQ dataset contains 80 visible question-and-answer units.
- The topic registry contains 31 defined medical-aesthetic terms.
- The comparison registry contains 13 visible comparison tables.
- Existing image derivatives are accepted as authoritative repository media and emitted in AVIF, WebP, and fallback formats.
- Eleven MP4/WebM pairs pass SHA-bound full-decode integrity checks and are published.
- The corrupt `why-mesoneedling-makes-dark-spots-worse-dr-ghezelbash.mp4` and its truncated WebM are explicitly excluded from playback, schema, and sitemap output rather than blocking the entire site.
- Persian captions and verbatim transcripts remain an accessibility enhancement phase. Every video card has an honest text alternative; no fabricated transcript is emitted.
- Strict production build, schema, link, canonical, header, media, retrieval, release-digest, and output-budget checks run on pull requests and `main`.

## Deployment

The validated `dist` directory is packaged and deployed through the repository's enabled GitHub Pages environment. The custom domain remains `www.ghezelbaash.ir`; after deployment, the workflow verifies the live HTML, frozen release record, and canonical graph before reporting success.
