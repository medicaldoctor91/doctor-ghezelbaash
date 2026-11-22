# Kaggle v41 public-default regression blocking coordinated PR #489 release

Verified: 2026-11-22 UTC. This is a **provider-side public default/version selection mismatch**, not an unverified graph content discrepancy. All observations are read-only.

## Affected dataset

- Dataset: https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data
- Exact public v41: https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data/versions/41
- Public GET info: https://api.kaggle.com/v1/datasets/view/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data
- Expected canonical graph website source for v41: `a62e2093c65464a83cc683f7e22e8c8d1f2077b7`
- Expected HF revision for v41: `e7637866157b29ce9022040dfbac93cc8ef7a406`
- Kaggle v41 graph SHA256: `66d837c9da71e63bd534b7b54bc4b305f3dd2330d26a0ea133bad2ffb4ded0de`

## Reproduction

The authenticated Kaggle dataset-status endpoint reports:
```json
{"status": "ready", "current_version_number": 41}
```

The **anonymous public** dataset `view` API instead reports `currentVersionNumber: 40`, and lists version 41 with `status: "Ready"`. The same public state was observed using both `www.kaggle.com` and `api.kaggle.com` endpoints.

The exact v41 page `/versions/41` is publicly accessible with the correct v41 dataset description and 26,649 RDF facts; exact-version v41 `list` contains 48 files and `checksums.sha256` covers the other 47. All exact-version `graph.jsonld` bytes match the active website and pinned HF graph. The exact-version v41 ZIP download endpoint responds HTTP 302 toward an archive, as does v40.

However, the *unversioned* raw `kaggle-manifest.json` resolves to version 40; the dataset root page also presents v40 metadata. The unversioned ZIP endpoint responds HTTP 302, but that alone is not proof that its contents are v41. This mismatch persists after v41 became Ready.

The publication workflow for PR #486 failed with 90 attempts to verify public default 41 after Kaggle v41 had been created: https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/44965781154

Authenticated and anonymous, read-only reproduction with integrity proof:
https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/44970153353

## Downstream impact and safety behavior

PR #489 was merged into development at `96635cfd474566a1d0ff46f71036aa0f13ac7482`. Its new graph has 1,916 top-level nodes, 427 directly authored/created works, and SHA256 `25440dbc062dc69131341744562da86e30037f00af681d8e8fc55ad078cb2f50`.

A **new, independently validated** mutable-platform candidate for website, HF, Kaggle v42 and Kaggle Notebook v22 is frozen. Frozen candidate digest:
`bcfa91b33f4c2f6d76288b5af0b81572fdbbb57d9f2eb53883fd4b3f16093b14`

- Full candidate CI: https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/44969386832
- Freeze: success; public Kaggle v41 default gate: correctly reports FALSE; publish: **SKIPPED**.
- The PR489 recovery workflows made no Kaggle version write, notebook push, website deploy, HF push, or immutable Zenodo change. This statement concerns these audited workflows; unrelated external activity is not assumed absent.
- The old immutable Zenodo source commit remains `eafb138d596a91504ed0af66e2557f52848e36b6`.

## Provider support request

Please repair or explain why the authenticated current ready version is 41 while the anonymous public default/current version is 40, despite exact v41 being public and downloadable. We need the unversioned dataset page, `GET /api/v1/datasets/view`, and unversioned file manifest to resolve to v41. Please do not delete, overwrite or regenerate version 41. If promotion requires an owner action, supply a documented supported endpoint/procedure that promotes this exact ready version without creating another dataset version.

This is the upstream prerequisite to safely publishing the next release candidate v42/Notebook v22 with full cross-platform verification.

## Evidence limitations

This record does not imply that the v41 **default** ZIP equals the exact ZIP; nor does it assert that PR #489 was already deployed. The exact v41 graph matches published website/HF bytes; v42 is only frozen, not externally published. Provider state may change after the recorded check.

Official Kaggle support: https://www.kaggle.com/contact
