"""Publish platform convergence while restoring and reconciling positioning enrichment."""
from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import platform_bundle as bundle
import platform_publish as publisher

DATASET = bundle.DATASET
HF_REPO = bundle.HF_REPO
KAGGLE_REF = bundle.KAGGLE_REF
OLD_DATASET = "https://www.ghezelbaash.ir/graph.jsonld#dataset"
POSITIONING_SOURCE_REVISION = "e9f45a0fbb55b23847d53f9bc070418670cddbdb"
POSITIONING_ENRICHMENT_FILES = (
    "enrichment/instruction_examples_fa_market_positioning.jsonl",
    "enrichment/instruction_examples_fa_market_positioning.csv",
    "enrichment/market-positioning-evidence.json",
    "enrichment/positioning-strategy.json",
)
POSITIONING_PARQUET = "viewer/positioning-examples.parquet"
LEGACY_HF_ARTIFACT = "_headers.content-digest.pending"


def reconcile_positioning_assets(root: str | Path) -> dict:
    """Update only current canonical anchors while preserving historical release provenance."""
    root = Path(root)
    changed = []
    for name in POSITIONING_ENRICHMENT_FILES:
        path = root / name
        if not path.is_file():
            raise AssertionError(f"positioning asset missing: {name}")
        text = path.read_text(encoding="utf-8")
        replaced = text.replace(OLD_DATASET, DATASET)
        if replaced != text:
            path.write_text(replaced, encoding="utf-8")
            changed.append(name)
        final = path.read_text(encoding="utf-8")
        if OLD_DATASET in final:
            raise AssertionError(f"stale Dataset IRI remains in {name}")
        if "A5064828898" in final:
            raise AssertionError(f"deprecated OpenAlex ID remains in {name}")
    jsonl = root / POSITIONING_ENRICHMENT_FILES[0]
    rows = [json.loads(line) for line in jsonl.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise AssertionError("positioning JSONL is empty")
    ids = [row.get("example_id") for row in rows if row.get("example_id")]
    if len(ids) != len(set(ids)):
        raise AssertionError("duplicate positioning example_id")
    evidence = json.loads((root / "enrichment/market-positioning-evidence.json").read_text(encoding="utf-8"))
    strategy = json.loads((root / "enrichment/positioning-strategy.json").read_text(encoding="utf-8"))
    if evidence.get("entity", {}).get("wikidata") not in {None, "Q140287622"}:
        raise AssertionError("positioning evidence Wikidata drift")
    if strategy.get("entity_wikidata") not in {None, "Q140287622"}:
        raise AssertionError("positioning strategy Wikidata drift")
    return {"rows": len(rows), "changed": changed}


def build_positioning_parquet(root: str | Path) -> dict:
    import pyarrow as pa
    import pyarrow.parquet as pq

    root = Path(root)
    source = root / "enrichment/instruction_examples_fa_market_positioning.csv"
    with source.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise AssertionError("positioning CSV is empty")
    target = root / POSITIONING_PARQUET
    target.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), target, compression="zstd")
    decoded = pq.read_table(target).to_pylist()
    if decoded != rows:
        raise AssertionError("positioning Parquet changed CSV semantics")
    return {"rows": len(rows), "path": POSITIONING_PARQUET, "sha256": bundle.sha(target)}


def update_dataset_card_for_positioning(path: str | Path) -> None:
    import yaml

    path = Path(path)
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise AssertionError("Hugging Face README front matter missing")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise AssertionError("Hugging Face README front matter not closed")
    front = yaml.safe_load(text[4:end]) or {}
    configs = front.setdefault("configs", [])
    if not isinstance(configs, list):
        raise AssertionError("Hugging Face configs metadata is not a list")
    configs = [cfg for cfg in configs if not isinstance(cfg, dict) or cfg.get("config_name") != "market_positioning"]
    configs.append({
        "config_name": "market_positioning",
        "data_files": [{"split": "train", "path": POSITIONING_PARQUET}],
    })
    front["configs"] = configs
    body = text[end + 5 :]
    rebuilt = "---\n" + yaml.safe_dump(front, sort_keys=False, allow_unicode=True).rstrip() + "\n---\n" + body
    marker = "## Market-positioning enrichment"
    if marker not in rebuilt:
        rebuilt += (
            "\n\n" + marker + "\n\n"
            "The `market_positioning` Viewer config exposes the preserved retrieval-positioning examples as Parquet. "
            "Historical release DOI fields remain provenance; current identity anchors resolve to the canonical website dataset IRI.\n"
        )
    path.write_text(rebuilt, encoding="utf-8")


def _hf_download(repo: str, filename: str, revision: str, token: str) -> Path:
    from huggingface_hub import hf_hub_download

    return Path(hf_hub_download(repo, filename=filename, repo_type="dataset", revision=revision, token=token, force_download=True))


