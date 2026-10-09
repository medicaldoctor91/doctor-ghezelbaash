# Delivery and evidence audit

Scope: `experiment/source-preview`, starting commit `1ecff5ec28074060032f10d4e691e59c7502578a`. No production deployment or main-branch work.

## Baseline limitations

The exact starting release failed during Astro compilation because the watch-page sitemap check received no `record.pagePurpose`. Its log and partial dist were preserved outside the worktree. Therefore baseline sitemap, final headers, seal and live behavior are unavailable, not passing.

For title/H1, content and size comparisons, the starting renderer was run separately with **only** the missing registry purpose copied into its record in memory. These are diagnostic renderer measurements, not a successful baseline release. That renderer also referenced generated CSS/JavaScript that the starting build did not emit.

## Canonical and crawl contracts

Home emits `SOURCE.graph` directly as the only inline JSON-LD document immediately after critical metadata and canonical. The external graph uses the same object. RDFC-1.0 fingerprints check the RDF datasets of SOURCE, inline Home, graph.jsonld and parsed graph.ttl; node counts are diagnostics only. Focused routes contain independent Schema.org projections and visible clinical text. Other page references are small document descriptors; clinical Q&A and full videos are restricted to the visible route scope. The rich Person/Clinic authority relationships are retained.

Google's [Googlebot documentation](https://developers.google.com/search/docs/crawling-indexing/googlebot), read on 2026-10-07, says Google Search fetches the first **2 MB** of supported files. The conservative delivery comparison uses 2,000,000 uncompressed bytes. Home's total HTML size is not a quality gate. The inline full-KG closing script byte position is measured separately. Focused documents must remain below 1,500,000 bytes.

All canonical HTML paths remain crawlable through the unchanged wildcard robots policy. `OAI-SearchBot` search access is distinct from `GPTBot` training and `ChatGPT-User` requests; the existing model-training preference was preserved. Neither llms.txt nor graph density is treated as a ranking mechanism.

## Dates and visible clinical trust

Source edition remains release metadata. The starting source assigned that edition to every canonical page's dateModified without route-specific evidence of meaningful clinical modification. Those unsupported page dates and corresponding sitemap lastmod values were omitted. Historical publication/media/research dates and the existing canonical medical review date were preserved. Focused entries display author/reviewer/review-date metadata derived from the canonical graph. At the owner's request, Home displays its three-part license/clinic-status/review-date strip directly after the entity heading, replacing the separate author/reviewer card. The Home review badge still derives from the canonical graph; author and reviewer remain in structured data. The clinical-copy lock was refreshed for the strip's changed text order, with clinical prose and the strip contents preserved. No review date or historical event was invented.

## Evidence relations

The full custom ontology remains available in Home and the external machine graph. Schema.org projections omit custom ontology and infrastructure terms; this is not an ontology deletion.

The existing `supports`, `supportedBy`, `corroboratedBy`, `evidencedBy`, claim/source and evidence-bundle relationships were examined by their declared definitions, subjects, targets, source descriptions and provenance roles. `evidencedBy` means an explicitly about/annotated source, not independent endorsement. Existing first-party profiles, archive preservation and external directories remain attributed to their actual roles. This was a repository/provenance semantic audit; external pages were not all freshly re-fetched, and no new independent corroboration is claimed.

Corrections:

- Removed mutual `corroboratedBy` claims between a rounded iCliniq “20K” profile metric and a more-than-20,000 clinical count. A rounded profile display does not independently validate that precise clinical population.
- Removed positive skill-support relationships from uncontrolled 100% resolution and 0% complication observations, including inverse `supportedBy`/`evidencedBy` links. The observations, reported values, dates and neutral `dcterms:relation`/subject links remain. They cannot establish efficacy, safety or expertise by themselves.
- Preserved registry credential links, published-work authorship/affiliation evidence, training evidence and source-scoped observations. Bundles retain their source membership and provenance; their existence is not an authority metric.

## Existing resource inventory

Every resource below was retained. “Consumer” names the concrete interface or consuming software category, **not** an assertion of measured traffic. Downstream usage telemetry is unavailable. Resource byte counts/hashes are release diagnostics. Standard formats are kept for distinct interfaces rather than format count.

