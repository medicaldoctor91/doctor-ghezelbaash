"""One-time, guarded repair of the v1.3.3 distribution integrity metadata.

Run without tokens for a public preflight. GitHub Actions supplies scoped tokens
only after the website build and public release identities pass validation.
"""

import hashlib
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

RELEASE = "1.3.3"
RECORD = "22838416"
DOI = "10.5281/zenodo.22838416"
DATASET_IRI = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
HF_REPO = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
HF_BEFORE = "b706fa7c2d196eec3c70c146d4191fb14f028de3"
FROZEN_TAG = "358bbf8b3f1255f55b2da6e2626e4f741b61c40f"
HTML_SHA = "569fe65382b6891ccf3df046d6c8acb50df584b3018c327c5553900809d6c6a8"
OLD_HF_SHA = "ad0a7aaa2cec6d9d91b73fc7e9a242a97b4771977efa3a72845d30f871a3bce7"
OLD_ZEN_SHA = "3894c6a7d4620c9b81257ac30ef9286917f95c96009e9279fceb8bc355899ac4"
HF_BASE = f"https://huggingface.co/datasets/{HF_REPO}"
ZEN_BASE = "https://zenodo.org/api"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(url, method="GET", data=None, token=None, content_type=None, allowed=(200,)):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if "ghezelbaash.ir" in url:
        headers["User-Agent"] = "Mozilla/5.0"
    if token is not None:
        if not url.startswith("https://zenodo.org/api/"):
            raise RuntimeError("Refusing to send Zenodo token to another host")
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = response.read()
            if response.status not in allowed:
                raise RuntimeError(f"{method} {url}: unexpected HTTP {response.status}")
            return response.status, result
    except urllib.error.HTTPError as error:
        # Credentials are always headers and must never be logged.
        raise RuntimeError(f"{method} {url}: HTTP {error.code}") from error


def public_file(name):
    return fetch(f"{ZEN_BASE}/records/{RECORD}/files/{name}/content")[1]


def hf_file(sha, name):
    return fetch(f"{HF_BASE}/resolve/{sha}/{name}?download=true")[1]


def require_identity():
    release = json.loads(Path("src/data/release.json").read_bytes())
    assert release["release"] == RELEASE
    assert str(release["dataset"]["zenodo"]["recordId"]) == RECORD
    assert release["dataset"]["zenodo"]["versionDoi"] == DOI
    assert release["dataset"]["id"] == DATASET_IRI
    assert release["dataset"]["huggingFace"]["dataset"].removeprefix(
        "https://huggingface.co/datasets/"
    ) == HF_REPO
    local = Path("dist/index.html").read_bytes()
    assert digest(local) == HTML_SHA and len(local) == 1966633
    live = fetch("https://www.ghezelbaash.ir/?integrity-repair=20260923")[1]
    assert local == live, "Build and live website differ"
    return local


def planned_hf_changes():
    info = json.loads(fetch(f"https://huggingface.co/api/datasets/{HF_REPO}")[1])
    sha = info["sha"]
    assert info["id"] == HF_REPO
    assert hf_file(sha, "index.html") == Path("dist/index.html").read_bytes()
    manifest_bytes = hf_file(sha, "dist-sha256.json")
    card_bytes = hf_file(sha, "README.md")
    manifest = json.loads(manifest_bytes)
    assert (manifest["release"], manifest["canonicalDatasetIri"], manifest["zenodoVersionDoi"]) == (
        RELEASE, DATASET_IRI, DOI
    )
    assert len(manifest["files"]) == 32
    entry = manifest["files"]["index.html"]
    assert entry["sha256"] in (OLD_HF_SHA, HTML_SHA)
    if entry["sha256"] == OLD_HF_SHA:
        assert entry["bytes"] == 1965211
    else:
        assert entry["bytes"] == 1966633
    assert digest(card_bytes) == manifest["files"]["README.md"]["sha256"]
    assert len(card_bytes) == manifest["files"]["README.md"]["bytes"]

    card = card_bytes.decode("utf-8")
    old_claim = "and all other canonical release resources are preserved unchanged."
    new_claim = "and the other canonical graph and data resources are preserved unchanged."
    old_history = (
        "Current `main` adds Viewer packaging revision **1** and this expanded card; "
        "these access derivatives are separate from the DOI snapshot."
    )
    new_history = (
        "Current `main` includes Viewer packaging revision **1**, this expanded card, "
        "and a later presentation-only microdata correction to `index.html`. "
        "The frozen tag retains the original HTML; the Zenodo record received "
        "that minor correction under the existing DOI. The canonical graph and "
        "data tables remain unchanged."
    )
    if old_claim in card:
        assert card.count(old_claim) == 1
        card = card.replace(old_claim, new_claim)
    else:
        assert new_claim in card
    if old_history in card:
        assert card.count(old_history) == 1
        card = card.replace(old_history, new_history)
    else:
        assert new_history in card
    new_card = card.encode("utf-8")
    entry.update(bytes=1966633, sha256=HTML_SHA)
    manifest["files"]["README.md"].update(bytes=len(new_card), sha256=digest(new_card))
    new_manifest = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    assert json.loads(new_manifest)["files"]["index.html"]["sha256"] == HTML_SHA
    return sha, manifest_bytes, card_bytes, new_manifest, new_card


