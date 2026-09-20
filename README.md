# Dr. Saeed Ghezelbash — production source

Canonical static Astro source for <https://www.ghezelbaash.ir/>.

This repository contains only the authored inputs and deterministic build machinery required to reproduce the production website and its machine-readable distribution. External publication, release orchestration, platform repair, live verification and one-time migration tooling are intentionally not part of the final website source.

## Build

```bash
npm ci
npm run build
```

The build:

1. clears the generated workspace and previous `dist/` output;
2. serializes the canonical JSON-LD graph to RDF;
3. generates page, semantic, retrieval and contact projections;
4. generates the website’s dataset descriptors;
5. builds the static Astro routes;
6. materializes registered static resources, redirects and stable media aliases;
7. copies the static IndexNow verification key;
8. derives deployment headers from the finished distribution.

Generated files belong under `.generated/` and `dist/` and are not committed as authored source.

## Canonical authored inputs

- `src/content-source/page.md` — human-facing canonical page content.
- `src/styles/global.css` and `src/data/render-calibration.json` — production presentation inputs.
- `src/data/semantic/knowledge-graph.jsonld` — canonical entity and semantic graph.
- `src/data/semantic/head-profile.json` and `support-profile.json` — graph projection policies.
- `src/data/semantic/shapes.ttl` — published SHACL distribution source.
- `src/data/release.json` — current release identity and canonical entity pointers.
- `src/data/machine-resources.json` — machine-resource registry.
- `src/data/evidence-registry.json`, `src/data/retrieval/`, `src/data/templates/`, `src/data/redirects.json`, and `src/data/stable-media-aliases.json` — deterministic distribution inputs.
- `public/` — canonical static media and browser-facing assets.

Only website-consumed resources are generated. The separately published Hugging Face Viewer tables and Zenodo release remain available in their existing repositories.

Cloudflare Pages builds from the `production` branch. The normal build has no code path that mutates Hugging Face, Zenodo, GitHub releases, Google Places, or any other external service.
