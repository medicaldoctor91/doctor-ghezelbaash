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

## Public machine-readable assets

The canonical entity graph is the only standalone public JSON-LD source of truth:

- `https://www.ghezelbaash.ir/graph-ghezelbaash-final.jsonld`

Dataset manifest, publishing crosswalk, and research graph semantics are consolidated into the Dataset, Person, Physician, CollectionPage, and ScholarlyArticle nodes inside the primary graph. They are not maintained as separate public JSON-LD endpoints.

Other generated machine-readable projections remain secondary to the graph:

- `brand-kb.ghezelbaash.ai-public.json`
- `ai-discovery-index.json`
- `entity-hardening-index.json`
- `aesthetic_medicine_knowledge_kermanshah_fa.json`
- `local-competitive-landscape.json`
- `services.json`
- `service-taxonomy.json`
- `sameas.json`
- `location.json`
- `regulatory.json`
- `research.json`
- `dataset.json`
- `authority-signals.json`
- `profile-links.json`
- `nap.csv`
- `llms.txt`
- `routes.json`
- `seo-aeo-index.json`
- `page-context.json`
- `link-graph.json`
- `sitemap.xml`

## Deployment

Canonical deployment is the Astro static build through GitHub Pages Actions:

```text
.github/workflows/astro-pages.yml
```

The build validates the generated site, machine-readable asset architecture, schema entities, schema property expansion, research consolidation, generated dist, llms.txt, and page context before deploying the `dist` artifact.
