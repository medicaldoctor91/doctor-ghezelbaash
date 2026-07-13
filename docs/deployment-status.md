# Deployment status

Source, CI and Cloudflare Preview validation are complete for the ProfilePage and dedicated video watch-page release.

Production verification is performed by `.github/workflows/verify-production.yml` against the custom domain with cache-busting requests. The audit now verifies the homepage, all twelve watch pages, inline VideoObject data, the canonical graph, main sitemap, image sitemap and video sitemap.

Deployment retrigger source commit: `72120ca4fb1e9049319a73d46aa01f2fee49551d`.
