"""Read-only completion audit for the already published 1.3.6 mutable cohort.

Absolutely no provider POST/PUT/PATCH/DELETE calls, no deployment or version
creation. Reuses the exact immutable CI candidate generated in run 44889318984.
All proof is based on public bytes and on the frozen manifests, not fresh builds.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coordinated_doi_release as gates
import mutable_platform_release as maintenance
from immutable_archive import verify_published_archive
from sync_platform_machine_resources import kaggle_client
from platform_bundle import DOI_POLICY

ROOT = Path("/tmp/mutable-release")
OUT = Path("/tmp/136-final-verify")
OUT.mkdir(parents=True, exist_ok=True)

PLAN = {
    "sourceCommit": "29e6c519e55252c70f8b22c0ada2061f1dd332fe",
    "hfRevision": "ff4183c3e68bc383b8a47cf356dbebc1d716c823",
    "kaggleVersion": 40,
    "notebookVersion": 21,
    "archiveSourceCommit": "eafb138d596a91504ed0af66e2557f52848e36b6",
    "archiveDoi": "10.5281/zenodo.24354791",
    "archiveWrites": False,
}
manifest_sha = "69a55cb306c3728fe22e4a9d28173d4b58d84ff3b3fd0af94ed1030cf20ac22c"
report = {
    "operation": "GET-only post-publication reconciliation",
    "externalMutations": 0,
    "reviewedCandidateRun": 44889318984,
    "frozenCohortExpected": PLAN,
    "observedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "tests": {},
    "conclusion": "NOT_VERIFIED",
}

def save():
    (OUT / "reconciliation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n"
    )

def test(label, call):
    started = time.monotonic()
    try:
        value = call()
        report["tests"][label] = {
            "status": "PASS",
            "elapsedSeconds": round(time.monotonic() - started, 2),
            "proof": value,
        }
        save()
        print(f"READ_ONLY_PASS {label}", flush=True)
        return value
    except Exception as exc:
        report["tests"][label] = {
            "status": "FAIL",
            "elapsedSeconds": round(time.monotonic() - started, 2),
            "error": type(exc).__name__ + ": " + str(exc)[:500],
            "traceback": traceback.format_exc(limit=5),
        }
        save()
        print(f"READ_ONLY_FAIL {label}: {exc}", flush=True)
        return None

def prepare():
    plan = maintenance.load(ROOT / "release-plan.json")
    if plan.get("candidateSchema") != "mutable-distributions-4":
        raise AssertionError("Wrong frozen candidate schema")
    for key in ["sourceCommit", "hfRevision", "kaggleVersion", "notebookVersion",
                "archiveSourceCommit", "archiveWrites"]:
        if plan.get(key) != PLAN[key]:
            raise AssertionError(f"Frozen release plan mismatch: {key}")
    if maintenance.sha(ROOT / "frozen-sha256.json") != manifest_sha:
        raise AssertionError("Unreviewed frozen SHA-256 manifest")
    if DOI_POLICY["currentArchive"]["doi"] != PLAN["archiveDoi"]:
        raise AssertionError("The DOI changed!")
    if DOI_POLICY["currentArchive"]["sourceCommit"] != PLAN["archiveSourceCommit"]:
        raise AssertionError("Published archive source changed!")
    maintenance.guard_frozen(ROOT)
    proof = maintenance.guard_frozen_home_projection(ROOT)
    return {
        "status": "PASS", "plan": plan, "frozenManifest": manifest_sha,
        "homepageCanonical": proof
    }

def do_archive():
    archive = maintenance.load(ROOT / "archive-baseline.json")
    result = verify_published_archive(
        ROOT / "archive-public-final-recheck", DOI_POLICY,
        PLAN["archiveSourceCommit"], maintenance.read,
        expected=archive, verify_bytes=True
    )
    return {"status": "PASS", "doi": PLAN["archiveDoi"],
            "source": PLAN["archiveSourceCommit"],
            "fileCount": len(archive["files"]),
            "verification": result}

def do_hf():
    # Public Parquet, typed rows and full-text search/filter must all work.
    # A temporary ResponseNotReady remains a FAIL until verified, not a pass.
    original = gates.get
    gates.get = maintenance.fresh_viewer_reads(ROOT, original)
    try:
        last = None
        for i in range(5):
            try:
                result = gates.verify_hf(ROOT, runtime_features=True)
                return {"status": "PASS", "attempt": i + 1, "details": result}
            except Exception as exc:
                last = exc
                print(f"HF_RUNTIME_PENDING {i + 1}: {type(exc).__name__}: {str(exc)[:250]}", flush=True)
                if i < 4:
                    time.sleep([8, 15, 30, 45][i])
        raise RuntimeError(f"HF runtime never reached full convergence: {last}")
    finally:
        gates.get = original

def do_notebook():
    return gates.verify_notebook(ROOT, kaggle_client())

def do_final():
    return maintenance.verify_final_consistency(ROOT, maintenance.load(ROOT / "release-plan.json"), kaggle_client())

if __name__ == "__main__":
    # The first immutable condition must pass before remote endpoints are touched.
    base = test("frozen_candidate_and_full_HEAD_JSONLD", prepare)
    if base is None:
        report["conclusion"] = "FAIL_CLOSED_UNREVIEWED_CANDIDATE"
        save()
        sys.exit(2)
    test("website_all_exact_normal_URL_bytes", lambda: gates.verify_site(ROOT))
    test("archive_DOI_unchanged_and_all_published_bytes", do_archive)
    test("Kaggle_40_public_exact_default_ZIP_and_metadata", lambda: gates.verify_kaggle(ROOT))
    test("Kaggle_Notebook_21_real_execution_and_source", do_notebook)
    test("website_media_and_video_resources", lambda: maintenance.verify_media(ROOT))
    test("HuggingFace_205_files_all_Parquet_rows_search_filter_and_statistics", do_hf)
    if all(q["status"] == "PASS" for q in report["tests"].values()):
        test("postruntime_final_cross_platform_consistency", do_final)
    maintenance.guard_frozen(ROOT)
    report["conclusion"] = (
        "PASS_ALL_MUTABLE_PLATFORMS_VERIFIED_ARCHIVE_UNTOUCHED"
        if all(q["status"] == "PASS" for q in report["tests"].values())
        else "FAIL_CLOSED_OR_PENDING"
    )
    report["endedUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    save()
    print(json.dumps({"result": report["conclusion"],
                      "tests": {k:v["status"] for k,v in report["tests"].items()}},
                     indent=2), flush=True)
    sys.exit(0 if report["conclusion"].startswith("PASS") else 1)
