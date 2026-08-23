## Source architecture

This repository builds one canonical static physician landing page plus synchronized machine-readable representations. `src/content-source/page.md`, `src/data/semantic/knowledge-graph.jsonld`, the focused registries/policies, media assets and `src/data/volatile-facts.json` are canonical inputs. Generators create deterministic projections; Astro renders the single human-facing page; finalization binds only post-build integrity data. Google Places reputation is the only routine mutable public lane. Release-only publication tooling is separate from the normal build path.

# Dr. Saeed Ghezelbash — Canonical Production Source

Pure-static Astro source for the single-page production site at `https://www.ghezelbaash.ir/`.

This repository is the version-controlled **source and generation authority**. The canonical first-party Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset`; Zenodo is its immutable preservation distribution and Hugging Face is its AI/retrieval distribution. These related layers are not identity-equivalent.

## Canonical source

- Page content: `src/content-source/page.md`
- Knowledge graph: `src/data/semantic/knowledge-graph.jsonld`
- Current release/entity truth, including current Version DOI and release history: `src/data/release.json`
- Release validation thresholds and measured invariants: `src/data/release-invariants.json`
- Runtime/deployment authority: `.release/policy/platform-contract.json`; `.nvmrc`, `package.json` engines and `packageManager`, and CodeMeta are validated mirrors of that contract.
- Evidence/freshness inputs: `src/data/evidence-registry.json`, `src/data/evidence-snapshot.json`, `src/data/volatile-facts.json`
- Media/assets: `public/media/` and other required `public/` assets
- Head/support projection policy: `src/data/semantic/*-ids.json` and `*-profile.json`
- Render-calibration data authority: `src/data/render-calibration.json`; its interpolation CSS is generated deterministically in memory at the authored slot in `src/styles/global.css` and is never materialized back into the stylesheet source.
- CSS delivery: `src/styles/global.css` is the single canonical authored stylesheet; build-time CSS assembly combines it with render-calibration data, then emits a fingerprinted noncritical `/assets/site.<hash>.css` while keeping a small critical slice inline.
- Embedded raster metadata contract: every canonical PNG/JPEG/WebP/AVIF carries validated XMP, IPTC Core and PLUS entity/licensing metadata; `src/data/media-dimensions.tsv` locks dimensions and the canonical CI lifecycle validates metadata, fingerprints and decoding.

Generated representations are intentionally not committed. `scripts/pipeline.mjs` is the single lifecycle owner: it prepares `.generated/`, orders validators and compilers, invokes Astro, materializes machine resources, finalizes `dist/`, and executes release packaging without duplicating lifecycle order in `package.json` or CI. Specialized compiler and validator files remain independent failure-isolation units.

## Production commands

```bash
npm ci
npm run check
npm run build
```

CI executes the same lifecycle owner directly:

```bash
npm run ci
```

For a packaged release:

```bash
npm run release:prepare
npm run release
```

Release promotion and Zenodo preservation are explicit, mutation-capable operations and never run in a normal site build:

```bash
npm run release:promote -- --version=X.Y.Z --date=YYYY-MM-DD --zenodo-record=RECORD_ID --zenodo-doi=10.5281/zenodo.RECORD_ID
npm run release:zenodo -- --help
```

`release:promote` transactionally advances `release.json`, package identity, CodeMeta/CITATION, canonical graph release nodes, volatile/evidence release bindings and the stable `#evidence-zenodo-current-release` pointer. Historical DOI releases remain represented by immutable release-history nodes. `release:zenodo` owns the fail-closed external preservation lifecycle (`reserve → stage → publish → verify-public`).

Useful integrity operations:

```bash
npm run media:enrich
npm run render:calibration:apply -- path/to/chromium-measurements.json
npm run verify:production -- https://www.ghezelbaash.ir/
npm run verify:public-discovery
```

`media:enrich` is idempotent and preserves pixel dimensions. The render-calibration command validates all 134 chunk identities across the six measured viewport widths and atomically updates only the canonical JSON; production interpolation CSS is derived from that JSON in memory by the shared CSS assembly contract. Production verification checks asynchronous CSS delivery, response-budget safety, native answer integration, crawler access, machine-resource headers and the real 404 contract.

Runtime versions are defined only by `.release/policy/platform-contract.json`; release validation enforces convergence with `.nvmrc`, `package.json` and CodeMeta. Deployment target: Cloudflare Pages static output.

## Release and external distribution contract

- Current source release, release date, Zenodo Concept DOI, current Version DOI, preservation record and immutable release history: `src/data/release.json`
- Stable current-Zenodo evidence pointer: `https://www.ghezelbaash.ir/#evidence-zenodo-current-release`; its URL must equal the current Version DOI in both evidence registry and snapshot.
- Hugging Face: `doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data`
- Wikidata: physician `Q140287622`, clinic `Q140288589`, Dataset `Q140304972`

The normal website build is deterministic and does not reserve DOI records or publish external distributions. Release-only promotion, packaging, Zenodo preservation and Hugging Face publication are explicit operations outside the routine build path; each consumes the same canonical release/entity truth and is followed by convergence verification before a release is considered complete.

`npm run release` requires a clean source worktree, binds the generated release attestation to the exact 40-character `HEAD` commit, and emits the deterministic packages consumed by the Zenodo and Hugging Face distribution paths. A supplied `SOURCE_COMMIT` or `GITHUB_SHA` must equal `HEAD`; the release fails instead of creating an ambiguous attestation.
