# Stage 6 Audit — Entity-path cleanup and full structural review

## Package scope

This package is based on Stage 5 and applies a full structural cleanup focused on SEO/AEO/Google AI Overview readiness.

## Removed legacy folders

The legacy person and clinic folders were removed from the package. They are not present as physical directories.

Canonical entity pages:

- `dr-saeed-ghezelbash/index.html`
- `dr-saeed-ghezelbash-aesthetic-clinic/index.html`

## Validation

- JSON / JSON-LD parse errors: 0
- Broken internal HTML links: 0
- Missing internal fragment anchors: 0
- Service pages in sitemap: 0
- Service pages with `noindex,follow`: 5
- Legacy exact person path references: 0
- Legacy exact clinic path references: 0
- `Saeid` uppercase spelling occurrences: 0

Lowercase `saeid` occurrences may remain only inside legacy external URLs that already exist, such as Hugging Face dataset paths.

## Sitemap indexable URLs

- `/`
- `/dr-saeed-ghezelbash/`
- `/dr-saeed-ghezelbash-aesthetic-clinic/`
- `/services/`
- `/contact/`
- `/evidence/`
- `/kg/`
- `/aesthetic-medicine-dataset.html`
- `/google-maps-review-evidence.html`

## Draft/noindex service pages

- `/botox-kermanshah/`
- `/filler-kermanshah/`
- `/thread-lift-kermanshah/`
- `/skin-hair-rejuvenation-kermanshah/`
- `/double-chin-liposuction-kermanshah/`

## AEO / AI Overview release gate

A service page should become indexable only after the visible page contains:

1. Quick answer / direct summary
2. Candidate criteria
3. Use cases or subservices
4. Patient-facing process overview
5. Results timeline or duration
6. Aftercare
7. Side effects and risk signals
8. Cost factors
9. Best doctor / best service selection criteria in Kermanshah
10. FAQ
11. Instagram / phone / maps conversion path

## Best-intent policy

The following aggressive search patterns remain preserved in machine-readable service architecture and graph files:

- `بهترین + خدمت + کرمانشاه`
- `بهترین دکتر + خدمت + کرمانشاه`
- `بهترین کلینیک + خدمت + کرمانشاه`

They are mapped to visible future H2/FAQ anchors inside parent service pages, not weakened or removed.
