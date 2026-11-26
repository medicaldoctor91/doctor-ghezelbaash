# Website source freeze — reviewed successor, deployment pending

**Authoritative website source:** GitHub `main` in `medicaldoctor91/doctor-ghezelbaash`.

## Successor checkpoint

- Application commit: `9bc6d4ce2b9051879332f9395d2925e99a217514`
- Exact Git tree: `74156f7c541210218effd6feec231ee8fe050503`
- Application files excluding the four freeze-management files: 288
- Scope: lossless homepage JSON-LD compaction, early identity metadata, physician profile Microdata, and scoped research and workshop evidence in the corresponding HTML routes.
- Source validation and production deployment are recorded separately. Deploy from `main` after integrity checks and a live baseline check.

## Previous checkpoints (preserved)

- Production commit before this change: `046df540af0752eb5dd51b3ae4af7ce80c90eef8` (Cloudflare deployment `3c52611c-5d94-49b4-8cb3-b04fdf7837c3`).
- Physician practice schema checkpoint: `82d9805e0d9bff0c736cfa76c0275d5050319d5c` (tree `b94b00eedd08ab20f0858bba01878dad6e3dd501`).
- Historical production checkpoint: `824c02f4bd495cdbc3091b7b3911a5470fd9104b` (tree `03fba3db6f818677ab38e6702bbf111e79e2c6d7`).
- Keep all historical references intact. Production deployment is explicit.

## Freeze and authorized promotion policy

1. The successor source verifier pins the exact reviewed commit/tree and application blobs. It rejects other changes and source-sensitive additions; the existing four management-file exceptions remain unchanged.
2. `main` remains the only authoritative current source. The successor checkpoint is an immutable commit used to verify its application bytes, not a separate mutable source of truth.
3. The active `Frozen source main` ruleset restricts updates, disallows deletion/non-fast-forward updates, and requires a PR plus the passing `Frozen source integrity` check. An authorized administrator may temporarily permit updates only for the reviewed promotion while retaining the other protections. Restore the full restriction immediately after promotion.
4. The management workflow does not deploy. Run `python3 .github/scripts/source_freeze.py check` and `python3 tests/source-freeze.test.py`. Exact checkpoint recovery includes historical management bytes; use the current verifier from the authoritative source to validate that recovered checkout.
5. Deploy only the approved main source after successful integrity/build checks and live baseline verification. Verify the live homepage, biography and workshop JSON-LD and the other route outputs. Record the actual deployment only after confirmation.
6. Keep version 1.3.6, both DOI bindings and all previously published scientific/dataset artifacts unchanged. No force push, archive rewrite, or unsolicited external platform publication.
