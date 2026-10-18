"""Atomic card maintenance. Dataset payloads are never uploaded or deleted."""
import copy
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import yaml

REPO = "doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"
BRANCH = "refs/heads/maintenance/hf-discoverability-20261019"
BASE = "d7b8191565820b50e7da1aeb52609dbb9b03cc90"
SOURCE = "0b24213da940f2a40026e31acfc49339bd83ed65"
ALLOWED = {"README.md", "dist-sha256.json"}
TITLE = "Dr. Saeed Ghezelbash — Persian Clinical Knowledge Graph & RAG Dataset"
EXTRA_TAGS = ["knowledge-graph", "linked-data", "rdf", "semantic-web", "information-retrieval",
              "entity-linking", "persian-nlp", "medical-nlp", "text", "tabular", "mlcroissant"]
SECTION = """## Dataset scope, curation and intended use

This public, first-party **Persian clinical NLP and knowledge-graph dataset** supports multilingual information retrieval, source-attributed question answering, entity linking and evidence-grounded RAG. It connects **Dr. Saeed Ghezelbash / دکتر سعید قزلباش** and his authored educational material to explicit identifiers and provenance; the physician, clinic and dataset remain separate entities.

### Curation and data provenance

Clinical and professional text originates from the named physician's public website. Deterministic extraction, RDF serialization and Parquet packaging produce machine-readable representations; format conversion and mirrored publication do not provide independent corroboration of a claim. Follow each record's source anchors, evidence references and review metadata. Search-intent and positioning examples are distinguished from clinical educational passages.

### Appropriate uses and limitations

- Use for Persian/multilingual retrieval, cited QA prototypes, entity resolution, provenance tracing and RDF/Croissant interoperability tests.
- This is a physician-centred educational corpus, not a patient cohort, treatment-outcome study, representative medical literature collection or independently validated clinical benchmark. Language and topic coverage are unequal.
- The `train` split is a loading convention, not a curated train/test separation. A valid downstream benchmark requires a separately designed evaluation and leakage controls.
- Superlative query aliases and positioning examples record search intent or marketing framing; they do not establish clinical superiority, comparative rankings or independent endorsements. Keep those examples separate from clinical-answer evaluation.
- Preserve resource-level attribution and check third-party rights at the linked source. Public availability and CC BY 4.0 package metadata do not erase third-party rights or permit unsupported clinical claims.

### Reproducible citation and update policy

For the data package shared with **Kaggle v19**, pin Hugging Face data revision `d7b8191565820b50e7da1aeb52609dbb9b03cc90` and website source commit `0b24213da940f2a40026e31acfc49339bd83ed65` (website 1.3.4, edition 2026-10-18). Later documentation-only commits can change this card without changing the data files. Cite the exact Hub revision actually used, its source release and the canonical dataset IRI: https://www.ghezelbaash.ir/graph.jsonld/dataset. Zenodo DOIs identify their own archived snapshots, not automatically the current Hub bytes. Updates are release-driven; no fixed schedule is promised.

"""


