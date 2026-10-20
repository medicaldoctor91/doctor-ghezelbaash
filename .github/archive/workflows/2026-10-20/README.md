# Historical workflow snapshots

These seven files are retained byte-for-byte; `inventory.json` identifies the source commit for each snapshot. Six came from `3db15e6635ca47f19f1b368c1c9f2d8a08f7f6a9`; the final orphaned `viewer-revision-guard` came from `861230335d49c476d4a8f7d132e672638ea9d4c2`. They live outside `.github/workflows` and have `.txt` suffixes, so GitHub Actions does not register them. `inventory.json` records original paths, Git blobs and SHA256 values. Existing Actions run IDs and artifacts remain historical evidence.

`doi-release` and `platform-convergence` already refused execution as retired entrypoints. `doi-finish` belongs to the superseded split publication sequence. The other four workflows were branch-specific one-time checkpoints; their regression tests and build scripts remain in place, and coordinated preflight still runs the relevant validations. No reusable publisher or validator script was deleted.

Use the current coordinated release workflow for an explicitly authorized release. Do not restore a historical entrypoint merely to bypass the frozen candidate or live verification guards. See [maintenance guidance](../../../../docs/maintenance-release.md).
