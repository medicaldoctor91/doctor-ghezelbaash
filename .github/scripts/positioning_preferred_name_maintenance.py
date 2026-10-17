"""Narrow HF/Kaggle positioning-name maintenance; preserve all canonical/archived releases."""
from __future__ import annotations
import copy
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import platform_bundle as bundle
import platform_publish as publisher

from huggingface_hub import HfApi, CommitOperationAdd, hf_hub_download, snapshot_download

SOURCE_SHA = "8edb4d6f2e224886132297ac5f380bee26cb53cb"
STRATEGY = "enrichment/positioning-strategy.json"
OLD = "Dr. Saeid Ghezelbaash"
PREFERRED = "Dr. Saeed Ghezelbash"
EXPECTED_KAGGLE_VERSION = 15


def verified_name_patch(doc: dict) -> dict:
    result = copy.deepcopy(doc)
    entity = result["entity"]
    assert entity["preferred_name_en"] == OLD, "Unexpected positioning name; abort before mutation"
    assert "Dr. Saeed Ghezelbash" != OLD
    entity["preferred_name_en"] = PREFERRED
    aliases = entity.get("alternate_names_en", [])
    assert isinstance(aliases, list), "Unexpected alias representation"
    # A spelling variant remains explicitly addressable; existing positioning text is untouched.
    entity["alternate_names_en"] = list(dict.fromkeys([*aliases, OLD]))
    assert entity["preferred_name_en"] == PREFERRED
    assert OLD in entity["alternate_names_en"]
    assert result["entity"]["clinic_name_en"] == doc["entity"]["clinic_name_en"]
    before = copy.deepcopy(result)
    before["entity"]["preferred_name_en"] = OLD
    if "alternate_names_en" in doc["entity"]:
        before["entity"]["alternate_names_en"] = doc["entity"]["alternate_names_en"]
    else:
        before["entity"].pop("alternate_names_en", None)
    assert before == doc, "Patch changed an unrelated positioning field"
    return result


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def kaggle_status() -> int:
    _, view = publisher.request("GET", "https://www.kaggle.com/api/v1/datasets/view/" + bundle.KAGGLE_REF)
    version = int(view["currentVersionNumber"])
    assert version == EXPECTED_KAGGLE_VERSION, ("Kaggle changed; safe abort", version)
    versions = view.get("versions", [])
    record = [row for row in versions if int(row.get("versionNumber", -1)) == version]
    if record:
        assert record[0].get("status") == "Ready", ("Kaggle version not ready",record[0].get("status"))
    return version


def download_exact_kaggle(version: int, folder: Path) -> None:
    url = "https://www.kaggle.com/api/v1/datasets/download/" + bundle.KAGGLE_REF + "?datasetVersionNumber=" + str(version)
    for i in range(24):
        try:
            b = publisher.download_bytes(url, attempts=1)
            with zipfile.ZipFile(io.BytesIO(b)) as z:
                assert z.testzip() is None
                for name in z.namelist():
                    assert (folder / name).resolve().is_relative_to(folder.resolve()), name
                z.extractall(folder)
            if read_json(folder / "kaggle-manifest.json").get("desired_kaggle_version") == version:
                return
        except Exception:
            if i == 23:
                raise
            time.sleep(10)
        shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
    raise AssertionError("Kaggle exact version never became available")


def validate_bundle(root: Path, platform: str, hf_root: Path | None = None) -> None:
    command = [sys.executable, "tests/validate_platform_sync.py", str(root), "--platform", platform,
               "--source-commit", SOURCE_SHA]
    if hf_root is not None:
        command += ["--canonical-root", str(hf_root)]
    subprocess.run(command, check=True)


