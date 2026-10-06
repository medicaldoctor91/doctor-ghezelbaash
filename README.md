# Dr. Saeed Ghezelbash — Website Source

Canonical source repository for **https://www.ghezelbaash.ir/**, the public website and first-party machine-readable knowledge graph for Dr. Saeed Ghezelbash (دکتر سعید قزلباش).

The site is built as a finite static Astro project and publishes human-readable pages together with structured JSON-LD/RDF and related discovery resources from the same authored source.

## Build

```bash
npm ci
npm run build
```

Runtime requirements are defined by `.nvmrc`, `.npmrc`, and `package.json`. The primary build entry is `scripts/build.mjs`.

## Repository structure

- `src/` — authored website source, content, configuration, URL policy, styles, scripts, and semantic data.
- `public/` — static public assets such as images, fonts, icons, and verification files.
- `scripts/` — build, generation, validation, and regression tooling required to produce and verify the deployable static distribution.
- `.github/workflows/build.yml` — CI build and validation contract.
- `astro.config.mjs`, `tsconfig.json`, `package.json`, `package-lock.json` — project and dependency configuration.

Generated build output is not authoritative source. The build derives the deployable distribution and machine-readable projections from the authored inputs above.

## Semantic source

The canonical knowledge graph is maintained at:

`src/data/semantic/knowledge-graph.jsonld`

It is used to derive structured publication formats and browser-facing semantic projections rather than maintaining separate competing copies of entity facts.

## Identity

- Website: https://www.ghezelbaash.ir/
- Wikidata: https://www.wikidata.org/wiki/Q140287622
- ORCID: https://orcid.org/0009-0001-9346-8475

## Validation

The repository includes automated checks for source ownership, generated output, rendered-reader behavior, semantic/RDF validity, SHACL constraints, redirects, headers, and deployment fingerprints.

Useful commands include:

```bash
npm run build
npm run validate:dist
npm run validate:live
```

GitHub Actions runs the build and validation pipeline on pushes and pull requests.

## Citation

Citation metadata is provided in `CITATION.cff` for tools and platforms that support the Citation File Format.

## License

See `LICENSE` for the repository's current license terms.
