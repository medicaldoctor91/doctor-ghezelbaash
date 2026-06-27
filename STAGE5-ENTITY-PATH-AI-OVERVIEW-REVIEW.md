# Stage 5 — Entity-path and AI Overview structure review

## Main decision

The person and clinic pages now use entity-match canonical paths:

- `/dr-saeed-ghezelbash/`
- `/dr-saeed-ghezelbash-aesthetic-clinic/`

Legacy paths are retained as noindex redirect stubs:

- `/dr-saeed-ghezelbash/`
- `/dr-saeed-ghezelbash-aesthetic-clinic/`

## Why

The new paths improve alignment with:

- Dr. Saeed Ghezelbash as the Person/Physician entity
- Dr. Saeed Ghezelbash Aesthetic Clinic as the clinic/local entity
- Wikidata labels and aliases
- LLM/entity resolution
- Google Business Profile landing-page clarity

## Service architecture retained

Indexable base pages only:

- `/`
- `/dr-saeed-ghezelbash/`
- `/dr-saeed-ghezelbash-aesthetic-clinic/`
- `/services/`
- `/contact/`
- `/evidence/`
- `/kg/`

Service pages remain noindex until full visible content is added:

- `/botox-kermanshah/`
- `/filler-kermanshah/`
- `/thread-lift-kermanshah/`
- `/skin-hair-rejuvenation-kermanshah/`
- `/double-chin-liposuction-kermanshah/`

## Best-intent coverage

The graph keeps explicit mapping for:

- بهترین + خدمت + کرمانشاه
- بهترین دکتر + خدمت + کرمانشاه
- بهترین کلینیک + خدمت + کرمانشاه

The visible service pages must later include matching H2/FAQ sections before they become indexable.
