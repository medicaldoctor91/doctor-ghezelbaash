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
- CSS delivery: `src/styles/global.css` is the single canonical, rule-per-line authored stylesheet; build-time CSS assembly compacts only its source-layout line breaks, combines it with render-calibration data, then emits a fingerprinted noncritical `/assets/site.<hash>.css` while keeping a small critical slice inline.
- HTML authoring/delivery boundary: `src/content-source/page.md` keeps reviewable element-level line breaks. `assembleCanonicalContent()` removes only those structural line breaks before token binding, so source readability does not inflate the generated page.
- Embedded raster metadata contract: every canonical PNG/JPEG/WebP/AVIF carries validated XMP, IPTC Core and PLUS entity/licensing metadata; `src/data/media-dimensions.tsv` locks dimensions and `npm run validate:media` verifies metadata, fingerprints and decoding.

Generated representations are intentionally not committed. `npm run build` bootstraps the pinned RDF dependency when needed, then regenerates content assembly, RDF, head/support graphs, machine-readable projections and vCards before producing and validating `dist/`.

## Semantic HTML and presentation boundary

The uploaded v1.2.3 page is the locked human-facing visual baseline. Technical upgrades must not add visible cards, chapter rails, TOC entries, content sections or append-only style overrides. `src/styles/global.css` remains the single presentation authority; the `article` wrapper has only the selector continuity required to preserve the baseline reading measure.

The page is a real HTML `article` inside the primary `main` landmark. Consistent Microdata projects the same `MedicalWebPage` + `ProfilePage` and `Person` identifiers already used by the canonical JSON-LD graph. Existing visible Hero identity, physician imagery and verified external links provide the human-readable evidence surface without creating a competing entity ID.

The complete server-rendered TOC remains the only visible chapter navigation. The existing search dialog keeps its original copy and presentation while receiving native search semantics and accessible state. Its small inline runtime only indexes existing headings, exposes the current TOC destination through `aria-current`, reveals deferred video posters and supports media deep links; it does not construct new visible navigation.

The canonical `HowTo`/`HowToStep` graph points to the already-visible physician clinical-decision framework and does not create a duplicate visible pathway. Medical-condition nodes expose `possibleTreatment` links to existing `MedicalTherapy` nodes. Physician identity evidence remains in the existing visible content, while the retired Dataset Wikidata entity is excluded from authored content, metadata and graph projections.

Above-the-fold geometry and paint remain inside the enforced 12,000-byte critical-CSS budget. Below-the-fold presentation is emitted as the fingerprinted deferred stylesheet, image dimensions are reserved, interactive controls retain focus treatment and clearance from the fixed action dock, and reduced-motion, increased-contrast, forced-colors and print modes remain part of the canonical baseline.

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

`media:enrich` is idempotent and preserves pixel dimensions. The render-calibration command validates all 134 chunk identities across the six measured viewport widths and atomically updates only the canonical JSON; production interpolation CSS is derived from that JSON in memory by the shared CSS assembly contract. Production verification checks asynchronous CSS delivery, response-budget safety, native answer integration, crawler access, machine-resource headers and the real 404 contract.

Runtime versions are defined only by `.release/policy/platform-contract.json`; the release validators enforce convergence with `.nvmrc`, `package.json` and CodeMeta. Deployment target: Cloudflare Pages static output.

## Release and external distribution contract

Machine destinations have distinct roles: the canonical `Dataset` has no misleading file URL; `graph.jsonld` is a `DataDownload`; the GitHub repository is only `SoftwareSourceCode`; `dcat.ttl` is the catalog representation; and the immutable Zenodo Version DOI is the Dataset landing page used by DCAT, VoID, Data Package and Croissant. Landing pages are never misdeclared as direct `contentUrl` downloads.

- Current source release, release date, Zenodo Concept DOI, current Version DOI, preservation record and immutable release history: `src/data/release.json`
- Hugging Face: `doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data`
- Wikidata: physician `Q140287622` and clinic `Q140288589`; the Dataset is identified by its canonical first-party IRI and DOI lineage

The normal website build is deterministic and does not reserve DOI records or publish external distributions. Release-only promotion, packaging, Zenodo preservation and Hugging Face publication are explicit operations outside the routine build path; each consumes the same canonical release/entity truth and is followed by convergence verification before a release is considered complete.

`npm run release` requires a clean source worktree, binds the generated release attestation to the exact 40-character `HEAD` commit, and emits the deterministic packages consumed by the Zenodo and Hugging Face distribution paths. A supplied `SOURCE_COMMIT` or `GITHUB_SHA` must equal `HEAD`; the release fails instead of creating an ambiguous attestation.
