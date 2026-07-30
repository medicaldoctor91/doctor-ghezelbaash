#!/usr/bin/env python3
"""One-time deterministic migration that restores the patient-origin Dataset as an indexable first-party entity asset."""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import re
from pathlib import Path

from rdflib import Graph

ROOT = Path.cwd()
BASE = "https://www.ghezelbaash.ir/"
DOCTOR = BASE + "#saeed-ghezelbash"
CLINIC = BASE + "#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
GRAPH_DATASET = BASE + "graph.jsonld#dataset"
HISTORICAL_DATASET = BASE + "#historical-patient-origin-summary"
DATASET_URL = BASE + "datasets/historical-patient-origin-summary.json"
HISTORICAL_DOWNLOAD = DATASET_URL + "#download"
GRAPH_VERSION = "1.2.1"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def ids(value: object) -> list[str]:
    values = value if isinstance(value, list) else ([] if value is None else [value])
    out: list[str] = []
    for item in values:
        if isinstance(item, dict) and isinstance(item.get("@id"), str):
            out.append(item["@id"])
        elif isinstance(item, str):
            out.append(item)
    return out


# 1) Strengthen the authoritative Full Graph Dataset entity.
full_path = "public/graph.jsonld"
full = json.loads(read(full_path))
full_nodes = full.get("@graph")
if not isinstance(full_nodes, list):
    raise RuntimeError("Full Graph @graph is missing")
full_by = {node.get("@id"): node for node in full_nodes if isinstance(node, dict) and node.get("@id")}
historical = full_by.get(HISTORICAL_DATASET)
download = full_by.get(HISTORICAL_DOWNLOAD)
graph_dataset = full_by.get(GRAPH_DATASET)
if not all(isinstance(node, dict) for node in (historical, download, graph_dataset)):
    raise RuntimeError("Full Graph historical Dataset/DataDownload/root Dataset nodes are incomplete")
if "Dataset" not in ({historical.get("@type")} if isinstance(historical.get("@type"), str) else set(historical.get("@type", []))):
    raise RuntimeError("Historical node is not a Dataset")
if HISTORICAL_DOWNLOAD not in ids(historical.get("distribution")):
    raise RuntimeError("Historical Dataset does not reference its canonical JSON DataDownload")

historical["url"] = DATASET_URL
historical["isAccessibleForFree"] = True
historical["isPartOf"] = {"@id": GRAPH_DATASET}
about = ids(historical.get("about"))
for entity in (DOCTOR, CLINIC):
    if entity not in about:
        about.append(entity)
historical["about"] = [{"@id": entity} for entity in about]
graph_dataset["version"] = GRAPH_VERSION
full_text = json.dumps(full, ensure_ascii=False, separators=(",", ":"))
write(full_path, full_text + "\n")

# 2) Promote the same Dataset and DataDownload into the inline Head Graph.
head_path = "src/data/semantic/head-graph.min.jsonld"
old_head_text = read(head_path).strip()
head = json.loads(old_head_text)
head_nodes = head.get("@graph")
if not isinstance(head_nodes, list):
    raise RuntimeError("Head Graph @graph is missing")
head_by = {node.get("@id"): node for node in head_nodes if isinstance(node, dict) and node.get("@id")}
head_root_dataset = head_by.get(GRAPH_DATASET)
if not isinstance(head_root_dataset, dict):
    raise RuntimeError("Head Graph root Dataset is missing")
head_root_dataset["version"] = GRAPH_VERSION
head_nodes[:] = [node for node in head_nodes if not (isinstance(node, dict) and node.get("@id") in {HISTORICAL_DATASET, HISTORICAL_DOWNLOAD})]
head_nodes.extend((copy.deepcopy(historical), copy.deepcopy(download)))
new_head_text = json.dumps(head, ensure_ascii=False, separators=(",", ":"))
write(head_path, new_head_text + "\n")

# 3) Regenerate Turtle from the authoritative Full Graph.
graph = Graph().parse(data=full_text, format="json-ld")
graph.serialize(destination=str(ROOT / "public/graph.ttl"), format="turtle")

