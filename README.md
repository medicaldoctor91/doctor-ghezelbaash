# Dr. Saeed Ghezelbash — production source

Pure-static Astro source for the canonical physician entity home at `https://www.ghezelbaash.ir/`. The build renders one public HTML page, a real 404 page and synchronized machine-readable representations of the same physician, clinic, medical content and provenance data.

## Direct source ownership

- `src/content-source/page.md`: canonical visible content and page metadata.
- `src/styles/global.css`: the only authored stylesheet.
- `src/data/semantic/knowledge-graph.jsonld`: canonical knowledge graph.
- `src/data/semantic/head-profile.json`: Google head projection selection, policies and byte limit.
- `src/data/semantic/support-profile.json`: Google support projection selection, policies and byte limit.
- `src/data/document-head.json`: Open Graph, Twitter and application presentation metadata.
- `src/data/release.json`: canonical URL, physician and clinic identifiers, current release and DOI lineage.
- `src/data/release-invariants.json`: explicit delivery and validation limits.
- `src/data/service-registry.json` and `src/data/answer-registry.json`: publishable service and answer sets.
- `src/data/evidence-registry.json`, `src/data/evidence-snapshot.json` and `src/data/volatile-facts.json`: evidence and current Google Places observation.
- `src/data/render-calibration.json`: measured chunk geometry used to derive responsive calibration CSS.
- `public/media/` and `src/data/media-dimensions.tsv`: canonical media and intrinsic dimensions.

The physician uses one canonical ID with `Person` and `IndividualPhysician` types. The clinic, `ProfilePage`, 18 `WebPageElement` sections, medical procedures, answers, images, videos, credentials and external identifiers all reference that graph. DOM Microdata and both inline JSON-LD projections are derived from the same graph and projection profiles.

## Build flow

`npm run prepare:generated` recreates `.generated/` from canonical sources. Astro renders the site, the HTML5 output integration serializes void elements for validator-clean HTML, static resources are materialized into `dist/`, and finalization writes deployment headers plus integrity manifests. Generated files are not committed.

CSS delivery is derived directly from `global.css` and `render-calibration.json`: critical rules remain inline and the rest is emitted as one fingerprinted stylesheet. HTML content stays readable in `page.md`; canonical assembly compacts only structural whitespace and binds release, site, language, reputation, image and semantic tokens.

```bash
npm ci
npm run build
```

Useful commands:

```bash
npm run check
npm run security:dependencies
npm run validate:source
npm run validate:media
npm run render:calibration:update -- path/to/chromium-measurements.json
npm run verify:production -- https://www.ghezelbaash.ir/
```

## Release and deployment

```bash
npm run release
```

The website deploys as static output on Cloudflare Pages from `main`. Runtime and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json` and CodeMeta.

The canonical Dataset is `https://www.ghezelbaash.ir/graph.jsonld#dataset`. GitHub is its version-controlled source, Zenodo is its immutable DOI distribution and Hugging Face is its AI/retrieval distribution. Release promotion updates the release record, graph, package metadata, citation metadata and evidence snapshot as one transaction; external publication remains an explicit release operation.
