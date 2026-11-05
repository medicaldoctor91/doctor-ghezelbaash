# Fixed source and isolated additions

The current v1.3.5 application baseline is commit `10f2000f70086a2de6e580d32702e87d52e650a4`,
tree `acc13f54d41295409d77a6177297ec1dad2aa6f7`, containing 202 application files.
Annotated tag `source-frozen-2026-11-05-v3` identifies it. Its direct management
child restores exactly the four management files with these measured pins.
The guard and materialization checks apply to this new snapshot.

The previous 5 November review candidates remain unchanged at tags
`source-frozen-2026-11-05` (application `a2b89ff0989128c17ed96d8770d2a8be38331c9d`)
and `source-frozen-2026-11-05-v2` (application `d7e3cfc7c60f92f4ed5892b6e4dc842b68fc408b`).
Their reviewed management tags retain their original commits. This revision
aligns source/build documentation, current platform cards and the explicit
historical projection validator; prior candidates were not publicly deployed.

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
