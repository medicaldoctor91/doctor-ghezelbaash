# PR #8 Current Status — Astro Entity-Hardened Scaffold

Current branch: `astro-migration`

Current technical state:

- Astro static migration scaffold exists.
- Core entity routes exist.
- Five parent service routes exist and are indexable.
- `brand-kb.ghezelbaash.ai-public.json` is generated as `ghezelbaash.brand_kb.astro.v4.superset`.
- `services.json` is generated as `ghezelbaash.service_architecture.astro.v2.entity_hardened`.
- Regulatory, location, research, dataset, authority-signal, profile-link and service-taxonomy outputs are generated.
- `services.json` now includes content blocks, validation checklist, supporting intents, canonical owner links and machine-support assets.
- Dist validation enforces the hardened service architecture, brand KB, regulatory ID, location, research identifiers, dataset DOI, Wikidata IDs and service page indexability.
- Latest Astro PR Build after the hardened `services.json` update completed successfully.

Remaining before final merge/deploy:

- Write final visible page content.
- Write visible FAQ content before adding FAQ schema.
- Final editorial review.
- Execute redirects only after site is ready.
- Deploy and run Search Console / URL Inspection checks.
