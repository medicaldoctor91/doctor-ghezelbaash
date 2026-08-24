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

## Physician visual system

The single canonical stylesheet implements Dr. Saeed Ghezelbash's clinical-editorial signature: deep medical emerald, clinic sage, carbon, warm ivory and a restrained bronze accent paired with the official moustache mark. The palette is derived from the real physician, team and clinic photography rather than a generic medical-blue theme. The Hero, icon family, portrait seal, editorial video frames, asymmetric clinic gallery, chapter surfaces, clinical identity disclosure, in-page search, evidence cards, tables, branded footer and mobile action dock consume one `--ghezelbash-*` token system. Portrait videos use a two-column editorial stage on wide screens and a contained vertical stage on narrow screens, preventing oversized media while preserving native controls, tracks, captions and deep links. There is no UI framework, client-side hydration or append-only override layer.

The page is a real HTML `article` inside the primary `main` landmark. Consistent Microdata projects the same `MedicalWebPage` + `ProfilePage` and `Person` identifiers already used by the canonical JSON-LD graph; visible Hero name, job title, location, image, description and verified identity links are the Microdata evidence surface. The graph remains the fact authority, so the HTML layer cannot create a competing entity ID.

Navigation is progressive and document-native. The complete server-rendered TOC remains the authority, becomes a swipe/snap chapter deck on narrow screens, and supplies a compact current-chapter rail after it leaves the viewport on wide screens. The rail is constructed from those existing anchors rather than maintaining a second navigation registry. Search uses the semantic HTML `search` landmark and a native dialog/form close path; JavaScript only adds local indexing, chapter state, lazy video posters and deep-link seeking.

The visible physician decision pathway and its canonical `HowTo`/`HowToStep` nodes are one synchronized authority. Medical-condition nodes expose only `possibleTreatment` links to existing `MedicalTherapy` nodes. The closed-by-default clinical identity dossier remains fully visible to crawlers and fully operable without JavaScript.

Above-the-fold geometry and paint remain inside the enforced 12,000-byte critical-CSS budget. Below-the-fold presentation is emitted as the fingerprinted deferred stylesheet, all image dimensions are reserved, interactive controls retain visible focus treatment and clearance from the fixed action dock, and reduced-motion, increased-contrast, forced-colors and print modes are preserved. Scroll progress uses a paint-only scroll timeline when supported and disappears under reduced motion.

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
