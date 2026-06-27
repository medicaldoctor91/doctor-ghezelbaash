# Repo merge guide — Stage 4 full repo alignment

Use this package as a replacement/overlay for the current repository root.

## Important

Do not move or rename root dataset files. They are intentionally preserved for Zenodo/GitHub/Hugging Face discovery continuity.

## Apply

1. Extract the zip.
2. Copy all files into the repository root.
3. Commit.
4. Enable GitHub Pages for the repository/root or selected branch.
5. Set custom domain to `www.ghezelbaash.ir`.
6. Enforce HTTPS.
7. Configure redirects outside GitHub Pages:
   - `https://ghezelbaash.ir/*` -> `https://www.ghezelbaash.ir/*`
   - `https://doctor.ghezelbaash.ir/*` -> `https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/`
   - `https://kg.ghezelbaash.ir/*` -> `https://www.ghezelbaash.ir/kg/`

## Indexing

Service pages are intentionally `noindex,follow` until final visible content is approved.

Do not submit service pages to sitemap until their content is complete.

## Canonical files

- `graph-ghezelbaash-final.jsonld`
- `brand-kb.ghezelbaash.ai-public.json`
- `ai-discovery-index.json`
- `dataset-manifest.jsonld`
- `publishing-crosswalk.jsonld`
- `services.json`
- `sameas.json`
- `nap.csv`
- `llms.txt`

## Firebase

Firebase is manual redirect-only legacy infrastructure. It should not be used as a competing canonical mirror.


## Stage 6 merge note

Use this package as the new baseline. The legacy person/clinic folders are intentionally absent. Do not recreate them unless you explicitly want legacy redirect stubs. Canonical entity pages are `dr-saeed-ghezelbash/` and `dr-saeed-ghezelbash-aesthetic-clinic/`.
