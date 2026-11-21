"""Read-only comparison of published v1.3.6 graph with the reviewed CI build.

No provider writes, file edits, DOI reservations or deployment actions.
Artifacts are uploaded to the GitHub Actions run for human/agent audit.
"""
from __future__ import annotations

import collections
import hashlib
import json
import os
import pathlib
import sys
from datetime import datetime, timezone
from urllib.parse import quote

import requests

OUT = pathlib.Path("/tmp/doi-136-parity")
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = "https://www.ghezelbaash.ir"
RECORD_ID = 24354791
DOI = f"10.5281/zenodo.{RECORD_ID}"
HF = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
KG = "saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data"

def request_bytes(url, bearer=None, limit=7_000_000):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache",
               "User-Agent": "DOI-136-Parity-Audit/1.0"}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    response = requests.get(url, headers=headers, timeout=(15, 75))
    response.raise_for_status()
    body = response.content
    if len(body) > limit:
        raise ValueError(f"Response exceeds {limit} bytes")
    return body

def get_json(url, bearer=None):
    return json.loads(request_bytes(url, bearer))

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def nodes(value):
    graph = value["@graph"]
    if not isinstance(graph, list):
        raise ValueError("Invalid graph list")
    ids = [entry["@id"] for entry in graph]
    if len(set(ids)) != len(ids):
        raise ValueError("Non-unique node IDs")
    return {entry["@id"]: entry for entry in graph}

def kinds(items):
    counts = collections.Counter()
    for node in items.values():
        types = node.get("@type", [])
        types = [types] if isinstance(types, str) else types
        for typ in types:
            counts[typ] += 1
    return dict(counts)

def compare(left_raw, right_raw):
    left = nodes(json.loads(left_raw))
    right = nodes(json.loads(right_raw))
    old_only = set(left) - set(right)
    new_only = set(right) - set(left)
    changed = set()
    properties = collections.Counter()
    for ref in left.keys() & right.keys():
        a, b = left[ref], right[ref]
        if a == b:
            continue
        changed.add(ref)
        for prop in a.keys() | b.keys():
            if a.get(prop) != b.get(prop):
                properties[prop] += 1
    return {
        "oldNodes": len(left), "newNodes": len(right),
        "oldOnlyCount": len(old_only), "newOnlyCount": len(new_only),
        "modifiedNodeCount": len(changed),
        "oldOnlySample": sorted(old_only)[:12],
        "newOnlySample": sorted(new_only)[:12],
        "modifiedSample": sorted(changed)[:12],
        "changedPropertyCount": dict(properties.most_common(20)),
        "oldTypes": {k:v for k,v in kinds(left).items() if k in ("Service","Offer","Article","VideoObject")},
        "newTypes": {k:v for k,v in kinds(right).items() if k in ("Service","Offer","Article","VideoObject")},
        "identical": left == right,
    }

report = {
    "auditedAtUTC": datetime.now(timezone.utc).isoformat(),
    "operation": "read-only",
    "writes": False,
    "targetVersion": "1.3.6",
    "exactDoi": DOI,
    "scope": "website; Zenodo; Hugging Face; Kaggle",
    "candidateArtifactRun": 44880178266,
    "providers": {},
    "errors": {},
}

def save():
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

try:
    root = pathlib.Path("/tmp/candidate")
    files = list(root.rglob("graph.jsonld"))
    if len(files) != 1:
        raise RuntimeError(f"Expected one reviewed graph.jsonld, found {len(files)}")
    graph = files[0].read_bytes()
    graph_data = json.loads(graph)
    catalog = nodes(graph_data)
    report["candidate"] = {
        "artifact": str(files[0].relative_to(root)),
        "nodes": len(catalog),
        "bytes": len(graph), "sha256": sha(graph),
        "services": sum("Service" in ([n.get("@type")] if isinstance(n.get("@type"), str) else n.get("@type", [])) for n in catalog.values()),
        "offers": sum("Offer" in ([n.get("@type")] if isinstance(n.get("@type"), str) else n.get("@type", [])) for n in catalog.values()),
    }
    p = catalog["https://www.ghezelbaash.ir/#saeed-ghezelbash"]
    report["candidate"]["personHasOfferCatalog"] = "hasOfferCatalog" in p
    report["candidate"]["candidateDoiInGraph"] = DOI in graph.decode("utf-8")