def planned_zenodo_changes():
    record = json.loads(fetch(f"{ZEN_BASE}/records/{RECORD}")[1])
    assert record["id"] == int(RECORD) and record["doi"] == DOI
    assert record["metadata"]["version"] == RELEASE
    assert len(record["files"]) == 24
    files = {entry["key"]: entry for entry in record["files"]}
    current = {}
    planned = {}
    for name, key in (
        ("dist-sha256.json", "index.html"),
        ("release-attestation.json", "indexHtmlSha256"),
    ):
        original = public_file(name)
        assert len(original) == files[name]["size"]
        assert "md5:" + hashlib.md5(original).hexdigest() == files[name]["checksum"]
        document = json.loads(original)
        assert document[key] in (OLD_ZEN_SHA, HTML_SHA)
        if name == "dist-sha256.json":
            assert len(document) == 103
        else:
            assert document["release"] == RELEASE
            assert document["zenodoVersionDoi"] == DOI
            assert document["distFileCount"] == 103
        assert original.count(document[key].encode()) == 1
        replacement = original.replace(document[key].encode(), HTML_SHA.encode())
        assert json.loads(replacement)[key] == HTML_SHA
        current[name], planned[name] = original, replacement
    assert public_file("index.html") == Path("dist/index.html").read_bytes()
    return current, planned


def update_hf(before, original_manifest, original_card, manifest, card, token):
    from huggingface_hub import CommitOperationAdd, HfApi

    api = HfApi(endpoint="https://huggingface.co", token=token)
    assert str(api.whoami().get("name", "")).casefold() == "ghezelbaash"
    main = api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision="main")
    assert main.sha == before, "HF main advanced since preflight"
    frozen = api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision=f"v{RELEASE}")
    assert frozen.sha == FROZEN_TAG, "Frozen tag changed"
    if manifest != original_manifest or card != original_card:
        assert before == HF_BEFORE, "Refusing to modify an unreviewed HF revision"
        with tempfile.TemporaryDirectory() as directory:
            targets = []
            for name, contents in (("dist-sha256.json", manifest), ("README.md", card)):
                file = Path(directory) / name
                file.write_bytes(contents)
                if contents != (original_manifest if name == "dist-sha256.json" else original_card):
                    targets.append(CommitOperationAdd(path_in_repo=name, path_or_fileobj=str(file)))
            result = api.create_commit(
                repo_id=HF_REPO,
                repo_type="dataset",
                revision="main",
                parent_commit=before,
                operations=targets,
                create_pr=False,
                commit_message=f"Correct v{RELEASE} current HTML checksum and card provenance",
                commit_description="Same DOI and frozen tag; only current integrity metadata and explanatory card.",
            )
            assert result.oid and result.oid != before
    latest = api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision="main")
    assert hf_file(latest.sha, "dist-sha256.json") == manifest
    assert hf_file(latest.sha, "README.md") == card
    assert hf_file(latest.sha, "index.html") == Path("dist/index.html").read_bytes()
    assert api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision=f"v{RELEASE}").sha == FROZEN_TAG
    print(json.dumps({"hf": "VERIFIED", "before": before, "after": latest.sha, "htmlSha256": HTML_SHA}))


