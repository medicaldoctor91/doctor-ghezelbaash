#!/usr/bin/env python3
"""Synchronize the staged-platform RDF row contract with verified website dist."""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


def canonical_entity_fact_count(root: str | Path) -> int:
    root = Path(root)
    with (root / "entity-facts.csv").open(newline="", encoding="utf-8") as handle:
        count = sum(1 for _ in csv.DictReader(handle))
    if count <= 0:
        raise AssertionError("canonical entity-facts.csv is empty")
    return count


def patch_validator(validator_path: str | Path, entity_facts: int) -> int:
    """Replace only the entity_facts member of EXPECTED_ROWS exactly once."""
    validator_path = Path(validator_path)
    text = validator_path.read_text(encoding="utf-8")
    block = re.search(r"EXPECTED_ROWS\s*=\s*\{.*?\}", text, flags=re.S)
    if not block:
        raise AssertionError("platform validator EXPECTED_ROWS contract missing")
    old = block.group(0)
    updated_block, count = re.subn(
        r"('entity_facts'\s*:\s*)\d+",
        rf"\g<1>{entity_facts}",
        old,
        count=1,
    )
    if count != 1:
        raise AssertionError("entity_facts row contract was not patched exactly once")
    updated = text[:block.start()] + updated_block + text[block.end():]
    validator_path.write_text(updated, encoding="utf-8")
    if f"'entity_facts': {entity_facts}" not in updated_block:
        raise AssertionError("patched validator does not contain canonical entity-fact count")
    return entity_facts


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: sync_platform_validator_contract.py <dist> <validator.py>")
    entity_facts = canonical_entity_fact_count(sys.argv[1])
    patch_validator(sys.argv[2], entity_facts)
    print(json.dumps({"PLATFORM_VALIDATOR_ENTITY_FACTS": entity_facts}, sort_keys=True))


if __name__ == "__main__":
    main()
