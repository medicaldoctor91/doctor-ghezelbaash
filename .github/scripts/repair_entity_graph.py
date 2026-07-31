#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

from rdflib import Graph
from rdflib.compare import isomorphic

BASE = "https://www.ghezelbaash.ir/"
DATASET = BASE + "graph.jsonld#dataset"
RELEASE_VERSION = "1.2.3"
RELEASE_DATE = "2026-07-31"

WPA = BASE + "#organization-world-psychiatric-association"
DGPPN = BASE + "#organization-dgppn"
WPA_QID = "https://www.wikidata.org/entity/Q2593790"
DGPPN_QID = "https://www.wikidata.org/entity/Q1202963"
WPA_URL = "https://www.wpanet.org/"
DGPPN_URL = "https://www.dgppn.de/"

ALIAS_MAP = {
    BASE + "#world-psychiatric-association": WPA,
    BASE + "#organization-american-psychiatric-association": WPA,
    BASE + "#dgppn": DGPPN,
    BASE + "#organization-german-psychiatric-association": DGPPN,
    BASE + "#organization-german-society-psychiatry": DGPPN,
}
FORBIDDEN_QIDS = {
    "Q1645764",
    "Q1683009",
    "https://www.wikidata.org/entity/Q1645764",
    "https://www.wikidata.org/entity/Q1683009",
}
INVALID_EVENT_STATUS = "https://schema.org/EventCompleted"
DROP = object()

FULL_PATH = Path("public/graph.jsonld")
HEAD_PATH = Path("src/data/semantic/head-graph.min.jsonld")
TTL_PATH = Path("public/graph.ttl")
HEADERS_PATH = Path("public/_headers")
SITEMAP_PATH = Path("public/sitemap.xml")
SOURCE_VALIDATOR_PATH = Path(".github/scripts/validate_source.py")
LIVE_VALIDATOR_PATH = Path(".github/scripts/validate_live.py")


def read_graph(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("@graph"), list):
        raise SystemExit(f"{path}: expected an object with @graph")
    return value


def clean_value(value):
    if isinstance(value, str):
        if value in ALIAS_MAP:
            return ALIAS_MAP[value]
        if value in FORBIDDEN_QIDS:
            return DROP
        return value
    if isinstance(value, list):
        output = []
        for item in value:
            cleaned = clean_value(item)
            if cleaned is DROP:
                continue
            if cleaned not in output:
                output.append(cleaned)
        return output
    if isinstance(value, dict):
        output = {}
        for key, item in value.items():
            if key == "eventStatus":
                status = item.get("@id") if isinstance(item, dict) else item
                if status == INVALID_EVENT_STATUS:
                    continue
            cleaned = clean_value(item)
            if cleaned is not DROP:
                output[key] = cleaned
        return output
    return value


def merge_values(left, right):
    if left == right:
        return left
    if isinstance(left, dict) and isinstance(right, dict):
        output = deepcopy(left)
        for key, value in right.items():
            output[key] = merge_values(output[key], value) if key in output else deepcopy(value)
        return output
    if isinstance(left, list) and isinstance(right, list):
        output = deepcopy(left)
        for value in right:
            if value not in output:
                output.append(deepcopy(value))
        return output
    return deepcopy(left)


def ensure_type(node: dict, required: str) -> None:
    current = node.get("@type")
    if isinstance(current, list):
        if required not in current:
            current.append(required)
    elif isinstance(current, str) and current != required:
        node["@type"] = [current, required]
    elif current is None:
        node["@type"] = required


def ensure_alt_name(node: dict, value: str) -> None:
    current = node.get("alternateName")
    if current is None:
        node["alternateName"] = value
    elif isinstance(current, list):
        if value not in current:
            current.append(value)
    elif current != value:
        node["alternateName"] = [current, value]


def normalize_same_as(node: dict, canonical_qid: str) -> None:
    current = node.get("sameAs")
    values = current if isinstance(current, list) else ([] if current is None else [current])
    output = []
    for value in values:
        if (
            isinstance(value, str)
            and value not in FORBIDDEN_QIDS
            and not value.startswith("https://www.wikidata.org/entity/")
            and value not in output
        ):
            output.append(value)
    output.append(canonical_qid)
    node["sameAs"] = output[0] if len(output) == 1 else output


def strings(value) -> set[str]:
    found: set[str] = set()
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, str):
            found.add(current)
        elif isinstance(current, dict):
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return found


