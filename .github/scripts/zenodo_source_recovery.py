"""Recover only the existing Zenodo source archive in place.

The dataset record is read-only in this recovery. Its DOI/version/file metadata
fingerprint is captured before the source write and must be byte-for-byte
metadata-identical afterward. The source record keeps the same DOI, version and
file key. Upload uses curl retries and a long timeout, then public Zenodo bytes
are downloaded and compared with the exact git archive built from the live
website source commit.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ZEN_BASE = "https://zenodo.org/api"
ORIGIN = "https://www.ghezelbaash.ir"
DATASET_RECORD = "22838416"
DATASET_DOI = "10.5281/zenodo.22838416"
DATASET_VERSION = "1.3.3"
SOURCE_RECORD = "23289009"
SOURCE_DOI = "10.5281/zenodo.23289009"
SOURCE_VERSION = "source-final-2026-10-10"
SOURCE_KEY = "medicaldoctor91/doctor-ghezelbaash-source-final-2026-10-10.zip"
DATASET_IRI = ORIGIN + "/graph.jsonld/dataset"
SOURCE_PREFIX = "doctor-ghezelbaash-source-final-2026-10-10/"


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def request(method: str, url: str, *, token: str | None = None, payload=None,
            allowed=(200,), parse_json=True, timeout=180):
    if token and not url.startswith(ZEN_BASE + "/"):
        raise RuntimeError("Refusing to send Zenodo credential to a non-Zenodo host")
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "doctor-ghezelbaash-zenodo-source-recovery/2026-10-14",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif method in {"POST", "PUT", "PATCH"}:
        data = b""
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    attempts = 4 if method == "GET" else 1
    last = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                body = response.read()
                if response.status not in allowed:
                    raise RuntimeError(f"{method} {url}: unexpected HTTP {response.status}")
                if not parse_json:
                    return response.status, body
                ctype = response.headers.get("Content-Type", "")
                if body and "json" in ctype:
                    return response.status, json.loads(body)
                return response.status, body
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            if token:
                body = body.replace(token, "[redacted]")
            last = RuntimeError(f"HTTP {error.code} {method} {url}: {body[:800]}")
            if method != "GET" or error.code < 500 or attempt == attempts - 1:
                raise last from error
        except (urllib.error.URLError, TimeoutError) as error:
            last = error
            if method != "GET" or attempt == attempts - 1:
                raise
        time.sleep(2 + attempt)
    raise RuntimeError(str(last))


def get_json(url: str, token: str | None = None) -> dict:
    return request("GET", url, token=token)[1]


def get_bytes(url: str, token: str | None = None, timeout=600) -> bytes:
    return request("GET", url, token=token, parse_json=False, timeout=timeout)[1]


def record(record_id: str, token: str | None = None) -> dict:
    return get_json(f"{ZEN_BASE}/records/{record_id}", token)


def record_identity(rec: dict) -> dict:
    doi = rec.get("doi") or rec.get("pids", {}).get("doi", {}).get("identifier")
    return {
        "id": int(rec["id"]),
        "doi": doi,
        "version": rec.get("metadata", {}).get("version"),
        "keys": tuple(sorted(item["key"] for item in rec.get("files", []))),
    }


def dataset_fingerprint(rec: dict) -> tuple:
    return tuple(sorted(
        (item["key"], int(item.get("size", -1)), item.get("checksum", ""))
        for item in rec.get("files", [])
    ))


def source_file_matches(entry: dict, desired: bytes) -> bool:
    checksum = entry.get("checksum", "")
    live_md5 = checksum.split(":", 1)[1] if checksum.startswith("md5:") else None
    return int(entry.get("size", -1)) == len(desired) and live_md5 == md5(desired)


def record_content(record_id: str, key: str, token: str | None = None, timeout=600) -> bytes:
    encoded = urllib.parse.quote(key, safe="")
    return get_bytes(f"{ZEN_BASE}/records/{record_id}/files/{encoded}/content", token, timeout)


def typed_contributor(value) -> bool:
    vals = value if isinstance(value, list) else [value]
    for item in vals:
        if not isinstance(item, dict):
            continue
        types = item.get("@type", [])
        types = types if isinstance(types, list) else [types]
        if any(str(t).endswith(("Person", "Organization")) for t in types):
            return True
    return False


def validate_dataset_public() -> tuple[dict, tuple, str]:
    rec = record(DATASET_RECORD)
    ident = record_identity(rec)
    assert ident["doi"] == DATASET_DOI, ident
    assert ident["version"] == DATASET_VERSION, ident
    assert len(ident["keys"]) == 24, ident

    def body(name: str) -> bytes:
        return record_content(DATASET_RECORD, name)

    croissant = json.loads(body("croissant.json"))
    assert croissant.get("@id") == DATASET_IRI
    assert typed_contributor(croissant.get("creator"))
    assert typed_contributor(croissant.get("publisher"))

    shapes = body("shapes.ttl").decode("utf-8")
    shape_count = shapes.count("<http://www.w3.org/ns/shacl#NodeShape>") + shapes.count("sh:NodeShape")
    assert shape_count == 65, shape_count

    dcat = body("dcat.ttl").decode("utf-8")
    for marker in ("dcat:byteSize", "spdx:checksum", "spdx:checksumAlgorithm_sha256",
                   "https://www.iana.org/assignments/media-types/"):
        assert marker in dcat, marker

    package = json.loads(body("datapackage.json"))
    assert package.get("resources")

    matrix = json.loads(body("current-release-matrix.json"))
    attestation = json.loads(body("release-attestation.json"))
    source_commit = matrix.get("websiteSourceCommit")
    assert source_commit and source_commit == attestation.get("sourceCommit")
    assert matrix.get("canonicalDatasetIri") == DATASET_IRI
    assert attestation.get("canonicalDatasetIri") == DATASET_IRI
    assert matrix.get("publicationScope") == ["zenodo_dataset", "zenodo_source"]
    assert attestation.get("version") == DATASET_VERSION

    live_site = get_json(ORIGIN + "/release-provenance.json?zenodo-source-recovery=20261014")
    assert live_site.get("sourceCommit") == source_commit
    return rec, dataset_fingerprint(rec), source_commit


def build_source_archive(source_commit: str) -> bytes:
    subprocess.run(["git", "cat-file", "-e", source_commit + "^{commit}"], check=True)
    with tempfile.TemporaryDirectory() as directory:
        out = pathlib.Path(directory) / "source.zip"
        subprocess.run([
            "git", "archive", "--format=zip", "--prefix=" + SOURCE_PREFIX,
            "-o", str(out), source_commit,
        ], check=True)
        data = out.read_bytes()
    validate_source_archive(data)
    return data


def validate_source_archive(data: bytes) -> None:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        source_name = next(name for name in names if name.endswith("src/canonical/source.mjs"))
        source = archive.read(source_name)
        assert b"A5064828898" not in source
        assert b"A5146521397" in source
        assert any(name.endswith("src/lib/shacl-output.mjs") for name in names)


def assert_source_identity(rec: dict) -> None:
    ident = record_identity(rec)
    assert ident["doi"] == SOURCE_DOI, ident
    assert ident["version"] == SOURCE_VERSION, ident
    assert ident["keys"] == (SOURCE_KEY,), ident


def draft_exists(token: str) -> bool:
    try:
        request("GET", f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token=token)
        return True
    except RuntimeError as error:
        if "HTTP 404" in str(error):
            return False
        raise


def discard_draft(token: str) -> None:
    try:
        request("DELETE", f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token=token,
                allowed=(200, 202, 204))
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise


def robust_upload(url: str, data: bytes, token: str) -> None:
    if not url.startswith(ZEN_BASE + "/"):
        raise RuntimeError("Refusing upload to non-Zenodo host")
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / "source.zip"
        path.write_bytes(data)
        command = [
            "curl", "--fail-with-body", "--silent", "--show-error",
            "--retry", "5", "--retry-all-errors", "--retry-delay", "5",
            "--connect-timeout", "30", "--max-time", "1800",
            "-X", "PUT",
            "-H", "Content-Type: application/octet-stream",
            "-H", "Authorization: Bearer " + token,
            "--upload-file", str(path), url,
        ]
        subprocess.run(command, check=True)


def replace_source_in_place(desired: bytes, token: str) -> None:
    before = record(SOURCE_RECORD, token)
    assert_source_identity(before)
    if draft_exists(token):
        raise RuntimeError("Source record already has an unpublished draft; refusing to overwrite it")

    request("POST", f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token=token,
            allowed=(200, 201, 202))
    published = False
    try:
        fresh = record(SOURCE_RECORD, token)
        assert_source_identity(fresh)
        endpoint = fresh.get("links", {}).get("file_modification") or f"{ZEN_BASE}/records/{SOURCE_RECORD}/file-modification"
        status, _ = request(
            "POST", endpoint,
            token=token,
            payload={
                "reason": "correction",
                "comment": "Source-only in-place recovery: replace the existing source-final ZIP with the exact source commit already attested by the corrected Zenodo v1.3.3 dataset, preserving DOI, version and file key.",
            },
            allowed=(200, 201),
        )
        if status != 200:
            raise RuntimeError("Zenodo source file modification requires moderator approval")

        draft = get_json(f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token)
        files_url = draft.get("links", {}).get("files") or f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft/files"
        publish_url = draft.get("links", {}).get("publish") or f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft/actions/publish"
        encoded = urllib.parse.quote(SOURCE_KEY, safe="")
        try:
            request("DELETE", f"{files_url}/{encoded}", token=token, allowed=(200, 202, 204))
        except RuntimeError as error:
            if "HTTP 404" not in str(error):
                raise
        request("POST", files_url, token=token, payload=[{"key": SOURCE_KEY}], allowed=(200, 201))
        robust_upload(f"{files_url}/{encoded}/content", desired, token)
        request("POST", f"{files_url}/{encoded}/commit", token=token, allowed=(200, 201, 202, 204))
        request("POST", publish_url, token=token, allowed=(200, 201, 202))
        published = True
    finally:
        if not published:
            discard_draft(token)


def verify_public_source(desired: bytes) -> dict:
    last = None
    for attempt in range(12):
        try:
            rec = record(SOURCE_RECORD)
            assert_source_identity(rec)
            entry = rec["files"][0]
            assert source_file_matches(entry, desired), {
                "liveSize": entry.get("size"), "liveChecksum": entry.get("checksum"),
                "desiredSize": len(desired), "desiredMd5": md5(desired),
            }
            public = record_content(SOURCE_RECORD, SOURCE_KEY, timeout=900)
            assert public == desired, "Public source ZIP bytes differ from exact git archive"
            validate_source_archive(public)
            return rec
        except Exception as error:
            last = error
            if attempt == 11:
                raise
            time.sleep(3 + attempt)
    raise RuntimeError(str(last))


def main() -> None:
    if sys.argv[1:] not in ([], ["--apply"]):
        raise SystemExit("Usage: zenodo_source_recovery.py [--apply]")

    dataset_before, dataset_fp, source_commit = validate_dataset_public()
    source_before = record(SOURCE_RECORD)
    assert_source_identity(source_before)
    desired = build_source_archive(source_commit)
    current_entry = source_before["files"][0]

    plan = {
        "mode": "apply" if sys.argv[1:] else "preflight",
        "dataset": record_identity(dataset_before),
        "source": record_identity(source_before),
        "websiteSourceCommit": source_commit,
        "liveSourceBytes": current_entry.get("size"),
        "liveSourceChecksum": current_entry.get("checksum"),
        "desiredSourceBytes": len(desired),
        "desiredSourceMd5": md5(desired),
        "alreadyCurrent": source_file_matches(current_entry, desired),
    }
    print(json.dumps(plan, ensure_ascii=False, indent=2))

    if not sys.argv[1:]:
        return

    token = os.environ.get("ZENODO_TOKEN", "")
    if not token:
        raise RuntimeError("Missing ZENODO_TOKEN")

    if not source_file_matches(current_entry, desired):
        replace_source_in_place(desired, token)

    verified_source = verify_public_source(desired)
    assert not draft_exists(token), "Published source record still exposes an unpublished draft"

    dataset_after = record(DATASET_RECORD)
    assert record_identity(dataset_after) == record_identity(dataset_before)
    assert dataset_fingerprint(dataset_after) == dataset_fp, "Dataset record changed during source-only recovery"
    validate_dataset_public()

    print(json.dumps({
        "liveVerification": "PASS",
        "datasetUnchanged": True,
        "source": record_identity(verified_source),
        "sourceBytes": verified_source["files"][0].get("size"),
        "sourceChecksum": verified_source["files"][0].get("checksum"),
        "sourceSha256": sha256(desired),
        "websiteSourceCommit": source_commit,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