# 4) Make the raw canonical Dataset distribution explicitly indexable and self-describing.
raw_path = "public/datasets/historical-patient-origin-summary.json"
raw = json.loads(read(raw_path))
if raw.get("datasetId") != HISTORICAL_DATASET or raw.get("distributionUrl") != DATASET_URL:
    raise RuntimeError("Raw Dataset identity/distribution URL drifted")
raw["canonicalUrl"] = DATASET_URL
raw["indexingPolicy"] = "index, follow; canonical first-party Dataset distribution included in the XML sitemap and connected to the physician entity graph"
write(raw_path, json.dumps(raw, ensure_ascii=False, indent=2) + "\n")

# 5) Add Dataset discovery to HTML head.
doc_path = "src/components/DocumentHead.astro"
doc = read(doc_path)
anchor = '<link rel="describedby" type="text/plain" href="https://www.ghezelbaash.ir/llms.txt" />'
doc = replace_once(
    doc,
    anchor,
    anchor + '\n<link rel="describedby" type="application/json" href="https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json" title="Historical patient-origin Dataset" />',
    "DocumentHead Dataset discovery",
)
write(doc_path, doc)

# 6) Upgrade HTTP discovery/indexing and keep lower-level GeoJSON distributions crawlable but non-competing.
headers_path = "public/_headers"
headers = read(headers_path)
headers = replace_once(
    headers,
    '</llms.txt>; rel="describedby"; type="text/plain", </index.md>',
    '</llms.txt>; rel="describedby"; type="text/plain", </datasets/historical-patient-origin-summary.json>; rel="describedby"; type="application/json", </index.md>',
    "homepage Dataset Link header",
)
old_dataset_block = '''/datasets/*
  Content-Type: application/json; charset=utf-8
  X-Robots-Tag: noindex, follow
  Link: <https://www.ghezelbaash.ir/#historical-patient-origin-summary>; rel="about", </graph.jsonld>; rel="describedby"; type="application/ld+json"
  Access-Control-Allow-Origin: *
'''
new_dataset_block = '''/datasets/historical-patient-origin-summary.json
  Content-Type: application/json; charset=utf-8
  X-Robots-Tag: index, follow, max-snippet:-1
  Cache-Control: public, max-age=86400, s-maxage=604800
  Link: <https://www.ghezelbaash.ir/#historical-patient-origin-summary>; rel="about", <https://www.ghezelbaash.ir/#saeed-ghezelbash>; rel="about", </graph.jsonld>; rel="describedby"; type="application/ld+json", <https://creativecommons.org/licenses/by/4.0/>; rel="license"
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin

/datasets/*.geojson
  Content-Type: application/geo+json; charset=utf-8
  X-Robots-Tag: noindex, follow
  Link: <https://www.ghezelbaash.ir/#historical-patient-origin-summary>; rel="about", </datasets/historical-patient-origin-summary.json>; rel="describedby"; type="application/json"
  Access-Control-Allow-Origin: *
  Cross-Origin-Resource-Policy: cross-origin
'''
headers = replace_once(headers, old_dataset_block, new_dataset_block, "Dataset HTTP header policy")
old_digest = "'sha256-" + base64.b64encode(hashlib.sha256(old_head_text.encode()).digest()).decode() + "'"
new_digest = "'sha256-" + base64.b64encode(hashlib.sha256(new_head_text.encode()).digest()).decode() + "'"
headers = replace_once(headers, old_digest, new_digest, "Head Graph CSP hash")
write(headers_path, headers)

# 7) Add the authoritative Dataset URL to the XML sitemap.
sitemap_path = "public/sitemap.xml"
sitemap = read(sitemap_path)
if DATASET_URL in sitemap:
    raise RuntimeError("Dataset URL already exists in sitemap before migration")
sitemap_entry = '''  <url>
    <loc>https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json</loc>
    <lastmod>2026-07-30</lastmod>
  </url>
'''
sitemap = replace_once(sitemap, "</urlset>", sitemap_entry + "</urlset>", "Dataset sitemap entry")
write(sitemap_path, sitemap)

