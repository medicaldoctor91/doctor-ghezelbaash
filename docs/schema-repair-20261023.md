# Schema repair and external verification — 2026-10-23

This dated report identifies payload source `94611168bacf7630022499204c493f6e4af64f70`. Later documentation or workflow-controller commits do not replace it. The observations below do not yet establish a full coordinated-publication PASS: the resumed publisher is still checking Hugging Face search/filter runtime behavior.

## Defect and corrected behavior

All 72 public sitemap pages already contained server-delivered, syntactically readable JSON-LD. The defect affected the 71 internal pages: their supporting homepage `ProfilePage` retained its type but lost the physician `mainEntity`. The homepage itself retained that field.

`closeSearchReferences` now preserves the supporting `ProfilePage.mainEntity`, including preselected nodes. The renderer validates the final graph after reference closure. Internal projections retain professional identity, credentials, expertise, address/contact, practice relationships and licensed images while avoiding repeated supporting content inventories and duplicate reciprocal procedure indexes. Visible questions and media remain route content roots. The complete canonical/homepage graph is preserved.

A first candidate (`f2498d1…`, HF `d46beb…`, Kaggle 28) was canceled after independent review found a missing physician-address regression. The corrected candidate restored it and was retested; the canceled candidate was not resumed.

## Public website and independent extraction

At 17:03:42 UTC, all 72 final-source public sitemap pages returned HTTP 200 with parseable JSON-LD, correct `ProfilePage.mainEntity` and matching canonicals. All graphs equal the previously verified corrective source `a5eb0e18…`. Explicit contact/address and licensed-image checks passed for all 71 internal pages.

The complete homepage graph retains all 1,600 nodes and is deeply equal to the original. The homepage HTML is also byte-identical to the original and archived homepage, SHA-256 `5e95c5d280de0a4fddb8e27db5acc4b979fd60427c1f732a25badb2f63b26aa0`.

Cloudflare's active production deployment identifies the same payload source. Automatic Git production deployments are disabled and previews are set to `none`; later workflow and documentation commits are not replacement site deployments. See the [read-only deployment receipt](../reports/schema-repair-20261023/cloudflare-deployment.json).

At 17:20:31 UTC, the public hosted AdNabu Schema Validator fetched five representative URLs with HTTP 200/success and no extraction errors:

