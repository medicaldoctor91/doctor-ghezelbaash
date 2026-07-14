# Deployment status

Source, CI and Cloudflare Preview validation are complete for the single-page physician-entity release.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit verifies the canonical homepage, contextual photographs and videos, the closed twenty-answer disclosure, the canonical graph, main and image sitemaps, Hugging Face profile/Dataset separation, removal of all former video watch pages and video sitemap, absence of the standalone video knowledge hub, and the minimal physician-first discovery contract in HTML and HTTP headers.

The canonical HTML head now carries only the page identity envelope: title, description, robots preview policy, canonical URL, the internal Person author reference, one `rel=describedby` pointer to the canonical knowledge graph, performance hints, icons and physician-first social preview metadata. External identity profiles, Wikidata entities, datasets and experimental AI text endpoints remain modeled in the knowledge graph or available at their conventional URLs rather than being flattened into the head.

The homepage HTTP `Link` header exposes only `/knowledge-graph.jsonld` as `rel=describedby`. Security, cache, content-type, CORS and indexing controls remain unchanged. Build and production validators prohibit `rel=me`, external `describedby` links, text alternates, decorative hreflang, duplicate Googlebot directives, legacy geo meta tags and additional HTTP Link targets from returning.