| Resource | Protocol/interface and consumer | Value and redundancy decision | Delivery |
|---|---|---|---|
| /index.html | HTML; browsers and Search | Duplicate Home document; canonical / | text/html; canonical HTML alias |
| /graph.jsonld | JSON-LD 1.1/RDF; jsonld and RDF clients | Full canonical truth, no reduced substitute | application/ld+json; noindex, follow; CORS |
| /graph.ttl | Turtle/RDF; Turtle parsers | Same dataset for RDF tools; existing N-Triples syntax is valid Turtle | text/turtle; noindex, follow; CORS |
| /shapes.ttl | SHACL; RDF validators | Validation constraints are distinct from facts | text/turtle; noindex, follow; CORS |
| /entity-facts.csv | CSV; tabular ingestion | Flattened graph facts for non-RDF clients | text/csv; noindex, follow; CORS |
| /entity-facts.csv-metadata.json | W3C CSVW; CSVW processors | Datatypes/column semantics for the CSV | application/csvm+json; noindex, follow; CORS |
| /answers.txt | Plain-text Q&A; retrieval ingestion | Question/accepted-answer interface | text/plain; noindex, follow; CORS |
| /fact-map.json | Site-specific JSON; generic ingestion | Existing fact/entity index; no universal standard or measured external consumer claimed | application/json; noindex, follow; CORS |
| /knowledge.xml | Site-specific XML; XML ingestion | Existing XML interface; no universal standard or measured external consumer claimed | application/xml; noindex, follow; CORS |
| /llms.txt | Unofficial llms.txt; retrieval discovery | Compact link guide, not Google ranking metadata | text/plain; noindex, follow; CORS |
| /index.md | Markdown; readers/agent ingestion | Human-readable corpus representation | text/markdown; noindex, follow; CORS |
| /llms-full.txt | Plain text; retrieval ingestion | Full text without HTML parser; distinct from compact discovery guide | text/plain; noindex, follow; CORS |
| /provenance.jsonld | JSON-LD/PROV/OA; provenance clients | Passage/source/answer bindings distinct from canonical entity RDF | application/ld+json; noindex, follow; CORS |
| /evidence-snapshot.json | Site-specific JSON; provenance inspection | Source observations and assessments, not endorsements | application/json; noindex, follow; CORS |
| /doctor.vcf | RFC 6350 vCard 4.0; contacts apps | Individual contact, canonical physician UID | text/vcard; noindex, follow; CORS |
| /clinic.vcf | RFC 6350 vCard 4.0; contacts apps | Separate organization UID, not the Person | text/vcard; noindex, follow; CORS |
| /sitemap.xml | Sitemap/image/video extensions; Search crawlers | Only the 72 canonical HTML documents | application/xml; support policy |
| /robots.txt | REP; Search/AI crawlers | Search crawl permissions, unchanged training preference | text/plain; support policy |
| /site.webmanifest | Web App Manifest; browsers | Existing application metadata | application/manifest+json; support policy |
| /linkset.json | RFC 9264; linkset clients | Typed discovery independent of HTML parsing | application/linkset+json; noindex, follow; CORS |
| /datapackage.json | Frictionless Data Package; data tools | Registered resource/tabular ingestion metadata | application/json; noindex, follow; CORS |
| /void.ttl | VoID; RDF discovery clients | Dataset/vocabulary description, count diagnostic only | text/turtle; noindex, follow; CORS |
| /dcat.ttl | DCAT 3; RDF catalogs | Distribution catalog metadata | text/turtle; noindex, follow; CORS |
| /croissant.json | Croissant 1.1; dataset ingestion | Existing ML dataset field mappings | application/ld+json; noindex, follow; CORS |

Seal outputs also have real release consumers: CycloneDX SBOM for dependency inspection; SHA-256 integrity manifest for offline verification; release provenance for exact commit/toolchain ownership; Content-Digest eligibility/pending configuration for the explicitly unverified byte-identity gate; RFC 9116 security.txt for security contact discovery. These are release infrastructure, not Search authority signals. Their delivery registry is separate from pre-seal corpus resources because they are produced at finalize/seal. Each receives explicit MIME, CORS and noindex/follow; CycloneDX uses application/vnd.cyclonedx+json. They are discoverable by the release artifact/manifest and security.txt’s standardized well-known path.

## Graph identity policy and live gates

The existing bounded exact 200 aliases remain dereferenceable. Header policies cover their namespaces/root identifiers without broadening routing rewrites. They are absent from the HTML sitemap, do not shadow HTML routes, have JSON-LD MIME, CORS and noindex/follow, and use describedby to the describing representation. Entity aliases do not receive document-canonical relations. HTML aliases remain one-hop 301 to their final semantic canonical page.

Repository tests and a localhost Chromium server prove generated bytes, primary ownership, unified reader context and timestamp seeking. They do **not** prove Cloudflare rewrite/header evaluation, WAF crawler access, production TLS/host behavior, compression or pages.dev live noindex. Those remain UNVERIFIED LIVE GATES unless separately exercised on a nonproduction preview of the exact final commit.

## Limited source extraction

After the semantic/delivery release passed, SOURCE and AUTHORED_BODY were moved unchanged into src/canonical/source.mjs. Rendering, materialization and validators import them directly. This removes balanced-brace JSON extraction and vm evaluation of authored-body literals from the release path. The compiler/design/runtime stay in the renderer; no broad architecture rewrite was made. A locked pre-extraction RDF fingerprint and delivered HTML comparison guard equivalence.

Catalog materialization is idempotent: stale datapackage/croissant files are excluded from self/mutual checksum input. Croissant retains the one-way checksum of freshly generated Data Package. Final verification checks every emitted distribution checksum and byte size against its actual local resource.

## Catalog protocol validation

The inherited Croissant generator used a specification HTML URL as its JSON-LD context, unprefixed FileObject types, and omitted advertised record/field mappings. It now embeds the pinned MLCommons context from mlcroissant 1.1.1 (Apache-2.0), declares Croissant 1.1, and maps the existing seven entity-facts CSV columns to actual FileObject/RecordSet/Field vocabulary. Dataset description, publication date and version come from canonical Dataset truth; no new medical or historical facts were authored. Its own descriptor is excluded from distribution to avoid an impossible self-checksum, and contentSize follows Schema.org Text syntax.

CSVW subject values use string because the RDF export contains blank-node labels as well as IRIs. Data Package resource paths are full canonical URLs, avoiding absolute local filesystem paths for remote consumers. Sealed MIME labels derive from the same resource registry as HTTP policy. The machine guide now accurately describes resource-wide noindex/follow.

External consumer checks actually run: mlcroissant 1.1.1 parsed the metadata and loaded all 22,226 existing local RDF fact rows with seven fields; Frictionless 5.19.1 accepted the Data Package descriptor. Local file mappings avoided fetching production resources. Row count is a coverage diagnostic, not authority evidence. Node release tests verify standard JSON-LD expansion, field/header consistency, accurate byte checksums and idempotent output; no Python dependency was added to the release pipeline.
