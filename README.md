# Saeed Ghezelbash — Production Source V1

Pure-static Astro source for the single-page production site at `https://www.ghezelbaash.ir/`.

## Canonical source

- Page content: `src/content-source/`
- Knowledge graph: `src/data/semantic/knowledge-graph.jsonld`
- Release/entity truth: `src/data/release.json`, `src/data/release-invariants.json`
- Evidence/freshness inputs: `src/data/evidence-registry.json`, `src/data/evidence-snapshot.json`, `src/data/volatile-facts.json`
- Media/assets: `public/media/` and other required `public/` assets
- Head/support projection policy: `src/data/semantic/*-ids.json` and `*-profile.json`
- Render calibration used by production CSS validation: `src/data/render-calibration.json`
- CSS delivery: `src/styles/global.css` is the single canonical stylesheet; build generation emits a fingerprinted noncritical `/assets/site.<hash>.css` while keeping a small critical slice inline.

Generated representations are intentionally not committed. `npm run build` bootstraps the pinned RDF dependency when needed, then regenerates content assembly, RDF, head/support graphs, machine-readable projections and vCards before producing and validating `dist/`.

## Production commands

```bash
npm ci
npm run build
```

For a packaged release:

```bash
npm run release
```

Runtime target: Node 24.18.0 / npm 11.x. Deployment target: Cloudflare Pages static output.
