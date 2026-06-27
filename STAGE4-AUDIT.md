# Stage 4 audit

Date: 2026-06-27

- JSON parse: PASS
- JSON-LD parse: PASS
- Sitemap parse: PASS
- Sitemap contains only indexable base/entity pages and two preserved legacy HTML evidence/dataset pages.
- Service pages are present and noindex.
- Service pages are not listed in sitemap.
- Root dataset paths preserved.
- Stage 3 graph line-review edits retained.
- Additional full-repo files aligned: ai-discovery, dataset-manifest, publishing-crosswalk, Persian knowledge map, benchmark/positioning file, route map, CITATION, .zenodo, llms.

Known intentional legacy references:
- Redirect policies may mention legacy subdomains as redirect sources.
- Hugging Face dataset path keeps the existing `dr-saeid-...` external URL because that external slug already exists.
