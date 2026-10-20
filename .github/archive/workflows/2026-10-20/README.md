# Historical workflow snapshots

These six files are retained byte-for-byte from commit `3db15e6635ca47f19f1b368c1c9f2d8a08f7f6a9`. They live outside `.github/workflows` and have `.txt` suffixes, so GitHub Actions does not register them. `inventory.json` records original paths, Git blobs and SHA256 values. Existing Actions run IDs and artifacts remain historical evidence.

`doi-release` and `platform-convergence` already refused execution as retired entrypoints. `doi-finish` belongs to the superseded split publication sequence. The other three workflows were branch-specific one-time checkpoints; their regression tests and build scripts remain in place, and coordinated preflight still runs the relevant validations. No reusable publisher or validator script was deleted.

Use the current coordinated release workflow for an explicitly authorized release. Do not restore a historical entrypoint merely to bypass the frozen candidate or live verification guards. See [maintenance guidance](../../../../docs/maintenance-release.md).
