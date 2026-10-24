# Full graph first: isolated homepage experiment

This tests Google's recognition of the complete graph before the homepage body.
It does not change the published website or the coordinated platform release.

The protected production baseline is deployment
`a86aa67c-5d7d-426d-87b2-b11ce8bdef7f`, website source
`0f72c5e6ef832adef66d003069e3e3c189cf5079`. Its homepage SHA-256 remains
`4f8cb1cc228a620110bc45fb01decf7446c0e8f06dba80878e0ceb204bda863b`.
Git auto-deployment remains disabled. HF3cc, Kaggle32, notebook16 and the same
Zenodo DOI `10.5281/zenodo.23474664` are unchanged.

## Published experiment

- [Full-graph candidate](https://077ae6ce.doctor-ghezelbaash.pages.dev/)
- [Exact baseline HTML control](https://077ae6ce.doctor-ghezelbaash.pages.dev/control/)
- [Successful preview-only workflow](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/40138824441)

The candidate has one active JSON-LD document containing the exact complete
1,600-node canonical graph. The 85-node document and inert graph container are
removed from this experimental response, preventing the smaller document from
masking a failure to recognize the complete one. The active document ends at byte
1,667,242, or 1,675,434 including an 8,192-byte header reserve. The authored body,
page metadata and all other 187 website files remain unchanged. The added
`/control/index.html` is byte-identical to the production homepage. Its different
pathname means it is a static/schema control, not a navigation-equivalence claim.

The candidate homepage SHA-256 is
`372a538549d500a3c25ea3f64343f64fd459a91f91bea178f15bd6f61da6f423`.
The unchanged complete graph SHA-256 is
`aa8776aab907ab2abed459127a50f18d5e431b7f4d2dfb6d3382564da5fed4a7`.
Offline RDF parsing also preserves all 22,235 triples. Six safety tests passed,
including preparation of an exact 188-file baseline restore. Independent ordinary
public reads verified candidate/control/graph/Botox bytes and unchanged production
at 22:33 UTC. Preview headers are `noindex, nofollow, noarchive`.
See the [candidate receipt](../reports/full-graph-first-20261024/candidate.json),
[public preview verification](../reports/full-graph-first-20261024/preview.json),
[independent outside check](../reports/full-graph-first-20261024/independent-public.json)
and [unchanged production proof](../reports/full-graph-first-20261024/production-after.json).

## Google recognition regressed; preview restored

The user supplied both completed Google tests. The first supplied link tested
the control, and the second tested the full-graph candidate; the mapping below
comes from Google's saved tested URL rather than the order of the links.

| Tested HTML | Google test time, UTC | Recognized eligible items | Categories |
| --- | --- | --- | --- |
| [85-node baseline control](https://search.google.com/test/rich-results/result?id=knrJKuOUtIdfKrr8bvryVw) | 22:52:09 | 13 valid; no critical errors; 4 items with warnings | Dataset, ImageMetadata, LocalBusiness, Organization, ProfilePage |
| [Full 1,600-node graph first](https://search.google.com/test/rich-results/result?id=LQgOpomf5iY8QvYfrDDYWQ) | 22:53:51 | 0 | None |

Both fetches returned HTTP 200 and the same intentional preview `noindex`.
Google's tested HTML contains the candidate's complete active 1,600-node JSON-LD,
deep-equal to the canonical graph. Thus moving the complete graph before the body
alone did not restore Google's recognition. Missing or truncated graph content
does not explain this observation. The precise parser limitation has not been
isolated; this result does not establish that the RDF itself is invalid.
Rich Results item counts do not establish indexing of all graph nodes.
See the [control receipt](../reports/full-graph-first-20261024/google-control.json),
[candidate receipt](../reports/full-graph-first-20261024/google-full-graph-candidate.json)
and [independent comparison](../reports/full-graph-first-20261024/google-independent-review.json).

As authorized, [restore workflow 40140681020](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/40140681020)
completed successfully using reviewed controller `2f1f75e8303c2284ceefd502a92f274a27023e73`.
It restored all 188 original website files to the same preview branch, with no
baseline file changes. The restored immutable preview is
<https://49bfc628.doctor-ghezelbaash.pages.dev/> (deployment
`49bfc628-1635-48c2-992f-bffb79ac0a96`). The branch alias also serves the original
homepage SHA-256. The failed immutable `077ae6ce` preview remains as test evidence.

The workflow's before/after guards and separate anonymous public reads at
22:58:47 UTC confirm production remains at `a86aa67c`, source `0f72c5e6`, with
the exact original homepage, Botox, full graph and provenance bytes. Git automatic
deployments remain disabled. No HF, Kaggle, notebook or Zenodo files were changed
by the experiment or restore, so this experiment introduces no cohort mismatch.
See the [restore receipt](../reports/full-graph-first-20261024/restore-preview.json),
[production guard](../reports/full-graph-first-20261024/restore-production-after.json)
and [outside verification](../reports/full-graph-first-20261024/restore-public-verification.json).

Search Console's read-only baseline inspection reports the production home and
Botox URLs as indexed with matching Google canonicals. Their last crawl times are
October 23, before this experiment, so they do not validate its markup.

## Restore and promotion conditions

If another reviewed experiment regresses relative to its control, dispatch
`full-graph-first-preview.yml` with `mode=restore` and the exact reviewed controller
commit. This uploads the original verified 188-file website to the same fixed
preview branch. It does not roll back someone else's production deployment;
production was never changed by this experiment. Preserve the failed immutable
preview and its result as evidence.

Even a positive initial-page Google result does not make this a complete
production change. The existing lazy internal-to-home metadata resource still
restores the published fallback. That navigation contract must be updated and
verified before coordinated promotion. Any later production publication must
preserve scientific data, authored content, canonical identities and the same DOI,
and update the public platform packages and archive in a reviewed order.
