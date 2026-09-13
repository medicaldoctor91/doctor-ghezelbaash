#!/usr/bin/env python3
"""Hermetic single-attempt publication recovery tests."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("zenodo_publish_safe", ROOT / "scripts/zenodo-publish-safe.py")
if SPEC is None or SPEC.loader is None:
    raise SystemExit("Unable to load zenodo-publish-safe.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

release = {
    "release": "1.3.0",
    "dataset": {
        "zenodo": {
            "recordId": "22663811",
            "versionDoi": "10.5281/zenodo.22663811",
            "conceptDoi": "10.5281/zenodo.18765168",
        }
    },
}
source_commit = "a" * 40
blob = b"exact release bytes"
digest = hashlib.sha256(blob).hexdigest()
os.environ["SOURCE_COMMIT"] = source_commit


def fixture_runtime(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "zenodo-stage.json").write_text(
        json.dumps(
            {
                "release": "1.3.0",
                "recordId": "22663811",
                "versionDoi": "10.5281/zenodo.22663811",
                "sourceCommit": source_commit,
                "sha256": {"graph.jsonld": digest},
            }
        ),
        encoding="utf-8",
    )


def run_case(*, post_error=None, verify_error=None, submitted=False):
    calls = []
    writes = []

    def call(_token, method, url, body=None, content_type="application/json", ok=(200, 201, 202, 204), binary=False):
        calls.append((method, url))
        if method == "POST":
            if post_error is not None:
                raise post_error
            return {}
        if url.endswith("/files"):
            return [{"filename": "graph.jsonld", "links": {"download": "https://fixture.invalid/file"}}]
        if url == "https://fixture.invalid/file":
            return blob
        if "/deposit/depositions/22663811" in url:
            return {
                "submitted": submitted,
                "metadata": {
                    "version": "1.3.0",
                    "prereserve_doi": {"doi": "10.5281/zenodo.22663811"},
                },
            }
        raise AssertionError(f"unexpected call: {method} {url}")

    def verify(*_args, **_kwargs):
        if verify_error is not None:
            raise verify_error
        return {
            "stage": "ZENODO_PUBLIC_VERIFIED",
            "release": "1.3.0",
            "recordId": "22663811",
            "versionDoi": "10.5281/zenodo.22663811",
            "conceptDoi": "10.5281/zenodo.18765168",
            "integrity": "PASS",
        }

    module.zenodo.load_release = lambda: release
    module.zenodo.call = call
    module.zenodo.verify_public_record = verify
    module.zenodo.write_state = lambda name, state: writes.append((name, dict(state)))
    return calls, writes


with tempfile.TemporaryDirectory(prefix="zenodo-publish-safe-") as temporary:
    runtime = Path(temporary)
    fixture_runtime(runtime)
    module.zenodo.RUNTIME = runtime

    calls, writes = run_case(post_error=TimeoutError("ambiguous transport"))
    state = module.publish_once("fixture-token")
    assert state["publishResponseAmbiguous"] is True
    assert state["publishPostAttempts"] == 1
    assert sum(method == "POST" for method, _ in calls) == 1
    assert writes[-1][0] == "zenodo-published.json"

    calls, _ = run_case(
        post_error=TimeoutError("ambiguous transport"),
        verify_error=RuntimeError("not public"),
    )
    try:
        module.publish_once("fixture-token")
    except RuntimeError as error:
        assert "refusing a blind retry" in str(error)
    else:
        raise AssertionError("Ambiguous publish without public proof must fail")
    assert sum(method == "POST" for method, _ in calls) == 1

    calls, _ = run_case(submitted=True)
    state = module.publish_once("fixture-token")
    assert state["idempotentAlreadyPublished"] is True
    assert sum(method == "POST" for method, _ in calls) == 0

print("ZENODO_PUBLISH_SINGLE_ATTEMPT_PASS")
