# Stage 6 — Entity-path cleanup and AI Overview structure review

## Decision

Legacy live folders were removed from the package:

- `legacy person entity path`
- `legacy clinic entity path`

Canonical entity pages are now:

- `/dr-saeed-ghezelbash/`
- `/dr-saeed-ghezelbash-aesthetic-clinic/`

## Why this is more useful

The public URL paths now match the strongest entity phrases more closely:

- `Dr. Saeed Ghezelbash`
- `Dr. Saeed Ghezelbash Aesthetic Clinic`

This improves entity matching consistency across the website, Wikidata references, machine-readable files, GitHub, Zenodo metadata, and LLM retrieval.

## Service architecture

The service architecture remains intentionally small and aggressive:

- `/botox-kermanshah/`
- `/filler-kermanshah/`
- `/thread-lift-kermanshah/`
- `/skin-hair-rejuvenation-kermanshah/`
- `/double-chin-liposuction-kermanshah/`

These service pages remain `noindex,follow` until visible final content is approved.

## Best-intent strategy

The intent families are preserved and mapped, not weakened:

- `بهترین + خدمت + کرمانشاه`
- `بهترین دکتر + خدمت + کرمانشاه`
- `بهترین کلینیک + خدمت + کرمانشاه`

Each parent service page has a dedicated future visible anchor for its best-intent section.

## Supporting concepts without standalone URLs

No standalone pages are created for:

- central lip lift
- fat injection

They remain supporting concepts inside:

- `/filler-kermanshah/#central-lip-lift-vs-lip-filler`
- `/filler-kermanshah/#fat-injection-vs-filler`
- `/double-chin-liposuction-kermanshah/#fat-removal-and-fat-transfer`

## Zenodo continuity

Root dataset file paths remain preserved. Existing root machine-readable assets were not moved.
