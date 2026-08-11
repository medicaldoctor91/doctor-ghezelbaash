#!/usr/bin/env python3
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

BASE = "https://zenodo.org/api"
HISTORICAL_RECORD_ID = "18765169"
HISTORICAL_VERSION_DOI = "10.5281/zenodo.18765169"
TARGET_RELEASE = "1.1.0"
CANONICAL_DATASET_IRI = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
DATASET_WIKIDATA = "Q140304972"
PRIMARY_WIKIDATA = "Q140287622"
CLINIC_WIKIDATA = "Q140288589"
ORCID = "0009-0001-9346-8475"
RELEASE_PATH = pathlib.Path("src/data/release.json")

TOKEN = os.environ.get("ZENODO_TOKEN", "").strip()
if not TOKEN:
    raise SystemExit("ZENODO_TOKEN is unavailable; DOI Gate stopped before any Zenodo mutation")

AUTH_HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "doctor-ghezelbaash-release-authority/1.1",
}


def request(method, url, body=None, auth=True, expected=(200, 201, 202)):
    headers = dict(AUTH_HEADERS if auth else {"Accept": "application/json", "User-Agent": AUTH_HEADERS["User-Agent"]})
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8", "replace")
            payload = json.loads(raw) if raw else {}
            if response.status not in expected:
                raise SystemExit(f"Unexpected Zenodo HTTP {response.status} for {method} {url}")
            return payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        # Never print request headers/token. Zenodo response bodies do not contain the bearer token.
        raise SystemExit(f"Zenodo HTTP {exc.code} for {method} {url}: {raw[:2000]}") from None


def nested(obj, *path):
    cur = obj
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def collect_concept_dois(*objects):
    found = []
    candidate_paths = [
        ("conceptdoi",),
        ("metadata", "conceptdoi"),
        ("concept_doi",),
        ("metadata", "concept_doi"),
        ("parent", "pids", "doi", "identifier"),
        ("parent", "doi"),
    ]
    for obj in objects:
        for path in candidate_paths:
            value = nested(obj, *path)
            if isinstance(value, str) and value.startswith("10."):
                found.append(value.strip())
    return sorted(set(found))


def get_draft_url(response):
    url = nested(response, "links", "latest_draft")
    if not isinstance(url, str) or not url.startswith("https://zenodo.org/api/"):
        raise SystemExit("Zenodo new-version response did not expose a valid links.latest_draft")
    return url


# 1) Verify the exact current deposition and public record before mutation.
original = request("GET", f"{BASE}/deposit/depositions/{HISTORICAL_RECORD_ID}")
if str(original.get("record_id") or original.get("id")) != HISTORICAL_RECORD_ID:
    raise SystemExit("Historical Zenodo record/deposition identity mismatch")
if original.get("submitted") is not True and original.get("state") != "done":
    raise SystemExit("Historical Zenodo deposition is not in the expected published state")

public_record = request("GET", f"{BASE}/records/{HISTORICAL_RECORD_ID}", auth=False)
public_version_doi = public_record.get("doi") or nested(public_record, "pids", "doi", "identifier")
if public_version_doi and public_version_doi != HISTORICAL_VERSION_DOI:
    raise SystemExit(f"Historical Version DOI mismatch: expected {HISTORICAL_VERSION_DOI}, got {public_version_doi}")

# 2) Create/reuse the single allowed unpublished new-version draft.
new_version_response = request(
    "POST",
    f"{BASE}/deposit/depositions/{HISTORICAL_RECORD_ID}/actions/newversion",
    body=None,
    expected=(200, 201, 202),
)
draft_url = get_draft_url(new_version_response)
draft = request("GET", draft_url)
draft_id = str(draft.get("id") or "")
if not draft_id or draft_id == HISTORICAL_RECORD_ID:
    raise SystemExit("Zenodo did not provide a distinct new-version draft identifier")
