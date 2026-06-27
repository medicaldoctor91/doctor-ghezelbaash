# Stage 2 graph/path/intent polish report

Date: 2026-06-27

## Scope

This package polishes the graph and machine-readable files for the new static site architecture without moving or renaming root dataset files.

## Preserved root files

- `graph-ghezelbaash-final.jsonld`
- `brand-kb.ghezelbaash.ai-public.json`
- `services.json`
- `doctor.jpg`
- `logo.png`
- `llms.txt`
- `README.md`

## Canonical paths

- Website: https://www.ghezelbaash.ir/
- Person: https://www.ghezelbaash.ir/about-dr-saeed-ghezelbash/
- Clinic: https://www.ghezelbaash.ir/clinic/
- Services hub: https://www.ghezelbaash.ir/services/
- KG hub: https://www.ghezelbaash.ir/kg/
- Evidence: https://www.ghezelbaash.ir/evidence/

## Service architecture

Primary parent pages:

- https://www.ghezelbaash.ir/botox-kermanshah/
- https://www.ghezelbaash.ir/filler-kermanshah/
- https://www.ghezelbaash.ir/thread-lift-kermanshah/
- https://www.ghezelbaash.ir/skin-hair-rejuvenation-kermanshah/
- https://www.ghezelbaash.ir/double-chin-liposuction-kermanshah/

These pages remain `noindex,follow` until full content is approved.

## Best-intent coverage

The graph intentionally preserves and structures the query families:

- `بهترین + خدمت + کرمانشاه`
- `بهترین دکتر + خدمت + کرمانشاه`
- `بهترین کلینیک + خدمت + کرمانشاه`

Implementation locations:

- `graph-ghezelbaash-final.jsonld`
- `brand-kb.ghezelbaash.ai-public.json`
- `services.json`
- `llms.txt`
- Service page metadata and anchors

## No standalone pages at this stage

Central lip lift and fat injection do not receive standalone URLs in this package.

Representations:

- Central lip lift: https://www.ghezelbaash.ir/filler-kermanshah/#central-lip-lift-vs-lip-filler
- Fat injection/filler comparison: https://www.ghezelbaash.ir/filler-kermanshah/#fat-injection-vs-filler
- Fat removal/fat transfer relation: https://www.ghezelbaash.ir/double-chin-liposuction-kermanshah/#fat-removal-and-fat-transfer

## Saeed spelling

Canonical English spelling:

- `Dr. Saeed Ghezelbash`

Legacy third-party URLs may still contain `saeid` or `Ghezelbaash` when they are existing external paths.

## Audit

- JSON files parse successfully.
- Internal links: no broken internal links found.
- Sitemap contains only indexable base pages.
- Service pages are not in sitemap and remain noindex.
- Root dataset paths are preserved.
