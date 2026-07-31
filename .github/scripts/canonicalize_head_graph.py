#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
from copy import deepcopy
from pathlib import Path

BASE = "https://www.ghezelbaash.ir/"
WPA = BASE + "#organization-world-psychiatric-association"
DGPPN = BASE + "#organization-dgppn"
ALIAS_MAP = {
    BASE + "#world-psychiatric-association": WPA,
    BASE + "#organization-american-psychiatric-association": WPA,
    BASE + "#dgppn": DGPPN,
    BASE + "#organization-german-psychiatric-association": DGPPN,
    BASE + "#organization-german-society-psychiatry": DGPPN,
}
FORBIDDEN = {
    "Q1645764", "Q1683009",
    "https://www.wikidata.org/entity/Q1645764",
    "https://www.wikidata.org/entity/Q1683009",
}
DROP = object()
HEAD = Path("src/data/semantic/head-graph.min.jsonld")
HEADERS = Path("public/_headers")


def clean(value):
    if isinstance(value, str):
        if value in ALIAS_MAP:
            return ALIAS_MAP[value]
        if value in FORBIDDEN:
            return DROP
        return value
    if isinstance(value, list):
        output = []
        for item in value:
            result = clean(item)
            if result is not DROP and result not in output:
                output.append(result)
        return output
    if isinstance(value, dict):
        output = {}
        for key, item in value.items():
            if key == "eventStatus":
                status = item.get("@id") if isinstance(item, dict) else item
                if status == "https://schema.org/EventCompleted":
                    continue
            result = clean(item)
            if result is not DROP:
                output[key] = result
        return output
    return value


def merge(left, right):
    if left == right:
        return left
    if isinstance(left, dict) and isinstance(right, dict):
        output = deepcopy(left)
        for key, value in right.items():
            output[key] = merge(output[key], value) if key in output else deepcopy(value)
        return output
    if isinstance(left, list) and isinstance(right, list):
        output = deepcopy(left)
        for value in right:
            if value not in output:
                output.append(deepcopy(value))
        return output
    return deepcopy(left)


def normalize_identity(node: dict, *, qid: str, url: str, abbreviation: str) -> None:
    current_type = node.get("@type")
    if isinstance(current_type, list):
        if "Organization" not in current_type:
            current_type.append("Organization")
    elif current_type != "Organization":
        node["@type"] = "Organization" if current_type is None else [current_type, "Organization"]
    node["url"] = url
    values = node.get("sameAs")
    values = values if isinstance(values, list) else ([] if values is None else [values])
    values = [value for value in values if isinstance(value, str) and not value.startswith("https://www.wikidata.org/entity/") and value not in FORBIDDEN]
    values.append(qid)
    deduped = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    node["sameAs"] = deduped[0] if len(deduped) == 1 else deduped
    alternate = node.get("alternateName")
    if alternate is None:
        node["alternateName"] = abbreviation
    elif isinstance(alternate, list):
        if abbreviation not in alternate:
            alternate.append(abbreviation)
    elif alternate != abbreviation:
        node["alternateName"] = [alternate, abbreviation]


raw = HEAD.read_text(encoding="utf-8")
data = json.loads(raw)
if not isinstance(data, dict) or not isinstance(data.get("@graph"), list):
    raise SystemExit("Head Graph is not a JSON-LD @graph object")

staged = []
canonical_ids = {WPA, DGPPN}
for position, node in enumerate(data["@graph"]):
    identifier = node.get("@id") if isinstance(node, dict) else None
    priority = 0 if identifier in canonical_ids else (1 if identifier in ALIAS_MAP else 2)
    result = clean(node)
    if result is not DROP:
        staged.append((priority, position, result))
staged.sort(key=lambda item: (item[0], item[1]))

nodes = []
by_id: dict[str, dict] = {}
for _, _, node in staged:
    if not isinstance(node, dict) or not isinstance(node.get("@id"), str):
        nodes.append(node)
        continue
    identifier = node["@id"]
    if identifier in by_id:
        merged = merge(by_id[identifier], node)
        by_id[identifier].clear()
        by_id[identifier].update(merged)
    else:
        by_id[identifier] = node
        nodes.append(node)
data["@graph"] = nodes

if WPA in by_id:
    normalize_identity(by_id[WPA], qid="https://www.wikidata.org/entity/Q2593790", url="https://www.wpanet.org/", abbreviation="WPA")
if DGPPN in by_id:
    normalize_identity(by_id[DGPPN], qid="https://www.wikidata.org/entity/Q1202963", url="https://www.dgppn.de/", abbreviation="DGPPN")

new_text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ("\n" if raw.endswith("\n") else "")
old_hash = "'sha256-" + base64.b64encode(hashlib.sha256(raw.encode()).digest()).decode() + "'"
new_hash = "'sha256-" + base64.b64encode(hashlib.sha256(new_text.encode()).digest()).decode() + "'"
headers = HEADERS.read_text(encoding="utf-8")
if old_hash != new_hash:
    if headers.count(old_hash) != 1:
        raise SystemExit(f"expected one current Head Graph CSP hash, found {headers.count(old_hash)}")
    headers = headers.replace(old_hash, new_hash, 1)
    HEADERS.write_text(headers, encoding="utf-8", newline="")
HEAD.write_text(new_text, encoding="utf-8", newline="")

remaining_ids = {node.get("@id") for node in nodes if isinstance(node, dict)}
if remaining_ids & set(ALIAS_MAP):
    raise SystemExit(f"Head Graph organization aliases remain: {sorted(remaining_ids & set(ALIAS_MAP))}")
print(json.dumps({"headGraphNodes": len(nodes), "headGraphCspHash": new_hash}, indent=2))
