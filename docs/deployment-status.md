# Deployment status

The source contract targets one canonical, indexable, Astro-rendered physician-first Homepage. The Homepage remains the sole public HTML search document; Clinic, services, evidence, media, datasets and the knowledge graph support that document without creating competing entity landing pages.

## Canonical entities

- Person: `https://www.ghezelbaash.ir/#mohammad-saeed-ghezelbash`
- Clinic: `https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic`
- WebSite: `https://www.ghezelbaash.ir/#website`
- WebPage: `https://www.ghezelbaash.ir/#webpage`
- Canonical knowledge graph: `https://www.ghezelbaash.ir/knowledge-graph.jsonld`

The Person is the sole Homepage `mainEntity`. The Clinic is a separate `MedicalClinic` and `LocalBusiness`. Person points to Clinic with `worksFor`, `workLocation` and `affiliation`; Clinic points back through `employee`. Clinic is the provider of offered services and the location/reputation entity.

Clinic `aggregateRating` uses the same dated `5/5` and `163` review snapshot visible in HTML. Google Maps is represented by `Clinic.hasMap` and the visible location link; Maps URLs are not `Clinic.sameAs`.

## Visible Homepage contract

The rendered Homepage contains:

- one approved H1: `دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه`;
- a Person introduction followed by the primary physician portrait and exactly two main CTAs;
- a crawlable Content Table with sixteen ordered canonical H2 destinations;
- medical content split across the approved H2/H3 architecture;
- twelve contextual videos with explicit H2/H3 destinations;
- two medical-education videos only under `#medical-education`;
- the video `رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش` inside `#clinic-information-kermanshah`;
- visible Clinic facts, dated rating provenance, machine-readable resources, contact routes and the five-group external directory.

No independent video hub, video watch page, video sitemap, knowledge landing page or alternate Person/Clinic HTML page is published.

## Graph and machine-readable contract

Inline JSON-LD and `knowledge-graph.jsonld` pass one shared final synchronization layer. They use the canonical Person and Clinic IDs and maintain field-level parity for:

- Person, Clinic, WebSite, WebPage and Article;
- H1 / WebPage `name` / WebPage `headline` / Article `headline`;
- the ordered Content Table `ItemList`;
- all sixteen `WebPageElement` section nodes;
- all twelve `VideoObject` nodes and their visible destinations.

The full graph is a superset of the inline graph. `llms.txt` and `/.well-known/ai.txt` use the same canonical entity URIs and describe the current sixteen-section, twelve-video architecture.

## Discovery contract

The HTML head contains the page identity envelope only: title, description, robots policy, canonical URL, one internal Person author reference, one `rel=describedby` link to the canonical graph, performance hints, icons and physician-first social preview metadata.

The Homepage HTTP `Link` header exposes exactly:

```text
</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"
```

External identity profiles, datasets and authority resources are modeled in the graph or visible Footer directory rather than flattened into the HTML head. `rel=me`, text alternates, decorative `hreflang`, legacy geo metadata and extra HTTP Link targets are prohibited.

## Release gates

Pull requests run:

1. Python syntax checks for both production-audit scripts.
2. Astro build.
3. Validators for stages ۲ through ۹.
4. Release, visible-contract, schema-semantics, nine-stage and passage-depth validators.
5. Upload of the build log, built Homepage and Stage 9 acceptance report.
6. Cloudflare Branch Preview for the exact PR head commit.

Stage 9 formalizes twenty canonical acceptance criteria. Its generated report is written to `build-reports/stage-9-validation.json` and retained as a CI artifact; it is not deployed as a public entity file.

Current production budgets are:

- only `index.html` and `404.html` as HTML routes;
- Homepage raw size below 700 KB;
- gzip size below 180 KB;
- Brotli size below 145 KB;
- fewer than 4,200 DOM elements;
- exactly twelve videos, all with `preload="none"`;
- no duplicate IDs, broken fragments, dangling same-site graph references or legacy entity IDs.

## Production verification

`.github/workflows/verify-production.yml` runs after pushes to `main` and through manual dispatch. It calls `scripts/run-production-audit.py`, which retries cache-busted checks against the custom domain until the deployed commit is visible or the retry budget is exhausted.

The live-domain audit verifies response/security headers, the minimal HTML/HTTP discovery contract, canonical IDs, H1, Content Table, sixteen sections, twelve contextual videos, Clinic testimonial placement, Person/Clinic separation, rating consistency, graph parity, machine-readable guidance, sitemap/robots behavior, removed routes and byte-range video delivery.

## Deployment execution

Production deployment was explicitly retriggered from `main` on 2026-07-15 after Stage 9 completion. The application source immediately before the retrigger was commit `2385143c3c5882ccde71d771abe87cf420f35acc`; this documentation-only commit intentionally starts the production build, Cloudflare deployment and live-domain audit without modifying the rendered Homepage contract.

## Rollback

The pre-Stage-9 rollback point is:

```text
aeeade6650ee4947ec9287c8d15c8887a0ae89a3
```

Detailed traceability, baseline evidence and layered rollback points are recorded in `docs/homepage-stage-9-production-control.md`.