if draft.get("submitted") is True or draft.get("state") == "done":
    raise SystemExit("New-version target is already published; DOI Gate refuses to continue")

# 3) Verify Concept DOI strictly from authoritative Zenodo payloads; never infer from record-number adjacency.
concept_dois = collect_concept_dois(original, public_record, new_version_response, draft)
if len(concept_dois) != 1:
    raise SystemExit(f"Concept DOI could not be uniquely verified from Zenodo payloads: {concept_dois}")
concept_doi = concept_dois[0]
if concept_doi == HISTORICAL_VERSION_DOI:
    raise SystemExit("Concept DOI incorrectly equals the historical Version DOI")

# 4) Reserve the exact Version DOI for this draft if Zenodo has not already done so.
prereserve = nested(draft, "metadata", "prereserve_doi")
if not (isinstance(prereserve, dict) and prereserve.get("doi")):
    metadata = dict(draft.get("metadata") or {})
    metadata["prereserve_doi"] = True
    draft = request("PUT", draft_url, {"metadata": metadata})
    prereserve = nested(draft, "metadata", "prereserve_doi")

if not isinstance(prereserve, dict):
    raise SystemExit("Zenodo did not return metadata.prereserve_doi after reservation")
version_doi = str(prereserve.get("doi") or "").strip()
version_record_id = str(prereserve.get("recid") or draft.get("record_id") or draft.get("id") or "").strip()
if not version_doi.startswith("10.5281/zenodo."):
    raise SystemExit(f"Reserved Version DOI is invalid/unexpected: {version_doi!r}")
if version_doi == HISTORICAL_VERSION_DOI or version_doi == concept_doi:
    raise SystemExit("Reserved Version DOI is not distinct from historical/concept DOI")
if not version_record_id.isdigit() or version_record_id == HISTORICAL_RECORD_ID:
    raise SystemExit(f"Reserved Version record ID is invalid: {version_record_id!r}")

# 5) Lock the verified identifiers into the single release/distribution contract.
release = json.loads(RELEASE_PATH.read_text(encoding="utf-8"))
release["release"] = TARGET_RELEASE
release["dateModified"] = "2026-08-11"
release["dataset"] = {
    "id": CANONICAL_DATASET_IRI,
    "name": "Dr. Saeed Ghezelbash Public Knowledge Graph",
    "wikidata": DATASET_WIKIDATA,
    "creator": release["primaryEntity"]["id"],
    "creatorWikidata": PRIMARY_WIKIDATA,
    "creatorOrcid": ORCID,
    "publisher": release["primaryEntity"]["id"],
    "supportingClinic": release["clinic"]["id"],
    "supportingClinicWikidata": CLINIC_WIKIDATA,
    "license": "https://creativecommons.org/licenses/by/4.0/",
    "github": {
        "role": "source",
        "repository": "https://github.com/medicaldoctor91/doctor-ghezelbaash"
    },
    "zenodo": {
        "role": "preservation",
        "conceptDoi": concept_doi,
        "versionDoi": version_doi,
        "recordId": version_record_id,
        "draftApi": draft_url,
        "state": "doi-locked-draft",
        "historicalVersion": {
            "release": "1.0.0",
            "recordId": HISTORICAL_RECORD_ID,
            "versionDoi": HISTORICAL_VERSION_DOI
        }
    },
    "huggingFace": {
        "role": "ai-distribution",
        "dataset": "https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
    }
}

RELEASE_PATH.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Non-secret machine-readable status for Actions logs and later verification.
status = {
    "stage": "DOI_GATE_LOCKED",
    "release": TARGET_RELEASE,
    "conceptDoi": concept_doi,
    "versionDoi": version_doi,
    "recordId": version_record_id,
    "draftApi": draft_url,
    "coreFrozen": False,
    "integrity": "PASS"
}
pathlib.Path(".release").mkdir(exist_ok=True)
pathlib.Path(".release/doi-gate.json").write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
print(json.dumps(status, separators=(",", ":")))