def assert_kaggle_version_lock(view: dict, expected: str | int | None) -> int:
    current = int(view["currentVersionNumber"])
    if expected not in (None, "") and current != int(expected):
        raise AssertionError(f"Kaggle changed since preflight: expected {expected}, got {current}")
    versions = view.get("versions") or []
    if versions:
        matching = [v for v in versions if int(v.get("versionNumber", -1)) == current]
        if matching and matching[0].get("status") not in {None, "Ready"}:
            raise AssertionError(f"Kaggle v{current} is not Ready: {matching[0].get('status')}")
    return current


def preflight_kaggle() -> int:
    _, view = publisher.request("GET", "https://www.kaggle.com/api/v1/datasets/view/" + KAGGLE_REF)
    return assert_kaggle_version_lock(view, os.environ.get("EXPECTED_KAGGLE_VERSION"))


def preflight_zenodo(token: str) -> dict:
    expected = {
        "22838416": ("10.5281/zenodo.22838416", "1.3.3", 24),
        "23289009": ("10.5281/zenodo.23289009", "source-final-2026-10-10", 1),
    }
    out = {}
    for rec, (doi, version, count) in expected.items():
        _, record = publisher.request("GET", f"{publisher.BASE}/records/{rec}", token=token)
        actual_doi = record.get("doi") or record["pids"]["doi"]["identifier"]
        if actual_doi != doi or record["metadata"].get("version") != version:
            raise AssertionError((rec, "Zenodo DOI/version drift", actual_doi, record["metadata"].get("version")))
        _, files = publisher.request("GET", f"{publisher.BASE}/records/{rec}/files", token=token)
        if len(files["entries"]) != count:
            raise AssertionError((rec, "Zenodo file-count drift", len(files["entries"])))
        try:
            publisher.request("GET", f"{publisher.BASE}/records/{rec}/draft", token=token)
        except RuntimeError as exc:
            if "HTTP 404" not in str(exc):
                raise
        else:
            raise RuntimeError(f"Zenodo record {rec} already has an unpublished draft; publication aborted")
        out[rec] = {"doi": doi, "version": version, "files": count, "draft": "none"}
    return out


def publish_source_via_record_draft(rec: str, changed: dict[str, bytes], token: str, request_fn=publisher.request) -> None:
    """Replace the single source ZIP through the current records/draft file API and publish the same record."""
    if len(changed) != 1:
        raise AssertionError("Zenodo source correction must contain exactly one ZIP")
    key, body = next(iter(changed.items()))
    if not key.endswith(".zip"):
        raise AssertionError("Zenodo source correction file key must remain a ZIP")
    encoded = urllib.parse.quote(key, safe="")
    base = f"{publisher.BASE}/records/{rec}/draft"
    request_fn("DELETE", f"{base}/files/{encoded}", token=token)
    request_fn("POST", f"{base}/files", payload=[{"key": key}], token=token)
    request_fn("PUT", f"{base}/files/{encoded}/content", raw=body, token=token)
    request_fn("POST", f"{base}/files/{encoded}/commit", token=token)
    request_fn("POST", f"{base}/actions/publish", token=token)


def prepare_hf_positioning(token: str) -> str:
    from huggingface_hub import HfApi, CommitOperationAdd, CommitOperationDelete

    api = HfApi(token=token)
    info = api.dataset_info(HF_REPO, files_metadata=True)
    parent = info.sha
    expected = os.environ.get("EXPECTED_HF_BEFORE")
    if expected and parent != expected:
        raise AssertionError(f"HF changed since preflight: expected {expected}, got {parent}")
    current = {s.rfilename for s in info.siblings}
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for name in POSITIONING_ENRICHMENT_FILES:
            revision = parent if name in current else POSITIONING_SOURCE_REVISION
            src = _hf_download(HF_REPO, name, revision, token)
            dest = root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
        result = reconcile_positioning_assets(root)
        parquet = build_positioning_parquet(root)
        readme_src = _hf_download(HF_REPO, "README.md", parent, token)
        readme = root / "README.md"
        shutil.copyfile(readme_src, readme)
        update_dataset_card_for_positioning(readme)
        ops = [CommitOperationAdd(path_in_repo=name, path_or_fileobj=str(root / name)) for name in POSITIONING_ENRICHMENT_FILES]
        ops.extend([
            CommitOperationAdd(path_in_repo=POSITIONING_PARQUET, path_or_fileobj=str(root / POSITIONING_PARQUET)),
            CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=str(readme)),
        ])
        if LEGACY_HF_ARTIFACT in current:
            ops.append(CommitOperationDelete(path_in_repo=LEGACY_HF_ARTIFACT))
        commit = api.create_commit(
            HF_REPO,
            repo_type="dataset",
            revision="main",
            parent_commit=parent,
            operations=ops,
            commit_message="Restore validated market-positioning enrichment",
            commit_description=(
                "Recover immutable historical positioning assets, migrate only current canonical identity anchors, "
                "preserve historical DOI provenance, expose a native Parquet Viewer config, and remove the obsolete pending Content-Digest artifact."
            ),
        )
        revision = commit.oid
        for name in [*POSITIONING_ENRICHMENT_FILES, POSITIONING_PARQUET, "README.md"]:
            live = _hf_download(HF_REPO, name, revision, token)
            local = root / name
            if bundle.sha(live) != bundle.sha(local):
                raise AssertionError(("HF positioning live hash", name))
        final_info = api.dataset_info(HF_REPO, revision=revision, files_metadata=True)
        final_files = {s.rfilename for s in final_info.siblings}
        if LEGACY_HF_ARTIFACT in final_files:
            raise AssertionError("obsolete HF pending Content-Digest artifact still present")
        print(json.dumps({"HF_POSITIONING_PRECOMMIT": revision, **result, "parquet": parquet}, ensure_ascii=False), flush=True)
        return revision


