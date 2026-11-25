# Website source freeze — reviewed successor, deployment pending

**Authoritative website source:** GitHub `main` in `medicaldoctor91/doctor-ghezelbaash`.

## Reviewed successor checkpoint

- Application commit: `82d9805e0d9bff0c736cfa76c0275d5050319d5c`
- Exact Git tree: `b94b00eedd08ab20f0858bba01878dad6e3dd501`
- Application files excluding the four freeze-management files: 287
- Validation: [successful full build and 72-page regression, RDF, machine outputs and DOI policy](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/45702641869).
- Scope: the reciprocal physician/practice Search JSON-LD references on the dedicated clinic page, regression tests and validation workflow. No canonical scientific facts, package version or archive DOI changes.

The successor is a reviewed source checkpoint, **not a statement that it is deployed**. PR #502 is the proposed promotion. Before deployment, reverify the actual production commit and the final approved source. Do not change the archive or external dataset releases for this HTML-projection-only correction.

## Previous production checkpoint (preserved)

- Commit: `824c02f4bd495cdbc3091b7b3911a5470fd9104b`
- Tree: `03fba3db6f818677ab38e6702bbf111e79e2c6d7`
- Previously recorded Cloudflare deployment: `9730f5cb-d6f8-4ba2-9413-bd64eb700bbb`
- Historical tag, if present: `source-frozen-2026-11-22-production-824c02f4`.

The previous commit/tree and tag must not be rewritten or deleted. Production remains independently verified; automatic production and preview deployment were disabled at the prior freeze.

## Freeze and authorized promotion policy

1. The successor source verifier pins the exact reviewed commit/tree and application blobs. It rejects other changes and source-sensitive additions; the existing four management-file exceptions remain unchanged.
2. `main` remains the only authoritative current source. The successor checkpoint is an immutable commit used to verify its application bytes, not a separate mutable source of truth.
3. The active `Frozen source main` ruleset restricts updates, disallows deletion/non-fast-forward updates, and requires a PR plus the passing `Frozen source integrity` check. An authorized administrator may temporarily permit updates only for the reviewed promotion while retaining the other protections. Restore the full restriction immediately after promotion.
4. The management workflow does not deploy. Run `python3 .github/scripts/source_freeze.py check` and `python3 tests/source-freeze.test.py`. Exact checkpoint recovery includes historical management bytes; use the current verifier from the authoritative source to validate that recovered checkout.
5. Deploy only the approved main source after successful integrity/build checks and live baseline verification. Verify the live clinic JSON-LD and the other route outputs. Record the actual deployment only after confirmation.
6. Keep version 1.3.6, both DOI bindings and all previously published scientific/dataset artifacts unchanged. No force push, archive rewrite, or unsolicited external platform publication.