def refs(value) -> set[str]:
    found: set[str] = set()
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            identifier = current.get("@id")
            if isinstance(identifier, str):
                found.add(identifier)
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return found


def write_minified(path: Path, value: dict, preserve_newline: bool) -> str:
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if preserve_newline:
        text += "\n"
    path.write_text(text, encoding="utf-8", newline="")
    return text


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one target, found {count}")
    return text.replace(old, new, 1)


def insert_before_once(text: str, marker: str, block: str, label: str) -> str:
    if block.strip() in text:
        return text
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return text.replace(marker, block + marker, 1)


def header_block(text: str, path: str) -> tuple[str, re.Match[str]]:
    pattern = re.compile(rf"(?m)^{re.escape(path)}\n(?:[ \t].*(?:\n|$))*")
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise SystemExit(f"{path}: expected one _headers block, found {len(matches)}")
    return matches[0].group(0), matches[0]


def patch_machine_header(text: str, path: str, canonical: str) -> str:
    block, match = header_block(text, path)
    canonical_relation = f'<{canonical}>; rel="canonical"'
    lines = block.rstrip("\n").splitlines()
    link_index = next((i for i, line in enumerate(lines) if line.strip().startswith("Link:")), None)
    if link_index is None:
        robots_index = next((i for i, line in enumerate(lines) if line.strip().startswith("X-Robots-Tag:")), 0)
        lines.insert(robots_index + 1, f"  Link: {canonical_relation}")
    elif canonical_relation not in lines[link_index]:
        lines[link_index] = lines[link_index] + ", " + canonical_relation
    expose = "  Access-Control-Expose-Headers: Link, X-Robots-Tag"
    if expose not in lines:
        cors_index = next((i for i, line in enumerate(lines) if line.strip().startswith("Access-Control-Allow-Origin:")), len(lines) - 1)
        lines.insert(cors_index + 1, expose)
    replacement = "\n".join(lines) + "\n"
    return text[:match.start()] + replacement + text[match.end():]


def patch_expose_only(text: str, path: str) -> str:
    block, match = header_block(text, path)
    lines = block.rstrip("\n").splitlines()
    expose = "  Access-Control-Expose-Headers: Link, X-Robots-Tag"
    if expose not in lines:
        cors_index = next((i for i, line in enumerate(lines) if line.strip().startswith("Access-Control-Allow-Origin:")), len(lines) - 1)
        lines.insert(cors_index + 1, expose)
    replacement = "\n".join(lines) + "\n"
    return text[:match.start()] + replacement + text[match.end():]


full_raw = FULL_PATH.read_text(encoding="utf-8")
head_raw = HEAD_PATH.read_text(encoding="utf-8")
full = read_graph(FULL_PATH)
head = read_graph(HEAD_PATH)

canonical_ids = {WPA, DGPPN}
staged = []
for position, node in enumerate(full["@graph"]):
    original_id = node.get("@id") if isinstance(node, dict) else None
    priority = 0 if original_id in canonical_ids else (1 if original_id in ALIAS_MAP else 2)
    cleaned = clean_value(node)
    if cleaned is not DROP:
        staged.append((priority, position, cleaned))
staged.sort(key=lambda item: (item[0], item[1]))

merged_nodes = []
by_id: dict[str, dict] = {}
for _, _, node in staged:
    if not isinstance(node, dict) or not isinstance(node.get("@id"), str):
        merged_nodes.append(node)
        continue
    identifier = node["@id"]
    if identifier in by_id:
        merged = merge_values(by_id[identifier], node)
        by_id[identifier].clear()
        by_id[identifier].update(merged)
    else:
        by_id[identifier] = node
        merged_nodes.append(node)
full["@graph"] = merged_nodes

by_id = {
    node["@id"]: node
    for node in full["@graph"]
    if isinstance(node, dict) and isinstance(node.get("@id"), str)
}
if WPA not in by_id or DGPPN not in by_id:
    raise SystemExit("canonical WPA or DGPPN node is absent")

wpa = by_id[WPA]
ensure_type(wpa, "Organization")
wpa["url"] = WPA_URL
normalize_same_as(wpa, WPA_QID)
ensure_alt_name(wpa, "WPA")

dgppn = by_id[DGPPN]
ensure_type(dgppn, "Organization")
dgppn["url"] = DGPPN_URL
normalize_same_as(dgppn, DGPPN_QID)
ensure_alt_name(dgppn, "DGPPN")

