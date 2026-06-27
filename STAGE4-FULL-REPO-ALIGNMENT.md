# Stage 4 full-repo alignment report

Date: 2026-06-27

## Scope

Merged the Stage 3 graph/site edits into the full GitHub repository snapshot, then aligned additional machine-facing files that were not present in the smaller Zenodo snapshot.

## Preserved root paths

No existing root dataset file was moved or renamed.

Preserved:

- graph-ghezelbaash-final.jsonld
- brand-kb.ghezelbaash.ai-public.json
- ai-discovery-index.json
- dataset-manifest.jsonld
- publishing-crosswalk.jsonld
- aesthetic_medicine_knowledge_kermanshah_fa.json
- dr-ghezelbaash-kermanshah-aesthetic-benchmark-2026-real-competitor-dominance.json
- aesthetic-medicine-dataset.html
- google-maps-review-evidence.html
- doctor.jpg
- logo.png
- CITATION.cff
- .zenodo.json

## Added root helper files

- services.json
- sameas.json
- nap.csv
- llms.txt

## Canonical decisions

- Canonical website: https://www.ghezelbaash.ir/
- Person page: https://www.ghezelbaash.ir/dr-saeed-ghezelbash/
- Clinic page: https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/
- KG hub: https://www.ghezelbaash.ir/kg/
- Saeed spelling is canonical.
- Legacy external paths containing `saeid` are preserved only where those external URLs already exist.

## Service architecture

Five parent service pages are present as structure-only drafts:

- /botox-kermanshah/
- /filler-kermanshah/
- /thread-lift-kermanshah/
- /skin-hair-rejuvenation-kermanshah/
- /double-chin-liposuction-kermanshah/

They remain noindex and are not listed in sitemap until content is approved.

## Best-intent coverage

Machine-readable files preserve exact Persian intent families:

- بهترین + خدمت + کرمانشاه
- بهترین دکتر + خدمت + کرمانشاه
- بهترین کلینیک + خدمت + کرمانشاه

## Supporting concepts without pages

- Central lip lift: mapped under /filler-kermanshah/
- Fat injection: mapped under /filler-kermanshah/ and /double-chin-liposuction-kermanshah/

## Firebase

Firebase is converted to manual redirect-only legacy policy. It is not a canonical mirror.