except Exception as e:
    report["errors"]["candidate"] = type(e).__name__ + ": " + str(e)[:240]
    save()
    sys.exit(1)

try:
    metadata = get_json(f"https://zenodo.org/api/records/{RECORD_ID}")
    record = metadata["id"]
    zen_doi = metadata["doi"]
    if record != RECORD_ID or zen_doi != DOI:
        raise RuntimeError("Wrong Zenodo record or DOI!")
    old_graph = request_bytes(f"https://zenodo.org/api/records/{RECORD_ID}/files/graph.jsonld/content")
    report["providers"]["zenodo"] = {
        "record": record, "doi": zen_doi,
        "created": metadata.get("created"),
        "publicationDate": metadata.get("metadata", {}).get("publication_date"),
        "isPublished": metadata.get("status") == "published",
        "fileCount": len(metadata.get("files", [])),
        "graphSha256": sha(old_graph), "graphBytes": len(old_graph),
        "candidateComparison": compare(old_graph, graph),
    }
except Exception as e:
    report["errors"]["zenodo"] = type(e).__name__ + ": " + str(e)[:250]

try:
    old_graph = request_bytes(ORIGIN + "/graph.jsonld")
    site_commit = get_json(ORIGIN + "/release-provenance.json")["sourceCommit"]
    report["providers"]["website"] = {
        "sourceCommit": site_commit,
        "graphSha256": sha(old_graph),
        "graphBytes": len(old_graph),
        "candidateComparison": compare(old_graph, graph),
    }
except Exception as e:
    report["errors"]["website"] = type(e).__name__ + ": " + str(e)[:250]

try:
    repo = get_json("https://huggingface.co/api/datasets/" + HF)
    hf_url = "https://huggingface.co/datasets/" + HF + "/resolve/main/graph.jsonld"
    old_graph = request_bytes(hf_url)
    report["providers"]["huggingFace"] = {
        "revision": repo.get("sha"),
        "graphSha256": sha(old_graph),
        "graphBytes": len(old_graph),
        "candidateComparison": compare(old_graph, graph),
    }
except Exception as e:
    report["errors"]["huggingFace"] = type(e).__name__ + ": " + str(e)[:250]

try:
    p = get_json("https://www.kaggle.com/api/v1/datasets/view/" + KG)
    report["providers"]["kaggle"] = {
        "version": p.get("currentVersionNumber"),
        "updated": p.get("lastUpdated"),
        "fileDetailsObtained": False,
    }
except Exception as e:
    report["errors"]["kaggle"] = type(e).__name__ + ": " + str(e)[:250]

if "zenodo" in report["providers"]:
    comparison = report["providers"]["zenodo"]["candidateComparison"]
    total_changed = comparison["oldOnlyCount"]+comparison["newOnlyCount"]+comparison["modifiedNodeCount"]
    report["sameDoiFileEdit"] = {
        "publishedRecordAlreadyExists": True,
        "contentChangeNodes": total_changed,
        "identicalToPublishedRecord": comparison["identical"],
        "correctionScope": "Content differs: review Zenodo minor-correction vs new-version rules before any edit" if total_changed else "Byte/semantic check passed",
        "sameDOIEditSubmitted": False,
    }
save()
print(json.dumps({
    "doi": DOI, "candidate": report["candidate"],
    "zenodoDelta": report.get("providers", {}).get("zenodo", {}).get("candidateComparison"),
    "websiteDelta": report.get("providers", {}).get("website", {}).get("candidateComparison"),
    "errors": report["errors"],
}, indent=2, ensure_ascii=False), flush=True)
if "zenodo" not in report["providers"]:
    sys.exit(2)
