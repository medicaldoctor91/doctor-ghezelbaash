"""One-time guarded Hugging Face documentation fix.

This script changes only README.md and the README.md entry in dist-sha256.json
on the existing dataset repository main branch. It aborts if the reviewed live
revision or README has changed.
"""

import hashlib
import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

HF_REPO = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
EXPECTED_MAIN = "71a1265ec02e64ed5542b5485c7d38a2f906c2e7"
EXPECTED_README_SHA256 = "75527a46a03a7959dc5a7023dd0c1723bea301ec5b06a97d7b2e6633bbad8b8a"
BASE = f"https://huggingface.co/datasets/{HF_REPO}"

OLD_TABLE = "| stable_evidence_refs | Ordered evidence-node IRIs; resolve these nodes in graph.jsonld and inspect the cited sources |"
NEW_TABLE = "| stable_evidence_refs | Ordered evidence-node IRIs; resolve these nodes across graph.jsonld and provenance.jsonld, then inspect the recorded source metadata |"

OLD_RETRIEVAL = (
    "Retrieval policy: **evidence_bound**. Resolution mode: **canonical_entity_resolution**. "
    "Join `answer_id`, `service_ids`, `canonical_subject_iri` and `stable_evidence_refs` "
    "to graph node identifiers; use those nodes and their cited sources to construct attributable answers."
)
NEW_RETRIEVAL = (
    "Retrieval policy: **evidence_bound**. Resolution mode: **canonical_entity_resolution**. "
    "Resolve `canonical_subject_iri`, `answer_id` and `service_ids` in `graph.jsonld`. "
    "Resolve `stable_evidence_refs` across both `graph.jsonld` and `provenance.jsonld`; "
    "some evidence definitions occur only in `provenance.jsonld`. Keep all definitions when an IRI "
    "occurs in both files, and use `evidence-snapshot.json` as the complementary recorded source registry. "
    "Filtering `entity-facts.csv` alone is not a complete evidence resolver."
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "doctor-ghezelbaash-one-time-doc-fix/1.0", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url}: HTTP {response.status}")
        return response.read()


def hf_file(revision: str, name: str) -> bytes:
    return fetch(f"{BASE}/resolve/{revision}/{name}?download=true")


def build_changes():
    info = json.loads(fetch(f"https://huggingface.co/api/datasets/{HF_REPO}"))
    current = info["sha"]
    if current != EXPECTED_MAIN:
        raise RuntimeError(f"HF main changed since review: expected {EXPECTED_MAIN}, got {current}")

    readme = hf_file(current, "README.md")
    manifest_bytes = hf_file(current, "dist-sha256.json")
    if sha256(readme) != EXPECTED_README_SHA256:
        raise RuntimeError("README.md hash changed since review")

    manifest = json.loads(manifest_bytes)
    entry = manifest["files"]["README.md"]
    if entry != {"bytes": len(readme), "sha256": EXPECTED_README_SHA256}:
        raise RuntimeError(f"README manifest entry is not the reviewed value: {entry}")

    text = readme.decode("utf-8")
    if text.count(OLD_TABLE) != 1:
        raise RuntimeError("Expected one old stable_evidence_refs table instruction")
    if text.count(OLD_RETRIEVAL) != 1:
        raise RuntimeError("Expected one old retrieval paragraph")

    new_text = text.replace(OLD_TABLE, NEW_TABLE).replace(OLD_RETRIEVAL, NEW_RETRIEVAL)
    new_readme = new_text.encode("utf-8")
    if new_readme == readme:
        raise RuntimeError("README replacement produced no change")

    before = json.loads(manifest_bytes)
    manifest["files"]["README.md"] = {
        "bytes": len(new_readme),
        "sha256": sha256(new_readme),
    }

    # Guard that no manifest entry except README.md changes.
    before_without = json.loads(json.dumps(before))
    after_without = json.loads(json.dumps(manifest))
    before_without["files"].pop("README.md")
    after_without["files"].pop("README.md")
    if before_without != after_without:
        raise RuntimeError("Unexpected non-README manifest change")

    new_manifest = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return current, readme, manifest_bytes, new_readme, new_manifest


def apply(current, old_readme, old_manifest, new_readme, new_manifest, token):
    from huggingface_hub import CommitOperationAdd, HfApi

    api = HfApi(endpoint="https://huggingface.co", token=token)
    identity = api.whoami()
    if str(identity.get("name", "")).casefold() != "ghezelbaash":
        raise RuntimeError(f"Unexpected HF identity: {identity.get('name')}")

    latest = api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision="main")
    if latest.sha != current:
        raise RuntimeError(f"HF main advanced before commit: {latest.sha}")

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        readme_path = root / "README.md"
        manifest_path = root / "dist-sha256.json"
        readme_path.write_bytes(new_readme)
        manifest_path.write_bytes(new_manifest)

        result = api.create_commit(
            repo_id=HF_REPO,
            repo_type="dataset",
            revision="main",
            parent_commit=current,
            operations=[
                CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=str(readme_path)),
                CommitOperationAdd(path_in_repo="dist-sha256.json", path_or_fileobj=str(manifest_path)),
            ],
            create_pr=False,
            commit_message="Clarify complete evidence resolution in dataset card",
            commit_description=(
                "Documentation-only correction: stable_evidence_refs require graph.jsonld plus "
                "provenance.jsonld for complete resolution. No graph, data, DOI, identifier, or frozen tag changes."
            ),
        )

    after = api.repo_info(repo_id=HF_REPO, repo_type="dataset", revision="main").sha
    if not after or after == current:
        raise RuntimeError("HF commit did not advance main")

    readback_readme = hf_file(after, "README.md")
    readback_manifest = hf_file(after, "dist-sha256.json")
    if readback_readme != new_readme or readback_manifest != new_manifest:
        raise RuntimeError("HF readback mismatch after commit")

    parsed = json.loads(readback_manifest)
    expected_entry = {"bytes": len(new_readme), "sha256": sha256(new_readme)}
    if parsed["files"]["README.md"] != expected_entry:
        raise RuntimeError("HF README manifest entry failed readback validation")

    # The old files were exactly what was reviewed; keep these checks explicit in logs.
    print(json.dumps({
        "status": "VERIFIED",
        "repository": HF_REPO,
        "before": current,
        "after": after,
        "changed_files": ["README.md", "dist-sha256.json"],
        "old_readme_sha256": sha256(old_readme),
        "new_readme_sha256": sha256(new_readme),
        "new_readme_bytes": len(new_readme),
        "old_manifest_sha256": sha256(old_manifest),
        "new_manifest_sha256": sha256(new_manifest),
    }))


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise SystemExit("usage: one-time-hf-evidence-doc-fix.py [--apply]")

    changes = build_changes()
    print(json.dumps({
        "status": "PREFLIGHT_OK",
        "repository": HF_REPO,
        "reviewed_revision": changes[0],
        "new_readme_sha256": sha256(changes[3]),
        "new_readme_bytes": len(changes[3]),
        "mode": "apply" if sys.argv[1:] else "preflight",
    }))

    if not sys.argv[1:]:
        return

    token = os.environ.get("HF_TOKEN", "")
    if not token:
        raise RuntimeError("HF_TOKEN is not available")
    apply(*changes, token)


if __name__ == "__main__":
    main()
