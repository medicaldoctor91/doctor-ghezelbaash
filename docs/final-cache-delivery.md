# Final cache and Cloudflare delivery audit — 2026-10-10

This change targets the final website distribution. The existing Pages release publishes the verified, sealed artifact; Cloudflare native Git production builds remain disabled.

The final `_headers` policy uses immediate browser revalidation for HTML, including `/index.html`; one-year immutable caching for the content-hashed stylesheet and reader script; and one-hour revalidation for mutable media, fonts and the existing root icons/domain verification file. Native Pages ETags provide conditional 304 responses. The policy fits within Pages limits at 58 rules. No `_astro` assets exist in this distribution.

Both `/404.html` and its Pages-normalized `/404` path now have `no-store`, `noindex, follow` and no inherited graph/preload links. The compact HTML route rule is retained because independent rules for every canonical page plus machine resources would exceed the Pages 100-rule limit.

Two existing Cloudflare rules were updated and read back successfully in [the operational run](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/38032419219):

- The status-404 response correction removes `Link`, labels the real HTML error body `text/html; charset=utf-8`, and uses the current source CSP instead of obsolete inline hashes. This also fixes undefined graph-subject paths previously returning HTML labeled JSON-LD.
- The existing Browser Integrity Check exception now covers all current machine and release document paths for canonical-host GET/HEAD clients. Its 33 exact paths preserve the verified-crawler rule and other WAF protection.

Live checks confirmed one-step canonical redirects with query preservation, working video byte ranges, 72 sitemap pages/four videos, indexable canonical HTML, machine MIME/CORS, Brotli for HTML/JSON-LD/Turtle/CSV, and working ETags. The operational rules do not replace the site's automatic Pages deployment invalidation.

The current GitHub Cloudflare secret authorizes Pages, the response transforms and WAF rules, but returns HTTP 403 for cache rules, compression rules, DNS, zone settings, bot management and tiered cache. Consequently no changes to those unavailable APIs are claimed. The existing redirects and domain activation are healthy.

One remaining opportunity requires Cloudflare compression-rule access: `/clinical-passages.jsonl` (6,603,205 bytes) and `/sbom.cdx.json` (343,516 bytes) are currently uncompressed. Local gzip estimates are 861,925 and 43,339 bytes respectively, about 87% lower. A rule adding `application/x-ndjson` and the declared vendor JSON MIME types to Brotli/gzip negotiation can address this without changing their content or MIME. The canonical dataset already resides on Pages and has a separate Hugging Face distribution.

The production verifier now checks HTML/hashed-asset cache policies and actual, normalized and undefined-subject error headers alongside sealed public-byte verification.
