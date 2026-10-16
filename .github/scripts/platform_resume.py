"""Resume platform convergence after a successful website/Hugging Face publication.

This script deliberately does NOT publish Hugging Face again. It verifies that the
existing Hub revision is already pinned to the live website source commit, then:
1) corrects the existing Zenodo source record in place using the deposition bucket
   streaming upload path (robust for the ~24 MB source archive),
2) corrects the existing Zenodo dataset record in place while preserving DOI,
   version, and file keys,
3) publishes and verifies the Kaggle package from that already-published HF revision.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from huggingface_hub import snapshot_download

from platform_bundle import DATASET, HF_REPO, KAGGLE_REF, build_kaggle, build_zenodo, context, load, dump, sha
import platform_publish as pub

ZEN_BASE = "https://zenodo.org/api"
ORIGIN = "https://www.ghezelbaash.ir"
SOURCE_RECORD = "23289009"
SOURCE_DOI = "10.5281/zenodo.23289009"
SOURCE_VERSION = "source-final-2026-10-10"
SOURCE_KEY = "medicaldoctor91/doctor-ghezelbaash-source-final-2026-10-10.zip"
DATASET_RECORD = "22838416"
DATASET_DOI = "10.5281/zenodo.22838416"
DATASET_VERSION = "1.3.3"
SOURCE_PREFIX = "doctor-ghezelbaash-source-final-2026-10-10/"


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def request(method: str, url: str, *, token: str | None = None, payload=None,
            allowed=(200,), parse_json=True, timeout=180):
    if token and not url.startswith(ZEN_BASE + "/"):
        raise RuntimeError("Refusing to send Zenodo credential to non-Zenodo host")
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache, no-store, max-age=0",
        "Pragma": "no-cache",
        "User-Agent": "doctor-ghezelbaash-platform-resume/2026-10-16",
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
                return response.status, (json.loads(body) if body and "json" in ctype else body)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            if token:
                body = body.replace(token, "[redacted]")
            last = RuntimeError(f"HTTP {error.code} {method} {url}: {body[:900]}")
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


def verify_existing_hf(info: dict, matrix: dict, target_source_commit: str) -> str:
    assert info.get("sha"), "Hugging Face revision missing"
    assert matrix.get("websiteSourceCommit") == target_source_commit, (
        "Hugging Face is not pinned to the live website source commit",
        matrix.get("websiteSourceCommit"), target_source_commit,
    )
    assert matrix.get("canonicalDatasetIri") == DATASET
    return info["sha"]


def bucket_upload_command(path: str, url: str, token: str) -> list[str]:
    assert url.startswith(ZEN_BASE + "/files/"), url
    return [
        "curl", "--fail-with-body", "--silent", "--show-error",
        "--retry", "4", "--retry-all-errors", "--retry-delay", "2",
        "--retry-max-time", "900", "--connect-timeout", "20",
        "--max-time", "600", "--speed-time", "90", "--speed-limit", "1024",
        "--http1.1", "--expect100-timeout", "5",
        "-H", "Content-Type: application/zip",
        "-H", "Authorization: Bearer " + token,
        "--upload-file", path, url,
    ]


def robust_bucket_upload(url: str, data: bytes, token: str) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / "source.zip"
        path.write_bytes(data)
        result = subprocess.run(
            bucket_upload_command(str(path), url, token),
            capture_output=True, text=True, timeout=1000,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "curl upload failed").replace(token, "[redacted]")
            raise RuntimeError(detail[:1200])
        try:
            uploaded = json.loads(result.stdout) if result.stdout.strip() else {}
        except json.JSONDecodeError as error:
            raise RuntimeError("Zenodo bucket upload returned non-JSON response") from error
    if uploaded:
        assert uploaded.get("key") == SOURCE_KEY, uploaded
        assert int(uploaded.get("size", -1)) == len(data), uploaded
        assert uploaded.get("checksum") == "md5:" + md5(data), uploaded
    return uploaded


def live_source_commit() -> str:
    url = ORIGIN + "/release-provenance.json?_cb=" + str(time.time_ns())
    value = get_json(url)
    commit = value.get("sourceCommit")
    assert isinstance(commit, str) and len(commit) == 40, value
    return commit


def hf_snapshot_for_source(source_commit: str, token: str) -> tuple[str, pathlib.Path, dict]:
    info = get_json("https://huggingface.co/api/datasets/" + HF_REPO)
    revision = info["sha"]
    root = pathlib.Path(snapshot_download(HF_REPO, repo_type="dataset", revision=revision, token=token))
    matrix = load(root / "current-release-matrix.json")
    verify_existing_hf(info, matrix, source_commit)
    inventory = load(root / "dist-sha256.json")
    assert inventory.get("sourceCommit") == source_commit
    assert inventory.get("canonicalDatasetIri") == DATASET
    return revision, root, matrix


def build_source_archive(source_commit: str) -> bytes:
    subprocess.run(["git", "cat-file", "-e", source_commit + "^{commit}"], check=True)
    with tempfile.TemporaryDirectory() as directory:
        out = pathlib.Path(directory) / "source.zip"
        subprocess.run([
            "git", "archive", "--format=zip", "--prefix=" + SOURCE_PREFIX,
            "-o", str(out), source_commit,
        ], check=True)
        data = out.read_bytes()
    with zipfile.ZipFile(pathlib.Path(tempfile.gettempdir()) / "noop.zip", "w") if False else zipfile.ZipFile(__import__("io").BytesIO(data)) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        source_name = next(name for name in names if name.endswith("src/canonical/source.mjs"))
        source = archive.read(source_name)
        assert b"worksFor" not in source
        assert b"Medical Director" not in source
        assert b"A5064828898" not in source
        assert b"A5146521397" in source
    return data


def source_identity(rec: dict) -> dict:
    doi = rec.get("doi") or rec.get("pids", {}).get("doi", {}).get("identifier")
    return {
        "id": int(rec["id"]),
        "doi": doi,
        "version": rec.get("metadata", {}).get("version"),
        "keys": tuple(sorted(item["key"] for item in rec.get("files", []))),
    }


def deposition_files(value) -> list[dict]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return value.get("entries", [])
    return []


def discard_draft(token: str) -> None:
    dep_url = f"{ZEN_BASE}/deposit/depositions/{SOURCE_RECORD}"
    try:
        dep = get_json(dep_url, token)
        discard = dep.get("links", {}).get("discard")
        if discard and dep.get("submitted") is False:
            request("POST", discard, token=token, allowed=(200, 201, 202, 204))
            return
    except Exception:
        pass
    try:
        request("DELETE", f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token=token, allowed=(200, 202, 204))
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise


def correct_source_record(source_commit: str, token: str) -> dict:
    desired = build_source_archive(source_commit)
    before = get_json(f"{ZEN_BASE}/records/{SOURCE_RECORD}", token)
    ident = source_identity(before)
    assert ident["doi"] == SOURCE_DOI, ident
    assert ident["version"] == SOURCE_VERSION, ident
    assert ident["keys"] == (SOURCE_KEY,), ident
    entry = next(item for item in before["files"] if item["key"] == SOURCE_KEY)
    current_md5 = entry.get("checksum", "").removeprefix("md5:")
    if int(entry.get("size", -1)) == len(desired) and current_md5 == md5(desired):
        return {"record": SOURCE_RECORD, "status": "ALREADY_CURRENT", "doi": SOURCE_DOI, "version": SOURCE_VERSION}

    try:
        get_json(f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token)
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise
    else:
        raise RuntimeError("Source record already has an unpublished draft; refusing concurrent overwrite")

    request("POST", f"{ZEN_BASE}/records/{SOURCE_RECORD}/draft", token=token, allowed=(200, 201, 202))
    published = False
    try:
        status, _ = request(
            "POST", f"{ZEN_BASE}/records/{SOURCE_RECORD}/file-modification",
            token=token,
            payload={
                "reason": "correction",
                "comment": "In-place source correction to the verified live canonical source; preserve DOI, version, and file key.",
            },
            allowed=(200, 201),
        )
        if status != 200:
            raise RuntimeError("Zenodo source file modification requires moderator approval")
        dep_url = f"{ZEN_BASE}/deposit/depositions/{SOURCE_RECORD}"
        draft = get_json(dep_url, token)
        assert draft.get("submitted") is False
        files_url = draft.get("links", {}).get("files") or dep_url + "/files"
        publish_url = draft.get("links", {}).get("publish") or dep_url + "/actions/publish"
        bucket = draft.get("links", {}).get("bucket")
        if not isinstance(bucket, str) or not bucket.startswith(ZEN_BASE + "/files/"):
            raise RuntimeError("Zenodo deposition did not expose a trusted links.bucket endpoint")
        upload_url = bucket.rstrip("/") + "/" + urllib.parse.quote(SOURCE_KEY, safe="")

        existing = deposition_files(get_json(files_url, token))
        matches = [f for f in existing if (f.get("filename") or f.get("name") or f.get("key")) == SOURCE_KEY]
        assert len(matches) == 1, existing
        file_id = matches[0].get("id")
        assert file_id
        request("DELETE", files_url.rstrip("/") + "/" + urllib.parse.quote(str(file_id), safe=""), token=token, allowed=(200, 202, 204))
        robust_bucket_upload(upload_url, desired, token)

        after_upload = deposition_files(get_json(files_url, token))
        matches = [f for f in after_upload if (f.get("filename") or f.get("name") or f.get("key")) == SOURCE_KEY]
        assert len(matches) == 1, after_upload
        uploaded = matches[0]
        size = uploaded.get("filesize") if uploaded.get("filesize") is not None else uploaded.get("size")
        checksum = str(uploaded.get("checksum", ""))
        checksum = checksum if checksum.startswith("md5:") else "md5:" + checksum
        assert int(size) == len(desired)
        assert checksum == "md5:" + md5(desired)
        request("POST", publish_url, token=token, allowed=(200, 201, 202))
        published = True
    finally:
        if not published:
            discard_draft(token)

    final = get_json(f"{ZEN_BASE}/records/{SOURCE_RECORD}?_cb={time.time_ns()}")
    final_ident = source_identity(final)
    assert final_ident == ident, ("Zenodo source identity changed", ident, final_ident)
    body = get_bytes(f"{ZEN_BASE}/records/{SOURCE_RECORD}/files/{urllib.parse.quote(SOURCE_KEY, safe='')}/content?_cb={time.time_ns()}", timeout=900)
    assert md5(body) == md5(desired)
    return {"record": SOURCE_RECORD, "status": "CORRECTED", "doi": SOURCE_DOI, "version": SOURCE_VERSION, "bytes": len(body)}


def correct_dataset_record(hf_root: pathlib.Path, hf_revision: str, source_commit: str, token: str, run_id: str) -> dict:
    ctx = context(source_commit, run_id)
    ctx["hf_revision"] = hf_revision
    with tempfile.TemporaryDirectory() as directory:
        base = pathlib.Path(directory)
        previous = base / "zenodo-before"
        desired = base / "zenodo"
        previous.mkdir()
        pub.fetch_zenodo_files(DATASET_RECORD, previous)
        build_zenodo(hf_root, previous, desired, ctx)
        pub.validate(desired, reader=False)
        return pub.correct_zenodo_record(DATASET_RECORD, desired, token, ctx, hf_revision)


def publish_kaggle(hf_root: pathlib.Path, hf_revision: str, source_commit: str, run_id: str) -> dict:
    ctx = context(source_commit, run_id)
    ctx["hf_revision"] = hf_revision
    with tempfile.TemporaryDirectory() as directory:
        base = pathlib.Path(directory)
        previous = base / "kaggle-before"
        previous.mkdir()
        subprocess.run(["kaggle", "datasets", "download", KAGGLE_REF, "-p", str(previous), "--unzip", "--force"], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["kaggle", "datasets", "metadata", KAGGLE_REF, "-p", str(previous)], check=True, stdout=subprocess.DEVNULL)
        _, view = pub.request("GET", "https://www.kaggle.com/api/v1/datasets/view/" + KAGGLE_REF)
        version = int(view["currentVersionNumber"]) + 1
        out = base / "kaggle"
        description = build_kaggle(hf_root, previous, out, ctx, version, hf_revision)
        control = load(out / "dataset-metadata.json")
        target = dict(control.get("info") or control)
        target["id"] = KAGGLE_REF
        target["description"] = description
        dump(out / "dataset-metadata.json", target)
        pub.validate(out, reader=False)
        subprocess.run([
            "kaggle", "datasets", "version", "-p", str(out),
            "-m", "Converge corrected solo-practice canonical graph and verified provenance",
            "--dir-mode", "zip",
        ], check=True)
        final = base / "kaggle-live"
        for _ in range(30):
            shutil.rmtree(final, ignore_errors=True)
            final.mkdir()
            subprocess.run(["kaggle", "datasets", "download", KAGGLE_REF, "-p", str(final), "--unzip", "--force"], check=True, stdout=subprocess.DEVNULL)
            manifest = final / "kaggle-manifest.json"
            if manifest.is_file() and load(manifest).get("desired_kaggle_version") == version:
                break
            time.sleep(10)
        else:
            raise RuntimeError("Kaggle published package not visible yet")
        pub.validate(final, reader=False)
        subprocess.run(["kaggle", "datasets", "metadata", KAGGLE_REF, "-p", str(out), "--update"], check=True)
        for line in (final / "checksums.sha256").read_text().splitlines():
            digest, name = line.split("  ", 1)
            assert sha(final / name) == digest, name
        return {"version": version, "files": sum(p.is_file() for p in final.rglob("*")), "checksums": "PASS"}


def main() -> None:
    hf_token = os.environ["HF_TOKEN"]
    zenodo_token = os.environ["ZENODO_TOKEN"]
    source_commit = live_source_commit()
    hf_revision, hf_root, _ = hf_snapshot_for_source(source_commit, hf_token)
    report = {
        "sourceCommit": source_commit,
        "hfRevision": hf_revision,
        "hf": "VERIFIED_EXISTING_NO_REPUBLISH",
    }
    print(json.dumps(report, indent=2), flush=True)

    report["zenodoSource"] = correct_source_record(source_commit, zenodo_token)
    print(json.dumps(report, indent=2), flush=True)

    report["zenodoDataset"] = correct_dataset_record(hf_root, hf_revision, source_commit, zenodo_token, os.environ["GITHUB_RUN_ID"])
    print(json.dumps(report, indent=2), flush=True)

    report["kaggle"] = publish_kaggle(hf_root, hf_revision, source_commit, os.environ["GITHUB_RUN_ID"])
    report_path = pathlib.Path("/tmp/platform-resume-report.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