def _with_positioning_kaggle_builder():
    original = publisher.build_kaggle

    def build_kaggle(hf, previous, out, ctx, version, hf_revision):
        hf = Path(hf)
        previous = Path(previous)
        with tempfile.TemporaryDirectory() as directory:
            prepared = Path(directory) / "previous"
            shutil.copytree(previous, prepared)
            manifest_path = prepared / "kaggle-manifest.json"
            manifest = bundle.load(manifest_path)
            known = {item["path"] for item in manifest["original_files"]}
            for name in [*POSITIONING_ENRICHMENT_FILES, POSITIONING_PARQUET]:
                if not (hf / name).is_file():
                    raise AssertionError(f"HF positioning resource missing before Kaggle build: {name}")
                if name not in known:
                    manifest["original_files"].append({"path": name})
            manifest["positioning_enrichment"] = {
                "source_revision": POSITIONING_SOURCE_REVISION,
                "canonical_dataset_iri": DATASET,
                "files": [*POSITIONING_ENRICHMENT_FILES, POSITIONING_PARQUET],
            }
            bundle.dump(manifest_path, manifest)
            return original(hf, prepared, out, ctx, version, hf_revision)

    publisher.build_kaggle = build_kaggle


def verify_public_positioning(root: Path) -> dict:
    from huggingface_hub import hf_hub_download

    report = bundle.load(root / "publication-report.json")
    revision = report["hfRevision"]
    token = os.environ["HF_TOKEN"]
    staged_hf = root / "hf"
    for name in [*POSITIONING_ENRICHMENT_FILES, POSITIONING_PARQUET]:
        live = Path(hf_hub_download(HF_REPO, filename=name, repo_type="dataset", revision=revision, token=token, force_download=True))
        if bundle.sha(live) != bundle.sha(staged_hf / name):
            raise AssertionError(("HF final positioning hash", name))
    live_text = "\n".join((staged_hf / name).read_text(encoding="utf-8") for name in POSITIONING_ENRICHMENT_FILES)
    if OLD_DATASET in live_text or "A5064828898" in live_text:
        raise AssertionError("stale canonical identity remains in positioning enrichment")
    kaggle = root / "kaggle-live"
    for name in [*POSITIONING_ENRICHMENT_FILES, POSITIONING_PARQUET]:
        if not (kaggle / name).is_file():
            raise AssertionError(f"Kaggle public positioning resource missing: {name}")
    for line in (kaggle / "checksums.sha256").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        if bundle.sha(kaggle / name) != digest:
            raise AssertionError(("Kaggle positioning checksum", name))
    for key in ("zenodoDataset", "zenodoSource"):
        if not report[key].get("DOI_unchanged"):
            raise AssertionError(f"{key} DOI changed")
    return {
        "hf_revision": revision,
        "kaggle_version": report["kaggle"]["version"],
        "positioning_files": len(POSITIONING_ENRICHMENT_FILES) + 1,
        "zenodo_dataset_doi": report["zenodoDataset"]["doi"],
        "zenodo_source_doi": report["zenodoSource"]["doi"],
    }


def main() -> None:
    canonical = os.environ.get("CANONICAL_WEBSITE_COMMIT")
    if not canonical:
        raise RuntimeError("CANONICAL_WEBSITE_COMMIT is required")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if head != canonical:
        raise AssertionError(("checkout is not canonical website commit", head, canonical))
    with urllib.request.urlopen(
        urllib.request.Request(
            "https://www.ghezelbaash.ir/release-provenance.json?platform-sync=" + canonical,
            headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
        ),
        timeout=30,
    ) as response:
        provenance = json.load(response)
    if provenance.get("sourceCommit") != canonical:
        raise AssertionError(("live website source commit drift", provenance.get("sourceCommit"), canonical))
    zenodo = preflight_zenodo(os.environ["ZENODO_TOKEN"])
    kaggle_version = preflight_kaggle()
    print(json.dumps({"ZENODO_PREFLIGHT": zenodo, "KAGGLE_PREFLIGHT": kaggle_version}, ensure_ascii=False), flush=True)
    hf_revision = prepare_hf_positioning(os.environ["HF_TOKEN"])
    os.environ["EXPECTED_HF_REVISION"] = hf_revision
    os.environ["GITHUB_SHA"] = canonical
    publisher.publish_source_bucket = publish_source_via_record_draft
    _with_positioning_kaggle_builder()
    publisher.main()
    result = verify_public_positioning(Path("/tmp/platform-publish"))
    print(json.dumps({"POSITIONING_PUBLIC_PASS": result}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
