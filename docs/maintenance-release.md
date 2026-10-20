# Maintenance and reserved release checkpoint

This source-only cleanup does not build, deploy, upload, publish, mint a DOI, alter secrets or enable a lock. A documentation commit on `main` is not a new dataset release or a new provenance claim for already frozen bytes.

## Frozen cohort: restore it, do not rebuild it

- Payload source: `b753b84011256f13c4badb21af888e92282565dd`.
- Reviewed publication tool: `3db15e6635ca47f19f1b368c1c9f2d8a08f7f6a9`; subsequent source-only cleanup is separate from payload identity.
- Preflight: Actions run `39346227733`, job `118379371240`; frozen artifact `12230513701`, evidence `12231057828`.
- Frozen manifest SHA256: `8fcca05749069f124b45c2a61c5386410f977fe151933d46daf37f4399f37be2`.
- HF revision: `83a17ed6f87d7c51ea5066e2e35c3b8553bdec77`; Kaggle version 25; notebook version 10. Do not create K26/N11 merely to retry a service or resume this cohort.
- Reserved exact Dataset DOI: `10.5281/zenodo.23474664`, packaging `1.3.4+zenodo.3`. Collection DOI: `10.5281/zenodo.18765168`. Historical archive identifiers retain their historical roles.
- Planned Zenodo upload: 43 files including the ZIP, 36,273,779 total bytes. ZIP `dr-saeed-ghezelbash-dataset-1.3.4-zenodo.3.zip`: 6,263,760 bytes, SHA256 `564b303111a15addfa44b1b742ce023e0d4c8cf401d20ae8d6c7342a9d9d0c31`.

Download the existing artifact through authorized GitHub access and verify the manifest before use. Check artifact retention/expiry; losing an artifact is not permission to silently regenerate or substitute bytes. Keep publication receipts outside frozen payload directories. A source commit and an execution/publication receipt identify different things.

The last publication run `39352207747` ended at the strict HF runtime gate; it is not proof of final Zenodo publication. At the last owner-UI review, Zenodo draft 23474664 had zero files and stale metadata. Re-read current state before any future authorized action. Do not label a reserved DOI, planned upload, incomplete draft or successful raw HF export as a completed release.

## Content that must remain intact

Preserve every word of all positioning material, including all 60 examples and the original 47 message arrays. Preserve the complete homepage inline graph and its ProfilePage + MedicalWebPage architecture with the physician as mainEntity. The corrected graph has 1600 entities / 22220 triples. Do not reduce content to meet a crawler size budget. Keep existing Person, Clinic and Dataset IRIs distinct. Wikidata is maintained manually by the user.

Do not modify `src`, `public`, `build`, package/lock files, platform payloads or generated bundles during housekeeping. Existing candidate/hash and strict current-revision, complete-export, positive search/filter and exact returned-row validations remain applicable. Service indexing errors do not justify hidden data edits, new revisions, empty commits or weakening a gate.

## Source cleanup and recoverability

[Branch inventory and retention decisions](maintenance/branch-retention-20261020.json) record every original tip and reachability to the pre-cleanup main. Deleted temporary branches are first preserved as lightweight archival tags under `archive/cleanup-20261020/<original-branch>`. These are retention refs, not GitHub Releases or publication tags. Do not move or overwrite them. To recover a tip, inspect the recorded SHA and create a local branch from its tag; do not push it until its triggers and current authorization are checked.

The first cleanup retained PR458 and ambiguous historical branches. The deeper cleanup reviewed them separately, preserved all 13 exact remaining tips, and closes the superseded PR458 without merging. The updated retention decisions are in [the second-pass inventory](maintenance/branch-retention-deep-20261020.json). No abandoned branch is merged into main. Historical reports and operation scripts remain evidence; they are not assertions of current live state.

[Archived workflow snapshots](../.github/archive/workflows/2026-10-20/README.md) preserve six retired, superseded or one-time entrypoints with their original blobs and hashes. Current coordinated publication, validators and their tests remain available. Nothing in this cleanup adds a lock or changes Actions/environment permissions.

## No-build/no-deploy housekeeping check

Before pushing any housekeeping change, inspect current workflow triggers, branch/tag/create/delete/PR/workflow_run/schedule events, open PRs, active worktrees and Cloudflare integration. `[skip ci]` is supplementary, not a safety boundary. Do not dispatch a workflow or run a build for this cleanup.

The reviewed pre-cleanup main had no matching main-push, tag-push, create/delete or scheduled workflows. Cloudflare Git integration used main with `production_deployments_enabled=false` and `preview_deployment_setting=none`. Its deprecated `deployments_enabled=true` was not treated as a production auto-deploy grant. Git pushes can still create idle metadata records; compare actual build/deploy stage starts and canonical production deployment, not record count alone. Re-check current configuration rather than treating this paragraph as permanent proof. Repository webhook inventory was inaccessible to the cleanup token (HTTP403); that remains a visibility limitation.

Use `git diff --check`, compare protected Git trees before/after, verify archival refs and default/main, and compare Actions plus Cloudflare deployments after the push. Never change protection, rulesets, environments, reviewers, permissions or secrets as part of housekeeping.

## Deeper housekeeping checkpoint

Main is the sole remaining remote branch after this pass. All 29 original non-main tips from both passes remain in lightweight archival tags under `archive/cleanup-20261020/`. Original first-pass decisions remain historical in their own inventory; the second-pass inventory records the later review. A verified local Git bundle additionally preserves each pass. No GitHub Release or dataset version is created.

PR458 was an older 2026-10-17 metadata patch based on source edition 2026-10-10 and a legacy mutable alignment workflow. The current edition 2026-10-18, central DOI policy, frozen source b753 and stricter coordinated guards supersede that route. Its exact head `23e488bc9885adab264d30b8f78daa8cef405fea` is retained before closing without a comment or merge. No old clinical/source changes are merged.

The working publisher dependency closure remains at its original paths: coordinated_doi_release, doi_release, sync_platform_machine_resources, platform_bundle, archive_bundle, candidate_contract, git_payload, doi_validation and browser_projection. The other tested maintenance helpers remain because active workflows/tests still use them. Only the demonstrably orphaned doi_finish.py and doi_inventory.py are moved byte-for-byte to the documented scripts archive. Meaningful validators and historical receipt strings remain intact.

The user does not want manual deployment approval. This cleanup does not introduce approval requirements, locks, protections, reviewers, environment changes, permissions changes or secret changes. Existing publication validation remains unchanged. Housekeeping remains separate from platform publication.

See [local audit and historical recovery](maintenance/audit-recovery.md). GitHub workflow_dispatch requires a workflow on the default branch; preserving a tag does not by itself make a tag-only workflow directly dispatchable. No workflow is dispatched by this cleanup.
