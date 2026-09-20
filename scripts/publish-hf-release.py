#!/usr/bin/env python3
"""Stage a release through the official Hub client; never move main or a tag."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

MANIFEST = "dist-sha256.json"
ATTRIBUTES = ".gitattributes"
SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"[a-f0-9]{64}")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def safe_path(value):
    return (isinstance(value, str) and bool(value)
            and not value.startswith("/") and "\\" not in value
            and all(part not in ("", ".", "..") for part in value.split("/"))
            and PurePosixPath(value).as_posix() == value)


def manifest_from_bytes(value):
    document = json.loads(value)
    require(isinstance(document, dict), "Invalid HF manifest document")
    manifest = document.get("files")
    require(isinstance(manifest, dict) and bool(manifest), "Empty or invalid HF manifest")
    require(all(safe_path(name) and name not in (MANIFEST, ATTRIBUTES)
                and isinstance(row, dict) and type(row.get("bytes")) is int and row["bytes"] >= 0
                and isinstance(row.get("sha256"), str) and DIGEST.fullmatch(row["sha256"])
                for name, row in manifest.items()), "Invalid HF manifest entry")
    return manifest


def validate_files(files):
    require(MANIFEST in files and ATTRIBUTES in files, "HF manifest or attributes are missing")
    manifest = manifest_from_bytes(files[MANIFEST])
    require(set(files) == set(manifest) | {MANIFEST, ATTRIBUTES},
            "HF files differ from the declared manifest inventory")
    for name, row in manifest.items():
        require(len(files[name]) == row["bytes"] and digest(files[name]) == row["sha256"],
                f"HF byte count or SHA-256 mismatch: {name}")
    return manifest


def local_files(directory):
    root = directory.resolve()
    require(root.is_relative_to(Path(".release").resolve())
            and root != Path(".release").resolve(), "HF package must be inside .release")
    files = {}
    for current, directories, names in os.walk(root, followlinks=False):
        directories[:] = [name for name in directories if name != ".git"]
        for name in [*directories, *names]:
            require(not (Path(current) / name).is_symlink(), "Symlinks are forbidden in the HF package")
        for name in names:
            item = Path(current) / name
            relative = item.relative_to(root).as_posix()
            if relative == ".git":
                continue
            require(safe_path(relative), "Invalid package path")
            files[relative] = item.read_bytes()
    validate_files(files)
    return files


def publication_context(branch):
    release = json.loads(Path("src/data/release.json").read_text())
    require(branch == f"release/v{release['release']}", "HF candidate branch/version mismatch")
    require(re.fullmatch(r"release/v\d+\.\d+\.\d+", branch), "Invalid HF release branch")
    url = release["dataset"]["huggingFace"]["dataset"]
    match = re.fullmatch(r"https://huggingface\.co/datasets/([\w.-]+/[\w.-]+)", url)
    require(match is not None, "Invalid canonical HF repository URL")
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    require(SHA.fullmatch(source), "Invalid source commit")
    require(os.environ.get("CANDIDATE_SHA", source) == source, "Candidate source commit mismatch")
    return release, match.group(1), source


def verify_identity(files, release):
    matrix = json.loads(files["current-release-matrix.json"])
    expected = {"release": release["release"], "datasetIri": release["dataset"]["id"],
                "versionDoi": release["dataset"]["zenodo"]["versionDoi"],
                "recordId": str(release["dataset"]["zenodo"]["recordId"])}
    require(all(str(matrix.get(key)) == str(value) for key, value in expected.items()),
            "HF package release identity mismatch")
    manifest = json.loads(files[MANIFEST])
    require(manifest.get("release") == release["release"]
            and manifest.get("canonicalDatasetIri") == release["dataset"]["id"]
            and manifest.get("zenodoVersionDoi") == release["dataset"]["zenodo"]["versionDoi"],
            "HF manifest release identity mismatch")
    return matrix


def remote_info(api, repo, revision):
    info = api.repo_info(repo_id=repo, repo_type="dataset", revision=revision, timeout=60)
    require(info.private is False and info.gated in (False, None, "false"),
            "HF dataset must be public and ungated")
    require(SHA.fullmatch(info.sha or ""), "HF did not return an exact commit")
    return info


def remote_files(api, repo, revision):
    from huggingface_hub import hf_hub_download
    info = remote_info(api, repo, revision)
    names = [row.rfilename for row in info.siblings or []]
    require(len(names) == len(set(names)) and all(safe_path(name) for name in names),
            "Invalid remote HF inventory")

    def download(name):
        path = hf_hub_download(repo_id=repo, repo_type="dataset", filename=name,
                               revision=info.sha, token=api.token)
        return name, Path(path).read_bytes()

    require(MANIFEST in names and ATTRIBUTES in names, "Remote HF release manifest missing")
    _, manifest_bytes = download(MANIFEST)
    manifest = manifest_from_bytes(manifest_bytes)
    require(set(names) == set(manifest) | {MANIFEST, ATTRIBUTES},
            "Remote HF contains undeclared files; refusing automatic deletion")
    with ThreadPoolExecutor(max_workers=4) as executor:
        files = dict(executor.map(download, names))
    validate_files(files)
    return info.sha, files


def changes(before, after):
    validate_files(before)
    validate_files(after)
    require(before[ATTRIBUTES] == after[ATTRIBUTES], "Release must preserve HF Git attributes")
    added = {name: data for name, data in after.items() if before.get(name) != data}
    removed = sorted(set(before) - set(after))
    return added, removed


def save_state(output, state):
    path = output.resolve()
    require(path.is_relative_to(Path(".release/runtime").resolve()),
            "Stage ledger must be inside .release/runtime")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(path)


def stage_decision(*, resume, base, baseline_matches, baseline_same_release,
                   frozen_sha, branch_exists):
    """Choose an exact, non-mutating staging path for new, canary, or resume state."""
    if frozen_sha:
        require(resume, "Target HF release tag already exists; only exact-state resume is allowed")
    if resume:
        if baseline_same_release:
            require(baseline_matches,
                    "HF main already identifies this release but differs from its exact frozen package")
        if baseline_matches and frozen_sha:
            require(base == frozen_sha,
                    "HF main and immutable release tag contain equal bytes at different commits")
        if baseline_matches:
            return {"candidate": base, "branch_required": False, "canary_resume": False}
        if frozen_sha:
            return {"candidate": frozen_sha, "branch_required": False, "canary_resume": False}
        return {"candidate": None, "branch_required": True, "canary_resume": False}
    if baseline_same_release:
        require(baseline_matches,
                "HF main already identifies the target release with divergent bytes; refusing restage")
        require(branch_exists,
                "HF main contains the release canary without its source-bound candidate branch")
        return {"candidate": base, "branch_required": True, "canary_resume": True}
    return {"candidate": None, "branch_required": True, "canary_resume": False}


def require_source_binding(api, repo, revision, source):
    commits = api.list_repo_commits(repo_id=repo, repo_type="dataset", revision=revision)
    require(bool(commits) and f"Source-Commit: {source}" in commits[0].message.splitlines(),
            "Existing HF candidate is bound to a different source commit")


def stage(args, api):
    from huggingface_hub import CommitOperationAdd, CommitOperationDelete
    release, repo, source = publication_context(args.branch)
    resume = args.resume_current
    if resume:
        frozen_source = subprocess.check_output(
            ["git", "rev-parse", f"v{release['release']}^{{commit}}"], text=True).strip()
        require(frozen_source == source, "Current resume requires the exact frozen GitHub source tag")
    prepared = local_files(args.directory)
    verify_identity(prepared, release)
    base, baseline = remote_files(api, repo, "main")
    matrix = json.loads(baseline["current-release-matrix.json"])
    require(matrix.get("datasetIri") == release["dataset"]["id"], "HF baseline dataset identity mismatch")
    require(any(row["release"] == matrix.get("release")
                and row["versionDoi"] == matrix.get("versionDoi")
                and str(row["recordId"]) == str(matrix.get("recordId"))
                for row in release["dataset"]["zenodo"]["releaseHistory"]),
            "HF baseline is outside the canonical release history")
    refs = api.list_repo_refs(repo_id=repo, repo_type="dataset")
    tag = f"v{release['release']}"
    frozen_sha = None
    if any(row.name == tag for row in refs.tags):
        require(resume, "Target HF release tag already exists; refusing to restage an immutable release")
        frozen_sha, frozen_files = remote_files(api, repo, tag)
        require(frozen_files == prepared,
                "Existing immutable HF tag differs from the exact package; publish a newer release")
    branch_exists = any(row.name == args.branch for row in refs.branches)
    decision = stage_decision(
        resume=resume, base=base, baseline_matches=baseline == prepared,
        baseline_same_release=matrix.get("release") == release["release"],
        frozen_sha=frozen_sha, branch_exists=branch_exists)
    branch_required = decision["branch_required"]
    canary_resume = decision["canary_resume"]
    if canary_resume:
        candidate, prior = remote_files(api, repo, args.branch)
        require(candidate == base and prior == prepared,
                "HF canary main/candidate branch exact-state drift")
        require_source_binding(api, repo, candidate, source)
    elif not branch_required:
        candidate = decision["candidate"]
    else:
        if not branch_exists:
            api.create_branch(repo_id=repo, repo_type="dataset", branch=args.branch,
                              revision=base, exist_ok=False)
        candidate, prior = remote_files(api, repo, args.branch)
        if candidate != base:
            require(prior == prepared, "Existing HF candidate differs from the prepared release")
            require_source_binding(api, repo, candidate, source)
        else:
            additions, removals = changes(prior, prepared)
            require(bool(additions or removals), "New HF release has no changed files")
            require(remote_info(api, repo, "main").sha == base, "HF main advanced before staging")
            result = api.create_commit(
                repo_id=repo, repo_type="dataset", revision=args.branch,
                parent_commit=candidate, create_pr=False,
                commit_message=f"Stage release {release['release']} authority distribution",
                commit_description=f"Source-Commit: {source}\nBase-Main: {base}\nVersion-DOI: {release['dataset']['zenodo']['versionDoi']}",
                operations=[*[CommitOperationAdd(path_in_repo=name, path_or_fileobj=io.BytesIO(data))
                              for name, data in sorted(additions.items())],
                            *[CommitOperationDelete(path_in_repo=name) for name in removals]],
            )
            candidate = result.oid
    verified_sha, readback = remote_files(api, repo, candidate)
    require(verified_sha == candidate and readback == prepared, "HF candidate readback mismatch")
    if branch_required:
        require(remote_info(api, repo, args.branch).sha == candidate, "HF candidate advanced concurrently")
    if frozen_sha:
        require(remote_info(api, repo, tag).sha == frozen_sha, "Frozen HF tag changed during recovery")
    require(remote_info(api, repo, "main").sha == base, "HF main advanced during staging")
    stage_mode = "resume-current" if resume else "resume-canary" if canary_resume else "new-release"
    state = {"stage": "HF_CANDIDATE_VERIFIED", "repo": repo, "branch": args.branch,
             "stageMode": stage_mode,
             "release": release["release"], "versionDoi": release["dataset"]["zenodo"]["versionDoi"],
             "sourceCommit": source, "baseMainSha": base, "candidateSha": candidate,
             "branchRequired": branch_required, "frozenTagSha": frozen_sha,
             "files": len(prepared), "sha256": {name: digest(data) for name, data in sorted(prepared.items())}}
    save_state(args.output, state)
    print(json.dumps({key: value for key, value in state.items() if key != "sha256"}))


def verify_stage(args, api):
    state = json.loads(args.state.read_text())
    release, repo, source = publication_context(state["branch"])
    expected = {"stage": "HF_CANDIDATE_VERIFIED", "repo": repo, "release": release["release"],
                "versionDoi": release["dataset"]["zenodo"]["versionDoi"], "sourceCommit": source}
    require(all(state.get(key) == value for key, value in expected.items()), "HF stage ledger identity mismatch")
    mode = state.get("stageMode")
    require(mode in ("new-release", "resume-canary", "resume-current"),
            "HF stage ledger mode is invalid")
    require(SHA.fullmatch(state.get("candidateSha", "")) and SHA.fullmatch(state.get("baseMainSha", "")),
            "Invalid HF stage commit binding")
    if mode == "resume-current":
        frozen_source = subprocess.check_output(
            ["git", "rev-parse", f"v{release['release']}^{{commit}}"], text=True).strip()
        require(frozen_source == source, "Current resume source no longer matches the frozen GitHub tag")
    elif mode == "resume-canary":
        require(state.get("branchRequired") is True
                and state["candidateSha"] == state["baseMainSha"]
                and not state.get("frozenTagSha"), "HF canary resume ledger is inconsistent")
        require_source_binding(api, repo, state["candidateSha"], source)
    else:
        require(state.get("branchRequired") is True
                and state["candidateSha"] != state["baseMainSha"]
                and not state.get("frozenTagSha"), "HF new-release ledger is inconsistent")
    prepared = local_files(args.directory)
    verify_identity(prepared, release)
    require(state["sha256"] == {name: digest(data) for name, data in prepared.items()}, "HF stage ledger file drift")
    require(remote_info(api, repo, "main").sha == state["baseMainSha"], "HF main advanced before promotion")
    if state.get("branchRequired", True):
        require(remote_info(api, repo, state["branch"]).sha == state["candidateSha"], "HF candidate branch drift")
    _, readback = remote_files(api, repo, state["candidateSha"])
    require(readback == prepared, "HF candidate no longer matches the source package")
    refs = api.list_repo_refs(repo_id=repo, repo_type="dataset")
    tag = f"v{release['release']}"
    tag_exists = any(row.name == tag for row in refs.tags)
    if mode != "resume-current":
        require(not tag_exists, "HF target tag appeared before immutable publication")
    elif tag_exists:
        expected_tag = state.get("frozenTagSha") or state["candidateSha"]
        require(remote_info(api, repo, tag).sha == expected_tag, "Frozen HF target tag conflicts before publication")
    else:
        require(not state.get("frozenTagSha"), "Previously verified frozen HF tag disappeared")
    print(json.dumps({"stage": "HF_PREPUBLICATION_PASS", "stageMode": mode,
                      "candidateSha": state["candidateSha"]}))


def self_test():
    def package(items):
        return {**items, MANIFEST: json.dumps({"files": {name: {"bytes": len(data), "sha256": digest(data)}
                                                         for name, data in items.items()}}).encode(),
                ATTRIBUTES: b"*.parquet filter=lfs diff=lfs merge=lfs -text\n"}
    before = package({"README.md": b"old", "viewer/old.parquet": b"PAR1old"})
    after = package({"README.md": b"new", "viewer/new.parquet": b"PAR1new"})
    added, removed = changes(before, after)
    require(set(added) == {"README.md", "viewer/new.parquet", MANIFEST}
            and removed == ["viewer/old.parquet"], "Binary staging plan self-test failed")
    bad = [dict(after, **{"unlisted.txt": b"unexpected"}), dict(after, **{"README.md": b"tampered"}),
           {**after, MANIFEST: json.dumps({"files": {"../escape": {"bytes": 0, "sha256": "0" * 64}}}).encode()}]
    for candidate in bad:
        try:
            validate_files(candidate)
        except RuntimeError:
            continue
        raise RuntimeError("Unsafe package unexpectedly accepted")
    try:
        changes(before, {**after, ATTRIBUTES: b"changed"})
    except RuntimeError:
        pass
    else:
        raise RuntimeError("Changed attributes unexpectedly accepted")

    sha_a, sha_b = "a" * 40, "b" * 40
    plan = stage_decision(resume=False, base=sha_a, baseline_matches=False,
                          baseline_same_release=False, frozen_sha=None, branch_exists=False)
    require(plan == {"candidate": None, "branch_required": True, "canary_resume": False},
            "New release stage decision failed")
    canary = stage_decision(resume=False, base=sha_a, baseline_matches=True,
                            baseline_same_release=True, frozen_sha=None, branch_exists=True)
    require(canary == {"candidate": sha_a, "branch_required": True, "canary_resume": True},
            "Canary resume stage decision failed")
    current = stage_decision(resume=True, base=sha_a, baseline_matches=True,
                             baseline_same_release=True, frozen_sha=None, branch_exists=False)
    require(current == {"candidate": sha_a, "branch_required": False, "canary_resume": False},
            "Exact current-main resume decision failed")
    tagged = stage_decision(resume=True, base=sha_a, baseline_matches=False,
                            baseline_same_release=False, frozen_sha=sha_b, branch_exists=False)
    require(tagged == {"candidate": sha_b, "branch_required": False, "canary_resume": False},
            "Exact immutable-tag resume decision failed")
    failures = [
        dict(resume=False, base=sha_a, baseline_matches=False,
             baseline_same_release=False, frozen_sha=sha_b, branch_exists=False),
        dict(resume=False, base=sha_a, baseline_matches=True,
             baseline_same_release=True, frozen_sha=None, branch_exists=False),
        dict(resume=True, base=sha_a, baseline_matches=False,
             baseline_same_release=True, frozen_sha=None, branch_exists=True),
        dict(resume=True, base=sha_a, baseline_matches=True,
             baseline_same_release=True, frozen_sha=sha_b, branch_exists=True),
    ]
    for case in failures:
        try:
            stage_decision(**case)
        except RuntimeError:
            continue
        raise RuntimeError("Unsafe HF release state unexpectedly accepted")
    print("HF_RELEASE_STAGING_SELF_TEST_PASS exact new/canary/current/tag state machine")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    commands = parser.add_subparsers(dest="command")
    staging = commands.add_parser("stage")
    staging.add_argument("--directory", required=True, type=Path)
    staging.add_argument("--branch", required=True)
    staging.add_argument("--output", required=True, type=Path)
    staging.add_argument("--resume-current", action="store_true",
                         help="Resume only the exact frozen release state; never rewrite an existing HF tag")
    checking = commands.add_parser("verify-stage")
    checking.add_argument("--directory", required=True, type=Path)
    checking.add_argument("--state", required=True, type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    require(args.command in ("stage", "verify-stage"), "A staging command is required")
    import huggingface_hub
    require(huggingface_hub.__version__ == "1.32.0", "Unpinned Hugging Face Hub client")
    token = os.environ.get("HF_TOKEN")
    require(bool(token), "HF_TOKEN is required")
    api = huggingface_hub.HfApi(endpoint="https://huggingface.co", token=token)
    (stage if args.command == "stage" else verify_stage)(args, api)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        message = re.sub(r"https?://\S+", "[URL]", str(exc))
        token = os.environ.get("HF_TOKEN")
        if token:
            message = message.replace(token, "[REDACTED]")
        print(json.dumps({"error": type(exc).__name__, "message": message[:2000]}), file=sys.stderr)
        sys.exit(1)
