# Coordinated release contract

The local implementation prepares a new website/Hugging Face/Kaggle/Notebook/Zenodo release. It does not reserve a DOI, activate a workflow or publish anything. The checked-in DOI policy continues to describe the actual previously published archive until a real reservation and the reviewed source binding exist.

## Current and future identities

Keep the Person `https://www.ghezelbaash.ir/#saeed-ghezelbash`, physician-owned practice `https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`, Dataset `https://www.ghezelbaash.ir/graph.jsonld/dataset` and collection DOI distinct and stable. A new exact archive DOI identifies a snapshot, never the physician or practice.

The current Dataset/source package remains `1.3.4`; the preserved positioning corpus also remains `1.3.4`. These are independent version roles. A future Dataset version must be selected and bound in the actual canonical source before its application checkpoint. Changing the archive packaging version alone does not change the Dataset version. Candidate validation requires the actual canonical Dataset version in every platform graph to equal the selected archive's `contentBaseline`. `sync_positioning` supports a different enclosing package version while preserving the historical corpus, its 47 original message arrays and protected JSONL/CSV/Parquet bytes.

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

No current provider credential is inferred from repository secret names. In the local audit environment, only the GitHub token name was present; repository Actions secret/variable listing returned 403. No Zenodo/HF/Kaggle/Cloudflare runtime token was available to this local release runner. No new DOI or full publication readiness is claimed from fixtures.

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
