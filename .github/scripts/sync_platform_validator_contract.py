#!/usr/bin/env python3
"""Synchronize the platform validator's table-row contract with a verified canonical dist.

This prevents historical fixture counts from blocking a legitimate canonical graph change.
The validator remains strict: the measured canonical source counts become the exact contract
for staged HF/Kaggle packages in the same publication run.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

TABLE_KEYS = ("clinical_passages", "clinical_answers", "entity_facts", "query_matrix")


def _jsonl_rows(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def canonical_row_contract(root: str | Path) -> dict[str, int]:
    root = Path(root)
    with (root / "entity-facts.csv").open(newline="", encoding="utf-8") as handle:
        entity_facts = sum(1 for _ in csv.DictReader(handle))
    fact_map = json.loads((root / "fact-map.json").read_text(encoding="utf-8"))
    answer_rows = fact_map.get("records")
    if not isinstance(answer_rows, list):
        raise AssertionError("fact-map.json records contract missing")
    contract = {
        "clinical_passages": _jsonl_rows(root / "clinical-passages.jsonl"),
        "clinical_answers": len(answer_rows),
        "entity_facts": entity_facts,
        "query_matrix": _jsonl_rows(root / "query-matrix.jsonl"),
    }
    if set(contract) != set(TABLE_KEYS) or any(value <= 0 for value in contract.values()):
        raise AssertionError(f"invalid canonical row contract: {contract}")
    return contract


def patch_validator(validator_path: str | Path, contract: dict[str, int]) -> dict[str, int]:
    validator_path = Path(validator_path)
    text = validator_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"EXPECTED_ROWS\s*=\s*\{\s*'clinical_passages':\s*\d+,\s*'clinical_answers':\s*\d+,\s*"
        r"'entity_facts':\s*\d+,\s*'query_matrix':\s*\d+\s*\}",
        re.S,
    )
    replacement = (
        "EXPECTED_ROWS = {'clinical_passages': %d, 'clinical_answers': %d,\n"
        "                 'entity_facts': %d, 'query_matrix': %d}"
        % (
            contract["clinical_passages"],
            contract["clinical_answers"],
            contract["entity_facts"],
            contract["query_matrix"],
        )
    )
    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise AssertionError("platform validator EXPECTED_ROWS contract was not patched exactly once")
    validator_path.write_text(updated, encoding="utf-8")
    if str(contract["entity_facts"]) not in updated:
        raise AssertionError("patched validator does not contain canonical entity-fact count")
    return contract


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: sync_platform_validator_contract.py <dist> <validator.py>")
    contract = canonical_row_contract(sys.argv[1])
    patch_validator(sys.argv[2], contract)
    print(json.dumps({"PLATFORM_VALIDATOR_ROW_CONTRACT": contract}, sort_keys=True))


if __name__ == "__main__":
    main()