def update_zenodo(current, planned, token):
    if all(current[name] == planned[name] for name in planned):
        print(json.dumps({"zenodo": "ALREADY_CORRECT", "record": RECORD}))
        return

    def call(url, method="GET", data=None, content_type=None, allowed=(200,)):
        return fetch(url, method, data, token, content_type, allowed)

    try:
        call(f"{ZEN_BASE}/records/{RECORD}/draft", "POST", b"{}", "application/json", (200, 201, 202))
    except RuntimeError as error:
        if "HTTP 409" not in str(error):
            raise
    draft = json.loads(call(f"{ZEN_BASE}/records/{RECORD}/draft")[1])
    pub = json.loads(call(f"{ZEN_BASE}/records/{RECORD}")[1])
    assert pub["doi"] == DOI and pub["metadata"]["version"] == RELEASE
    unlock = pub["links"]["file_modification"]
    reason = {"comment": "Minor correction of two integrity JSON files after the already-published presentation-only index.html update; graph, evidence, DOI and frozen tag are unchanged."}
    status, _ = call(unlock, "POST", json.dumps(reason).encode(), "application/json", (200, 201))
    if status == 201:
        raise RuntimeError("Zenodo requested moderator approval for published-file editing")
    draft = json.loads(call(f"{ZEN_BASE}/records/{RECORD}/draft")[1])
    files_url = draft["links"].get("files") or f"{ZEN_BASE}/records/{RECORD}/draft/files"
    publish_url = draft["links"].get("publish") or f"{ZEN_BASE}/records/{RECORD}/draft/actions/publish"
    for name, data in planned.items():
        if current[name] == data:
            continue
        try:
            call(f"{files_url}/{name}", "DELETE", allowed=(200, 204))
        except RuntimeError as error:
            if "HTTP 404" not in str(error):
                raise
        call(files_url, "POST", json.dumps([{"key": name}]).encode(), "application/json", (200, 201))
        call(f"{files_url}/{name}/content", "PUT", data, "application/octet-stream", (200, 201, 204))
        call(f"{files_url}/{name}/commit", "POST", allowed=(200, 201, 202, 204))
    call(publish_url, "POST", allowed=(200, 201, 202))
    record = json.loads(fetch(f"{ZEN_BASE}/records/{RECORD}")[1])
    assert record["doi"] == DOI and record["metadata"]["version"] == RELEASE
    assert len(record["files"]) == 24
    for name, data in planned.items():
        assert public_file(name) == data, f"Zenodo {name} readback mismatch"
    assert public_file("index.html") == Path("dist/index.html").read_bytes()
    print(json.dumps({"zenodo": "VERIFIED_SAME_RECORD", "record": RECORD, "doi": DOI, "htmlSha256": HTML_SHA}))


def main():
    assert sys.argv[1:] in ([], ["--apply"]), "Usage: repair-current-release-integrity.py [--apply]"
    require_identity()
    hf = planned_hf_changes()
    zen_current, zen_planned = planned_zenodo_changes()
    print(json.dumps({
        "release": RELEASE, "record": RECORD, "doi": DOI,
        "htmlSha256": HTML_SHA, "hfBefore": hf[0],
        "hfChanges": ["dist-sha256.json", "README.md"],
        "zenodoChanges": [name for name in zen_planned if zen_planned[name] != zen_current[name]],
        "mode": "apply" if sys.argv[1:] else "preflight",
    }))
    if not sys.argv[1:]:
        return
    hf_token = os.environ.get("HF_TOKEN", "")
    zen_token = os.environ.get("ZENODO_TOKEN", "")
    if not hf_token or not zen_token:
        raise RuntimeError("Missing HF_TOKEN or ZENODO_TOKEN")
    update_hf(*hf, hf_token)
    update_zenodo(zen_current, zen_planned, zen_token)
    # Both manifests and the attestation must actually attest to published bytes.
    latest_hf = json.loads(fetch(f"https://huggingface.co/api/datasets/{HF_REPO}")[1])["sha"]
    hfm = json.loads(hf_file(latest_hf, "dist-sha256.json"))
    zenm = json.loads(public_file("dist-sha256.json"))
    att = json.loads(public_file("release-attestation.json"))
    assert hfm["files"]["index.html"] == {"bytes": 1966633, "sha256": HTML_SHA}
    assert zenm["index.html"] == att["indexHtmlSha256"] == HTML_SHA
    print(json.dumps({"convergence": "PASS", "hfRevision": latest_hf, "zenodoRecord": RECORD}))


if __name__ == "__main__":
    main()
