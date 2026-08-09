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
- Embedded raster metadata contract: every canonical PNG/JPEG/WebP/AVIF carries validated XMP, IPTC Core and PLUS entity/licensing metadata; `src/data/media-dimensions.tsv` locks dimensions and `npm run validate:media` verifies metadata, fingerprints and decoding.

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

Useful integrity operations:

```bash
npm run media:enrich
npm run render:calibration:apply -- path/to/chromium-measurements.json
npm run release:prepare
npm run validate:browser
npm run verify:production -- https://www.ghezelbaash.ir/
```

`validate:browser` requires Chrome or Chromium (`CHROME_PATH` may be supplied explicitly) and blocks release on delayed-CSS layout shift, mobile clipping, broken TOC/search targets, failed video deep links or Range requests, console errors, broken Manifest assets, and missing internal machine resources.

`media:enrich` is idempotent and preserves pixel dimensions. The render-calibration command validates all 134 chunk identities across the six measured viewport widths before atomically updating the canonical JSON and its CSS interpolation rules. Production verification checks asynchronous CSS delivery, response-budget safety, native answer integration, crawler access, machine-resource headers and the real 404 contract.

Runtime target: Node 24.18.0 / npm 11.x. Deployment target: Cloudflare Pages static output.
