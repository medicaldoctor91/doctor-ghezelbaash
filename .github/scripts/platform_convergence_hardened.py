"""Hardened external convergence orchestrator."""
import argparse
import json
import os
import re
from pathlib import Path
from types import SimpleNamespace

import sync_platform_machine_resources as sync

EXPECTED_WEBSITE_COMMIT = 'EXPECTED_' + 'WEBSITE_COMMIT'
EXPECTED_HF_REVISION = 'EXPECTED_' + 'HF_REVISION'
EXPECTED_KAGGLE_VERSION = 'EXPECTED_' + 'KAGGLE_VERSION'

STALE_PLATFORM_ANCHORS = {
    'old-openalex': 'A5064828898',
    'old-dataset-iri': 'https://www.ghezelbaash.ir/graph.jsonld#dataset',
    'stale-place-id': 'ChIJBTOYDOTt-j8RD-7mAPy6Zas',
    'obsolete-doi': '10.5281/zenodo.18765169',
}
TEXT_SUFFIXES = {'.txt', '.md', '.json', '.jsonl', '.csv', '.xml', '.ttl', '.html', '.yml', '.yaml'}


def exact_revision(value, label):
    assert re.fullmatch(r'[0-9a-f]{40}', value or ''), label + ' must be an exact 40-character revision'
    return value


def is_obsolete_hf_asset(name):
    return name == '_headers.content-digest.pending'


def semantic_lint_platform_only(root, names):
    root = Path(root)
    violations = []
    for name in sorted(names):
        path = root / name
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding='utf-8', errors='replace')
        for code, anchor in STALE_PLATFORM_ANCHORS.items():
            if anchor in text:
                violations.append({'file': name, 'code': code, 'anchor': anchor})
    return violations


def package_files(root, exclude=()):
    root = Path(root)
    excluded = set(exclude)
    return {path.relative_to(root).as_posix() for path in root.rglob('*')
            if path.is_file() and path.relative_to(root).as_posix() not in excluded}


def rebuild_hf_inventory(stage, source_commit):
    stage = Path(stage)
    files = {}
    for name in sorted(package_files(stage, {'dist-sha256.json'})):
        path = stage / name
        files[name] = {'bytes': path.stat().st_size, 'sha256': sync.sha(path)}
    sync.dump(stage / 'dist-sha256.json', {
        'algorithm': 'sha256',
        'canonicalDatasetIri': sync.DATASET,
        'sourceCommit': source_commit,
        'websiteIntegrityManifestSha256': sync.sha(stage / 'integrity-manifest.json'),
        'files': files,
    })


def apply_hf_asset_policy(root, source_commit):
    root = Path(root)
    stage = root / 'hf'
    website = root / 'website'
    website_names = package_files(website)
    stage_names = package_files(stage, {'dist-sha256.json'})
    platform_only = stage_names - website_names
    removed = []
    for name in sorted(platform_only):
        if is_obsolete_hf_asset(name):
            (stage / name).unlink()
            removed.append(name)
    platform_only = package_files(stage, {'dist-sha256.json'}) - website_names
    violations = semantic_lint_platform_only(stage, platform_only)
    rebuild_hf_inventory(stage, source_commit)
    report = {
        'platformOnlyFiles': sorted(platform_only),
        'removedObsolete': removed,
        'semanticViolations': violations,
    }
    sync.dump(root / 'hf-platform-only-lint.json', report)
    return report


def reviewed_args(root, prepare_only):
    website_commit = exact_revision(os.environ.get(EXPECTED_WEBSITE_COMMIT), 'website commit')
    hf_revision = exact_revision(os.environ.get(EXPECTED_HF_REVISION), 'HF revision')
    kaggle_version = int(os.environ[EXPECTED_KAGGLE_VERSION])
    assert kaggle_version > 0
    return SimpleNamespace(root=Path(root), compiled_root=sync.REPOSITORY / 'dist',
                           hf_revision=hf_revision, kaggle_version=kaggle_version,
                           website_commit=website_commit, website_run_url='',
                           prepare_only=prepare_only)


def verify_reviewed_origin(args):
    release_before = json.loads(sync.fetch(sync.ORIGIN + '/release-provenance.json'))
    assert release_before.get('sourceCommit') == args.website_commit, 'Reviewed website commit is no longer live'
    manifest_before = sync.fetch(sync.ORIGIN + '/integrity-manifest.json')
    ctx, control = sync.prepare(args)
    policy = apply_hf_asset_policy(args.root, args.website_commit)
    assert not policy['semanticViolations'], 'HF-only semantic drift: ' + json.dumps(policy['semanticViolations'], ensure_ascii=False)
    sync.validate_package(args.root / 'hf', 'hf', args.website_commit, args.root / 'hf-validation-hardened.json')
    assert sync.fetch(sync.ORIGIN + '/integrity-manifest.json') == manifest_before, 'Website changed during snapshot download'
    release_after = json.loads(sync.fetch(sync.ORIGIN + '/release-provenance.json'))
    assert release_after.get('sourceCommit') == args.website_commit, 'Website changed during snapshot download'
    return ctx, control


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='/tmp/platform-convergence-hardened')
    parser.add_argument('--prepare-only', action='store_true')
    parsed = parser.parse_args()
    args = reviewed_args(parsed.root, parsed.prepare_only)
    verify_reviewed_origin(args)
    if not args.prepare_only:
        raise RuntimeError('Publication remains gated until all hardening checks are implemented')
    print(json.dumps({'status': 'PREPARED', 'websiteSourceCommit': args.website_commit,
                      'hfRevisionReviewed': args.hf_revision,
                      'kaggleVersionReviewed': args.kaggle_version}, ensure_ascii=False))


if __name__ == '__main__':
    main()
