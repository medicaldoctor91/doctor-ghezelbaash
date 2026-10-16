"""Kaggle-specific projection for the canonical Frictionless Data Package descriptor.

Kaggle's CLI reserves ``datapackage.json`` as its legacy dataset metadata
filename, so it is not published as a downloadable dataset file. Preserve the
canonical descriptor bytes under a non-reserved, explicit filename and make the
Kaggle manifest/checksum inventory describe the actual public payload.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

RESERVED = "datapackage.json"
ALIAS = "frictionless-datapackage.json"
CONTROL = {"dataset-metadata.json", "checksums.sha256"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_kaggle_metadata(value: dict, dataset_ref: str) -> dict:
    """Return the flat metadata object accepted by ``kaggle datasets version``.

    ``kaggle datasets metadata`` may return a wrapper containing ``info`` and
    ancillary API fields. The version command expects the dataset id/slug at
    the top level, so retain only the actual metadata payload and pin its id to
    the existing dataset rather than allowing creation of another dataset.
    """
    if not isinstance(value, dict):
        raise TypeError("Kaggle metadata must be a JSON object")
    info = value.get("info")
    target = dict(info) if isinstance(info, dict) else dict(value)
    target["id"] = dataset_ref
    target.pop("ref", None)
    return target


def normalize_kaggle_payload(root: str | Path, descriptor: bytes) -> dict:
    root = Path(root)
    manifest_path = root / "kaggle-manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(manifest_path)

    # Never leave the reserved legacy metadata filename in an upload directory:
    # Kaggle consumes it rather than exposing it as a downloadable payload file.
    reserved_path = root / RESERVED
    if reserved_path.exists():
        reserved_path.unlink()

    alias_path = root / ALIAS
    alias_path.write_bytes(descriptor)

    manifest = json.loads(manifest_path.read_text())
    original = list(manifest.get("original_files") or [])
    rewritten = []
    alias_seen = False
    for item in original:
        if not isinstance(item, dict):
            rewritten.append(item)
            continue
        entry = dict(item)
        if entry.get("path") == RESERVED:
            entry["path"] = ALIAS
        if entry.get("path") == ALIAS:
            if alias_seen:
                continue
            alias_seen = True
            entry["bytes"] = len(descriptor)
            entry["sha256"] = sha256(descriptor)
        rewritten.append(entry)
    if not alias_seen:
        rewritten.append({"path": ALIAS, "bytes": len(descriptor), "sha256": sha256(descriptor)})
    manifest["original_files"] = rewritten
    manifest["frictionless_descriptor"] = {
        "canonical_name": RESERVED,
        "kaggle_downloadable_name": ALIAS,
        "reason": "Kaggle CLI reserves datapackage.json as legacy dataset metadata",
        "bytes": len(descriptor),
        "sha256": sha256(descriptor),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    # Checksums describe only public payload files. dataset-metadata.json is a
    # Kaggle control file and checksums.sha256 cannot self-hash.
    files = sorted(
        p for p in root.rglob("*")
        if p.is_file() and p.relative_to(root).as_posix() not in CONTROL
    )
    lines = [f"{sha256(path.read_bytes())}  {path.relative_to(root).as_posix()}" for path in files]
    (root / "checksums.sha256").write_text("\n".join(lines) + "\n")

    return {
        "alias": ALIAS,
        "alias_sha256": sha256(descriptor),
        "payload_files_hashed": len(files),
    }
