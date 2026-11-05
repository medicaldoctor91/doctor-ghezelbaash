# Coordinated release contract

The release includes the website on Cloudflare Pages, Hugging Face, the Kaggle dataset and Notebook, and Zenodo. The checked-in DOI policy continues to describe the actual previously published archive until a real reservation and the reviewed source binding exist. Preparing source or running the default access audit does not publish any platform.

## Current and future identities

Keep the Person `https://www.ghezelbaash.ir/#saeed-ghezelbash`, physician-owned practice `https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`, Dataset `https://www.ghezelbaash.ir/graph.jsonld/dataset` and collection DOI distinct and stable. A new exact archive DOI identifies a snapshot, never the physician or practice.

The reserved Dataset/source package is `1.3.5`, with exact archive packaging `1.3.5+zenodo.1` and real DOI `10.5281/zenodo.23965042`. The preserved positioning corpus remains `1.3.4`. These are independent version roles. The canonical source binds the active catalog, projects, distribution versions and current-version chain before its application checkpoint. The new release has its own technical date; earlier version nodes and scientific/clinical dates retain their original values. Candidate validation requires the actual canonical Dataset version in every platform graph to equal the selected archive's `contentBaseline`. `sync_positioning` preserves the historical corpus, its 47 original message arrays and protected JSONL/CSV/Parquet bytes inside this new enclosing package.

Scientific edition, clinical-review dates, document modification times, media upload/event dates, archive publication date, packaging maintenance date and HF commit timestamp retain their own meanings. The release plan records them separately; it does not manufacture fresh medical-review dates.

## Required sequence

1. Capture the actual public/owner baseline, previous archive policy and root file checksums, exact website deployment and verified rollback inventory. Recheck current main, workflow/ruleset states and provider access. A successful GET does not prove publication permission. Preserve all old records and refs.
2. With the separately authorized reservation scope and actual Zenodo credentials, run the reservation operation against the captured previous published policy, with `RELEASE_PLAN_PATH` unset. It first reads family drafts. An existing unique unchanged draft can be recovered. A full/ambiguous draft inventory, changed draft metadata or an existing unresolved POST journal blocks another reservation. Keep the actual `reservation.json` receipt and journals outside the source tree; never invent an ID.
3. Bind the returned real record/DOI/download paths, previous archive history and selected versions in `src/canonical/doi-policy.json`. Bind the actual Dataset version in canonical source if that version changes. Do not store the future source commit in this file: `sourceCommitMode: build-source` derives it after commits exist. The approved external plan's policy must match these checked-in bytes except for the computed current archive source commit; both JS and Python reject drift.
4. Finish approved application, content, tests, dependencies and release-tool changes. Create application-only checkpoint **C**, whose tree excludes exactly the four existing source-freeze management additions. Create management child **M**, adding those four files back with C's actual tree/count/tag pins. Count the new application inventory rather than retaining the old count of 184. Preserve historical refs. A fixture tests both guard and materialization; do not weaken the historical guard to accept a development tree.
5. Finalize the external approved plan after C/M exist. It contains the actual reservation, complete captured previous policy and its canonical SHA-256, previous archive source and inventory SHA, verified backup manifest SHA and deployment ID, stable entity IRIs, actual provider baselines/next versions, all graph/table counts, date/version roles, C/M/tool refs and exact release-tool inventory. `publicationToolCommit` is M. Keep the plan outside the source commit to avoid a commit self-reference. Validate it with `release_plan.py`; no synthetic test IDs may be used operationally.
6. Preserve C/M ancestry in the review PR. The reviewed immutable build ref resolves to M. Run the manual workflow at that exact ref: checkout HEAD, `GITHUB_SHA`, `reviewed_commit`, approved plan M and the publication tool tree must match. A default-main merge R is not relabelled M. If the selected ref cannot run, review/build a new truthful candidate from the actual source instead.
7. Preflight runs pure source unit fixtures with the publication plan removed and the selected source M pinned. Those fixtures do not build or publish an archive. Historical-policy compatibility is tested against the captured historical fixture through the explicit JS/Python resolvers. Then Build runs in the real approved reserved-edition context, followed by built-output tests, browser regression and machine/canonical validators. The candidate controller prepares the actual platform packages, executes the notebook, verifies reviewed counts/protected corpora, rebuilds the archive for reproducibility and freezes all payload and control inventories.
8. Stage only the selected new Zenodo draft and verify downloaded server-side bytes. Keep the immutable archive unpublished while publishing the exact frozen HF commit/LFS bytes, website artifact, Kaggle dataset version and Notebook version. Verify public/default ZIPs, exact source/versions, notebook execution and all HF Viewer features including actual Search and Filter rows. Pending Search/Filter does not become a full runtime PASS.
9. Publish Zenodo last, once, after the public/runtime gates pass. Verify the final record, collection relationship, metadata, standalone/ZIP byte parity and that the previous archive is unchanged. Append receipts outside frozen payload directories; do not rebuild or patch frozen data during publication.

## Three source contexts

