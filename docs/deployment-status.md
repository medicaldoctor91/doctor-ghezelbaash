# Deployment status

Source, CI and Cloudflare Preview validation are complete for the single-page physician-entity release.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit verifies the canonical homepage, contextual photographs and videos, the closed twenty-answer disclosure, the canonical graph, main and image sitemaps, Hugging Face profile/Dataset separation, removal of all former video watch pages and video sitemap, absence of the standalone video knowledge hub, and the current machine-resource discovery contract in HTML and HTTP Link headers.

The current head contract removes the personal Hugging Face profile from `rel=me`, keeps Instagram as a head ownership link while retaining it exclusively in `Clinic.sameAs`, exposes the Hugging Face Dataset and the Person/Clinic/Dataset Wikidata entities through `rel=describedby`, and exposes `llms.txt` plus `/.well-known/ai.txt` as text alternates.

Deployment retrigger source commit: `833b4e392b81c28be3d2aa855833732149783195`.
