## Source architecture

This repository builds one canonical static physician landing page plus synchronized machine-readable representations. `src/content-source/page.md`, `src/data/semantic/knowledge-graph.jsonld`, the focused registries/policies, media assets and `src/data/volatile-facts.json` are canonical inputs. Generators create deterministic projections; Astro renders the single human-facing page; finalization binds only post-build integrity data. Google Places reputation is the only routine mutable public lane. Release-only publication tooling is separate from the normal build path.

# Dr. Saeed Ghezelbash — Canonical Production Source

Pure-static Astro source for the single-page production site at `https://www.ghezelbaash.ir/`.

This repository is the version-controlled **source and generation authority**. The canonical first-party Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset`; Zenodo is its immutable preservation distribution and Hugging Face is its AI/retrieval distribution. These related layers are not identity-equivalent.

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
npm run verify:production -- https://www.ghezelbaash.ir/
```

`media:enrich` is idempotent and preserves pixel dimensions. The render-calibration command validates all 134 chunk identities across the six measured viewport widths before atomically updating the canonical JSON and its CSS interpolation rules. Production verification checks asynchronous CSS delivery, response-budget safety, native answer integration, crawler access, machine-resource headers and the real 404 contract.

Runtime target: Node 24.18.0 / npm 11.x. Deployment target: Cloudflare Pages static output.

## Release and external distribution contract

- Current source release: `1.2.2`
- Zenodo Concept DOI: `10.5281/zenodo.18765168`
- Current Zenodo Version DOI: `10.5281/zenodo.21930954`
- Hugging Face: `doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data`
- Wikidata: physician `Q140287622`, clinic `Q140288589`, Dataset `Q140304972`

The atomic ceiling-release workflow reserves the next DOI, promotes all source contracts, builds once, publishes the same Core bytes to the live site, Zenodo and Hugging Face, preserves the governed aggressive Hugging Face enrichment layer, and runs three verification rounds before it publishes the source commit and version tag.
