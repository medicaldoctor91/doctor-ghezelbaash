# Live Google Rich Results audit — 2026-10-24

## Scope and provenance
Read-only investigation of the five public URLs below using Cloudflare Browser Rendering `/content` with JavaScript disabled and cache TTL 0. The API returned HTML that was parsed locally in the Cloudflare API executor. Browser-rendered HTML character counts are **not raw HTTP byte counts** and a successful Browser Rendering API response is not independent evidence of the origin's precise HTTP status. Separate Google Search Console URL inspections returned indexed/crawlable results for the sampled URLs in the accompanying conversation. The live `release-provenance.json` source commit was `94611168bacf7630022499204c493f6e4af64f70`.

**Hard constraints:** The 1600-node inline homepage graph is intentional. Do not shrink it, edit `src/lib/home-projection.mjs` for size, rewrite `@id` values or scientific facts, or modify archived Zenodo records/DOIs.

## 1. Root cause and confidence
No missing JSON-LD, missing BreadcrumbList, malformed JSON syntax, unexpected canonical, or noindex condition was reproduced in the four tested internal routes. Specifically, **the proposed root cause that `closeSearchReferences` drops BreadcrumbList was falsified** in production HTML. The claim that Google Rich Results Test displayed "No items detected" was supplied by the site owner; this audit could not execute Google's own live test service or obtain its URL-specific rendered diagnostic output. Its cause is **not established** by this evidence.

The homepage graph primarily represents the physician, practice, scientific knowledge and provenance, not necessarily a Google-supported rich-result feature for the homepage itself. Other page `BreadcrumbList` records and external `Article` evidence nodes inside the whole homepage knowledge graph are not proof of a rich result eligible *for the homepage*. This is a scope distinction, not a confirmed Google test verdict.

## 2. Affected URLs and live facts
| URL | Browser HTML chars | JSON-LD scripts | Parsed graph nodes | Canonical | Robots | Own BreadcrumbList |
| --- | ---: | ---: | ---: | --- | --- | --- |
| `/` | 2,793,998 | 1 | 1,600 | correct | index, follow | Not required for homepage; the full corpus contains breadcrumbs for other routes |
| `/botox` | 130,910 | 1 | 137 | correct | index, follow | Present; 2 valid ListItems |
| `/acne-pigmentation-and-scars` | 109,418 | 1 | 105 | correct | index, follow | Present; 2 valid ListItems |
| `/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah` | 88,814 | 1 | 85 | correct | index, follow | Present; 2 valid ListItems |
| `/aesthetic-guide-en` | 133,583 | 1 | 147 | correct | index, follow | Present; 2 valid ListItems |

Each inspected internal JSON-LD document uses a `https://schema.org` context plus IRI coercion mappings, preserves the supporting `ProfilePage.mainEntity` physician reference and links its own `MedicalWebPage` to its `BreadcrumbList`. The breadcrumb `position`, `name` and absolute `item` URLs were verified.

The published HTML of the homepage intentionally embeds all 1,600 nodes. No size reduction is proposed.

## 3. Exact source locations
- `src/pages/index.astro`: `independentPages` emits `BreadcrumbList`, `page.breadcrumb` and per-route JSON-LD (roughly lines 4337–4339 and 5091–5095).
- `src/pages/index.astro`: `routeSchemaPolicy` preserves reviewed `MedicalWebPage`, `WebPage`, `ContactPage` types (roughly lines 4653–4670).
- `src/pages/index.astro`: final projection, `closeSearchReferences` and `assertRichResultsDocument` run before serialization (roughly lines 4990–5002).
- `src/lib/search-contract.mjs`: `closeSearchReferences` preserves supporting `ProfilePage.mainEntity`; BreadcrumbList exists in the live output.
- `src/lib/jsonld.mjs`: `serializeInlineJsonLd` safely serializes JSON-LD.
- `src/lib/home-projection.mjs`: `projectHomeGraph` intentionally returns the complete canonical graph.
- `src/canonical/source.mjs`: authoritative semantic facts. Do not rewrite.
- `src/pages/[...route].astro`: dispatches canonical paths to the canonical renderer.

## 4. Minimal fix decision
**No production semantic mutation is justified by the evidence collected.** In particular, do not add duplicate breadcrumbs or relabel unrelated content as Article/Product/FAQPage to force Google recognition. Rich Results Test supports a subset of Schema.org. Google ProfilePage has page-purpose eligibility guidelines; valid RDF/JSON-LD does not guarantee a displayed rich result.

The confirmed improvement is to add a regression test for the final projected breadcrumb graph and the intentionally complete homepage. See `tests/google-rich-results-regression.test.mjs` on this branch.

## 5. Regression tests
New tests cover:
- preservation of a Google-compliant BreadcrumbList through `closeSearchReferences`;
- preservation of supporting physician `ProfilePage.mainEntity`;
- immutability of the canonical source fixture;
- conditional checks of the final built HTML for these five routes (canonical, robots, one parseable JSON-LD script, page/breadcrumb identity, two ListItems);
- exactly 1,600 nodes on the homepage.

Run: `node --test tests/google-rich-results-regression.test.mjs`.
To enable the dist-backed tests: `npm run build && node --test tests/google-rich-results-regression.test.mjs`.

The final-HTML tests deliberately skip before `dist` exists. No build or test execution result is claimed in this report.

## 6. Live verification
The public production payload has the expected JSON-LD structure at all five sampled URLs (snapshot checked on 2026-10-24). Independent Google Search Console inspection previously confirmed indexability and matching canonicals for four URLs (home, botox, clinic, English guide); that observation is not an RRT eligibility verdict. No production changes were deployed as part of this audit.

## 7. Unverified items and next gate
- Actual Google Rich Results Test output (screenshots, rendered HTML diagnostics and test settings) for each exact URL: **not obtained**. Do not claim Google approval or reproduce the user's reported zero without independent test evidence.
- HTML byte identity between the generated local `dist` and production: **not independently rebuilt or hashed here**; the site's own integrity manifest and release receipts are available but distinct from running `npm run build`.
- A new Ahrefs recrawl since the source-repair deployment: **not confirmed**. Earlier missing-Article/FAQ classification notices and Schema.org warnings should not be converted into fabricated markup.
- Whether individual educational pages qualify as `Article`: requires authored-page review and real `datePublished`, `dateModified` and `image` data. No Article is invented in this audit.

**Conclusion:** The suspected missing or stripped BreadcrumbList defect is not present in the sampled live pages. Until Google's URL-specific Rich Results Test reveals a concrete failure, preserve the existing semantic graph and restrict changes to regression coverage.
