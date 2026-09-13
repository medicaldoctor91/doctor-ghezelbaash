#!/usr/bin/env python3
"""Authenticated, GET-only proof of the locked Zenodo release transaction."""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://zenodo.org/api"
LOCK = Path(".release/policy/release-transaction-lock.json")
RELEASE = Path("src/data/release.json")
OUT = Path(".release/runtime/zenodo-preflight.json")


def fail(message: str) -> None:
    raise RuntimeError(message)


def get_json(token: str, url: str, *, allow_404: bool = False):
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "doctor-ghezelbaash-zenodo-preflight/2.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            if response.status != 200:
                fail(f"Zenodo read-only GET returned HTTP {response.status}: {url}")
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if allow_404 and exc.code == 404:
            return None
        detail = exc.read().decode("utf-8", "replace")[:1500]
        fail(f"Zenodo read-only GET failed HTTP {exc.code}: {detail}")


def semver(value: str) -> tuple[int, int, int]:
    if re.fullmatch(r"\d+\.\d+\.\d+", str(value or "")) is None:
        fail(f"Invalid Zenodo semantic version: {value!r}")
    return tuple(int(part) for part in value.split("."))


def concept_record_id(concept_doi: str) -> str:
    match = re.fullmatch(r"10\.5281/zenodo\.(\d+)", concept_doi)
    if not match:
        fail("Release transaction lock has an invalid Zenodo Concept DOI")
    return match.group(1)


def exact_creator(metadata: dict, orcid: str) -> bool:
    return any(
        isinstance(creator, dict) and creator.get("orcid") == orcid
        for creator in metadata.get("creators") or []
    )


def validate_public_record(record: dict, expected: dict, concept_doi: str, release: dict, label: str = "Zenodo published record") -> None:
    metadata = record.get("metadata") or {}
    if str(record.get("id")) != str(expected["recordId"]):
        fail(f"{label} record ID drift")
    if record.get("doi") != expected["versionDoi"]:
        fail(f"{label} Version DOI drift")
    if record.get("conceptdoi") != concept_doi:
        fail(f"{label} Concept DOI drift")
    if metadata.get("version") != expected["release"]:
        fail(f"{label} version drift")
    if metadata.get("title") != release["dataset"]["name"]:
        fail(f"{label} dataset title drift")
    if not exact_creator(metadata, release["primaryEntity"]["orcid"]):
        fail(f"{label} creator ORCID drift")


def validate_candidate_draft(draft: dict, expected: dict, concept_id: str, release: dict) -> None:
    metadata = draft.get("metadata") or {}
    prere = metadata.get("prereserve_doi") or {}
    if draft.get("submitted") is True or draft.get("state") == "done":
        fail("Locked Zenodo candidate is already submitted")
    if str(draft.get("id")) != str(expected["recordId"]):
        fail("Locked Zenodo candidate record ID drift")
    if str(draft.get("conceptrecid") or "") != concept_id:
        fail("Locked Zenodo candidate concept lineage drift")
    if prere.get("doi") != expected["versionDoi"]:
        fail("Locked Zenodo candidate reserved DOI drift")
    if str(prere.get("recid") or draft.get("id")) != str(expected["recordId"]):
        fail("Locked Zenodo candidate reserved record ID drift")
    if metadata.get("version") != expected["release"]:
        fail("Locked Zenodo candidate version drift")
    if metadata.get("title") != release["dataset"]["name"]:
        fail("Locked Zenodo candidate dataset title drift")
    if not exact_creator(metadata, release["primaryEntity"]["orcid"]):
        fail("Locked Zenodo candidate creator ORCID drift")


def deposition_rows(token: str, status: str) -> list[dict]:
    query = urllib.parse.urlencode(
        {"status": status, "all_versions": "true", "sort": "mostrecent", "size": 100}
    )
    rows = get_json(token, f"{BASE}/deposit/depositions?{query}")
    if not isinstance(rows, list):
        fail(f"Unexpected authenticated Zenodo {status} deposition listing")
    return rows


