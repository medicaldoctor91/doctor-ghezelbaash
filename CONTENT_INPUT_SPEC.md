# Visible-content replacement contract

All files are UTF-8 Markdown, Persian unless explicitly stated otherwise. Do not include front matter, scripts, styles, schema markup, invented citations, or duplicated H1 headings. Use Persian `ی` and `ک`, stable section anchors, descriptive link text, and factual claims that can be tied to a supplied source.

| File | Required content |
|---|---|
| `00-project-identity.md` | Page purpose, audience, scope, canonical entity statement, and content-freeze statement. |
| `01-doctor-profile.md` | Approved physician biography, credentials, registration facts, research identity, and alternate-name policy. |
| `02-clinic-profile.md` | Official clinic description, complete address wording, access details, hours if approved, and contact context. |
| `03-entity-relationship.md` | Plain-language distinction and relationship between the physician and clinic entities. |
| `04-hero.md` | One H1-ready title line, concise positioning paragraph, and evidence-bound opening copy. |
| `05-evidence-summary.md` | Evidence hierarchy, verified records, limits of evidence, and source-backed authority summary. |
| `06-selection-criteria.md` | Criteria for selecting a physician/clinic without unsupported superiority claims. |
| `07-decision-map.md` | Patient decision dimensions, candidacy boundaries, alternatives, and escalation criteria. |
| `08-topic-matrix.md` | High-level taxonomy connecting goals, methods, constraints, and relevant page sections. |
| `09-topic-sections.md` | Final copy for every medical-aesthetic topic section; each subsection must use the exact section ID supplied in `src/data/sections.ts`. |
| `10-comparison-tables.md` | Table-ready factual comparisons with column headings, limitations, and source references. |
| `11-faq.md` | Approved question/answer pairs; every schema FAQ must be visibly identical here. |
| `12-references.md` | Full source list with title, publisher, stable URL/DOI/PMID where available, and access/publication date. |
| `13-contact.md` | Approved contact wording, telephone display, address, map links, and response expectations. |
| `14-visible-cta.md` | Final non-deceptive CTA language; no dynamic booking or processed form promises. |
| `15-images-manifest.md` | Per-image subject, placement, alt text, caption, rights/source confirmation, and crop restrictions. |
| `16-final-visible-copy.md` | Final editorial pass or consolidated replacement copy; identify which earlier sections it supersedes. |
| `17-datasets-section.md` | English dataset description for the Zenodo and Hugging Face records already fixed in `src/data/datasets.ts`. |
| `18-video-content.md` | Approved title, description, visible transcript mapping, upload date if known, and section placement for all 12 videos. |

Video transcript text must also be delivered as the separate files specified in `BLOCKING_INPUTS.md`; duplicating a summary in `18-video-content.md` does not satisfy the transcript gate.
