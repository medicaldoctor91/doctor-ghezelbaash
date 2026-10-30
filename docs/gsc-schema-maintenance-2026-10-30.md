# Google structured-data maintenance — 30 October 2026

The public profile now supplies a recorded ISO 8601 `dateModified` timestamp,
`2026-10-30T03:58:16Z`. All 63 clinical Article projections supply their recorded
structured-metadata correction time, `2026-10-30T04:17:44Z`, including a timezone.
These delivery metadata edits preserve the original canonical calendar dates,
clinical review dates, scientific edition, authored text and entity identities.
No hour was invented for the original calendar-only scientific dates.

The final Kurdish video chapter now exposes `endOffset: 20` from its existing
parent video's declared `PT20S` duration. Explicit chapter boundaries remain
unchanged. The original graph, media and chapter VTT remain intact; the VTT and
encoded video retain their more precise 20.162-second endpoint. The bounded
Search projection derives this last chapter's known endpoint without changing
the scientific graph.

Fresh Google Rich Results tests confirmed that the reported profile datetime,
Article datetime/timezone and final-chapter warnings are absent:

| Page | Google result | Valid items |
| --- | --- | --- |
| Profile | [Live test](https://search.google.com/test/rich-results/result?id=-nNCy4g9KQdIhgedHwydyA) | 13 |
| Kurdish video | [Live test](https://search.google.com/test/rich-results/result?id=CKEUcEfM-WvCIAom6dnLDg) | 13 |
| Sorani guide | [Live test](https://search.google.com/test/rich-results/result?id=itixEr823Vg_OBlNRNYrQw) | 14 |
| Botox guide | [Live test](https://search.google.com/test/rich-results/result?id=fnbAPFR63e15hXkUiQyi0g) | 13 |

The samples have no critical errors. Optional image, price-range and duplicate
name/URL warnings remain where reported by Google; no pricing, unrelated
article images, publication dates or clinical reviews were fabricated. These
results describe fresh tests, not an assertion that Search Console has already
recrawled every page or closed its historical reports.

The delivery source is `7dc53a5d75aeb4954cc598216be0bff2ada75e7e`. Its reviewed
package binds Hugging Face revision `ca61e0e2dfce8d4245045873c8fd058467e4976d`,
Kaggle version 34 and notebook version 17. The frozen candidate manifest is
`1421b06c41ac324ed689e029d4098bcdaf03204c4c4922867f6fb2f32971221e` from
[the successful preflight](https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/41002385780).
Publication and actual notebook execution are separate gates; see the current
cohort in [maintenance](maintenance-release.md) and its execution receipts.

An independent read of all 204 immutable Hugging Face files matched the reviewed
SHA256 manifest. Complete converted Viewer rows matched the native tables:
3,249 clinical passages, 125 clinical answers, 22,235 entity facts, 876 queries
and 60 positioning examples. Preview, rows and statistics were also checked.
Search/filter remain deferred and are not covered by this primary-Viewer result.

The existing Zenodo DOI `10.5281/zenodo.23474664` keeps its original scientific
source `ed767f6e6726e1453196e2ec2b312fcad00677e2` and 43 archive files. Current
distribution links are maintained separately through same-record metadata.
The read-only archive verifier now recognizes the archive's already recorded
original-science and technical-delivery source bindings, checks both explicitly,
and retains its public checksums, complete ZIP inventory and standalone-file
checks. Nested `website/` copies do not replace the archive's standalone files.

Source and publication tests cover the reported warning regressions, unknown
timestamps, unrecorded chapter boundaries, graph preservation, archive provenance
drift and exact-version notebook inputs. Full public Kaggle default readiness is
reported separately from an exact-version execution; it is never inferred from
an owner `Ready` status alone.