dataset = by_id.get(DATASET)
if not isinstance(dataset, dict):
    raise SystemExit("Full Graph Dataset node is missing")
dataset["version"] = RELEASE_VERSION
dataset["dateModified"] = RELEASE_DATE

head_by = {
    node["@id"]: node
    for node in head["@graph"]
    if isinstance(node, dict) and isinstance(node.get("@id"), str)
}
head_dataset = head_by.get(DATASET)
if not isinstance(head_dataset, dict):
    raise SystemExit("Head Graph Dataset node is missing")
head_dataset["version"] = RELEASE_VERSION
head_dataset["dateModified"] = RELEASE_DATE

ids = [node.get("@id") for node in full["@graph"] if isinstance(node, dict) and node.get("@id")]
if len(ids) != len(set(ids)):
    raise SystemExit("duplicate top-level Full Graph @id values remain")
if set(ALIAS_MAP) & refs(full):
    raise SystemExit(f"deprecated organization aliases remain: {sorted(set(ALIAS_MAP) & refs(full))}")
all_strings = strings(full)
if FORBIDDEN_QIDS & all_strings:
    raise SystemExit(f"unrelated Wikidata IDs remain: {sorted(FORBIDDEN_QIDS & all_strings)}")
if WPA_QID not in strings(wpa) or DGPPN_QID not in strings(dgppn):
    raise SystemExit("canonical organization Wikidata IDs are absent")

old_head_hash = "'sha256-" + base64.b64encode(hashlib.sha256(head_raw.encode()).digest()).decode() + "'"
full_text = write_minified(FULL_PATH, full, full_raw.endswith("\n"))
head_text = write_minified(HEAD_PATH, head, head_raw.endswith("\n"))
new_head_hash = "'sha256-" + base64.b64encode(hashlib.sha256(head_text.encode()).digest()).decode() + "'"

headers = HEADERS_PATH.read_text(encoding="utf-8")
if old_head_hash != new_head_hash:
    if headers.count(old_head_hash) != 1:
        raise SystemExit(f"expected exactly one old CSP Head Graph hash, found {headers.count(old_head_hash)}")
    headers = headers.replace(old_head_hash, new_head_hash, 1)

for path, canonical in {
    "/graph.jsonld": BASE + "graph.jsonld",
    "/graph.ttl": BASE + "graph.ttl",
    "/llms.txt": BASE + "llms.txt",
    "/datasets/historical-patient-origin-summary.json": BASE + "datasets/historical-patient-origin-summary.json",
}.items():
    headers = patch_machine_header(headers, path, canonical)
for path in ("/index.md", "/llms-full.txt"):
    headers = patch_expose_only(headers, path)
HEADERS_PATH.write_text(headers, encoding="utf-8", newline="")

rdf = Graph()
rdf.parse(data=full_text, format="json-ld", publicID=BASE)
nt = rdf.serialize(format="nt")
if isinstance(nt, bytes):
    nt = nt.decode("utf-8")
ttl_lines = sorted({line.strip() for line in nt.splitlines() if line.strip()})
ttl_text = "\n".join(ttl_lines) + "\n"
TTL_PATH.write_text(ttl_text, encoding="utf-8", newline="")
ttl_check = Graph()
ttl_check.parse(data=ttl_text, format="turtle", publicID=BASE)
if not isomorphic(rdf, ttl_check):
    raise SystemExit("deterministic Turtle/N-Triples projection is not RDF-isomorphic to Full Graph")

sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
for target in ("graph.jsonld", "graph.ttl"):
    pattern = re.compile(rf"(<loc>{re.escape(BASE + target)}</loc>\s*<lastmod>)([^<]+)(</lastmod>)")
    sitemap, count = pattern.subn(rf"\g<1>{RELEASE_DATE}\g<3>", sitemap, count=1)
    if count != 1:
        raise SystemExit(f"sitemap entry not found exactly once: {target}")
SITEMAP_PATH.write_text(sitemap, encoding="utf-8", newline="")
ET.parse(SITEMAP_PATH)

