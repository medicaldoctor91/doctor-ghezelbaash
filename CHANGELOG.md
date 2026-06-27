
## 2026-06-27 — Stage 6 entity-path cleanup

- Removed legacy live folders the legacy about/clinic entity folders from the package.
- Kept canonical entity pages at `/dr-saeed-ghezelbash/` and `/dr-saeed-ghezelbash-aesthetic-clinic/`.
- Replaced internal references to legacy entity paths across HTML, JSON, JSON-LD, Markdown, sitemap, and LLM files.
- Strengthened `services.json` with AI Overview release gates and best-intent execution policy.
- Preserved root dataset paths for Zenodo/GitHub/AI discovery continuity.

## Stage 5 — Entity-path and AI Overview structure review

- Changed canonical Person path to `/dr-saeed-ghezelbash/`.
- Changed canonical Clinic path to `/dr-saeed-ghezelbash-aesthetic-clinic/`.
- Kept legacy `/dr-saeed-ghezelbash/` and `/dr-saeed-ghezelbash-aesthetic-clinic/` as noindex redirect stubs.
- Updated sitemap, internal links, graph references, sameAs map, llms, README, and service references.
- Preserved root dataset paths for Zenodo/GitHub discovery.

# Changelog

## v1.1.0-structure-stage1 — 2026-06-27

- Preserved existing root dataset files from the Zenodo-era package.
- Changed canonical public host from `github.ghezelbaash.ir` to `https://www.ghezelbaash.ir/`.
- Updated `CNAME`, `robots.txt`, `sitemap.xml`, `README.md`, and machine-readable pointers.
- Added initial static pages for entity, clinic, services, contact, evidence, and KG.
- Added structure-only service pages with `noindex,follow`.
- Added `services.json` to define parent pages, child anchors, best-intent anchors, and no-standalone service concepts.
- Central lip lift and fat injection are represented as supporting concepts, not standalone pages.

## stage2-graph-path-intent-polish — 2026-06-27

- Rebuilt `graph-ghezelbaash-final.jsonld` as a cleaner canonical graph for the new static site architecture.
- Added machine-readable DefinedTermSet for best-service and best-doctor-service Kermanshah search intent families.
- Preserved root dataset file paths for Zenodo/GitHub continuity.
- Kept central lip lift and fat injection as supporting concepts without standalone URLs.
- Updated `brand-kb.ghezelbaash.ai-public.json` with `ai_public_profile_v3`, path policy, and best-intent coverage map.
- Updated `services.json` to v2 with canonical parent service pages, anchors, query clusters and no-standalone concept policy.
- Did not add full service content to draft pages.

## Stage 3 graph line review — 2026-06-27

- Reviewed `graph-ghezelbaash-final.jsonld` entity-by-entity: WebSite, Person/Physician, Clinic, KG/Dataset, Service clusters and WebPageElement child anchors.
- Preserved aggressive Persian best-intent coverage: `بهترین + خدمت + کرمانشاه`, `بهترین دکتر + خدمت + کرمانشاه`, and `بهترین کلینیک + خدمت + کرمانشاه`.
- Removed `SearchAction` from graph/brand KB because the static site does not implement an internal search endpoint yet.
- Made `/services/` graph fragments physically resolvable for `#service-architecture`, `#best-intent-map`, and `#no-standalone-supporting-concepts`.
- Kept root dataset paths unchanged for Zenodo/GitHub discovery continuity.


## 1.1.0-stage4-live — 2026-06-27

- Merged Stage 3 graph/site edits into full GitHub repository snapshot.
- Preserved root dataset paths for Zenodo/GitHub/Hugging Face discovery continuity.
- Added/updated `sameas.json`, `nap.csv`, `services.json`, `ai-discovery-index.json`, `dataset-manifest.jsonld`, `publishing-crosswalk.jsonld`.
- Aligned Saeed spelling, www canonical URLs, Wikidata/ORCID/NCBI/Google Maps/GitHub/Hugging Face/Zenodo identifiers.
- Preserved aggressive best-intent query mappings for `بهترین + خدمت + کرمانشاه` and `بهترین دکتر + خدمت + کرمانشاه`.
- Kept service pages as noindex structure-only drafts.
- Converted Firebase config to legacy redirect-only policy.