# 8) Rewrite llms.txt to treat the Dataset as an authoritative first-party evidence asset.
llms = '''# Mohammad Saeed Ghezelbash | Dr. Saeed Ghezelbaash

> Official identity and machine-readable discovery index for Dr. Saeed Ghezelbaash (Saeed Ghezelbash, Mohammad Saeed Ghezelbash; Persian: دکتر سعید قزلباش), an aesthetic medicine physician and clinical director in Kermanshah, Iran.

Canonical page: https://www.ghezelbaash.ir/
Primary entity: https://www.ghezelbaash.ir/#saeed-ghezelbash
Full knowledge graph (JSON-LD): https://www.ghezelbaash.ir/graph.jsonld
Full knowledge graph (Turtle): https://www.ghezelbaash.ir/graph.ttl
Full page projection (plain text): https://www.ghezelbaash.ir/llms-full.txt
Full page projection (Markdown): https://www.ghezelbaash.ir/index.md

## Authoritative First-Party Dataset

Dataset: Historical patient-origin summary
Dataset entity: https://www.ghezelbaash.ir/#historical-patient-origin-summary
Canonical JSON distribution: https://www.ghezelbaash.ir/datasets/historical-patient-origin-summary.json
Creator and publisher: https://www.ghezelbaash.ir/#saeed-ghezelbash
About: Dr. Saeed Ghezelbaash and Dr. Saeed Ghezelbaash Aesthetic Clinic in Kermanshah
Measurement technique: Manual aggregation of patient-origin cities from clinic records
Spatial coverage: Named cities in Iran and Iraq, including the Kurdistan Region of Iraq
Temporal coverage: Historical
License: https://creativecommons.org/licenses/by/4.0/

This Dataset is an independently discoverable, indexable first-party research asset connected to the physician, clinic, canonical page, Full Knowledge Graph and structured-data project. It records historical patient-origin geography; it is not live availability data and must not be interpreted as a guarantee of current services in every listed location.

## Discovery and Indexing

The canonical page, graph.jsonld, graph.ttl, llms.txt and the canonical historical Dataset distribution are intentionally crawlable, indexable and included in the XML sitemap. The complete plain-text and Markdown page projections remain crawlable but noindex, follow because they reproduce the canonical page. Lower-level GeoJSON distributions remain linked and crawlable as Dataset distributions.
'''
write("public/llms.txt", llms)