source = SOURCE_VALIDATOR_PATH.read_text(encoding="utf-8")
source = replace_once(source, 'GRAPH_VERSION = "1.2.2"', 'GRAPH_VERSION = "1.2.3"', "source graph version")
source = replace_once(
    source,
    'require(full_by.get(DATASET, {}).get("dateModified") == "2026-07-30", "Full Graph Dataset dateModified is stale")',
    'require(full_by.get(DATASET, {}).get("dateModified") == "2026-07-31", "Full Graph Dataset dateModified is stale")',
    "Full Graph dateModified",
)
source = replace_once(
    source,
    'require(head_by.get(DATASET, {}).get("dateModified") == "2026-07-30", "Head Graph Dataset dateModified is stale")',
    'require(head_by.get(DATASET, {}).get("dateModified") == "2026-07-31", "Head Graph Dataset dateModified is stale")',
    "Head Graph dateModified",
)

source_contract = r'''
# Canonical organization and machine-resource contract (release 1.2.3).
def all_string_values(value: object) -> set[str]:
    found: set[str] = set()
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, str):
            found.add(current)
        elif isinstance(current, dict):
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return found

canonical_wpa = BASE + "#organization-world-psychiatric-association"
canonical_dgppn = BASE + "#organization-dgppn"
deprecated_organization_ids = {
    BASE + "#world-psychiatric-association",
    BASE + "#organization-american-psychiatric-association",
    BASE + "#dgppn",
    BASE + "#organization-german-psychiatric-association",
    BASE + "#organization-german-society-psychiatry",
}
forbidden_organization_qids = {
    "Q1645764", "Q1683009",
    "https://www.wikidata.org/entity/Q1645764",
    "https://www.wikidata.org/entity/Q1683009",
}
require(not (deprecated_organization_ids & collect_ids(full)), f"deprecated organization aliases remain: {sorted(deprecated_organization_ids & collect_ids(full))}")
full_strings = all_string_values(full)
require(not (forbidden_organization_qids & full_strings), f"unrelated organization Wikidata IDs remain: {sorted(forbidden_organization_qids & full_strings)}")
require(canonical_wpa in full_by and canonical_dgppn in full_by, "canonical WPA or DGPPN node is missing")
require("https://www.wikidata.org/entity/Q2593790" in all_string_values(full_by.get(canonical_wpa, {})), "WPA Wikidata identity is not Q2593790")
require("https://www.wikidata.org/entity/Q1202963" in all_string_values(full_by.get(canonical_dgppn, {})), "DGPPN Wikidata identity is not Q1202963")
require(full_by.get(canonical_wpa, {}).get("url") == "https://www.wpanet.org/", "WPA official URL is incorrect")
require(full_by.get(canonical_dgppn, {}).get("url") == "https://www.dgppn.de/", "DGPPN official URL is incorrect")
require(canonical_wpa in refs(full_by.get(EVENT, {}).get("organizer")), "WPA XVII organizer does not resolve to canonical WPA")

self_canonical_resources = {
    "/graph.jsonld": BASE + "graph.jsonld",
    "/graph.ttl": BASE + "graph.ttl",
    "/llms.txt": BASE + "llms.txt",
    "/datasets/historical-patient-origin-summary.json": BASE + "datasets/historical-patient-origin-summary.json",
}
for path, canonical_url in self_canonical_resources.items():
    block = header_block(path)
    require(f'<{canonical_url}>; rel="canonical"' in block, f"{path} lacks a self-canonical HTTP Link")
    require("Access-Control-Expose-Headers: Link, X-Robots-Tag" in block, f"{path} does not expose Link and X-Robots-Tag to CORS clients")
for path in ("/index.md", "/llms-full.txt"):
    require("Access-Control-Expose-Headers: Link, X-Robots-Tag" in header_block(path), f"{path} does not expose its projection headers")

ttl_projection = read_text("public/graph.ttl")
ttl_projection_lines = [line.strip() for line in ttl_projection.splitlines() if line.strip()]
require(ttl_projection_lines == sorted(ttl_projection_lines), "graph.ttl is not deterministically sorted")
require(len(ttl_projection_lines) == len(set(ttl_projection_lines)), "graph.ttl contains duplicate statements")
require(all(line.endswith(" .") for line in ttl_projection_lines), "graph.ttl is not a valid deterministic N-Triples subset")
require(not any(line.startswith(("@prefix", "PREFIX")) for line in ttl_projection_lines), "graph.ttl unexpectedly depends on prefix serialization")
'''
source = insert_before_once(source, "if errors:\n", source_contract + "\n", "source validator contract")
SOURCE_VALIDATOR_PATH.write_text(source, encoding="utf-8", newline="")

