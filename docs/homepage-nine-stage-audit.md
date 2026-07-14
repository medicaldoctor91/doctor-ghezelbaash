# Independent nine-stage Homepage audit

This report re-checks PR #53 against the original nine-stage plan and records the corrective evidence in PR #54.

## Result

The first implementation passed its original validators but did not satisfy every acceptance gate. The independent audit found:

- about 31,228 words instead of the intended 18–22k range;
- repeated legacy passages across new medical subsections;
- H2, H3 and validator contracts distributed across multiple files;
- Service URLs inferred by text matching rather than explicit mapping;
- physician social profiles placed under Clinic instead of Person;
- a clinic video title presented as a medical H3;
- no tests for word budgets, repeated passages, passage depth, social ownership, exact Service targets or complete VideoObject parity.

## Corrected output

The latest corrective build produces:

- 1 H1;
- 16 canonical H2 sections;
- 57 canonical article H3 passages;
- 19,268 words across the sixteen main sections;
- 0 duplicate long paragraphs;
- minimum H3 passage depth of 49 words;
- 164 H4 headings;
- 2,250 DOM elements;
- 434,682 raw HTML bytes;
- 80,345 gzip bytes;
- 59,551 Brotli bytes;
- 12 explicitly mapped videos;
- 0 duplicate IDs;
- 0 legacy numeric `clinical-decision-model-*` IDs in final HTML;
- 5 descriptive cross-links replacing repeated source blocks;
- 3 supplemental direct answers for passages made thin by deduplication.

## Stage 1 — audit and migration

The audit now records the changed files, baseline failures, video destinations and major identifier migration:

| Previous identifier or behavior | Canonical replacement |
| --- | --- |
| `#person` | `#mohammad-saeed-ghezelbash` |
| `#clinic` | `#dr-saeed-ghezelbash-aesthetic-clinic` |
| `#doctor` | Person block `#mohammad-saeed-ghezelbash` |
| `#clinic-reputation` | Person rating bar plus `#clinic-information-kermanshah` |
| `#services` | `#aesthetic-services-kermanshah` |
| `#search-intent-hub` | `#best-aesthetic-doctor-kermanshah` |
| `#contact` | `#sources-contact-and-appointment` |
| `#videos` | each video’s explicit medical or clinic destination |
| numeric legacy content IDs | removed from final HTML |
| text-inferred Service target | explicit node-fragment → destination registry |

## Stage 2 — shared contracts

The corrected architecture uses:

- `homepage-sections.mjs` for entities, H2 order, titles, TOC groups, intent, geography and Graph inclusion;
- `homepage-article-registry.mjs` for H3 titles, IDs, sources and content budgets;
- `homepage-service-targets.mjs` for explicit Service and Procedure destinations;
- `media.mjs` for video placement;
- `homepage-subsection-summaries.mjs` for independent answers required after deduplication.

Final H2 text is applied from the registry before validation, so visible HTML and Graph cannot silently diverge on section titles.

## Stages 3–4 — opening and semantic skeleton

Verified:

- Person-first opening with canonical Person ID;
- introduction immediately below the sole H1;
- portrait before the action bar;
- exactly two primary CTA links;
- Google Maps beside clinic rating and location;
- real Content Table immediately after the Person block;
- 16 H2 and 57 H3 destinations;
- no broken Fragment links;
- no duplicate IDs;
- no heading-level jumps;
- no JavaScript requirement for basic section navigation.

## Stage 5 — content restructuring

| Section | Words |
| --- | ---: |
| best-aesthetic-doctor-kermanshah | 1,636 |
| aesthetic-services-kermanshah | 1,958 |
| aesthetic-treatment-selection | 1,551 |
| injectable-aesthetic-treatments | 3,327 |
| lifting-and-facial-aging | 1,710 |
| skin-scar-rejuvenation | 2,121 |
| hair-loss-and-restoration | 1,286 |
| submental-and-body-contouring | 1,135 |
| aesthetic-surgery-and-referral | 803 |
| revision-complications-and-safety | 1,266 |
| aesthetic-cost-and-consultation | 372 |
| aesthetic-faq-kermanshah-iran | 940 |
| medical-research-and-education | 751 |
| clinic-information-kermanshah | 222 |
| knowledge-graph-and-datasets | 185 |
| sources-contact-and-appointment | 96 |
| **Total** | **19,268** |

A legacy content block is rendered once. Later reuse produces a descriptive cross-link, not duplicate text. Every canonical article H3 must retain at least 40 visible words; the current minimum is 49.

## Stage 6 — video map

| Video | Destination |
| --- | --- |
| home-workshop-thread-lift-training | `medical-research-and-education / medical-education` |
| home-workshop-thread-lift-advanced | `medical-research-and-education / medical-education` |
| clinic-patient-experience-review | `clinic-information-kermanshah` |
| botox-vs-subcision-dynamic-static-scar | `injectable-aesthetic-treatments / botulinum-toxin-guide` |
| filler-under-eye-transformation | `injectable-aesthetic-treatments / under-eye-filler-guide` |
| filler-under-eye-before-after | `injectable-aesthetic-treatments / under-eye-filler-guide` |
| cat-eye-thread-lift-before-after | `lifting-and-facial-aging / thread-lift-guide` |
| jalupro-vs-profhilo-skin-boosters | `skin-scar-rejuvenation / skin-booster-mesogel` |
| nonsurgical-rhinoplasty-boundary | `aesthetic-surgery-and-referral / rhinoplasty-evaluation` |
| nose-filler-before-after | `injectable-aesthetic-treatments / facial-contouring-injections` |
| proper-subcision-technique-guide | `skin-scar-rejuvenation / subcision-guide` |
| mesoneedling-dark-spots-warning | `skin-scar-rejuvenation / pigmentation-melasma-guide` |

All VideoObject fields are validated against the visible media registry.

## Stages 7–8 — Clinic, Footer and Graph

Verified:

- Person and Clinic remain independent;
- Person is the sole Homepage `mainEntity`;
- Instagram, LinkedIn and Facebook identifying the physician are in `Person.sameAs`;
- Instagram Direct is only a CTA;
- Google Maps is `Clinic.hasMap` and is not `sameAs`;
- OpenStreetMap is a visible location link and is not `sameAs`;
- Content Table is a sixteen-item ItemList;
- all twelve videos have matching VideoObject nodes;
- exact Service destinations replace text inference;
- Graph URLs targeting Homepage fragments resolve to visible HTML.

## Stage 9 — release evidence and remaining gaps

Passed on the corrective branch:

- Astro production build;
- release, visible-contract and schema validators;
- independent nine-stage validator;
- independent H3 passage-depth validator;
- GitHub Actions;
- Cloudflare Preview.

Validated Preview:

- `https://6955527f.doctor-ghezelbaash.pages.dev`
- `https://fix-homepage-nine-stage-audi.doctor-ghezelbaash.pages.dev`

Not yet claimable as complete:

- a separate `astro check` or `tsc --noEmit` diagnostic and a formal lint command are not installed in the dependency contract; Astro build is not identical to those gates;
- Production parity can only be closed after PR #54 is merged and the primary domain is observed serving the corrective output.

Therefore Stages 1–8 and the executable CI/Preview portion of Stage 9 are evidenced. Dedicated type/lint diagnostics and final Production parity remain explicit release gaps until completed.
