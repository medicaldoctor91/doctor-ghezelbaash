# Deployment status

Source, CI and Cloudflare Preview validation are complete for the single-page physician-entity release.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit verifies the canonical homepage, contextual photographs and videos, the closed twenty-answer disclosure, the canonical graph, main and image sitemaps, Hugging Face profile/Dataset separation, and removal of all former video watch pages and video sitemap.

Deployment retrigger source commit: `d51a5daf7d309bf9f82e7f49c5aa145a96d85f2d`.