live = LIVE_VALIDATOR_PATH.read_text(encoding="utf-8")
live_contract = r'''
    # Canonical machine resources and organization resolution.
    llms = fetch(BASE + "llms.txt", follow=True)
    historical = fetch(BASE + "datasets/historical-patient-origin-summary.json", follow=True)
    for label, response, source_path, canonical_url in (
        ("graph", graph, "public/graph.jsonld", BASE + "graph.jsonld"),
        ("ttl", ttl, "public/graph.ttl", BASE + "graph.ttl"),
        ("llms", llms, "public/llms.txt", BASE + "llms.txt"),
        ("historical dataset", historical, "public/datasets/historical-patient-origin-summary.json", BASE + "datasets/historical-patient-origin-summary.json"),
    ):
        require(response.status == 200, f"{label} returned {response.status}")
        robots_header = response.header("x-robots-tag").lower()
        require("index" in robots_header and "follow" in robots_header and "noindex" not in robots_header, f"{label} is not explicitly index, follow: {robots_header or 'missing'}")
        require(f'<{canonical_url}>; rel="canonical"' in response.header("link"), f"{label} lacks its self-canonical HTTP Link")
        exposed = response.header("access-control-expose-headers").lower()
        require("link" in exposed and "x-robots-tag" in exposed, f"{label} does not expose Link and X-Robots-Tag")
        same_bytes(f"live {label}", response.body, source_path)

    try:
        live_full = json.loads(graph.body)
        live_nodes = live_full.get("@graph", []) if isinstance(live_full, dict) else []
        live_by = {
            node.get("@id"): node
            for node in live_nodes
            if isinstance(node, dict) and isinstance(node.get("@id"), str)
        }
        live_ids: set[str] = set()
        live_strings: set[str] = set()
        stack: list[object] = [live_full]
        while stack:
            current = stack.pop()
            if isinstance(current, str):
                live_strings.add(current)
            elif isinstance(current, dict):
                identifier = current.get("@id")
                if isinstance(identifier, str):
                    live_ids.add(identifier)
                stack.extend(current.values())
            elif isinstance(current, list):
                stack.extend(current)
        deprecated_ids = {
            BASE + "#world-psychiatric-association",
            BASE + "#organization-american-psychiatric-association",
            BASE + "#dgppn",
            BASE + "#organization-german-psychiatric-association",
            BASE + "#organization-german-society-psychiatry",
        }
        forbidden_qids = {
            "Q1645764", "Q1683009",
            "https://www.wikidata.org/entity/Q1645764",
            "https://www.wikidata.org/entity/Q1683009",
        }
        require(not (deprecated_ids & live_ids), f"live graph exposes deprecated organization aliases: {sorted(deprecated_ids & live_ids)}")
        require(not (forbidden_qids & live_strings), f"live graph exposes unrelated organization Wikidata IDs: {sorted(forbidden_qids & live_strings)}")
        require("https://www.wikidata.org/entity/Q2593790" in live_strings, "live graph lacks canonical WPA Wikidata identity")
        require("https://www.wikidata.org/entity/Q1202963" in live_strings, "live graph lacks canonical DGPPN Wikidata identity")
        live_dataset = live_by.get(BASE + "graph.jsonld#dataset", {})
        require(live_dataset.get("version") == "1.2.3", "live graph version is not 1.2.3")
        require(live_dataset.get("dateModified") == "2026-07-31", "live graph dateModified is not 2026-07-31")
    except Exception as exc:
        errors.append(f"live graph semantic validation failed: {exc}")

'''
live = insert_before_once(
    live,
    "    # Verify native not-found behavior without assigning significance to disposable development URLs.\n",
    live_contract,
    "live validator contract",
)
LIVE_VALIDATOR_PATH.write_text(live, encoding="utf-8", newline="")

json.loads(FULL_PATH.read_text(encoding="utf-8"))
json.loads(HEAD_PATH.read_text(encoding="utf-8"))
ET.parse(SITEMAP_PATH)

print(json.dumps({
    "releaseVersion": RELEASE_VERSION,
    "releaseDate": RELEASE_DATE,
    "fullGraphNodes": len(full["@graph"]),
    "fullGraphBytes": FULL_PATH.stat().st_size,
    "headGraphBytes": HEAD_PATH.stat().st_size,
    "ttlTriples": len(rdf),
    "headGraphCspHash": new_head_hash,
}, ensure_ascii=False, indent=2))