| Context | Required source behavior |
| --- | --- |
| Historical archive verification | Use its captured policy and recorded archive source. The old scientific source `ed767f6e6726e1453196e2ec2b312fcad00677e2` remains historical provenance. |
| New reserved edition | `RELEASE_PLAN_PATH` selects the actual approved plan; `PREPARE_RESERVED_DOI` equals its real new record; `ARCHIVE_SOURCE_COMMIT` is empty. Actual HEAD and `GITHUB_SHA` must equal M. |
| Published maintenance of that edition | Use a reviewed `published-maintenance` plan, pin `ARCHIVE_SOURCE_COMMIT` to the newly published archive's M, and leave preparing mode empty. A later website build does not relabel the immutable archive. The coordinated new-edition workflow deliberately rejects this context; use a separately reviewed maintenance operation. |

## GitHub execution before the new checkpoint

Local credential availability and GitHub Actions access are separate checks. The repository token can dispatch Actions even though listing Actions secrets/variables returns 403. Run `41921964850` successfully dispatched the existing media inspector at reviewed commit `6ae90bd5422fb28a0773c1aca368383c6930d87d`; its authenticated Cloudflare project GET returned 200. This establishes that execution path and that read access, rather than full publication permission on every provider.

All four authenticated provider reads passed in run `41923983120`; run `41924204532` durably reserved the real unpublished record `23965042`. Fresh read-only run `42005324865` on 5 November confirmed the same draft/DOI, unchanged previous archive policy and file inventory, HF parent `ca61e0e2dfce8d4245045873c8fd058467e4976d`, Kaggle owner/public version 34, completed Notebook version 17 and the existing Cloudflare deployment. The intended provider increments are Kaggle 35 and Notebook 18. An explicit `six` dependency and an import smoke check cover the observed Kaggle 2.2.4 packaging gap on a fresh runner.

The registered `inspect-media-delivery.yml` workflow also supports a default `access-audit` and an explicit `reserve` operation at an exact reviewed source SHA. It has no automatic trigger and does not bypass the final coordinated workflow's C/M/plan checks. Its reports contain selected public metadata and access outcomes, never credentials or a raw Cloudflare environment configuration. Each provider is checked with the credentials available inside Actions; absent local environment variables are not treated as evidence that repository secrets are absent.

Reservation first captures fresh owner/public baselines and authenticates earlier bootstrap evidence. A source-, policy- and action-bound intent artifact must be durably uploaded and verified before a single Zenodo POST. A new-version request and a later DOI-reservation request require distinct durable intents and separate runs. An ambiguous write is resolved through owner GETs; starting a new runner does not authorize repeating it. These bootstrap receipts remain outside canonical source and do not constitute a published archive.

After a real reservation, bind the actual DOI and versions before creating C/M. The final publication workflow remains disabled until its concrete source bindings and candidate are ready. Cloudflare automatic Git deployment stays disabled: the reviewed frozen website artifact is deployed explicitly by the coordinated controller. The immutable Zenodo archive is published last, after the website, Hugging Face, Kaggle dataset and executed Notebook have converged and passed their required runtime checks.

## Frozen artifacts and cross-run recovery

The workflow authenticates the producing candidate run, exact source/workflow/plan and artifact availability before restoration. Every tar member is validated before extraction: no traversal, links, devices, duplicate members or unexpected root. Frozen controls and upload bytes are checked again before stage/publish.

Attempt journals are written atomically and flushed before reservation, DOI reservation, dataset-version creation, Notebook push, website deployment and Zenodo publication. HF pushes retain the ordinary non-forced same-commit check. The same work directory cannot repeat an unresolved write.

A fresh Actions runner restores prior attempt journals before `publish-frozen`. Recovery reads only authenticated runs of this workflow and exact M. It checks source, operation, run attempt, approved-plan digest, frozen-manifest digest, action and record/version binding. Only four named publication-attempt journals can be restored; frozen controls are never overwritten from evidence. Archive names, entry count and control sizes are bounded. Active prior runs, mismatched candidates and missing/expired evidence after an executed operation block another write. Starting a new workflow run is the recovery path; rerunning a publication attempt is rejected.

After an ambiguous response, inspect owner/public state. If a provider has reached the exact intended version/source, resume verification and skip creation. If it is still processing or the attempted outcome is unknown, retain the journal and wait for/read its actual state. Do not remove the journal, create a compensating version or repeat the POST to bypass a cache. An unsuccessful website deployment is likewise investigated through deployment/public reads before a separately reviewed retry or rollback. An already published DOI remains an immutable historical edition.

The workflow archives JSON/log evidence even after failure. If evidence is missing, the controller stops for owner-side inspection rather than treating the next runner as a new release. The services do not provide an atomic multi-platform transaction; controlled resume/rollback and actual per-platform receipts are required.

## Local verification

These commands exercise local fixtures only, using the current published-archive context; they do not reserve, stage or publish:

```sh
ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 python tests/release-plan.test.py
ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 python tests/release-recovery.test.py
ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 python tests/coordinated-doi-release.test.py
python tests/source-freeze.test.py
```

The historical source-freeze check is expected to reject the changed development tree until a genuinely new reviewed C/M checkpoint is created. Passing its isolated regression fixtures does not mean the development patch has become the historical frozen release.
