#!/usr/bin/env python3
"""Hermetic regression tests for the GET-only Zenodo transaction preflight."""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("zenodo_preflight", ROOT / "scripts/zenodo-preflight.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to load zenodo-preflight.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

release = json.loads((ROOT / "src/data/release.json").read_text(encoding="utf-8"))
lock = json.loads((ROOT / ".release/policy/release-transaction-lock.json").read_text(encoding="utf-8"))
concept_id = lock["conceptDoi"].rsplit(".", 1)[1]
predecessor = lock["predecessor"]
candidate = lock["candidate"]
creator = {"name": "Ghezelbash, Saeed", "orcid": release["primaryEntity"]["orcid"]}
public = {
    "id": int(predecessor["recordId"]),
    "doi": predecessor["versionDoi"],
    "conceptdoi": lock["conceptDoi"],
    "conceptrecid": concept_id,
    "metadata": {
        "version": predecessor["release"],
        "title": release["dataset"]["name"],
        "creators": [creator],
        "publication_date": "2026-09-08",
    },
}
published_deposition = {
    "id": int(predecessor["recordId"]),
    "conceptrecid": concept_id,
    "submitted": True,
    "metadata": {"version": predecessor["release"]},
}
draft = {
    "id": int(candidate["recordId"]),
    "conceptrecid": concept_id,
    "submitted": False,
    "state": "unsubmitted",
    "metadata": {
        "version": candidate["release"],
        "title": release["dataset"]["name"],
        "creators": [creator],
        "prereserve_doi": {
            "doi": candidate["versionDoi"],
            "recid": int(candidate["recordId"]),
        },
    },
}
candidate_public = {
    "id": int(candidate["recordId"]),
    "doi": candidate["versionDoi"],
    "conceptdoi": lock["conceptDoi"],
    "conceptrecid": concept_id,
    "metadata": {
        "version": candidate["release"],
        "title": release["dataset"]["name"],
        "creators": [creator],
        "publication_date": "2026-09-13",
    },
}
candidate_published_deposition = {
    "id": int(candidate["recordId"]),
    "conceptrecid": concept_id,
    "submitted": True,
    "state": "done",
    "metadata": {"version": candidate["release"]},
}


def expect_failure(label: str, action, token: str) -> None:
    try:
        action()
    except RuntimeError as error:
        if token not in str(error):
            raise AssertionError(f"{label}: wrong failure: {error}") from error
    else:
        raise AssertionError(f"{label}: mutation was not rejected")


with tempfile.TemporaryDirectory(prefix="zenodo-preflight-") as temporary:
    temporary = Path(temporary)
    module.LOCK = temporary / "lock.json"
    module.RELEASE = temporary / "release.json"
    module.OUT = temporary / "runtime/preflight.json"
    module.LOCK.write_text(json.dumps(lock), encoding="utf-8")
    module.RELEASE.write_text(json.dumps(release), encoding="utf-8")
    os.environ["ZENODO_TOKEN"] = "fixture-token-never-transported"

    def exact_get(_token: str, url: str, *, allow_404: bool = False):
        if url.endswith(f"/records/{predecessor['recordId']}"):
            return public
        if url.endswith(f"/deposit/depositions/{candidate['recordId']}"):
            return draft
        if url.endswith(f"/records/{candidate['recordId']}") and allow_404:
            return None
        raise AssertionError(f"Unexpected fixture URL: {url}")

    module.get_json = exact_get
    module.deposition_rows = lambda _token, status: (
        [published_deposition] if status == "published" else [draft]
    )
    module.main()
    state = json.loads(module.OUT.read_text(encoding="utf-8"))
    assert state["stage"] == "ZENODO_READ_ONLY_PREFLIGHT_VERIFIED"
    assert state["authenticated"] is True
    assert state["httpMethodsUsed"] == ["GET"]
    assert state["predecessor"]["recordId"] == predecessor["recordId"]
    assert state["candidate"]["recordId"] == candidate["recordId"]
    assert state["candidate"]["state"] == "draft"
    assert state["candidate"]["publicationDate"] is None

    conflicting = json.loads(json.dumps(draft))
    conflicting["metadata"]["prereserve_doi"]["doi"] = "10.5281/zenodo.99999999"
    expect_failure(
        "reserved DOI drift",
        lambda: module.validate_candidate_draft(conflicting, candidate, concept_id, release),
        "reserved DOI drift",
    )

    wrong_public = json.loads(json.dumps(public))
    wrong_public["doi"] = "10.5281/zenodo.99999998"
    expect_failure(
        "predecessor DOI drift",
        lambda: module.validate_public_record(wrong_public, predecessor, lock["conceptDoi"], release),
        "Version DOI drift",
    )

    module.get_json = exact_get
    module.deposition_rows = lambda _token, status: (
        [published_deposition]
        if status == "published"
        else [draft, json.loads(json.dumps(draft))]
    )
    expect_failure("ambiguous draft", module.main, "missing or ambiguous")

    def published_get(_token: str, url: str, *, allow_404: bool = False):
        if url.endswith(f"/records/{predecessor['recordId']}"):
            return public
        if url.endswith(f"/records/{candidate['recordId']}"):
            return candidate_public
        if url.endswith(f"/deposit/depositions/{candidate['recordId']}"):
            return candidate_published_deposition
        raise AssertionError(f"Unexpected published-recovery fixture URL: {url}")

    module.get_json = published_get
    module.deposition_rows = lambda _token, status: (
        [published_deposition, candidate_published_deposition] if status == "published" else []
    )
    module.main()
    recovered = json.loads(module.OUT.read_text(encoding="utf-8"))
    assert recovered["candidate"]["state"] == "published"
    assert recovered["candidate"]["submitted"] is True
    assert recovered["candidate"]["publicationDate"] == "2026-09-13"
    assert recovered["predecessor"]["release"] == predecessor["release"]

print("ZENODO_PREFLIGHT_HERMETIC_PASS")
