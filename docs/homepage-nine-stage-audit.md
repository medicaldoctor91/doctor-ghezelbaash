# Independent nine-stage Homepage audit

This report re-checks the merged Person-first Homepage against the original nine-stage execution plan. It records both the defects found after PR #53 and the corrective evidence in PR #54.

## Executive result

PR #53 passed its original validators but did not satisfy every acceptance gate. The independent audit found excessive content volume, repeated medical passages, non-explicit Service destination inference, incorrect ownership of physician social profiles, and validator blind spots.

The corrective branch now produces:

- one canonical and indexable Homepage;
- one H1;
- sixteen canonical main H2 sections;
- fifty-seven canonical article H3 sections;
- 19,049 words across the sixteen main content sections;
- zero exact duplicate long paragraphs;
- 164 H4 headings instead of the previous 300-range output;
- 2,244 DOM elements;
- 432,455 raw HTML bytes;
- 79,854 gzip bytes;
- 59,205 Brotli bytes;
- twelve explicitly mapped contextual videos;
- zero duplicate HTML IDs;
- zero legacy numeric `clinical-decision-model-*` IDs in final HTML;
- explicit Service and Procedure destinations;
- physician social profiles under `Person.sameAs`;
- Google Maps in `Clinic.hasMap`, with Google Maps and OpenStreetMap excluded from `Clinic.sameAs`.

## Stage 1 — audit and migration map

### Baseline defects found after PR #53

- Main content was approximately 31,228 words rather than the intended 18–22k range.
- The renderer repeated legacy passages under multiple new subsections.
- At least 42 long paragraphs and 21 H4 titles had exact duplicate output.
- H2, H3, source placement and validator arrays were defined in multiple files.
- Service destination selection used Persian regular-expression matching. For example, `موضعی` could match the hair token `مو`, sending body contouring to the hair section.
- Instagram, LinkedIn and Facebook URLs visibly identifying the physician were placed in `Clinic.sameAs`.
- The clinic contextual video used a medical H3 heading.
- Validators did not measure total words, duplicate passages, exact Service destinations, social-profile ownership or full VideoObject parity.
- The primary domain did not match the Cloudflare Preview after the earlier merge.

### Major old → canonical destination map

| Previous identifier or behavior | Canonical replacement |
| --- | --- |
| `#person` | `#mohammad-saeed-ghezelbash` |
| `#clinic` | `#dr-saeed-ghezelbash-aesthetic-clinic` |
| `#doctor` | Person block `#mohammad-saeed-ghezelbash` |
| `#clinic-reputation` | rating in the Person bar plus `#clinic-information-kermanshah` |
| `#services` | `#aesthetic-services-kermanshah` |
| `#search-intent-hub` | `#best-aesthetic-doctor-kermanshah` |
| `#contact` | `#sources-contact-and-appointment` |
| `#videos` / `#video-knowledge-hub` | each video’s explicit medical or clinic destination |
| numeric `#clinical-decision-model-*` HTML IDs | removed from final HTML; source selection is internal only |
| inferred Service URL by text regex | explicit node-fragment → visible destination registry |

The broad `#clinical-guide` remains only as the semantic wrapper around the article flow. It is not a substitute for the sixteen canonical main-section destinations.

## Stage 2 — central architecture contract

The corrected implementation uses shared machine-readable registries:

- `src/domain/homepage-sections.mjs` for canonical entities, sixteen H2 sections, order, TOC groups, intent class, geography and Graph/TOC inclusion;
- `src/domain/homepage-article-registry.mjs` for article H3 IDs, titles, source selection and content budgets;
- `src/domain/homepage-service-targets.mjs` for explicit Service/Procedure destination mapping;
- `src/domain/media.mjs` for explicit video placement.

Astro components, graph compilers, Content Table generation, post-processing and Node validators consume these registries. Final H2 text is applied from the registry before release validation, preventing drift from component fallback text.

## Stage 3 — Person-first opening

Verified:

- one H1;
- Person block ID `#mohammad-saeed-ghezelbash`;
- physician introduction directly below the H1 and without an independent content anchor;
- physician portrait before the action bar;
- eager responsive LCP image with fixed dimensions and high fetch priority;
- exactly two primary CTA links;
- Google Maps beside clinic rating and location information;
- no ORCID, Dataset or unrelated profile links in the action bar;
- no repeated physician introduction at the page end.

## Stage 4 — Content Table and heading skeleton

Verified:

- real crawlable Content Table after the complete Person block;
- sixteen canonical H2 destinations;
- fifty-seven canonical article H3 destinations;
- unique IDs;
- no broken internal Fragment links;
- no H1–H4 hierarchy jumps;
- no JavaScript dependency for basic section navigation;
- no legacy numeric content IDs in final HTML.

## Stage 5 — medical-content restructuring

### Before correction

- approximately 31,228 main-content words;
- repeated passages across treatment selection, injectable, safety and referral clusters;
- very large injectable, lifting and skin clusters;
- approximately 300 H4 headings.

### Corrected output