def main() -> None:
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == SOURCE_SHA
    token = os.environ["HF_TOKEN"]
    assert os.environ.get("KAGGLE_API_TOKEN")
    with urllib.request.urlopen(
        urllib.request.Request(
            "https://www.ghezelbaash.ir/release-provenance.json?name-alignment=" + SOURCE_SHA,
            headers={"Cache-Control": "no-cache", "Pragma": "no-cache"}),
        timeout=35
    ) as response:
        assert json.load(response)["sourceCommit"] == SOURCE_SHA, "Website deployment drift"
    api = HfApi(token=token)
    parent = api.dataset_info(bundle.HF_REPO).sha
    locked_kaggle = kaggle_status()
    assert locked_kaggle == EXPECTED_KAGGLE_VERSION
    print(json.dumps({"PREFLIGHT": "PASS", "website": SOURCE_SHA, "hf": parent,
                      "kaggle": locked_kaggle, "zenodo": "UNTOUCHED"}), flush=True)

    with tempfile.TemporaryDirectory(prefix="preferred-positioning-") as td:
        root = Path(td)
        source_snapshot = Path(snapshot_download(
            repo_id=bundle.HF_REPO, repo_type="dataset", revision=parent, token=token))
        hf = root / "hf"
        shutil.copytree(source_snapshot, hf)
        strategy = hf / STRATEGY
        before = read_json(strategy)
        after = verified_name_patch(before)
        strategy.write_text(json.dumps(after, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        inventory_path = hf / "dist-sha256.json"
        inventory = read_json(inventory_path)
        assert inventory["sourceCommit"] == SOURCE_SHA
        assert STRATEGY in inventory["files"], "HF integrity inventory is missing strategy"
        inventory["files"][STRATEGY] = {"bytes": strategy.stat().st_size, "sha256": sha(strategy)}
        inventory_path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        assert all(
            p.exists() and p.stat().st_size == m["bytes"] and sha(p) == m["sha256"]
            for name,m in inventory["files"].items() for p in [hf/name]
        ), "HF inventory mismatch"
        validate_bundle(hf,"hf")
        print("STAGED_HF_PASS", parent, sha(strategy), flush=True)

        # Download Kaggle v15 before first write. Avoid creating a new dataset version on broken input.
        prior = root / "prior"
        prior.mkdir()
        subprocess.run(["kaggle", "datasets", "download", bundle.KAGGLE_REF,
                        "-p", str(prior), "--unzip", "--force"], check=True)
        subprocess.run(["kaggle", "datasets", "metadata", bundle.KAGGLE_REF, "-p", str(prior)], check=True)
        assert read_json(prior/"kaggle-manifest.json")["desired_kaggle_version"] == locked_kaggle
        assert read_json(prior/STRATEGY)["entity"]["preferred_name_en"] == OLD
        assert kaggle_status() == locked_kaggle
        assert api.dataset_info(bundle.HF_REPO).sha == parent, "HF updated after preflight"

        result = api.create_commit(
            bundle.HF_REPO, repo_type="dataset", revision="main", parent_commit=parent,
            operations=[
                CommitOperationAdd(path_in_repo=STRATEGY,path_or_fileobj=str(strategy)),
                CommitOperationAdd(path_in_repo="dist-sha256.json",path_or_fileobj=str(inventory_path))
            ],
            commit_message="Align preferred physician name while retaining historical spelling alias",
            commit_description="Narrow positioning metadata correction; no clinical content or Zenodo DOI change."
        )
        hf_revision = result.oid
        for n in [STRATEGY, "dist-sha256.json"]:
            remote = Path(hf_hub_download(bundle.HF_REPO, filename=n, repo_type="dataset",
                                          revision=hf_revision,token=token,force_download=True))
            assert remote.read_bytes() == (hf/n).read_bytes(), ("HF live bytes drift", n)
        print("HF_PREFERRED_NAME_VERIFIED",hf_revision,flush=True)

        context = bundle.context(SOURCE_SHA, os.environ["GITHUB_RUN_ID"],
                                 read_json(hf/"release-attestation.json")["maintenanceDate"])
        context["publication_scope"]=["hf","kaggle"]
        context["archived_snapshots_updated"]=False
        context["hf_revision"]=hf_revision
        context["publication_commit"]=os.environ.get("GITHUB_WORKFLOW_SHA","")
        next_version=locked_kaggle+1
        prepared=root/"kaggle"
        readme=bundle.build_kaggle(hf,prior,prepared,context,next_version,hf_revision)
        control=read_json(prepared/"dataset-metadata.json")
        dataset=dict(control.get("info") or control)
        dataset["id"]=bundle.KAGGLE_REF
        dataset["description"]=readme
        (prepared/"dataset-metadata.json").write_text(json.dumps(dataset,indent=2)+"\n",encoding="utf-8")
        assert read_json(prepared/STRATEGY)["entity"]["preferred_name_en"]==PREFERRED
        assert read_json(prepared/"kaggle-manifest.json")["upstream_revision"]==hf_revision
        validate_bundle(prepared,"kaggle",hf)
        assert kaggle_status() == locked_kaggle, "Kaggle updated just before publish"
        print("STAGED_KAGGLE_PASS",next_version,flush=True)
        subprocess.run(["kaggle","datasets","version","-p",str(prepared),
                        "-m","Correct preferred-name field while preserving positioning examples and provenance",
                        "--dir-mode","zip"],check=True)

        public=root/"kaggle-public"
        public.mkdir()
        download_exact_kaggle(next_version,public)
        validate_bundle(public,"kaggle",hf)
        assert read_json(public/STRATEGY) == after, "Kaggle strategy differs from immutable HF source"
        assert read_json(public/"kaggle-manifest.json")["upstream_revision"] == hf_revision
        for line in (public/"checksums.sha256").read_text().splitlines():
            digest,name=line.split("  ",1)
            assert sha(public/name)==digest, name
        subprocess.run(["kaggle","datasets","metadata",bundle.KAGGLE_REF,
                        "-p",str(prepared),"--update"],check=True)
        print(json.dumps({"POSITIONING_NAME_ALIGN_PASS":{
            "website":SOURCE_SHA,"hf_revision":hf_revision,
            "kaggle_version":next_version,"preferred_name_en":PREFERRED,
            "alternate_name":OLD,"zenodo":"UNTOUCHED",
            "hf_inventory":"PASS","kaggle_public_checksums":"PASS"
        }}),flush=True)


if __name__=="__main__":
    main()
