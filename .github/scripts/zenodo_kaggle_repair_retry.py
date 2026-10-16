"""Finish the 2026-10-16 convergence after HF succeeded.

This script deliberately reuses the already-published HF revision, never creates a
Zenodo new version, preserves the existing DOI/version/file-key sets, retries
transient Zenodo 5xx/network failures, and uses curl for large binary uploads.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import platform_publish as pp
from platform_bundle import KAGGLE_REF, build_kaggle, build_zenodo, context, dump, load, sha

BASE = "https://zenodo.org/api"
TARGET_SHA = os.environ["TARGET_SHA"]
HF_REVISION = os.environ["HF_REVISION"]
ZENODO_TOKEN = os.environ["ZENODO_TOKEN"]
HF_TOKEN = os.environ["HF_TOKEN"]
ROOT = Path(os.environ.get("REPAIR_ROOT", "/tmp/platform-repair-retry"))
ROOT.mkdir(parents=True, exist_ok=True)

TRANSIENT = {429, 500, 502, 503, 504}


def _redact(text: str, token: str | None) -> str:
    return text.replace(token, "[redacted]") if token else text


def api_request(method: str, url: str, *, payload=None, token: str | None = None,
                allowed=(200, 201, 202, 204), attempts: int = 8):
    """JSON-oriented request with bounded retry/backoff for transient failures."""
    headers = {"User-Agent": "doctor-ghezelbaash-convergence-repair/2.0", "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        headers["Content-Type"] = "application/json"
    elif method in {"POST", "PUT", "PATCH"}:
        data = b""

    last = None
    for attempt in range(attempts):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                body = response.read()
                if response.status not in allowed:
                    raise RuntimeError((method, url, response.status))
                parsed = json.loads(body) if body and "json" in response.headers.get("Content-Type", "") else body
                return response.status, parsed
        except urllib.error.HTTPError as exc:
            body = _redact(exc.read().decode(errors="replace"), token)
            if exc.code not in TRANSIENT or attempt == attempts - 1:
                raise RuntimeError(f"HTTP {exc.code} {method} {url}: {body[:1200]}") from exc
            last = f"HTTP {exc.code}: {body[:300]}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            if attempt == attempts - 1:
                raise RuntimeError(f"Network failure {method} {url}: {exc}") from exc
            last = repr(exc)
        delay = min(60, 3 * (2 ** attempt))
        print(f"ZENODO_RETRY method={method} attempt={attempt + 1}/{attempts} delay={delay}s reason={last}", flush=True)
        time.sleep(delay)
    raise AssertionError("unreachable")


def get_draft(record_id: str):
    """Return draft JSON or None. 404 is authoritative 'no draft'; 5xx is retried."""
    url = f"{BASE}/records/{record_id}/draft"
    headers = {"User-Agent": "doctor-ghezelbaash-convergence-repair/2.0", "Accept": "application/json", "Authorization": "Bearer " + ZENODO_TOKEN}
    last = None
    for attempt in range(8):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as exc:
            body = _redact(exc.read().decode(errors="replace"), ZENODO_TOKEN)
            if exc.code == 404:
                return None
            if exc.code not in TRANSIENT or attempt == 7:
                raise RuntimeError(f"HTTP {exc.code} GET {url}: {body[:1200]}") from exc
            last = f"HTTP {exc.code}: {body[:300]}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            if attempt == 7:
                raise RuntimeError(f"Network failure GET {url}: {exc}") from exc
            last = repr(exc)
        delay = min(60, 3 * (2 ** attempt))
        print(f"DRAFT_RETRY record={record_id} attempt={attempt + 1}/8 delay={delay}s reason={last}", flush=True)
        time.sleep(delay)
    raise AssertionError("unreachable")


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, path: Path, expected_md5: str | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "curl", "--fail-with-body", "--silent", "--show-error", "--location",
        "--retry", "6", "--retry-all-errors", "--retry-delay", "4",
        "--connect-timeout", "30", "--max-time", "1200", "-o", str(path), url,
    ]
    subprocess.run(cmd, check=True)
    if expected_md5:
        assert md5_file(path) == expected_md5, (path, "download checksum mismatch")


def upload(url: str, path: Path):
    cmd = [
        "curl", "--fail-with-body", "--silent", "--show-error",
        "--retry", "6", "--retry-all-errors", "--retry-delay", "5",
        "--connect-timeout", "30", "--max-time", "1800", "-X", "PUT",
        "-H", "Authorization: Bearer " + ZENODO_TOKEN,
        "-H", "Content-Type: application/octet-stream",
        "--data-binary", "@" + str(path), url,
    ]
    subprocess.run(cmd, check=True)


def fetch_record_files(record_id: str, out: Path):
    _, listing = api_request("GET", f"{BASE}/records/{record_id}/files", token=ZENODO_TOKEN)
    for entry in listing["entries"]:
        key = entry["key"]
        path = out / key
        content_url = f"{BASE}/records/{record_id}/files/{urllib.parse.quote(key, safe='')}/content"
        download(content_url, path, entry["checksum"].removeprefix("md5:"))
    return listing["entries"]


def safe_delete_draft(record_id: str):
    draft = get_draft(record_id)
    if draft is None:
        return
    api_request("DELETE", f"{BASE}/records/{record_id}/draft", token=ZENODO_TOKEN)
    assert get_draft(record_id) is None, (record_id, "draft cleanup failed")


def correct_zenodo(record_id: str, desired: Path, ctx: dict, *, source_archive=False):
    _, original = api_request("GET", f"{BASE}/records/{record_id}", token=ZENODO_TOKEN)
    doi = original.get("doi") or original["pids"]["doi"]["identifier"]
    version = original["metadata"].get("version")
    _, old_listing = api_request("GET", f"{BASE}/records/{record_id}/files", token=ZENODO_TOKEN)
    old = {entry["key"]: entry["checksum"].removeprefix("md5:") for entry in old_listing["entries"]}
    incoming = {p.relative_to(desired).as_posix(): p for p in desired.rglob("*") if p.is_file()}
    assert set(incoming) == set(old), (record_id, "file-key set changed", sorted(set(incoming) ^ set(old)))
    changed = {key: path for key, path in incoming.items() if md5_file(path) != old[key]}

    assert get_draft(record_id) is None, (record_id, "pre-existing draft; refusing to overwrite")
    if changed:
        api_request("POST", f"{BASE}/records/{record_id}/draft", token=ZENODO_TOKEN)
        published = False
        try:
            status, _ = api_request(
                "POST", f"{BASE}/records/{record_id}/file-modification",
                payload={
                    "reason": "correction",
                    "comment": "Correct solo-practice semantic projection and converge verified canonical source "
                               + ctx["source_commit"]
                               + " while preserving the existing DOI, version and filenames.",
                }, token=ZENODO_TOKEN,
            )
            assert status == 200, (record_id, "file modification not approved")
            for key in changed:
                api_request("DELETE", f"{BASE}/records/{record_id}/draft/files/{urllib.parse.quote(key, safe='')}", token=ZENODO_TOKEN)
            api_request("POST", f"{BASE}/records/{record_id}/draft/files", payload=[{"key": key} for key in changed], token=ZENODO_TOKEN)
            for key, path in changed.items():
                quoted = urllib.parse.quote(key, safe="")
                upload(f"{BASE}/records/{record_id}/draft/files/{quoted}/content", path)
                api_request("POST", f"{BASE}/records/{record_id}/draft/files/{quoted}/commit", token=ZENODO_TOKEN)
            api_request("POST", f"{BASE}/records/{record_id}/draft/actions/publish", token=ZENODO_TOKEN)
            published = True
        finally:
            if not published:
                safe_delete_draft(record_id)

    # Preserve DOI/version and existing metadata; only converge description/related links.
    deposition = f"{BASE}/deposit/depositions/{record_id}"
    _, dep = api_request("GET", deposition, token=ZENODO_TOKEN)
    metadata = dep["metadata"]
    description = metadata.get("description", "")
    description = re.sub(r"<p><strong>Publication convergence — 2026-10-(?:12|16):</strong>.*?</p>", "", description, flags=re.S)
    description += (
        f"<p><strong>Publication convergence — 2026-10-16:</strong> Existing DOI {doi} and version {version} remain unchanged. "
        "This record received an in-place maintenance correction aligning the public package with the physician-owned solo-practice model. "
        f"Verified source commit: {ctx['source_commit']}. Publication run: <a href=\"{ctx['run_url']}\">{ctx['run_url']}</a>. "
        f"Hugging Face revision: <a href=\"{ctx['hf']}/tree/{HF_REVISION}\">{HF_REVISION}</a>. "
        f"Website: <a href=\"{ctx['website']}\">canonical website</a>; Kaggle: <a href=\"{ctx['kaggle']}\">current distribution</a>. "
        + ("The source ZIP contains the corrected current canonical source; its existing source-release filename/version is retained."
           if source_archive else "The preserved dataset file set is synchronized to the corrected canonical graph and provenance.")
        + "</p>"
    )
    metadata["description"] = description
    related = list(metadata.get("related_identifiers", []))
    known = {item.get("identifier") for item in related}
    for url in [
        ctx["website"], ctx["hf"] + "/tree/" + HF_REVISION, ctx["kaggle"], ctx["wikidata"], ctx["run_url"],
        "https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/" + ctx["source_commit"],
    ]:
        if url not in known:
            related.append({"identifier": url, "scheme": "url", "relation": "isSupplementTo"})
    metadata["related_identifiers"] = related
    if dep.get("submitted"):
        api_request("POST", deposition + "/actions/edit", token=ZENODO_TOKEN)
    api_request("PUT", deposition, payload={"metadata": metadata}, token=ZENODO_TOKEN)
    api_request("POST", deposition + "/actions/publish", token=ZENODO_TOKEN)

    _, final = api_request("GET", f"{BASE}/records/{record_id}", token=ZENODO_TOKEN)
    final_doi = final.get("doi") or final["pids"]["doi"]["identifier"]
    assert final_doi == doi and final["metadata"].get("version") == version, (record_id, "DOI/version changed")
    _, final_files = api_request("GET", f"{BASE}/records/{record_id}/files", token=ZENODO_TOKEN)
    hashes = {entry["key"]: entry["checksum"].removeprefix("md5:") for entry in final_files["entries"]}
    assert hashes == {key: md5_file(path) for key, path in incoming.items()}, (record_id, "published file hashes differ")
    assert get_draft(record_id) is None, (record_id, "draft remains after publish")
    return {"record": record_id, "doi": doi, "version": version, "files": len(incoming), "changed": len(changed), "DOI_unchanged": True}


def assert_graph(path: Path):
    graph = json.loads(path.read_text())
    person = "https://www.ghezelbaash.ir/#saeed-ghezelbash"
    clinic = "https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
    nodes = {node.get("@id"): node for node in graph.get("@graph", []) if isinstance(node, dict) and node.get("@id")}
    def ids(value):
        values = value if isinstance(value, list) else ([] if value is None else [value])
        return [item.get("@id") if isinstance(item, dict) else item for item in values]
    p, c = nodes[person], nodes[clinic]
    assert not ids(p.get("worksFor"))
    assert clinic not in ids(p.get("affiliation"))
    assert not ids(c.get("employee"))
    assert clinic in ids(p.get("owns")) and clinic in ids(p.get("practicesAt"))
    assert person in ids(c.get("owner")) and person in ids(c.get("founder"))


def main():
    from huggingface_hub import snapshot_download

    ctx = context(TARGET_SHA, os.environ["GITHUB_RUN_ID"])
    report = {"sourceCommit": TARGET_SHA, "publicationRun": ctx["run_url"], "hfRevision": HF_REVISION, "hfReused": True}
    dump(ROOT / "context.json", ctx)
    dump(ROOT / "publication-report.json", report)

    hf = ROOT / "hf"
    snapshot_download(
        "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data",
        repo_type="dataset", revision=HF_REVISION, token=HF_TOKEN, local_dir=hf,
    )
    assert json.loads((hf / "release-provenance.json").read_text())["sourceCommit"] == TARGET_SHA
    assert_graph(hf / "graph.jsonld")
    print("HF_REUSE_VERIFIED", HF_REVISION, flush=True)

    # Reconfirm both records are clean after any transient API trouble.
    assert get_draft("23289009") is None
    assert get_draft("22838416") is None

    # Source record, same single key/DOI/version.
    source_before = ROOT / "zenodo-source-before"
    entries = fetch_record_files("23289009", source_before)
    assert len(entries) == 1 and entries[0]["key"].endswith(".zip")
    source_after = ROOT / "zenodo-source"
    key = entries[0]["key"]
    archive = source_after / key
    archive.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "git", "archive", "--format=zip", "--prefix=doctor-ghezelbaash-source-final-2026-10-10/",
        "-o", str(archive), TARGET_SHA,
    ], check=True)
    with zipfile.ZipFile(archive) as zf:
        assert zf.testzip() is None
        source_name = next(name for name in zf.namelist() if name.endswith("src/canonical/source.mjs"))
        source_text = zf.read(source_name).decode(errors="ignore")
        assert "Medical Director / مدیر پزشکی" not in source_text
        assert 'worksFor: [{ "@id": CLINIC_IRI }]' not in source_text
    report["zenodoSource"] = correct_zenodo("23289009", source_after, ctx, source_archive=True)
    dump(ROOT / "publication-report.json", report)
    print("ZENODO_SOURCE_PASS", report["zenodoSource"], flush=True)

    # Dataset record, same 24-key subset/DOI/version.
    dataset_before = ROOT / "zenodo-before"
    fetch_record_files("22838416", dataset_before)
    dataset_after = ROOT / "zenodo"
    build_zenodo(hf, dataset_before, dataset_after, ctx)
    pp.validate(dataset_after, reader=False)
    assert_graph(dataset_after / "graph.jsonld")
    report["zenodoDataset"] = correct_zenodo("22838416", dataset_after, ctx)
    dump(ROOT / "publication-report.json", report)
    print("ZENODO_DATASET_PASS", report["zenodoDataset"], flush=True)

    # Kaggle only after both Zenodo records are verified.
    previous = ROOT / "kaggle-before"
    previous.mkdir(exist_ok=True)
    subprocess.run(["kaggle", "datasets", "download", KAGGLE_REF, "-p", str(previous), "--unzip", "--force"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["kaggle", "datasets", "metadata", KAGGLE_REF, "-p", str(previous)], check=True, stdout=subprocess.DEVNULL)
    _, view = api_request("GET", "https://www.kaggle.com/api/v1/datasets/view/" + KAGGLE_REF, attempts=4)
    version = int(view["currentVersionNumber"]) + 1
    kg = ROOT / "kaggle"
    description = build_kaggle(hf, previous, kg, ctx, version, HF_REVISION)
    control = load(kg / "dataset-metadata.json")
    target = dict(control.get("info") or control)
    target["id"] = KAGGLE_REF
    target["description"] = description
    dump(kg / "dataset-metadata.json", target)
    pp.validate(kg, reader=False)
    subprocess.run([
        "kaggle", "datasets", "version", "-p", str(kg), "-m",
        "Align public package with verified physician-owned solo-practice semantics", "--dir-mode", "zip",
    ], check=True)
    final = ROOT / "kaggle-live"
    for attempt in range(30):
        shutil.rmtree(final, ignore_errors=True)
        final.mkdir()
        subprocess.run(["kaggle", "datasets", "download", KAGGLE_REF, "-p", str(final), "--unzip", "--force"], check=True, stdout=subprocess.DEVNULL)
        if (final / "kaggle-manifest.json").is_file() and load(final / "kaggle-manifest.json").get("desired_kaggle_version") == version:
            break
        time.sleep(10)
    else:
        raise RuntimeError("Kaggle published package not visible yet")
    pp.validate(final, reader=False)
    subprocess.run(["kaggle", "datasets", "metadata", KAGGLE_REF, "-p", str(kg), "--update"], check=True)
    for line in (final / "checksums.sha256").read_text().splitlines():
        digest, name = line.split("  ", 1)
        assert sha(final / name) == digest, name
    if (final / "graph.jsonld").is_file():
        assert_graph(final / "graph.jsonld")
    report["kaggle"] = {"version": version, "files": sum(p.is_file() for p in final.rglob("*")), "query_bindings": "PASS", "checksums": "PASS"}

    # Final invariants.
    _, latest = api_request("GET", BASE + "/records/22857496/versions/latest", attempts=8)
    assert str(latest["id"]) == "23289009"
    assert report["zenodoSource"]["doi"] == "10.5281/zenodo.23289009"
    assert report["zenodoSource"]["version"] == "source-final-2026-10-10"
    assert report["zenodoDataset"]["doi"] == "10.5281/zenodo.22838416"
    assert report["zenodoDataset"]["version"] == "1.3.3"
    assert get_draft("23289009") is None and get_draft("22838416") is None
    dump(ROOT / "publication-report.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    print("CONVERGENCE_REPAIR_RETRY_FINAL_PASS", flush=True)


if __name__ == "__main__":
    main()
