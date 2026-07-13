# v8.0.0 — canonical single-page graph architecture

Released: 2026-07-13

## Human-visible architecture

- The canonical website remains `/`; `/videos/`, all `/videos/{slug}/` pages and `/knowledge/` were removed without redirects because the URLs were pre-release.
- All 12 videos now live in their related clinical sections. Each retains its MP4, poster, VTT chapters, editorial summary, takeaways, safety boundary, audience, questions, sources and professional-education context.
- The homepage contains a dedicated `Knowledge & AI` section and the visible Content Table contains a matching block.

## Semantic architecture

- `/knowledge-graph.jsonld` is the only canonical public graph. It is self-contained and self-describing.
- Graph manifests, graph summaries, public graph shards, the identity crosswalk endpoint and the separate research graph were removed; their verified semantic content is incorporated into the canonical graph.
- `site.webmanifest` remains because it is install/UI metadata for the web app, not a graph manifest and not a semantic source.
- The homepage inline JSON-LD is a compact projection of the canonical graph and reuses the same entity IDs.
- `MedicalWebPage.mainEntity` is the Person only. Clinic remains a distinct provider, publisher, employer and work location.
- Retrieval indexes remain separate assets and are described by a retrieval `Dataset`; they are not graph shards.
- HTML and HTTP discover the graph through `rel="describedby"`.

## Validation contract

- Build fails on duplicate or dangling IDs, invisible graph fragments, route ghosts, graph/inline ID drift, lost video dossiers, invalid VTT boundaries, service URL drift, missing research identity or retrieval regression.
- The reusable `knowledge-graph-integrity` Skill adds structural auditing plus optional RDFLib, pySHACL and URDNA2015 gates.