| Public page | Detected entities | Supporting ProfilePage subject |
|---|---:|---|
| [Homepage](https://www.ghezelbaash.ir/) | 1,600 | Correct physician mainEntity |
| [Botox](https://www.ghezelbaash.ir/botox) | 137 | Correct physician mainEntity |
| [Acne category](https://www.ghezelbaash.ir/acne-pigmentation-and-scars) | 105 | Correct physician mainEntity |
| [Clinic](https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah) | 85 | Correct physician mainEntity |
| [English guide](https://www.ghezelbaash.ir/aesthetic-guide-en) | 147 | Correct physician mainEntity |

This establishes hosted extraction on those pages, not complete vocabulary conformance or Google rich-result eligibility. The provider's generic absent-Product ecommerce rule does not warrant irrelevant Product markup on this physician website. See the [hosted extraction receipt](../reports/schema-repair-20261023/hosted-extraction.json).

Local build, focused tests and RDF/SHACL checks passed. A published independent schema engine, executed locally against all 71 internal public responses, reported zero parse/runtime errors, zero blocking findings and zero new blocking findings. Its 6,511 advisory diagnostics remain; the original responses also had zero blocking findings. These local engine results are distinct from hosted validation.

## Publication evidence and remaining runtime gate

Preflight [39990970872](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39990970872) passed with frozen manifest SHA-256 `82aa6b793ca90cf1027a27e454d4e41c83fb71d24c502aa862b28c25c045df05`.

Full publisher [39991573278](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39991573278) failed after 90 checks still observed public Kaggle default 27 instead of 29. Later public convergence resolved that particular gate; it does not erase the failed run. A separate notebook operation [39994939155](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39994939155) succeeded. The same frozen candidate is now being rechecked by resumed publisher [39995675163](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/39995675163), with controller `949c05a…`; no new dataset version or DOI was created for the resume.

| Surface | Verified public observation | Scope or remaining gate |
|---|---|---|
| Website | Payload source `94611168bacf7630022499204c493f6e4af64f70`; public 72-page checks pass | Google/Ahrefs recrawl acceptance unverified |
| Hugging Face files | Revision `d5d5d17e2b4584fba2da326060f9b3202d712a1e`; all 203 public files / 67,751,760 bytes match frozen SHA-256 and inventory, including 74 HTML files | Exact public bytes verified |
| HF Viewer core | At 17:19:21 UTC, all five converted Parquet tables / 26,545 rows, previews, rows and statistics passed with exact response revision | Search/filter checked separately; full runtime still pending |
| Kaggle dataset | At 17:31:36 UTC, public default was 29 before and after verification; exact-29/default ZIPs were byte-identical and all 48 files, 47 checksums and 41 manifest resources passed | The earlier default/ZIP delay has cleared |
| Kaggle notebook | Public version 13 source cells match frozen starter; anonymous exact-version output reports PASS with all 26,545 rows reconstructed, 876 CSV query roundtrips and zero unresolved references | Owner execution COMPLETE and public output independently checked; public metadata does not itself expose an exact dataset version |

The Kaggle ZIPs are each 5,769,616 bytes, SHA-256 `b041d98d99bef542c6d0530d71f6428d27568a60be878d2142862e2ca1012303`. Notebook 13's execution output binds HF `d5d5d17…`, source `94611168…`, Kaggle 29 and exact input-checksum digest `3786431c517c3df8e8ef3fdd3ebc741a5ac0e2b846d3f1cde5646f429706bfba`. See the [Kaggle ZIP receipt](../reports/schema-repair-20261023/kaggle-downloads.json), [notebook receipt](../reports/schema-repair-20261023/notebook-execution.json) and [HF core receipt](../reports/schema-repair-20261023/hf-core.json).

Earlier HF search/filter checks passed 0/10 flows across 20 requests by 17:18:15 UTC. An alternate clinical-passages search for `filler` subsequently returned 851 matches with the current response revision and two exact rows verified. Seven other distinct alternate requests failed; the market-positioning pair had not been tried at that checkpoint. One working search does not establish full runtime health. The resumed publisher's final runtime result remains pending.

## Immutable archive and DOI boundary

[Zenodo 23474664](https://doi.org/10.5281/zenodo.23474664), packaging `1.3.4+zenodo.3`, remains the immutable source-`ed767f6e6726e1453196e2ec2b312fcad00677e2` snapshot, with historical HF `51ec078…`, Kaggle 27 and notebook 12. It is not relabeled as the repaired website. The collection DOI remains [10.5281/zenodo.18765168](https://doi.org/10.5281/zenodo.18765168).

The final read-only audit at 17:09:25 UTC verified all 43 public files / 36,284,377 bytes against baseline hashes and lengths, 62 ZIP members, 61 inventory checksums and 42 standalone/ZIP byte comparisons. Metadata is unchanged, fingerprint SHA-256 `bc5d0403c335da0f66c20fee4ed18f452bf7f6839035b2138c14c3231035908a`. No archive writes were made; see the [archive receipt](../reports/schema-repair-20261023/archive-preservation.json).

The actual archive ZIP contains only homepage `index.html`, with no affected internal-page HTML. Its homepage and canonical/scientific resources are byte-identical to current public equivalents. The 876 query records differ only in build-source commit metadata. This renderer repair does not require a new scientific-payload DOI; a new packaging archive would be a separate edition.

## Verification limits

Schema.org hosted validation later returned 405/429 and was not bypassed. No final successful result from that service or Google Rich Results Test was obtained. The Ahrefs project/Site Audit connection returned Insufficient plan; the exact 62-page issue title, URL list, crawl date and post-repair crawl remain unverified.

Public byte integrity, hosted extraction, local tests and runtime checks have the scopes and timestamps above. They do not guarantee future availability, search indexing, rankings, rich-result display or universal website health. The original failed publisher, later successful scoped checks and resumed publisher's pending full-runtime outcome remain separate results.
