# Fixed source and isolated additions

The coordinated 1.3.6 application checkpoint `d5af127c8554d201b5c77bcf32b56c4d849f5b47` has tree `37e766a4e7a2fc042f3c169bed7ceccd5cc69eac`, 204 application files and annotated tag `source-frozen-2026-11-19-clinical-attribution-1-3-6-r6`. Its direct management child restores the four source-freeze files. Supporting articles on service-focused pages are linked with `hasPart`. The named service remains the sole `mainEntity`.

The coordinated 1.3.6 application checkpoint `fe10f7a348dd5aa1f95b78e50919ba31bac06eca` has tree `84e89bb7776c8ebbfed578d89f4c9e78eb4700cc`, 204 application files and annotated tag `source-frozen-2026-11-19-clinical-attribution-1-3-6-r5`. Its direct child restores the four freeze-management files. Platform validation checks the exact canonical SHACL constraints rather than counting shapes from a prior edition.

The coordinated 1.3.6 checkpoint `3921761a92fd15b4bbd874c8cb0abe27faf81bcc` has tree `d0a10d4ea68c028f52f89672112038c7fba42f43`, 204 application files and annotated tag `source-frozen-2026-11-19-clinical-attribution-1-3-6-r4`. The direct child restores the four freeze-management files. Its exporter preserves the optional clinical-provider and introduction fields in the Parquet distribution.

The frozen 1.3.6 application checkpoint `92d4b58fe5e5d0e20e55a4db3b4a9164d4887675` has tree `728964c3185839aa72a83fc0575b6419d1c7c1c8`, 204 application files and annotated tag `source-frozen-2026-11-19-clinical-attribution-1-3-6-r3`. Its direct child restores precisely the four freeze-management files. This revision adds the legacy 1.3.5 projector binding to the release validator.

The validated 1.3.6 application checkpoint is `41c817b0185a68374192b7c891305d8b3eb8dea3`,
tree `f16fcbccacdd08a381e602910487ffae29851e47`, containing 204 application files, tagged `source-frozen-2026-11-19-clinical-attribution-1-3-6-r2`.
The direct management child restores the four frozen-source management files.
The preceding candidate remains available under its original immutable tags.

The clinical attribution 1.3.6 application checkpoint is `1a5a97b4382322af686b313ca340d3efa4919fce`,
tree `1e810749f93cbe30ad7c16b78974870936ba27a2`, with 204 application files and annotated tag `source-frozen-2026-11-19-clinical-attribution-1-3-6`.
Its direct management child restores exactly the four source-freeze management files.
The coordinated publication uses the verified management build and a separately bound release plan.

The earlier approved clinical-attribution application checkpoint is `25365752e2665d2eaba77e8f805cc0f79dee9183`,
tree `e299a2fbb0e47d8209ca2dc8921f1a032bb92cc4`, containing 204 application files.
Annotated tag `source-frozen-clinical-attribution-2026-11-18` identifies it.
The application files are byte-identical to `60db571865b967d27fededafd284b291a0e0d403`. The management
child restores the four source-freeze management files with the measured pins.

The previous v1.3.5 application baseline remains commit `11ee42b298f96c8db8137d98247739e822a01483`,
tree `1350ae57501cd1f6e01470f385014d8cf3c29e54`, containing 202 application files.
Annotated tag `source-frozen-2026-11-05-v5` identifies it. Its direct management
child restores exactly the four management files with these measured pins.
Its historical guard and materialization remain available from that management child.

All earlier 5 November review candidates remain unchanged under their original
`source-frozen-2026-11-05`, `source-frozen-2026-11-05-v2` and
`source-frozen-2026-11-05-v3` and `source-frozen-2026-11-05-v4` tags and their reviewed management tags.
This revision recognizes only the exact legacy reader.<12 lowercase hex>.js
asset form during replacement of the complete HF mirror. The actual public
baseline inventory and rejected-path regression tests cover that cleanup.
Current query release metadata is bound to Dataset 1.3.5 while the independently
protected positioning corpus retains its own version and bytes. The preceding
heading compaction and all visible sections remain preserved.
Earlier candidates were not publicly deployed.

The historical 30 October baseline remains commit
`0afbefec50a5cd019608699af09ff67efa4c8212`, tree
`36fb3d46e15a3cf0374585ee6187c15d581c7067`, with 184 application files and tag
`source-frozen-2026-10-30`. No historical commit or tag is rewritten.

The earlier `source-frozen-2026-10-24` retains commit
`fd4c523bbbc4103f10be89cec152dfdd436655aa`, tree
`98c37613e7349f9f9070cbf3fe93f259a229183f` and its 182 application files.
Neither that tag nor any published website/source identity is relabelled.

## Integrity contract

Run `python3 .github/scripts/source_freeze.py check` to verify that every baseline
file retains its content, Git mode and file type. Deletions, replacements and
additional source or configuration inputs fail the check. Independent Markdown,
text and reStructuredText notes can be added outside source-sensitive paths.
The four freeze-management files are explicit additions, separate from the
frozen application. Generated dependencies and build caches are not source inputs.

The `Frozen source integrity` GitHub Actions job runs without platform secrets
or write permissions. It checks integrity and exercises the guard; it does not
build or publish the website. A failing check detects an invalid tree. Preventing
that tree from reaching `main` additionally requires a server-side required-check
rule; a workflow alone cannot prevent a direct push or protect itself from an
administrator who changes repository policy.

At the earlier checkpoint, this integration's attempt to create tag protection
was rejected with HTTP 403 (`Resource not accessible by integration`). During
the 30 October maintenance, GitHub's active `main` rules were independently read:
they require a pull request and the passing `Frozen source integrity` check,
require the branch to be current, and prohibit deletion and non-fast-forward
updates. The required approving-review count is zero. The maintenance follows
those rules; it does not bypass or change them. Tag protection is not inferred
from the branch rules, and all older source tags remain unchanged.

## Use the fixed source

Create a separate checkout of the exact baseline:

```sh
python3 .github/scripts/source_freeze.py materialize /tmp/ghezelbaash-frozen-source
```

The destination must not exist and must be outside this repository. This creates
a detached Git worktree at the pinned commit, so later files in `main` cannot
enter its source inputs. It neither edits nor deletes files in the original tree.
To remove that temporary checkout when finished, use `git worktree remove` with
its path; the source baseline and current working tree remain intact.

This source checkout is distinct from the existing published website payload at
`7dc53a5d75aeb4954cc598216be0bff2ada75e7e`. A rebuild would create new provenance;
exact restoration uses the already verified published bytes, never a relabelled
rebuild. The fixed cohort is recorded in [maintenance](maintenance-release.md).

## Controlled publication

The old automatic publication paths remain disabled. Cloudflare automatic Git
production and preview deployment remain disabled, including its global switch.
The reviewed bootstrap reserved the real unpublished archive
`10.5281/zenodo.23965042`; its receipts remain outside frozen source.

The manual coordinated workflow may be enabled for the exact reviewed management
commit, finalized external release plan and frozen candidate. It checks C/M
lineage, source guards, tool hashes, provider baselines and platform bytes.
Zenodo publication is last, after website, Hugging Face, Kaggle and Notebook
runtime verification. Enabling that workflow does not publish a platform.
Historical records and tags remain unchanged. See
[the coordinated release contract](coordinated-release-plan.md).
