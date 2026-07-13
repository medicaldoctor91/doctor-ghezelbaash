# Deployment status

Source, CI and Cloudflare Preview validation are complete for the single-page physician-entity release.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit verifies the canonical homepage, contextual photographs and videos, the closed twenty-answer disclosure, the canonical graph, main and image sitemaps, Hugging Face profile/Dataset separation, removal of all former video watch pages and video sitemap, and absence of the standalone video knowledge hub and its navigation links.

Deployment retrigger source commit: `c78136edd72577a567d06a9691cb6cc2af45432d`.
