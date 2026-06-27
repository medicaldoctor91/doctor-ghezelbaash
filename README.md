# Doctor Ghezelbash Astro site and public entity assets

Canonical website: https://www.ghezelbaash.ir/

This repository contains the Astro static website and the public machine-readable entity assets for Dr. Saeed Ghezelbash / دکتر سعید قزلباش and Dr. Saeed Ghezelbash Aesthetic Clinic / کلینیک زیبایی دکتر سعید قزلباش in Kermanshah.

## Canonical pages

- Home: https://www.ghezelbaash.ir/
- Person: https://www.ghezelbaash.ir/dr-saeed-ghezelbash/
- Clinic: https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/
- Services hub: https://www.ghezelbaash.ir/services/
- Contact: https://www.ghezelbaash.ir/contact/
- Evidence hub: https://www.ghezelbaash.ir/evidence/
- Knowledge graph hub: https://www.ghezelbaash.ir/kg/

## Canonical service pages

- https://www.ghezelbaash.ir/botox-kermanshah/
- https://www.ghezelbaash.ir/filler-kermanshah/
- https://www.ghezelbaash.ir/thread-lift-kermanshah/
- https://www.ghezelbaash.ir/skin-hair-rejuvenation-kermanshah/
- https://www.ghezelbaash.ir/double-chin-liposuction-kermanshah/

## Primary conversion

- Instagram: https://www.instagram.com/doctor.ghezelbaash/
- Phone: +989308209494
- Google Maps CID: https://www.google.com/maps?cid=12350483144643112463

## Public identifiers

- Person Wikidata: https://www.wikidata.org/wiki/Q140287622
- Clinic Wikidata: https://www.wikidata.org/wiki/Q140288589
- Knowledge graph Wikidata: https://www.wikidata.org/wiki/Q140304972
- ORCID: https://orcid.org/0009-0001-9346-8475
- NCBI bibliography: https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/
- Hugging Face dataset: https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data
- Zenodo DOI archived release: https://doi.org/10.5281/zenodo.18765169

## Root public assets intentionally preserved

These files stay at repository root for continuity with existing machine references, archived dataset references, GitHub discovery, Hugging Face references, and Zenodo-linked material:

- `CNAME`
- `robots.txt`
- `logo.png`
- `doctor.jpg`
- `graph-ghezelbaash-final.jsonld`
- `dataset-manifest.jsonld`
- `publishing-crosswalk.jsonld`
- `aesthetic_medicine_knowledge_kermanshah_fa.json`
- `dr-ghezelbaash-kermanshah-aesthetic-benchmark-2026-real-competitor-dominance.json`
- `sameas.json`
- `nap.csv`
- `aesthetic-medicine-dataset.html`
- `google-maps-review-evidence.html`
- `brand-kb.ghezelbaash.ai-public.json`
- `llms.txt`
- `ai-discovery-index.json`
- `services.json`
- `.zenodo.json`
- `CITATION.cff`

Do not move or rename these files without a deliberate versioned migration.

## Deployment

Canonical deployment is the Astro static build through GitHub Pages Actions:

```text
.github/workflows/astro-pages.yml
```

The build validates the generated site, route registry, SEO/AEO index, internal link graph, and page context before deploying the `dist` artifact.
