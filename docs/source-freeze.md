# Fixed source and isolated additions

The source baseline is commit `fd4c523bbbc4103f10be89cec152dfdd436655aa`,
tree `98c37613e7349f9f9070cbf3fe93f259a229183f`, containing 182 files.
The existing annotated tag `source-frozen-2026-10-24` continues to identify that
same commit. Neither the tag nor the published website's source is relabelled.

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

The connected integration rejected creation of a tag-protection ruleset with
HTTP 403 (`Resource not accessible by integration`). No server-side main or tag
ruleset was applied. To enforce the integrity check on `main`, a repository
administrator must require `Frozen source integrity` from GitHub Actions, prevent
branch deletion and force pushes, and protect the existing freeze tag against
updates and deletion. These settings need no human-review requirement. Until
configured, the check detects violations but cannot prohibit a direct push.

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
`0f72c5e6ef832adef66d003069e3e3c189cf5079`. A rebuild would create new provenance;
exact restoration uses the already verified published bytes, never a relabelled
rebuild. The fixed cohort is recorded in [maintenance](maintenance-release.md).

## Publication freeze

The seven write-capable maintenance/publication workflows are disabled in GitHub
Actions. Their files remain intact. The read-only media inspector and source
integrity check remain available. Cloudflare Git automatic production and preview
deployment are disabled, including its global Git deployment switch.

An intentional future release requires explicitly ending this freeze, checking
the then-current public cohort and using the existing coordinated release
validation. Adding a file to `main` does not enable publication or create a new
Hugging Face revision, Kaggle version or Zenodo record. The current DOI and all
published platform files remain unchanged.
