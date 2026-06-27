# Graph Line Review — Stage 3

Date: 2026-06-27  
Scope: `graph-ghezelbaash-final.jsonld`, service intent map, root dataset continuity, and Stage 2 graph polish package.

## Decision

The graph is structurally aligned with the new static site architecture:

- Canonical website: `https://www.ghezelbaash.ir/`
- Person entity: `https://www.ghezelbaash.ir/#dr-saeed-ghezelbash`
- Clinic entity: `https://www.ghezelbaash.ir/#clinic`
- KG/Dataset entity: `https://www.ghezelbaash.ir/kg/#dataset`
- Service parent pages:
  - `/botox-kermanshah/`
  - `/filler-kermanshah/`
  - `/thread-lift-kermanshah/`
  - `/skin-hair-rejuvenation-kermanshah/`
  - `/double-chin-liposuction-kermanshah/`

## Entity review

### WebSite

Status: pass with one correction.

- `@id` uses canonical `www`.
- `about` correctly points to Person, Clinic, and KG/Dataset.
- `hasPart` correctly points to entity/base pages.
- `SearchAction` was removed because no real internal search endpoint exists in the static site.

### Person / Physician

Status: pass.

- Canonical spelling: `Saeed`.
- Canonical page: `/about-dr-saeed-ghezelbash/`.
- SameAs includes Wikidata, ORCID, NCBI, IRIMC, LinkedIn, GitHub, Instagram.
- `knowsAbout` preserves best-service Kermanshah intent clusters.

### Clinic

Status: pass.

- Canonical page: `/clinic/`.
- Uses Google Maps CID, Place ID, OSM, Instagram and Wikidata.
- Offers point to the five service parent pages.

### KG / Dataset

Status: pass.

- Canonical page: `/kg/`.
- Root dataset files remain in root and are not moved.
- Zenodo DOI is represented as archived release / `isBasedOn`.
- GitHub and Hugging Face remain linked as machine-discovery surfaces.

### Service clusters

Status: pass.

The five parent service clusters are represented as `Service` and `MedicalProcedure` nodes. Each includes:

- canonical parent URL
- Kermanshah locality targeting
- aggressive best-intent query keywords
- child anchors via WebPageElement nodes
- supporting concepts without standalone URLs where applicable

## Best-intent coverage

The following intent families are explicitly preserved:

- `بهترین + خدمت + کرمانشاه`
- `بهترین دکتر + خدمت + کرمانشاه`
- `بهترین کلینیک + خدمت + کرمانشاه`

They are mapped to the following anchors:

- `/botox-kermanshah/#best-botox-doctor-kermanshah`
- `/filler-kermanshah/#best-filler-doctor-kermanshah`
- `/thread-lift-kermanshah/#best-thread-lift-doctor-kermanshah`
- `/skin-hair-rejuvenation-kermanshah/#best-rejuvenation-doctor-kermanshah`
- `/double-chin-liposuction-kermanshah/#best-double-chin-doctor-kermanshah`

## Supporting concepts

No standalone pages are created for:

- Central lip lift
- Fat injection

They are preserved as supporting concepts:

- `/filler-kermanshah/#central-lip-lift-vs-lip-filler`
- `/filler-kermanshah/#fat-injection-vs-filler`
- `/double-chin-liposuction-kermanshah/#fat-removal-and-fat-transfer`

## Technical corrections applied in Stage 3

- Removed `SearchAction` from graph/brand KB.
- Added physically resolvable `/services/` sections for graph fragments:
  - `#service-architecture`
  - `#best-intent-map`
  - `#no-standalone-supporting-concepts`
- Preserved root dataset paths.
- Preserved noindex status for service pages until final content approval.

## Audit result

- JSON parse: pass
- Local `@id` reference resolution inside graph: pass
- `www` canonical consistency: pass
- `Saeed` spelling policy: pass
- Legacy external paths containing `saeid`: preserved only where they are existing third-party URLs
- Service pages in sitemap: no
- Service pages status: `noindex,follow`
