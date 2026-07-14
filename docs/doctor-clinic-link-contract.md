# Doctor–clinic entity-link contract

This document records the required production relationship between the canonical physician and clinic entities on the single canonical Homepage.

- `#mohammad-saeed-ghezelbash` is a `Person` and remains the sole `MedicalWebPage.mainEntity`.
- `#dr-saeed-ghezelbash-aesthetic-clinic` is an independent `MedicalClinic` / `LocalBusiness` support entity.
- `Person.worksFor`, `Person.workLocation`, and `Person.affiliation` point to `#dr-saeed-ghezelbash-aesthetic-clinic`.
- `Clinic.employee` points to `#mohammad-saeed-ghezelbash`.
- `#clinic-information-kermanshah` is a visible `WebPageElement` whose `about` points to the canonical Clinic entity.
- LinkedIn, Facebook, and Instagram remain classified under `Clinic.sameAs` according to the established account-ownership contract.
- Google Maps is expressed with `Clinic.hasMap` and location identifiers; Google Maps and OpenStreetMap URLs must not be duplicated in `sameAs`.
- The document head exposes the canonical Person URI through `rel="author"` and the external JSON-LD graph through one `rel="describedby"` link.
