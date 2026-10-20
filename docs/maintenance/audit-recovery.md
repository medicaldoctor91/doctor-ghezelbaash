# Read-only audits and exact historical recovery

## Current local entrypoint

`tools/audit/home_positioning_link_audit.py` is a byte-identical copy of the self-contained read-only script from `e56dceafdb04d3dcda4c7deeb9225c14e799fd41`, preserved in `archive/cleanup-20261020/codex/doi-23474664-owner-proof`. It imports only Python standard library modules and `requests`; no historical coordinator or platform library was copied into main. It uses GET requests and writes evidence under `/tmp/home-positioning-links`. Run only when a fresh public audit is authorized:

```sh
python tools/audit/home_positioning_link_audit.py
```

This checks full inline/standalone equality, homepage identity and referenced URLs/IRIs, and records positioning hashes. It does not itself compare those hashes against the frozen manifest; that requires a separate comparison with the verified frozen artifact. It is not owner-authenticated verification of a draft, execution output or all Dataset Viewer features. A proxy error, HTTP203 or a semantic graph IRI must be interpreted in context; it is not automatically a broken navigation link. This cleanup does not execute the audit or access public platform payloads.

## Recover the complete live-audit snapshot locally

The exact historical branch tip is `5deb0dfd23b46df4bd7b64c460b123fe8f054575` in tag `archive/cleanup-20261020/audit/doi-23474664-live-review`. To inspect without overwriting main:

```sh
git fetch origin refs/tags/archive/cleanup-20261020/audit/doi-23474664-live-review:refs/tags/archive/cleanup-20261020/audit/doi-23474664-live-review
git rev-parse refs/tags/archive/cleanup-20261020/audit/doi-23474664-live-review
git worktree add --detach ../doctor-ghezelbaash-historical-audit refs/tags/archive/cleanup-20261020/audit/doi-23474664-live-review
```

The rev-parse result must equal the recorded SHA. The separate checkout preserves all original `.github/scripts` imports, workflow setup, version pins and unique audit dependencies together. Inspect its `.github/workflows/live-release-audit.yml` and `.github/workflows/current-viewer-features.yml` before using their local read-only scripts. Historical hardcoded pins and old evidence are not current-state assertions. Do not copy that checkout's coordinator/libraries over main. Do not run its legacy publication scripts while recovering an audit.

For the full release audit, reproduce the local artifact extraction/setup described in the historical workflow, using the existing frozen artifact `12230513701` from run `39346227733`, not a rebuild. Verify `frozen-sha256.json` against `8fcca05749069f124b45c2a61c5386410f977fe151933d46daf37f4399f37be2` and inspect script expectations before any authorized GETs. The preserved workflow source documents its original environment; scripts are not promised to run without those prerequisites.

GitHub `workflow_dispatch` requires the workflow to exist on the default branch. A tag-only archived workflow is not automatically dispatchable. No new audit workflow or remote dispatch is introduced here. Adding a future audited manual-only workflow to main would be a separate source change; local recovery requires no workflow dispatch.

## Other historical tips and bundles

Each inventory entry gives the original branch, full SHA and exact archival ref. Fetch its tag and create a separate detached worktree as above, substituting the recorded ref. If remote refs become unavailable, the verified Git retention bundles from the two cleanup evidence packages contain the exact tip histories:

```sh
git bundle verify /path/to/remaining-13-branches.bundle
git fetch /path/to/remaining-13-branches.bundle 'refs/tags/archive/cleanup-20261020/*:refs/tags/archive/cleanup-20261020/*'
```

Restoration is not permission to push or run a publisher. Re-check triggers and authorization before any future remote mutation. Tags are retention refs, not GitHub Releases. No stale branch was merged into main, and no history was rewritten.
