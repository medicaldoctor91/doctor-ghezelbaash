# Retired standalone utilities

These files are byte-for-byte historical snapshots from `6b99204f61bab7a97ef1544f4abf976c0d9419e3`; see `inventory.json`. Their `.txt` suffixes and location prevent accidental treatment as active entrypoints.

- `doi_finish.py`: superseded split publication sequence. The coordinated frozen publisher owns notebook identity/execution and final archive publication. No active workflow, script import or test depends on this script.
- `doi_inventory.py`: one-off source inventory generator writing a historical report. Current DOI validation is performed by the retained `doi_validation.py` and `candidate_contract.py`. No active workflow, script import or test depends on this generator.

Restore a historical file at its original path in a separate historical checkout if needed. Do not execute these snapshots from their archive paths: their original relative-root assumptions are intentionally preserved. Historical workflow-path strings in receipts/tests remain unchanged.
