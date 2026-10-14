"""Guarded in-place synchronization of the two current Zenodo records.

The operation is intentionally correction-only: record IDs, DOI identifiers,
versions and file keys are invariants. Human/canonical machine resources come
from the verified live website. The two query-matrix package files, which are
not members of the website integrity manifest, come from the *current pinned*
Hugging Face revision only after that revision proves the same website source
commit and file hashes. Published Zenodo bytes are read back publicly before
success is reported.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ZEN_BASE = "https://zenodo.org/api"
ORIGIN = "https://www.ghezelbaash.ir"
HF_REPO = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
HF_URL = "https://huggingface.co/datasets/" + HF_REPO
KAGGLE_URL = "https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data"
REPO = "medicaldoctor91/doctor-ghezelbaash"

DATASET_RECORD = "22838416"
DATASET_DOI = "10.5281/zenodo.22838416"
DATASET_VERSION = "1.3.3"
SOURCE_RECORD = "23289009"
SOURCE_DOI = "10.5281/zenodo.23289009"
SOURCE_VERSION = "source-final-2026-10-10"

DATASET = ORIGIN + "/graph.jsonld/dataset"
PERSON = ORIGIN + "/#saeed-ghezelbash"
OPENALEX = "A5146521397"
ORCID = "0009-0001-9346-8475"
WIKIDATA = "Q140287622"

CONTROL_FILES = {"dist-sha256.json", "current-release-matrix.json", "release-attestation.json"}
HF_ONLY_DATASET_FILES = {"query-matrix.jsonl", "query-matrix.json-seq"}
ATTESTED_RESOURCES = [
    "graph.jsonld", "graph.ttl", "provenance.jsonld", "query-matrix.jsonl",
    "fact-map.json", "croissant.json", "shapes.ttl", "doctor.vcf", "clinic.vcf",
    "dcat.ttl", "void.ttl", "datapackage.json",
]
REQUIRED_MACHINE_FIXES = {"croissant.json", "shapes.ttl", "dcat.ttl", "datapackage.json"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def record_snapshot(record: dict) -> dict:
    doi = record.get("doi") or record.get("pids", {}).get("doi", {}).get("identifier")
    return {
        "id": int(record["id"]),
        "doi": doi,
        "version": record.get("metadata", {}).get("version"),
        "keys": tuple(sorted(item["key"] for item in record.get("files", []))),
    }


def assert_same_record(before: dict, after: dict) -> None:
    assert after == before, ("Zenodo record identity changed", before, after)


def merge_matching_files(existing: dict[str, bytes], replacements: dict[str, bytes]) -> dict[str, bytes]:
    merged = dict(existing)
    for name in merged:
        if name in replacements:
            merged[name] = replacements[name]
    assert set(merged) == set(existing)
    return merged


def changed_names(before: dict[str, bytes], after: dict[str, bytes]) -> list[str]:
    assert set(before) == set(after), "Published Zenodo file keys must remain unchanged"
    return sorted(name for name in before if before[name] != after[name])


def build_dist_inventory(files: dict[str, bytes], source_commit: str) -> dict:
    return {
        "algorithm": "sha256",
        "canonicalDatasetIri": DATASET,
        "sourceCommit": source_commit,
        "files": {
            name: {"bytes": len(body), "sha256": sha256(body)}
            for name, body in sorted(files.items()) if name != "dist-sha256.json"
        },
    }


def partition_mirror_sources(dataset_keys: set[str], website_keys: set[str]) -> tuple[set[str], set[str]]:
    wanted = set(dataset_keys) - CONTROL_FILES
    site = wanted & set(website_keys)
    hf = wanted - site
    assert hf <= HF_ONLY_DATASET_FILES, ("Unexpected Zenodo file missing from website manifest", sorted(hf))
    assert HF_ONLY_DATASET_FILES <= wanted, "Expected query-matrix package files are absent from Zenodo"
    return site, hf


def request(method: str, url: str, *, payload=None, raw: bytes | None = None,
            token: str | None = None, allowed=(200,), parse_json=True, timeout=90):
    if token and not url.startswith(ZEN_BASE + "/"):
        raise RuntimeError("Refusing to send Zenodo credential to non-Zenodo host")
    headers = {"Accept": "application/json", "Cache-Control": "no-cache",
               "User-Agent": "doctor-ghezelbaash-zenodo-in-place/2026-10-14"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if raw is not None:
        data = raw
        headers["Content-Type"] = "application/octet-stream"
    elif payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json"
    elif method in {"POST", "PUT", "PATCH"}:
        data = b""
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    attempts = 3 if method == "GET" else 1
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                body = response.read()
                assert response.status in allowed, (method, url, response.status)
                if not parse_json:
                    return response.status, body
                ctype = response.headers.get("Content-Type", "")
                return response.status, (json.loads(body) if body and "json" in ctype else body)
        except urllib.error.HTTPError as error:
            body = error.read().decode(errors="replace")
            if token:
                body = body.replace(token, "[redacted]")
            wrapped = RuntimeError(f"HTTP {error.code} {method} {url}: {body[:800]}")
            if method != "GET" or error.code < 500 or attempt == attempts - 1:
                raise wrapped from error
        except (urllib.error.URLError, TimeoutError):
            if method != "GET" or attempt == attempts - 1:
                raise
        time.sleep(1 + attempt)
    raise RuntimeError("Unreachable request retry state")


def get_json(url: str, token: str | None = None) -> dict:
    return request("GET", url, token=token)[1]


def get_bytes(url: str, token: str | None = None) -> bytes:
    return request("GET", url, token=token, parse_json=False)[1]


def record(record_id: str, token: str | None = None) -> dict:
    return get_json(f"{ZEN_BASE}/records/{record_id}", token)


def record_content(record_id: str, key: str, token: str | None = None) -> bytes:
    encoded = urllib.parse.quote(key, safe="")
    return get_bytes(f"{ZEN_BASE}/records/{record_id}/files/{encoded}/content", token)


def download_record(record_id: str, token: str | None = None) -> tuple[dict, dict[str, bytes]]:
    rec = record(record_id, token)
    entries = list(rec["files"])

    def one(entry):
        body = record_content(record_id, entry["key"], token)
        checksum = entry.get("checksum", "")
        if checksum.startswith("md5:"):
            assert hashlib.md5(body).hexdigest() == checksum.removeprefix("md5:"), entry["key"]
        if "size" in entry:
            assert len(body) == int(entry["size"]), entry["key"]
        return entry["key"], body

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        files = dict(pool.map(one, entries))
    assert tuple(sorted(files)) == record_snapshot(rec)["keys"]
    return rec, files


def normalized_manifest(manifest: dict) -> dict[str, dict]:
    return {name.lstrip("/"): meta for name, meta in manifest["files"].items()}


def hf_revision_snapshot(source_commit: str, names: set[str]) -> tuple[str, dict[str, bytes]]:
    info = get_json("https://huggingface.co/api/datasets/" + HF_REPO)
    revision = info["sha"]
    sibling_names = {item["rfilename"] for item in info.get("siblings", [])}
    assert names <= sibling_names, ("Pinned HF revision lacks required package files", sorted(names - sibling_names))

    def raw(name: str) -> bytes:
        return get_bytes(f"{HF_URL}/resolve/{revision}/{urllib.parse.quote(name, safe='/')}?download=true")

    matrix = json.loads(raw("current-release-matrix.json"))
    assert matrix["websiteSourceCommit"] == source_commit, ("HF package is not pinned to live website commit", revision)
    assert matrix["canonicalDatasetIri"] == DATASET
    assert matrix["activeOpenAlexAuthorId"] == OPENALEX
    inventory = json.loads(raw("dist-sha256.json"))
    assert inventory["sourceCommit"] == source_commit
    assert inventory["canonicalDatasetIri"] == DATASET

    out = {}
    for name in sorted(names):
        body = raw(name)
        meta = inventory["files"][name]
        assert len(body) == int(meta["bytes"]), ("HF byte count", name)
        assert sha256(body) == meta["sha256"], ("HF SHA-256", name)
        out[name] = body
    return revision, out


def website_snapshot(dataset_keys: set[str]) -> tuple[str, str, dict[str, bytes], dict]:
    provenance = get_json(ORIGIN + "/release-provenance.json?zenodo-sync=20261014")
    source_commit = provenance["sourceCommit"]
    first_manifest_body = get_bytes(ORIGIN + "/integrity-manifest.json?zenodo-sync=20261014-a")
    manifest = json.loads(first_manifest_body)
    lookup = normalized_manifest(manifest)
    site_names, hf_names = partition_mirror_sources(dataset_keys, set(lookup))

    def site_file(name: str):
        body = get_bytes(ORIGIN + "/" + urllib.parse.quote(name, safe="/") + "?zenodo-sync=20261014")
        meta = lookup[name]
        assert len(body) == int(meta["bytes"]), ("Live website byte count", name)
        assert sha256(body) == meta["sha256"], ("Live website SHA-256", name)
        return name, body

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        live = dict(pool.map(site_file, sorted(site_names)))
    hf_revision, hf_files = hf_revision_snapshot(source_commit, hf_names)
    live.update(hf_files)

    second_manifest = get_bytes(ORIGIN + "/integrity-manifest.json?zenodo-sync=20261014-b")
    assert second_manifest == first_manifest_body, "Website integrity manifest changed during snapshot"
    after = get_json(ORIGIN + "/release-provenance.json?zenodo-sync=20261014-c")
    assert after["sourceCommit"] == source_commit, "Website source commit changed during snapshot"
    assert REQUIRED_MACHINE_FIXES <= set(live)
    validate_machine_fix_bytes(live)
    return source_commit, hf_revision, live, manifest


def contributor_has_type(value: object) -> bool:
    values = value if isinstance(value, list) else [value]
    for item in values:
        if isinstance(item, dict):
            types = item.get("@type", [])
            types = types if isinstance(types, list) else [types]
            if any(str(t).endswith(("Person", "Organization")) for t in types):
                return True
    return False


def validate_machine_fix_bytes(files: dict[str, bytes]) -> None:
    croissant = json.loads(files["croissant.json"])
    assert croissant["@id"] == DATASET
    assert contributor_has_type(croissant.get("creator")), "Croissant creator is not explicitly typed"
    assert contributor_has_type(croissant.get("publisher")), "Croissant publisher is not explicitly typed"

    shapes = files["shapes.ttl"].decode()
    count = shapes.count("<http://www.w3.org/ns/shacl#NodeShape>") + shapes.count("sh:NodeShape")
    assert count == 65, ("Expected 65 standalone SHACL NodeShapes", count)

    dcat = files["dcat.ttl"].decode()
    for marker in ("dcat:byteSize", "spdx:checksum", "spdx:checksumAlgorithm_sha256",
                   "https://www.iana.org/assignments/media-types/"):
        assert marker in dcat, ("Measured DCAT marker missing", marker)
    assert json.loads(files["datapackage.json"]).get("resources"), "Data Package has no resources"

    for name, body in files.items():
        if name.endswith((".json", ".jsonld", ".txt", ".md", ".xml", ".ttl", ".csv", ".html", ".jsonl", ".json-seq")):
            assert b"A5064828898" not in body, ("Retired OpenAlex identifier remains", name)
    for name in ("graph.jsonld", "croissant.json", "dcat.ttl", "datapackage.json"):
        assert b"graph.jsonld#dataset" not in files[name], ("Retired dataset IRI remains", name)


def github_successful_run(source_commit: str) -> str:
    query = urllib.parse.urlencode({"head_sha": source_commit, "status": "success", "per_page": 20})
    data = get_json(f"https://api.github.com/repos/{REPO}/actions/runs?{query}")
    runs = [run for run in data.get("workflow_runs", [])
            if run.get("head_sha") == source_commit and run.get("conclusion") == "success"]
    assert runs, ("No successful GitHub Actions publication found for live website commit", source_commit)
    preferred = next((run for run in runs if "machine-readable" in run.get("name", "").lower()), runs[0])
    return preferred["html_url"]


def final_controls(old: dict[str, bytes], staged: dict[str, bytes], source_commit: str,
                   website_run_url: str, hf_revision: str) -> dict[str, bytes]:
    maintenance = datetime.now(timezone.utc).date().isoformat()
    matrix = json.loads(old["current-release-matrix.json"])
    matrix.update({
        "websiteSourceCommit": source_commit,
        "canonicalDatasetIri": DATASET,
        "canonicalPersonIri": PERSON,
        "publicationMaintenanceDate": maintenance,
        "activeOpenAlexAuthorId": OPENALEX,
        "orcid": ORCID,
        "wikidata": WIKIDATA,
        "verifiedPublicationRun": website_run_url,
        "websitePublicationRun": website_run_url,
        "pinnedHuggingFaceRevision": hf_revision,
        "publicationScope": ["zenodo_dataset", "zenodo_source"],
        "archivedSnapshots": {},
        "archivedSnapshotsUpdated": True,
    })
    distributions = dict(matrix.get("distributions") or {})
    distributions.update({
        "website": ORIGIN + "/", "hf": HF_URL + "/tree/" + hf_revision,
        "kaggle": KAGGLE_URL, "zenodo_dataset": "https://doi.org/" + DATASET_DOI,
        "zenodo_source": "https://doi.org/10.5281/zenodo.18765168",
    })
    matrix["distributions"] = distributions
    staged["current-release-matrix.json"] = json_bytes(matrix)

    att = json.loads(old["release-attestation.json"])
    att.update({
        "sourceCommit": source_commit, "canonicalDatasetIri": DATASET,
        "publicationRun": website_run_url, "websitePublicationRun": website_run_url,
        "pinnedHuggingFaceRevision": hf_revision,
        "version": DATASET_VERSION, "maintenanceDate": maintenance,
        "openalex": OPENALEX, "publicationScope": ["zenodo_dataset", "zenodo_source"],
        "archivedSnapshotsUpdated": True,
        "verifiedResources": {name: sha256(staged[name]) for name in ATTESTED_RESOURCES if name in staged},
    })
    staged["release-attestation.json"] = json_bytes(att)
    staged["dist-sha256.json"] = json_bytes(build_dist_inventory(staged, source_commit))
    return staged


def validate_staged_dataset(files: dict[str, bytes], source_commit: str, hf_revision: str) -> None:
    assert len(files) == 24, ("Expected existing 24-file Zenodo dataset", len(files))
    assert CONTROL_FILES <= set(files)
    validate_machine_fix_bytes(files)
    matrix = json.loads(files["current-release-matrix.json"])
    assert matrix["websiteSourceCommit"] == source_commit
    assert matrix["canonicalDatasetIri"] == DATASET
    assert matrix["pinnedHuggingFaceRevision"] == hf_revision
    assert matrix["archivedSnapshotsUpdated"] is True
    assert matrix["publicationScope"] == ["zenodo_dataset", "zenodo_source"]
    att = json.loads(files["release-attestation.json"])
    assert att["sourceCommit"] == source_commit and att["version"] == DATASET_VERSION
    assert att["pinnedHuggingFaceRevision"] == hf_revision
    for name, digest in att["verifiedResources"].items():
        assert digest == sha256(files[name]), ("Attested resource hash", name)
    assert json.loads(files["dist-sha256.json"]) == build_dist_inventory(files, source_commit)


def build_source_archive(source_commit: str) -> bytes:
    with tempfile.TemporaryDirectory() as directory:
        out = Path(directory) / "source.zip"
        subprocess.run(["git", "cat-file", "-e", source_commit + "^{commit}"], check=True)
        subprocess.run(["git", "archive", "--format=zip",
                        "--prefix=doctor-ghezelbaash-source-final-2026-10-10/",
                        "-o", str(out), source_commit], check=True)
        body = out.read_bytes()
    validate_source_archive(body)
    return body


def validate_source_archive(body: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        assert archive.testzip() is None, "Source ZIP is corrupt"
        names = archive.namelist()
        source = archive.read(next(name for name in names if name.endswith("src/canonical/source.mjs")))
        assert b"A5064828898" not in source and b"A5146521397" in source
        assert any(name.endswith("src/lib/shacl-output.mjs") for name in names)


def ensure_no_existing_draft(record_id: str, token: str) -> None:
    try:
        request("GET", f"{ZEN_BASE}/records/{record_id}/draft", token=token)
    except RuntimeError as error:
        if "HTTP 404" in str(error):
            return
        raise
    raise RuntimeError(f"Record {record_id} already has an unpublished draft; refusing to overwrite it")


def discard_draft(record_id: str, token: str) -> None:
    try:
        request("DELETE", f"{ZEN_BASE}/records/{record_id}/draft", token=token, allowed=(200, 202, 204))
    except Exception:
        pass


def verify_live_record(record_id: str, before: dict, expected: dict[str, bytes]) -> dict:
    last = None
    for attempt in range(8):
        try:
            rec, actual = download_record(record_id)
            assert_same_record(before, record_snapshot(rec))
            assert set(actual) == set(expected)
            mismatch = [name for name in expected if actual[name] != expected[name]]
            assert not mismatch, ("Zenodo live readback mismatch", mismatch)
            return rec
        except Exception as error:
            last = error
            if attempt == 7:
                raise
            time.sleep(2 + attempt)
    raise RuntimeError(str(last))


def correct_record_files(record_id: str, before_record: dict, current: dict[str, bytes],
                         desired: dict[str, bytes], token: str, comment: str) -> dict:
    before = record_snapshot(before_record)
    names = changed_names(current, desired)
    if not names:
        rec = verify_live_record(record_id, before, desired)
        print(json.dumps({"record": record_id, "status": "ALREADY_CURRENT", "changedFiles": []}))
        return rec

    ensure_no_existing_draft(record_id, token)
    request("POST", f"{ZEN_BASE}/records/{record_id}/draft", token=token, allowed=(200, 201, 202))
    published = False
    try:
        assert_same_record(before, record_snapshot(record(record_id, token)))
        status, _ = request("POST", f"{ZEN_BASE}/records/{record_id}/file-modification",
                            payload={"reason": "correction", "comment": comment}, token=token,
                            allowed=(200, 201))
        if status != 200:
            raise RuntimeError(f"Zenodo record {record_id} requires moderator approval; no file bytes were published")
        draft = get_json(f"{ZEN_BASE}/records/{record_id}/draft", token)
        files_url = draft.get("links", {}).get("files") or f"{ZEN_BASE}/records/{record_id}/draft/files"
        publish_url = draft.get("links", {}).get("publish") or f"{ZEN_BASE}/records/{record_id}/draft/actions/publish"
        for key in names:
            encoded = urllib.parse.quote(key, safe="")
            try:
                request("DELETE", f"{files_url}/{encoded}", token=token, allowed=(200, 202, 204))
            except RuntimeError as error:
                if "HTTP 404" not in str(error):
                    raise
            request("POST", files_url, payload=[{"key": key}], token=token, allowed=(200, 201))
            request("PUT", f"{files_url}/{encoded}/content", raw=desired[key], token=token,
                    allowed=(200, 201, 202, 204), timeout=180)
            request("POST", f"{files_url}/{encoded}/commit", token=token, allowed=(200, 201, 202, 204))
        request("POST", publish_url, token=token, allowed=(200, 201, 202))
        published = True
    finally:
        if not published:
            discard_draft(record_id, token)

    rec = verify_live_record(record_id, before, desired)
    print(json.dumps({"record": record_id, "doi": before["doi"], "version": before["version"],
                      "status": "VERIFIED_SAME_DOI_VERSION", "changedFiles": names}, ensure_ascii=False))
    return rec


def prepare() -> dict:
    dataset_record, dataset_old = download_record(DATASET_RECORD)
    source_record, source_old = download_record(SOURCE_RECORD)
    dataset_before, source_before = record_snapshot(dataset_record), record_snapshot(source_record)
    assert dataset_before["doi"] == DATASET_DOI and dataset_before["version"] == DATASET_VERSION
    assert source_before["doi"] == SOURCE_DOI and source_before["version"] == SOURCE_VERSION
    assert len(dataset_before["keys"]) == 24 and len(source_before["keys"]) == 1

    source_commit, hf_revision, live_files, manifest = website_snapshot(set(dataset_old))
    website_run_url = github_successful_run(source_commit)
    desired_dataset = merge_matching_files(dataset_old, live_files)
    desired_dataset = final_controls(dataset_old, desired_dataset, source_commit, website_run_url, hf_revision)
    assert set(desired_dataset) == set(dataset_old)
    validate_staged_dataset(desired_dataset, source_commit, hf_revision)

    source_key = source_before["keys"][0]
    desired_source = {source_key: build_source_archive(source_commit)}
    return {
        "dataset_record": dataset_record, "dataset_old": dataset_old, "dataset_desired": desired_dataset,
        "source_record": source_record, "source_old": source_old, "source_desired": desired_source,
        "source_commit": source_commit, "hf_revision": hf_revision,
        "website_run_url": website_run_url, "manifest": manifest,
    }


def public_verify(prepared: dict) -> dict:
    dataset_live = verify_live_record(DATASET_RECORD, record_snapshot(prepared["dataset_record"]), prepared["dataset_desired"])
    source_live = verify_live_record(SOURCE_RECORD, record_snapshot(prepared["source_record"]), prepared["source_desired"])
    validate_staged_dataset(prepared["dataset_desired"], prepared["source_commit"], prepared["hf_revision"])
    validate_source_archive(next(iter(prepared["source_desired"].values())))
    return {
        "dataset": record_snapshot(dataset_live), "source": record_snapshot(source_live),
        "sourceCommit": prepared["source_commit"], "hfRevision": prepared["hf_revision"],
        "datasetChanges": changed_names(prepared["dataset_old"], prepared["dataset_desired"]),
        "sourceChanges": changed_names(prepared["source_old"], prepared["source_desired"]),
    }


def main() -> None:
    assert sys.argv[1:] in ([], ["--apply"]), "Usage: zenodo_in_place_sync.py [--apply]"
    prepared = prepare()
    plan = {
        "mode": "apply" if sys.argv[1:] else "preflight",
        "dataset": record_snapshot(prepared["dataset_record"]),
        "source": record_snapshot(prepared["source_record"]),
        "websiteSourceCommit": prepared["source_commit"],
        "pinnedHuggingFaceRevision": prepared["hf_revision"],
        "websitePublicationRun": prepared["website_run_url"],
        "datasetChangedFiles": changed_names(prepared["dataset_old"], prepared["dataset_desired"]),
        "sourceChangedFiles": changed_names(prepared["source_old"], prepared["source_desired"]),
    }
    print(json.dumps(plan, ensure_ascii=False, indent=2), flush=True)
    if not sys.argv[1:]:
        return
    token = os.environ.get("ZENODO_TOKEN", "")
    if not token:
        raise RuntimeError("Missing ZENODO_TOKEN")
    assert_same_record(record_snapshot(prepared["dataset_record"]), record_snapshot(record(DATASET_RECORD)))
    assert_same_record(record_snapshot(prepared["source_record"]), record_snapshot(record(SOURCE_RECORD)))

    correct_record_files(DATASET_RECORD, prepared["dataset_record"], prepared["dataset_old"],
                         prepared["dataset_desired"], token,
                         "In-place maintenance correction: synchronize the existing v1.3.3 DOI snapshot with the validated live website and its pinned Hugging Face package-only query matrices (typed Croissant, complete SHACL, measured DCAT/Data Package metadata and canonical identifiers), preserving DOI, version and all 24 file keys.")
    correct_record_files(SOURCE_RECORD, prepared["source_record"], prepared["source_old"],
                         prepared["source_desired"], token,
                         "In-place maintenance correction: replace the existing source-final ZIP with the exact source commit currently served by the canonical website, preserving DOI, version and file key.")
    verified = public_verify(prepared)
    print(json.dumps({"liveVerification": "PASS", **verified}, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
