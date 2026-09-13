#!/usr/bin/env python3
"""Publish a fully staged Zenodo release exactly once, resolving ambiguous transport by public verification."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("zenodo_release", ROOT / "scripts/zenodo_release.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to load zenodo_release.py")
zenodo = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(zenodo)


def publish_once(token: str) -> dict:
    release = zenodo.load_release()
    z = release["dataset"]["zenodo"]
    record = str(z["recordId"])
    doi = z["versionDoi"]
    draft_url = f"{zenodo.BASE}/deposit/depositions/{record}"
    source_commit = os.environ.get("SOURCE_COMMIT", "").strip()
    if len(source_commit) != 40 or any(c not in "0123456789abcdef" for c in source_commit):
        raise RuntimeError("SOURCE_COMMIT must bind Zenodo publication to exact Candidate C")

    stage_path = zenodo.RUNTIME / "zenodo-stage.json"
    if not stage_path.exists():
        raise RuntimeError("Zenodo stage ledger is required before publication")
    staged = json.loads(stage_path.read_text(encoding="utf-8"))
    if (
        staged.get("recordId") != record
        or staged.get("versionDoi") != doi
        or staged.get("release") != release["release"]
        or staged.get("sourceCommit") != source_commit
    ):
        raise RuntimeError("Zenodo stage ledger mismatch or stale Candidate C binding")
    hashes = staged.get("sha256")
    if not isinstance(hashes, dict) or not hashes:
        raise RuntimeError("Zenodo stage ledger has no exact file hashes")

    remote = zenodo.call(token, "GET", f"{draft_url}/files")
    names = [item.get("filename") for item in remote]
    if len(names) != len(set(names)) or set(names) != set(hashes):
        raise RuntimeError("Zenodo inventory drift after stage")
    for item in remote:
        name = item.get("filename")
        url = (item.get("links") or {}).get("download")
        if not name or not url:
            raise RuntimeError("Zenodo pre-publish file identity is incomplete")
        blob = zenodo.call(token, "GET", url, ok=(200,), binary=True)
        if hashlib.sha256(blob).hexdigest() != hashes[name]:
            raise RuntimeError(f"Zenodo pre-publish drift: {name}")

    draft = zenodo.call(token, "GET", draft_url)
    metadata = draft.get("metadata") or {}
    prere = metadata.get("prereserve_doi") or {}
    if draft.get("submitted") is True:
        state = zenodo.verify_public_record(
            token, record, doi, release["release"], z["conceptDoi"], hashes
        )
        state["idempotentAlreadyPublished"] = True
        state["sourceCommit"] = source_commit
        zenodo.write_state("zenodo-published.json", state)
        return state
    if prere.get("doi") != doi or metadata.get("version") != release["release"]:
        raise RuntimeError("Zenodo identity drift immediately before publish")

    ambiguous_error = None
    try:
        # Exactly one irreversible request. Never retry this POST in-process.
        zenodo.call(token, "POST", f"{draft_url}/actions/publish")
    except Exception as error:  # Transport may fail after Zenodo committed the publication.
        ambiguous_error = error

    try:
        state = zenodo.verify_public_record(
            token, record, doi, release["release"], z["conceptDoi"], hashes
        )
    except Exception as verification_error:
        if ambiguous_error is not None:
            raise RuntimeError(
                "Zenodo publish response was ambiguous and exact public DOI/hash verification did not prove publication; refusing a blind retry"
            ) from verification_error
        raise

    state["sourceCommit"] = source_commit
    state["publishPostAttempts"] = 1
    if ambiguous_error is not None:
        state["publishResponseAmbiguous"] = True
        state["publishTransportErrorType"] = type(ambiguous_error).__name__
    zenodo.write_state("zenodo-published.json", state)
    return state


def main() -> None:
    token = os.environ.get("ZENODO_TOKEN", "").strip()
    if not token:
        raise SystemExit("ZENODO_TOKEN is required")
    state = publish_once(token)
    print(json.dumps(state, separators=(",", ":"), ensure_ascii=False))


if __name__ == "__main__":
    main()
