# Doctor–clinic entity-link contract

This document records the required production relationship between the canonical physician and clinic entities.

- `#person` remains the sole `MedicalWebPage.mainEntity`.
- `#person.worksFor`, `#person.workLocation`, and `#person.affiliation` point to `#clinic`.
- `#clinic.employee` points to `#person`.
- LinkedIn, Facebook, and Instagram are classified under `#clinic.sameAs`.
- The document head links to the canonical external JSON-LD graph and the physician Wikidata entity.
