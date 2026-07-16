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

Cloudflare Pages Git integration remains the deployment mechanism. A push to `main` builds the strict static output and the GitHub workflow polls the canonical custom domain until the new production page, frozen release record, and canonical graph are visible.
