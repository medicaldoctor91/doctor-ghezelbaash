# Final cache and Cloudflare delivery audit — 2026-10-10

This change targets the final website distribution. The existing Pages release publishes the verified, sealed artifact; Cloudflare native Git production builds remain disabled.

The final `_headers` policy uses immediate browser revalidation for HTML, including `/index.html`; one-year immutable caching for the content-hashed stylesheet and reader script; and one-hour revalidation for mutable media, fonts and the existing root icons/domain verification file. Native Pages ETags provide conditional 304 responses. The policy fits within Pages limits at 58 rules. No `_astro` assets exist in this distribution.

Both `/404.html` and its Pages-normalized `/404` path now have `no-store`, `noindex, follow` and no inherited graph/preload links. The compact HTML route rule is retained because independent rules for every canonical page plus machine resources would exceed the Pages 100-rule limit.

Two existing Cloudflare rules were updated and read back successfully in [the operational run](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/38032419219):

- The status-404 response correction removes `Link`, labels the real HTML error body `text/html; charset=utf-8`, and uses the current source CSP instead of obsolete inline hashes. This also fixes undefined graph-subject paths previously returning HTML labeled JSON-LD.
- The existing Browser Integrity Check exception now covers all current machine and release document paths for canonical-host GET/HEAD clients. Its 33 exact paths preserve the verified-crawler rule and other WAF protection.

Live checks confirmed one-step canonical redirects with query preservation, working video byte ranges, 72 sitemap pages/four videos, indexable canonical HTML, machine MIME/CORS, Brotli for HTML/JSON-LD/Turtle/CSV, and working ETags. The operational rules do not replace the site's automatic Pages deployment invalidation.

The GitHub Cloudflare secret is an account token. Its supported delegation path creates a zone-scoped token with a 15-minute expiry; using the account token directly for zone APIs caused the earlier HTTP 403 responses. Delegated reads succeeded for DNS, zone settings, cache, compression, redirects, bot management and Tiered Cache. No additional credential was needed. The temporary token was revoked after the changes in [the final operational run](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/38033886374).

The blog domain now has a permanent canonical fallback redirect preserving path and query. Its new Bulk Redirect rule follows the existing three account rules, preserving all 87 historical blog mappings and the Pages.dev redirects. The four existing Single Redirects retain their order and targets. All 367 live redirect checks passed, covering the historical URLs over HTTP/HTTPS, encoded queries and the new fallback. The interim blog `noindex` response rule was removed once the redirect was active.

The broad custom-domain cache rule now applies only to `/assets/`, whose files are content-hashed CSS/JS. All other resources use native Pages caching and deployment invalidation, as recommended by [Cloudflare](https://developers.cloudflare.com/pages/configuration/serving-pages/#recommendations). The rule retains origin/browser TTL respect and Cache Deception Armor. The previous zone cache was purged once after the change.

The existing negotiated `auto` compression rule now covers CSV, Turtle, NDJSON, vendor JSON, vCards and captions on canonical-host GET/HEAD requests. Its binary media exclusions remain inherent in the extension whitelist. This addresses the previously uncompressed 6,603,205-byte clinical passage dataset and 343,516-byte CycloneDX file without changing decoded content or MIME. The canonical dataset already resides on Pages and has a separate Hugging Face distribution.

The domain audit confirmed proxied DNS, strict origin TLS, TLS 1.2 minimum, TLS 1.3, HTTP/2, HTTP/3, Brotli, Early Hints, HSTS and Smart Tiered Cache. Existing free features already cover the final site's delivery needs.

The production verifier now checks HTML/hashed-asset cache policies and actual, normalized and undefined-subject error headers alongside sealed public-byte verification.
