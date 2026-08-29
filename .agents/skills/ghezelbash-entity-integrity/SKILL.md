---
name: ghezelbash-entity-integrity
description: Entity SEO, structured-data, Knowledge Graph, Brand SERP, and corroboration workflow for Dr. Saeed Ghezelbash and his clinic. Use for JSON-LD, Microdata, RDF, schema.org, metadata, citations, machine-readable files, sameAs/entity links, physician-clinic modeling, Google Knowledge Panel/Maps evidence, and contradiction resolution. Do not use for generic keyword ideation detached from entity evidence.
---

# Ghezelbash Entity Integrity

Strengthen entity resolution and defensible authority without manufacturing notability, conflating entities, or overstating first-party evidence.

## Canonical entity boundaries

Keep the physician and clinic distinct but explicitly related.

### Physician

- Name: Dr. Saeed Ghezelbash / دکتر سعید قزلباش
- Google Knowledge Graph ID: `/g/11nqdfk76c`
- Wikidata: `Q140287622`

### Clinic

- Name: Dr. Saeed Ghezelbash Aesthetic Clinic / کلینیک زیبایی دکتر سعید قزلباش
- Google Local KGMID: `/g/11r3rzdtb3`
- Wikidata: `Q140288589`
- Google Maps CID: `12350483144643112463`
- Google Place ID: `ChIJBT0YDOTt-j8RD-7mAPy6Zas`

### Retired identifiers

- Follow the repository's retired-identifier sanitizer and release-contract gates. Never publish, reconstruct, alias, cite, or reintroduce an identifier that the canonical registry marks deleted or retired.

## Evidence model

Classify evidence before using it:

- first-party: official site, owned profiles, repository, self-published datasets;
- platform record: Google, ORCID, Wikidata, GitHub, Hugging Face, Maps;
- independent corroboration: genuinely independent, editorially controlled sources;
- operational observation: live response, current listing state, API result, or rendered output.

First-party material can establish the publisher's own claim and provide canonical machine-readable facts, but it is not independent corroboration. Never label it otherwise.

## Reconciliation sequence

1. Identify the single canonical source owner for each fact.
2. Compare visible Persian/English content with metadata, JSON-LD, Microdata, RDF, projections, feeds, descriptors, sitemaps, robots, manifests, and external profiles.
3. Detect contradictions in names, transliterations, entity type, identifiers, URLs, phone/address/hours, credentials, dates, and physician-clinic relationships.
4. Prefer removal of duplicate authority over synchronizing many hand-maintained copies.
5. Generate derived representations from canonical source data whenever the architecture supports it.
6. Distinguish a person's `sameAs` links from clinic links, citations, `subjectOf`, publisher links, and mere mentions.
7. Use schema.org types and properties only when the visible claim and evidence support them. Do not add unsupported awards, specialties, credentials, ratings, reviews, or medical claims.

## Structured-data review

For each node and edge, verify:

- stable `@id` and canonical URL strategy;
- correct type and entity scope;
- no physician/clinic identity merge;
- reciprocal or directional relationship semantics where justified;
- identifier value, property ID, and URL consistency;
- language/script consistency and intentional aliases;
- visible-content parity for material claims;
- no orphan nodes, duplicate canonical nodes, contradictory literals, or dead identifiers;
- syntax validity plus semantic validity; parser success alone is insufficient.

Review JSON-LD and Microdata together. They may coexist only when they describe the same facts without divergent identifiers or values.

## Validation path

Use repository-owned checks first. Depending on the affected layer, run the relevant subset of:

- `npm run validate:evidence`
- `npm run validate:shacl`
- `npm run validate:query-matrix`
- `npm run validate:source`
- `npm run build`
- `npm run verify:public-discovery`
- `npm run verify:production`

Also inspect the built and live machine-readable resources directly; do not infer them solely from source code.

## External edits

Before proposing or submitting an external platform edit, separate:

- factual correctness;
- eligibility and sourcing;
- authorization;
- platform process and policy;
- expected algorithmic benefit;
- enforcement/reversion risk;
- reputation risk.

Use lawful, documented platform mechanisms. Never fabricate coverage, citations, reviews, affiliations, credentials, or consensus. Treat platform approval as unknown until observed.

## Output standard

For consequential work, provide a contradiction ledger with source location, competing values, evidence class, selected authority, fix, verification, and rollback. End with one decision and prioritized actions scored for Impact, Confidence, Effort, Risk, and Dependency.
