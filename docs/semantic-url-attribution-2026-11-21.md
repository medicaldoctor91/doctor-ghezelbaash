# Evidence-scoped clinical URL attribution (2026-11-21)

Status: **review candidate; not published**.

## Purpose and agreed boundaries
This change strengthens the existing physician-centered RDF graph without declaring editorial guides, educational videos, biographies or contact pages to be commercial Offers. The user agreed to retain the existing physician `hasOfferCatalog` and 124 evidence-bounded Offers as an intentional exception to the original 18 November approval. The 18 November policy's separate Person and PhysiciansOffice nodes, sole physician provider, stable IRIs, and clinical service channels remain unchanged.

The published baseline contains:
- 72 sitemap URLs, each with physician `author` and `publisher` in its WebPage node.
- 124 Services with `Service.url`, pointing to 37 distinct local page bases.
- 124 Offers, of which exactly 10 have `Offer.url`.
- 62 physician-authored Article nodes and 4 creator-attributed VideoObject nodes.

## Narrowly scoped implementation
`connectClinicalContentToServices` creates only a missing inverse `Service.subjectOf -> Article | VideoObject` reference when:
1. The service exists and has exactly one `provider`, the canonical Person.
2. The content's `url` is on the canonical site.
3. The content has physician `author` (Article) or `creator` (VideoObject).
4. The content's existing `about` explicitly references that Service.
5. The inverse reference is not already present.

Fixture verification on the then-current, published 1,919-node graph: **59 new inverse references** (55 to Articles, 4 to VideoObjects) spanning **29 Services and 44 content nodes**. Running it again adds zero references. The 1,919 `@id` values, 124 Services, 124 Offers, 10 `Offer.url` values, and physician node are unchanged.

## Byte budget check
A local reconstruction of the original published homepage with the augmented graph yielded **script end byte 1,974,714**, inside a conservative uncompressed **2,000,000 byte** budget (25,286 bytes margin). These figures are based on the historical built HTML fixture; verify the **actual production build** before publication with the existing `home-canonical-rdf-head.test.mjs` and live fetch after deployment.

The site's body remains mostly beyond that budget; this patch does not solve Googlebot's truncation of visible HTML or imply a ranking benefit.

## Required release gates
- Run `npm ci && npm run build` and the complete existing Node/Python tests and SHACL validators at the exact reviewed commit.
- Confirm that all inverse links have exact, locally present authored content whose `about` references the Service, with no wrong-author/offsite/inferred links.
- Confirm the full homepage JSON-LD still ends before 2 MB; no duplicate script or missing `mainEntity`.
- Confirm the 18 November clinical attribution invariants are unchanged and service categories/claims were not expanded.
- Do not publish on Cloudflare, Hugging Face, Kaggle or Zenodo before coordinated C/M source-freeze and public parity validation.
