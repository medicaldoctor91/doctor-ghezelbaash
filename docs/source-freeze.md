# Current website source freeze — main

**Single authoritative website source:** GitHub `main` in `medicaldoctor91/doctor-ghezelbaash`.

**Published application baseline (immutable Git commit):**
`824c02f4bd495cdbc3091b7b3911a5470fd9104b`

**Published application Git tree:**
`03fba3db6f818677ab38e6702bbf111e79e2c6d7`

**Source-management promotion:** PR #500 brought the published source into `main` without editing any website source bytes. The promoted management files are
`.github/scripts/source_freeze.py` and this documentation. The latest validated main head at the time of consolidation was
`6cdf7be7d16813c7eea0916e73c7079eb65ab4b4`.

**Actual Cloudflare production:** project `doctor-ghezelbaash`, branch `main`, deployed source commit
`824c02f4bd495cdbc3091b7b3911a5470fd9104b`, deployment
`9730f5cb-d6f8-4ba2-9413-bd64eb700bbb`. Automatic production and preview deployment are disabled.

## Freeze policy

1. The production website baseline is exactly the published commit/tree above. The `source_freeze.py` verifier pins its tree and 286 application source blobs, and allows only the four specified freeze-management files to differ.
2. `main` is the **only authoritative website freeze reference**. Historical commits remain available in Git history but are not additional current baselines.
3. The active `Frozen source main` GitHub ruleset protects `main`: deletion and non-fast-forward updates are prohibited; changes require a pull request and a passing `Frozen source integrity` status check. A separate GitHub administrator-level **Restrict updates** rule would be necessary for a total lock against even compliant pull requests.
4. The `Frozen source integrity` workflow verifies source bytes and does not deploy. To validate locally:
   ```sh
   python3 .github/scripts/source_freeze.py check
   python3 tests/source-freeze.test.py
   ```
5. Before any future deployment, verify its source is descended from the published commit, with explicitly reviewed deltas and a successful integrity/build regression suite. Do not force-push `main`, re-label historical releases as current, or silently deploy from unrelated branches.

## Cleanup boundary

Earlier website freeze tags, archive branches and superseded website-"final" GitHub releases are **not authoritative**. Removing repository refs, releases, or legacy rulesets requires GitHub repository administrator permissions and must be performed separately. This document alone does not delete GitHub objects.

Versioned scientific and dataset releases, published external records, Git commit history, and deployed Cloudflare artifacts are separate records and must not be destroyed as part of website freeze consolidation.

**No site content, HTML, JSON-LD graph, SEO metadata, or Cloudflare deployment was changed by this documentation consolidation.**
