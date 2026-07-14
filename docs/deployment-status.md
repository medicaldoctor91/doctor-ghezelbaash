# Deployment status

The source contract targets one canonical, indexable, Astro-rendered physician entity landing page. The homepage remains the sole public Search document; the clinic, knowledge graph, datasets, services, evidence and media support that page without creating competing entity URLs.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit verifies the canonical homepage, contextual photographs and videos, the closed twenty-answer disclosure, the six expanded priority-answer passages, the visible 5/163 Google Maps reputation statement, the inline and canonical graphs, main and image sitemaps, Hugging Face profile/Dataset separation, removal of all former video watch pages and video sitemap, and the minimal physician-first discovery contract in HTML and HTTP headers.

## Person and Clinic contract

- `https://www.ghezelbaash.ir/#person` is a pure `Person` and the sole homepage `mainEntity`.
- `https://www.ghezelbaash.ir/#clinic` is a separate `MedicalClinic` and `LocalBusiness`.
- Person points to Clinic with `worksFor`, `workLocation` and `affiliation`; Clinic points back with `employee`.
- Clinic is the provider of offered services and the location/reputation entity.
- Clinic `aggregateRating` uses the same dated 5.0/5 and 163-rating snapshot that appears in visible HTML.
- A dated reputation Dataset has Clinic as `mainEntity` and explicitly mentions Person, preserving separation while exposing the supporting relationship.

## Retrieval and answer contract

The rendered homepage contains six fully visible, independent answer-first passages covering local doctor selection, interpretation of clinic reputation, national selection criteria, cost, surgical/referral boundaries and correction after previous treatment. Matching `Question`, `Answer` and `ItemList` nodes are present in both the compact inline graph and the full canonical graph. The existing closed twenty-answer local service-specific disclosure remains intact.

Services are separated into `offered`, `evaluated` and `referral-context` relationships. Surgical and non-surgical search intents are covered, but referral-context topics are not converted into false offered-service claims.

## Discovery contract

The canonical HTML head carries only the page identity envelope: title, description, robots preview policy, canonical URL, the internal Person author reference, one `rel=describedby` pointer to the canonical knowledge graph, performance hints, icons and physician-first social preview metadata. External identity profiles, Wikidata entities, datasets and experimental AI text endpoints remain modeled in the knowledge graph or available at their conventional URLs rather than being flattened into the head.

The homepage HTTP `Link` header exposes only `/knowledge-graph.jsonld` as `rel=describedby`. Security, cache, content-type, CORS and indexing controls remain unchanged. Build and production validators prohibit `rel=me`, external `describedby` links, text alternates, decorative hreflang, duplicate Googlebot directives, legacy geo meta tags and additional HTTP Link targets from returning.

## Release gates

Pull requests compile the production-audit Python scripts and run the full Astro build. Release validators enforce the two-page static architecture, fragment integrity, exactly one H1, 12 contextual videos, 11+ contextual images, Person/Clinic relationships, 5/163 reputation consistency, six Question/Answer pairs, no video rich-result claims, fewer than 60 inline graph nodes, fewer than 3,500 DOM elements, homepage raw size below 700KB, gzip below 145KB and Brotli below 115KB.

GitHub Pages deployment workflow restored in commit `909916b55c451de79cf8ac621e59db0722a2f34d`.
Deployment retrigger source commit: `909916b55c451de79cf8ac621e59db0722a2f34d`.
