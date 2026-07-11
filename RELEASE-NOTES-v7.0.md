# Release notes — v7.0

## Google-facing entity architecture

- Removed `ProfilePage` from the homepage graph. The homepage is a medical mega-landing, not a dedicated profile page, and now declares a single `MedicalWebPage`.
- Declared both canonical entities—physician and clinic—as homepage `mainEntity` values.
- Preserved one stable `@id` for each entity and strengthened the physician↔clinic relationship through `workLocation` and `employee`.
- Kept the public Google Maps rating as a dated, visible clinic snapshot without emitting self-serving `AggregateRating` markup.
- Added a direct head discovery link to `/graph/core.jsonld`, while keeping the compact inline graph after the human-readable main content.

## Wikidata disambiguation

- Preserved physician Wikidata `Q140287622` and clinic Wikidata `Q140288589` in their separate canonical schema nodes.
- Added clinic Wikidata to the Knowledge directory and compact AI/entity context.
- Added dataset Wikidata `Q140304972` to the Knowledge-page `Dataset` through both `sameAs` and `identifier`.
- Connected the dataset's Hugging Face URL, Zenodo DOI record, Wikidata item, physician creator, and clinic publisher without conflating it with the physician or clinic.

## Search presentation and discovery

- Shortened the homepage title to protect the primary local query from truncation and title rewriting.
- Tightened the meta description while retaining the main medical-aesthetic service and decision intents.
- Added physician, clinic, and dataset identity links to `llms.txt`, `/.well-known/ai.txt`, the knowledge manifest, AI summary, and compact agent context.

## Semantic corrections

- Removed the non-applicable `availableService` property from the inline `Person`.
- Removed authored scholarly works from the physician's `subjectOf` list; authorship remains represented on each `ScholarlyArticle`.
- Preserved research identity in `/research.jsonld` and preserved medical-education identity in the two workshop `LearningResource` pages.

## Validation

- Full Astro production build: pass.
- Homepage entity graph policy: pass (`MedicalWebPage` 1, `ProfilePage` 0).
- Physician, clinic, and dataset Wikidata identity checks: pass.
- Video/VTT/Clip validation: pass.
- Knowledge-page and dataset validation: pass.
- Instagram CTA routing validation: pass.
- Research and education validation: pass.
- 200-query retrieval benchmark: pass.
- Broken local links, broken fragments, duplicate DOM IDs, and invalid JSON/JSON-LD/JSONL/XML: 0.
