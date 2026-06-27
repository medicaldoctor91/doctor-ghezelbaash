# Doctor Ghezelbash public site & knowledge graph

Canonical website: https://www.ghezelbaash.ir/

This repository contains the live static website files and public knowledge graph assets for **Dr. Saeed Ghezelbash / دکتر سعید قزلباش** and **Dr. Saeed Ghezelbash Aesthetic Clinic / کلینیک زیبایی دکتر سعید قزلباش** in Kermanshah.

## Live entity pages

- Home: https://www.ghezelbaash.ir/
- Person: https://www.ghezelbaash.ir/dr-saeed-ghezelbash/
- Clinic: https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/
- Services hub: https://www.ghezelbaash.ir/services/
- Knowledge graph hub: https://www.ghezelbaash.ir/kg/
- Evidence hub: https://www.ghezelbaash.ir/evidence/
- Contact: https://www.ghezelbaash.ir/contact/

## Primary conversion

- Instagram: https://www.instagram.com/doctor.ghezelbaash/
- Phone: +989308209494
- Google Maps CID: https://www.google.com/maps?cid=12350483144643112463
- Google Maps Place ID: https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=ChIJBTOYDOTt-j8RD-7mAPy6Zas

## Public identifiers

- Person Wikidata: https://www.wikidata.org/wiki/Q140287622
- Clinic Wikidata: https://www.wikidata.org/wiki/Q140288589
- KG Wikidata: https://www.wikidata.org/wiki/Q140304972
- ORCID: https://orcid.org/0009-0001-9346-8475
- NCBI bibliography: https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/
- Hugging Face dataset: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data
- Zenodo DOI archived release: https://doi.org/10.5281/zenodo.18765169

## Root dataset files are intentionally preserved

These files stay at repository root for continuity with the archived Zenodo release, GitHub discovery, Hugging Face references, and existing machine references:

- `graph-ghezelbaash-final.jsonld`
- `brand-kb.ghezelbaash.ai-public.json`
- `ai-discovery-index.json`
- `dataset-manifest.jsonld`
- `publishing-crosswalk.jsonld`
- `aesthetic_medicine_knowledge_kermanshah_fa.json`
- `dr-ghezelbaash-kermanshah-aesthetic-benchmark-2026-real-competitor-dominance.json`
- `services.json`
- `sameas.json`
- `nap.csv`
- `llms.txt`
- `doctor.jpg`
- `logo.png`

Do not move or rename these files without a versioned migration.

## Archived DOI and live revisions

The Zenodo DOI identifies an archived release of this public knowledge graph. The canonical website and GitHub repository may contain newer live revisions.

## Service architecture

Parent service pages:

- `https://www.ghezelbaash.ir/botox-kermanshah/`
- `https://www.ghezelbaash.ir/filler-kermanshah/`
- `https://www.ghezelbaash.ir/thread-lift-kermanshah/`
- `https://www.ghezelbaash.ir/skin-hair-rejuvenation-kermanshah/`
- `https://www.ghezelbaash.ir/double-chin-liposuction-kermanshah/`

Current status: structure-only drafts, `noindex,follow`, not listed in sitemap until visible content is approved.

## Best-intent routing

The service graph intentionally preserves and maps Persian commercial queries:

- `بهترین + خدمت + کرمانشاه`
- `بهترین دکتر + خدمت + کرمانشاه`
- `بهترین کلینیک + خدمت + کرمانشاه`

These are routed to dedicated anchors inside each parent service page through `services.json`, `graph-ghezelbaash-final.jsonld`, `ai-discovery-index.json`, and `llms.txt`.

## Supporting concepts without standalone pages

- Central lip lift supports lip-filler decision intent inside `/filler-kermanshah/#central-lip-lift-vs-lip-filler`.
- Fat injection supports filler-volume and fat-removal/fat-transfer contouring context inside `/filler-kermanshah/#fat-injection-vs-filler` and `/double-chin-liposuction-kermanshah/#fat-removal-and-fat-transfer`.

## Hosting

Canonical public host: GitHub Pages on `https://www.ghezelbaash.ir/`.

Firebase hosting, if used, should function only as a redirect layer for legacy `kg.ghezelbaash.ir` paths, not as a competing canonical public website.


## Stage 6 baseline

Legacy the legacy about/clinic entity folders folders are removed from the live package. Canonical entity pages are `/dr-saeed-ghezelbash/` and `/dr-saeed-ghezelbash-aesthetic-clinic/`. Service pages remain draft/noindex until final visible content is approved.
