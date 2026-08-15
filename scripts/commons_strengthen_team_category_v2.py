#!/usr/bin/env python3
from __future__ import annotations

import re
from typing import Any

import commons_strengthen_team_category as publisher

_QID = re.compile(r"^Q[1-9][0-9]*$")


def extract_qids(value: Any) -> set[str]:
    out: set[str] = set()
    if isinstance(value, str):
        if _QID.fullmatch(value):
            out.add(value)
        return out
    if isinstance(value, list):
        for item in value:
            out |= extract_qids(item)
        return out
    if isinstance(value, dict):
        direct = value.get("id")
        if isinstance(direct, str) and _QID.fullmatch(direct):
            out.add(direct)
        numeric = value.get("numeric-id")
        entity_type = value.get("entity-type")
        if isinstance(numeric, int) and (entity_type in {None, "item"}):
            out.add(f"Q{numeric}")
        for nested in value.values():
            out |= extract_qids(nested)
    return out


def robust_qid_from_snak(snak: dict[str, Any]) -> str | None:
    qids = sorted(extract_qids(snak.get("datavalue", {}).get("value")))
    return qids[0] if qids else None


def robust_entity_qids(entity: dict[str, Any], prop: str) -> set[str]:
    out: set[str] = set()
    for claim in entity.get("claims", {}).get(prop, []):
        out |= extract_qids(claim.get("mainsnak", {}).get("datavalue", {}).get("value"))
    return out


publisher.qid_from_snak = robust_qid_from_snak
publisher.entity_qids = robust_entity_qids

if __name__ == "__main__":
    publisher.main()