def digest(body):
    return {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def build_updates(readme, inventory):
    assert inventory["sourceCommit"] == SOURCE, "Unexpected website provenance"
    assert inventory["files"]["README.md"] == digest(readme), "README inventory mismatch"
    text = readme.decode("utf-8")
    assert text.startswith("---\n")
    header, body = text.split("---", 2)[1:]
    metadata = yaml.safe_load(header)
    original = copy.deepcopy(metadata)
    assert len(metadata["configs"]) == 5
    assert set(metadata["language"]) == {"fa", "en", "ar", "ckb"}
    assert metadata["license"] == "cc-by-4.0"
    assert "## Dataset scope, curation and intended use" not in body, "Already applied; do not republish"
    metadata["pretty_name"] = TITLE
    metadata["tags"] = list(dict.fromkeys(metadata.get("tags", []) + EXTRA_TAGS))
    for key in original:
        if key not in {"pretty_name", "tags"}:
            assert metadata[key] == original[key], key
    heading = "# Dr. Saeed Ghezelbash Public Knowledge Graph"
    assert body.count(heading) == 1
    body = body.replace(heading, "# " + TITLE, 1)
    marker = "## Retrieval-ready clinical information"
    assert body.count(marker) == 1
    body = body.replace(marker, SECTION + marker, 1)
    marker = "All configurations use string-typed Parquet"
    assert body.count(marker) == 1
    body = body.replace(marker, "- **market_positioning**: 47 historically labelled search-intent and positioning examples. These are not clinical outcome labels; see `enrichment/positioning-strategy.json` and `enrichment/market-positioning-evidence.json` for scope and sources.\n\n" + marker, 1)
    revised = ("---\n" + yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False) + "---" + body).encode()
    new_inventory = copy.deepcopy(inventory)
    new_inventory["files"]["README.md"] = digest(revised)
    assert {k: v for k, v in inventory["files"].items() if k != "README.md"} == {
        k: v for k, v in new_inventory["files"].items() if k != "README.md"}
    return {"README.md": revised,
            "dist-sha256.json": (json.dumps(new_inventory, ensure_ascii=False, indent=2) + "\n").encode()}


def public_bytes(name, revision):
    url = f"https://huggingface.co/datasets/{REPO}/resolve/{revision}/{name}"
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()


def sibling_state(info):
    return {s.rfilename: (s.blob_id, s.size, s.lfs.sha256 if s.lfs else None) for s in info.siblings}


def main():
    from huggingface_hub import CommitOperationAdd, DatasetCard, HfApi
    assert os.environ.get("GITHUB_REF") == BRANCH, "Only the approved non-main branch is allowed"
    assert os.environ.get("EXPECTED_HF_REVISION") == BASE
    assert os.environ.get("EXPECTED_WEBSITE_COMMIT") == SOURCE
    assert os.environ.get("VERIFY_EXISTING") == "true", "Explicit metadata-only confirmation required"
    token = os.environ.get("HF_TOKEN")
    assert token, "Existing HF publication binding is missing"
    writer, reader = HfApi(token=token), HfApi(token=False)
    writer.auth_check(REPO, repo_type="dataset", write=True)
    before = reader.dataset_info(REPO, revision="main", files_metadata=True)
    assert before.sha == BASE, "HF HEAD changed; review before publishing"
    updates = build_updates(public_bytes("README.md", BASE), json.loads(public_bytes("dist-sha256.json", BASE)))
    assert set(updates) == ALLOWED
    DatasetCard(updates["README.md"].decode()).validate()
    result = writer.create_commit(repo_id=REPO, repo_type="dataset", revision="main", parent_commit=BASE,
        commit_message="Improve Persian clinical KG/RAG dataset discovery and usage documentation",
        commit_description="Metadata-only: README and its checksum. No dataset, positioning, archive, tag or website bytes changed.",
        operations=[CommitOperationAdd(path_in_repo=name, path_or_fileobj=body) for name, body in updates.items()])
    after = reader.dataset_info(REPO, revision=result.oid, files_metadata=True)
    old_files, new_files = sibling_state(before), sibling_state(after)
    assert old_files.keys() == new_files.keys(), "File inventory changed"
    changed = {name for name in old_files if old_files[name] != new_files[name]}
    assert changed == ALLOWED, ("Unexpected changed files", sorted(changed))
    for name, expected in updates.items():
        assert public_bytes(name, result.oid) == expected, name
    assert reader.dataset_info(REPO).sha == result.oid, "Public HEAD differs"
    receipt = {"before": BASE, "after": result.oid, "commit_url": result.commit_url,
        "changed_files": sorted(changed), "unchanged_files": len(old_files) - len(changed),
        "public_byte_checks": {name: digest(body) for name, body in updates.items()},
        "website_source_commit": SOURCE, "kaggle_data_snapshot_preserved": BASE,
        "data_configs_preserved": True, "data_bytes_changed": False,
        "github_main_changed": False, "website_deployed": False}
    output = Path("/tmp/hf-discoverability/receipt.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