def main() -> None:
    token = os.environ.get("ZENODO_TOKEN", "").strip()
    if not token:
        raise SystemExit("ZENODO_TOKEN is required")
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    release = json.loads(RELEASE.read_text(encoding="utf-8"))
    if lock.get("schemaVersion") != "1.0":
        fail("Unsupported release transaction lock schema")
    policy = lock.get("policy") or {}
    required_policy = {
        "requireAuthenticatedPreflight": True,
        "requireExistingCandidateDraft": True,
        "allowReplacementCandidateIdentity": False,
        "allowBlindPublishRetry": False,
    }
    if any(policy.get(key) is not value for key, value in required_policy.items()):
        fail("Release transaction lock policy is not fail-closed")

    concept_doi = lock["conceptDoi"]
    concept_id = concept_record_id(concept_doi)
    predecessor = lock["predecessor"]
    candidate = lock["candidate"]
    if semver(predecessor["release"]) >= semver(candidate["release"]):
        fail("Locked Zenodo predecessor must predate the candidate version")
    if concept_doi != release["dataset"]["zenodo"]["conceptDoi"]:
        fail("Release transaction lock Concept DOI disagrees with canonical release source")

    predecessor_public = get_json(token, f"{BASE}/records/{predecessor['recordId']}")
    validate_public_record(predecessor_public, predecessor, concept_doi, release, "Zenodo predecessor")
    published = [
        row
        for row in deposition_rows(token, "published")
        if str(row.get("conceptrecid") or "") == concept_id
        and re.fullmatch(r"\d+\.\d+\.\d+", str((row.get("metadata") or {}).get("version") or ""))
    ]
    if not published:
        fail("Authenticated Zenodo lineage contains no published versions")
    latest = max(published, key=lambda row: semver((row.get("metadata") or {})["version"]))
    latest_version = (latest.get("metadata") or {}).get("version")

    candidate_public = get_json(token, f"{BASE}/records/{candidate['recordId']}", allow_404=True)
    candidate_publication_date = None
    if candidate_public is None:
        if str(latest.get("id")) != str(predecessor["recordId"]) or latest_version != predecessor["release"]:
            fail("Locked predecessor is not the latest authenticated published Zenodo version")
        draft = get_json(token, f"{BASE}/deposit/depositions/{candidate['recordId']}")
        validate_candidate_draft(draft, candidate, concept_id, release)
        matching_drafts = [
            row for row in deposition_rows(token, "draft")
            if str(row.get("conceptrecid") or "") == concept_id
            and (row.get("metadata") or {}).get("version") == candidate["release"]
        ]
        if len(matching_drafts) != 1 or str(matching_drafts[0].get("id")) != str(candidate["recordId"]):
            fail("Zenodo target-version draft lineage is missing or ambiguous")
        candidate_state = "draft"
        candidate_submitted = False
    else:
        validate_public_record(candidate_public, candidate, concept_doi, release, "Locked Zenodo candidate")
        if str(latest.get("id")) != str(candidate["recordId"]) or latest_version != candidate["release"]:
            fail("Published locked candidate is not the latest authenticated Zenodo version")
        deposition = get_json(token, f"{BASE}/deposit/depositions/{candidate['recordId']}")
        if deposition.get("submitted") is not True or str(deposition.get("conceptrecid") or "") != concept_id:
            fail("Published locked candidate authenticated deposition state drift")
        candidate_publication_date = (candidate_public.get("metadata") or {}).get("publication_date")
        if not candidate_publication_date:
            fail("Published locked candidate has no publication date")
        candidate_state = "published"
        candidate_submitted = True

    predecessor_date = (predecessor_public.get("metadata") or {}).get("publication_date")
    if not predecessor_date:
        fail("Published Zenodo predecessor has no publication date")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    state = {
        "schemaVersion": "1.0",
        "stage": "ZENODO_READ_ONLY_PREFLIGHT_VERIFIED",
        "conceptDoi": concept_doi,
        "conceptRecordId": concept_id,
        "predecessor": {
            "release": predecessor["release"],
            "recordId": str(predecessor["recordId"]),
            "versionDoi": predecessor["versionDoi"],
            "publicationDate": predecessor_date,
        },
        "candidate": {
            "release": candidate["release"],
            "recordId": str(candidate["recordId"]),
            "versionDoi": candidate["versionDoi"],
            "state": candidate_state,
            "submitted": candidate_submitted,
            "publicationDate": candidate_publication_date,
        },
        "authenticated": True,
        "httpMethodsUsed": ["GET"],
        "integrity": "PASS",
    }
    OUT.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(state, separators=(",", ":"), ensure_ascii=False))


if __name__ == "__main__":
    main()