| Main section | Words |
| --- | ---: |
| best-aesthetic-doctor-kermanshah | 1,636 |
| aesthetic-services-kermanshah | 1,958 |
| aesthetic-treatment-selection | 1,551 |
| injectable-aesthetic-treatments | 3,327 |
| lifting-and-facial-aging | 1,710 |
| skin-scar-rejuvenation | 2,121 |
| hair-loss-and-restoration | 1,278 |
| submental-and-body-contouring | 1,135 |
| aesthetic-surgery-and-referral | 728 |
| revision-complications-and-safety | 1,195 |
| aesthetic-cost-and-consultation | 372 |
| aesthetic-faq-kermanshah-iran | 875 |
| medical-research-and-education | 751 |
| clinic-information-kermanshah | 222 |
| knowledge-graph-and-datasets | 185 |
| sources-contact-and-appointment | 96 |
| **Total** | **19,049** |

A legacy medical block is rendered only once. If a later subsection needs the same source, it receives a cross-reference to the first canonical destination rather than duplicate text.

## Stage 6 — video placement map

| Video ID | Section | Subsection |
| --- | --- | --- |
| `home-workshop-thread-lift-training` | `medical-research-and-education` | `medical-education` |
| `home-workshop-thread-lift-advanced` | `medical-research-and-education` | `medical-education` |
| `clinic-patient-experience-review` | `clinic-information-kermanshah` | — |
| `botox-vs-subcision-dynamic-static-scar` | `injectable-aesthetic-treatments` | `botulinum-toxin-guide` |
| `filler-under-eye-transformation` | `injectable-aesthetic-treatments` | `under-eye-filler-guide` |
| `filler-under-eye-before-after` | `injectable-aesthetic-treatments` | `under-eye-filler-guide` |
| `cat-eye-thread-lift-before-after` | `lifting-and-facial-aging` | `thread-lift-guide` |
| `jalupro-vs-profhilo-skin-boosters` | `skin-scar-rejuvenation` | `skin-booster-mesogel` |
| `nonsurgical-rhinoplasty-boundary` | `aesthetic-surgery-and-referral` | `rhinoplasty-evaluation` |
| `nose-filler-before-after` | `injectable-aesthetic-treatments` | `facial-contouring-injections` |
| `proper-subcision-technique-guide` | `skin-scar-rejuvenation` | `subcision-guide` |
| `mesoneedling-dark-spots-warning` | `skin-scar-rejuvenation` | `pigmentation-melasma-guide` |

Verified:

- no string matching;
- no fallback to the first section;
- all destinations exist in HTML;
- the two professional-education videos occur only under `#medical-education`;
- article video titles are H4;
- the clinic video title is descriptive figcaption text rather than a peer medical H3;
- VideoObject title, description, duration, dimensions, thumbnail, file URL, creator, author and `isPartOf` are validated against the visible media registry.

## Stage 7 — clinic, sources and Footer

Verified:

- visible clinic section `#clinic-information-kermanshah`;
- independent Clinic entity `#dr-saeed-ghezelbash-aesthetic-clinic`;
- address, telephone, recorded hours, dated rating and map links;
- visible knowledge-graph/Dataset gateway;
- categorized external source directory;
- descriptive link labels;
- Instagram Direct remains a CTA and is not `sameAs`;
- Google Maps is `hasMap` and is not `sameAs`;
- OpenStreetMap is a visible location source and is not `sameAs`;
- official Instagram, LinkedIn and Facebook URLs that visibly identify the physician are assigned to `Person.sameAs`, not `Clinic.sameAs`.

## Stage 8 — graph alignment

Verified in inline and canonical JSON-LD:

- Person is the sole Homepage `mainEntity`;
- Person and Clinic remain separate;
- sixteen main sections are `WebPageElement` nodes;
- Content Table is a sixteen-item `ItemList`;
- twelve VideoObject nodes match visible media;
- exact Service/Procedure destination registry replaces regex inference;
- body contouring points to `#body-contouring-evaluation`;
- blepharoplasty points to `#blepharoplasty-evaluation`;
- facelift/necklift points to `#facelift-necklift-evaluation`;
- hair transplant points to `#hair-transplant-surgical-evaluation`;
- Graph URLs targeting Homepage fragments resolve to visible HTML destinations;
- Google Maps and OpenStreetMap do not occur in Clinic.sameAs.

## Stage 9 — testing and release status

### Passed

- Astro production build;
- release contract validator;
- visible HTML contract validator;
- schema-semantics validator;
- independent nine-stage audit validator;
- duplicate-ID and Fragment validation;
- heading hierarchy validation;
- content word-budget and exact-duplicate validation;
- Graph/HTML title and destination parity;
- explicit Service target validation;
- full VideoObject parity validation;
- GitHub Actions;
- Cloudflare branch and immutable Preview deployment.

Latest validated Preview for the corrective branch:

- immutable: `https://2252b054.doctor-ghezelbaash.pages.dev`
- branch: `https://fix-homepage-nine-stage-audi.doctor-ghezelbaash.pages.dev`

### Not yet claimable as passed

- A separate full TypeScript diagnostic (`astro check` / `tsc --noEmit`) and a formal lint command are not installed in the current dependency contract. Astro build verifies compilation, but this is not equivalent to a dedicated static type and lint gate.
- Production parity cannot be marked complete until the corrective PR is merged and the primary domain is observed serving the same output.

Therefore the corrected implementation passes the executable Homepage, content and Graph gates, while final Production parity and a separately installed type/lint toolchain remain explicit release follow-ups rather than hidden assumptions.