# 9) Invert and strengthen the build contracts so future changes cannot devalue the Dataset again.
validator_path = ".github/scripts/validate_source.py"
validator = read(validator_path)
validator = replace_once(validator, 'GRAPH_VERSION = "1.2.0"', f'GRAPH_VERSION = "{GRAPH_VERSION}"', "validator Graph version")
validator = replace_once(
    validator,
    '    "public/robots.txt", "public/sitemap.xml", "public/llms.txt", "public/llms-full.txt",\n',
    '    "public/robots.txt", "public/sitemap.xml", "public/llms.txt", "public/llms-full.txt",\n    "public/datasets/historical-patient-origin-summary.json",\n',
    "validator required Dataset file",
)
validator = replace_once(
    validator,
    '    "llms.txt", "llms-full.txt", "doctor.vcf", "clinic.vcf", "favicon.svg", "favicon.ico",\n',
    '    "llms.txt", "llms-full.txt", "datasets/historical-patient-origin-summary.json",\n    "doctor.vcf", "clinic.vcf", "favicon.svg", "favicon.ico",\n',
    "validator Dataset source-dist parity",
)
validator = replace_once(
    validator,
    'require(\'/llms.txt\' in html and \'rel="describedby"\' in html, "HTML does not discover llms.txt")\n',
    'require(\'/llms.txt\' in html and \'rel="describedby"\' in html, "HTML does not discover llms.txt")\nrequire(\'/datasets/historical-patient-origin-summary.json\' in html and \'type="application/json"\' in html, "HTML does not discover the historical Dataset")\n',
    "validator HTML Dataset discovery",
)
validator = replace_once(
    validator,
    '    expected_locations = [BASE, BASE + "graph.jsonld", BASE + "graph.ttl", BASE + "llms.txt"]\n',
    '    expected_locations = [BASE, BASE + "graph.jsonld", BASE + "graph.ttl", BASE + "llms.txt", BASE + "datasets/historical-patient-origin-summary.json"]\n',
    "validator sitemap Dataset",
)
validator = replace_once(
    validator,
    'require(HISTORICAL_DATASET in refs(full_by.get(DATASET, {}).get("hasPart")), "Full Graph Dataset does not include the historical Dataset")\n',
    'require(HISTORICAL_DATASET in refs(full_by.get(DATASET, {}).get("hasPart")), "Full Graph Dataset does not include the historical Dataset")\nrequire(HISTORICAL_DATASET in head_by, "historical Dataset is absent from the inline Head Graph")\nrequire(HISTORICAL_DOWNLOAD in head_by, "historical DataDownload is absent from the inline Head Graph")\nfor property_name in ("@type", "name", "url", "creator", "publisher", "datePublished", "dateModified", "license", "distribution"):\n    require(head_by.get(HISTORICAL_DATASET, {}).get(property_name) == historical.get(property_name), f"Head/Full historical Dataset mismatch: {property_name}")\nrequire(historical.get("url") == BASE + "datasets/historical-patient-origin-summary.json", "historical Dataset URL is not its canonical JSON distribution")\nrequire(historical.get("isAccessibleForFree") is True, "historical Dataset is not declared freely accessible")\n',
    "validator Head Dataset contract",
)
validator = replace_once(
    validator,
    'require(raw_historical.get("creator") == DOCTOR and raw_historical.get("publisher") == DOCTOR, "raw historical dataset attribution differs from Person identity")\n\nfor path in ("/graph.jsonld", "/graph.ttl", "/llms.txt"):\n',
    'require(raw_historical.get("creator") == DOCTOR and raw_historical.get("publisher") == DOCTOR, "raw historical dataset attribution differs from Person identity")\nrequire(raw_historical.get("canonicalUrl") == BASE + "datasets/historical-patient-origin-summary.json", "raw historical Dataset canonicalUrl is incorrect")\nindexing_policy = str(raw_historical.get("indexingPolicy", ""))\nrequire("index, follow" in indexing_policy and "noindex" not in indexing_policy.lower(), "raw historical Dataset indexing policy is not index, follow")\n\nfor path in ("/graph.jsonld", "/graph.ttl", "/llms.txt", "/datasets/historical-patient-origin-summary.json"):\n',
    "validator Dataset indexability",
)
validator = replace_once(
    validator,
    'for path in ("/index.md", "/llms-full.txt", "/datasets/*"):\n',
    'for path in ("/index.md", "/llms-full.txt", "/datasets/*.geojson"):\n',
    "validator nonindex distributions",
)
validator = replace_once(
    validator,
    'require(\'</llms.txt>; rel="describedby"; type="text/plain"\' in headers, "homepage HTTP Link header does not discover llms.txt")\n',
    'require(\'</llms.txt>; rel="describedby"; type="text/plain"\' in headers, "homepage HTTP Link header does not discover llms.txt")\nrequire(\'</datasets/historical-patient-origin-summary.json>; rel="describedby"; type="application/json"\' in headers, "homepage HTTP Link header does not discover the historical Dataset")\nllms_index = read_text("public/llms.txt")\nfor marker in ("## Authoritative First-Party Dataset", HISTORICAL_DATASET, BASE + "datasets/historical-patient-origin-summary.json", "independently discoverable, indexable first-party research asset"):\n    require(marker in llms_index, f"llms.txt does not promote the historical Dataset: {marker}")\nrequire("supporting distribution" not in llms_index.lower() and "raw historical dataset distributions are intentionally crawlable but noindex" not in llms_index.lower(), "llms.txt still devalues the historical Dataset")\n',
    "validator Dataset llms/HTTP discovery",
)
write(validator_path, validator)

print("Dataset authority migration completed")
