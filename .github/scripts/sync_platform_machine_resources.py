"""Validate and publish the current website's machine resources to HF and Kaggle."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

from platform_bundle import DATASET, HF_REPO, KAGGLE_REF, build_hf, build_kaggle, context, dump, load, sha

ORIGIN = 'https://www.ghezelbaash.ir'
REPOSITORY = Path(__file__).resolve().parents[2]


def relative_path(name):
    value = name.lstrip('/')
    parts = PurePosixPath(value).parts
    if not value or '\\' in value or '\x00' in value or '..' in parts or '.git' in parts:
        raise ValueError('Unsafe package path: ' + name)
    return value


def fetch(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'ghezelbaash-machine-resource-sync/1.0'})
    # Retry reads only; publication writes have their own explicit race guards.
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def public_state():
    hf = json.loads(fetch('https://huggingface.co/api/datasets/' + HF_REPO))
    kaggle = json.loads(fetch('https://www.kaggle.com/api/v1/datasets/view/' + KAGGLE_REF))
    website = json.loads(fetch(ORIGIN + '/release-provenance.json'))
    return hf, kaggle, website


def guard_kaggle_version(kaggle, expected_version):
    assert int(kaggle['currentVersionNumber']) == expected_version, 'Kaggle changed since review'
    versions = kaggle.get('versions', [])
    current = next((version for version in versions if int(version['versionNumber']) == expected_version), None)
    assert current is not None and current['status'] == 'Ready', 'Reviewed Kaggle version is not Ready'
    assert not any(int(version['versionNumber']) > expected_version for version in versions), 'A newer Kaggle version is already pending'


def guard(args):
    hf, kaggle, website = public_state()
    assert hf['sha'] == args.hf_revision, 'HF changed since review; do not overwrite the new revision'
    guard_kaggle_version(kaggle, args.kaggle_version)
    assert website['sourceCommit'] == args.website_commit, 'The published website changed since review'
    assert not hf.get('private') and not hf.get('gated') and not kaggle.get('isPrivate')
    return hf, kaggle, website


def extract_package(archive, root):
    root.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        assert zipped.testzip() is None, 'Corrupt Kaggle ZIP'
        for member in zipped.infolist():
            name = relative_path(member.filename)
            assert not stat.S_ISLNK(member.external_attr >> 16), 'Package symlink not permitted'
            if member.is_dir():
                continue
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zipped.read(member))


def download_kaggle(version, root, archive):
    url = 'https://www.kaggle.com/api/v1/datasets/download/' + KAGGLE_REF
    url += '?' + urllib.parse.urlencode({'datasetVersionNumber': version})
    archive.write_bytes(fetch(url))
    extract_package(archive, root)
    assert int(load(root / 'kaggle-manifest.json')['desired_kaggle_version']) == version


def validate_package(root, platform, source_commit, report):
    subprocess.run([sys.executable, str(REPOSITORY / 'tests/validate_platform_sync.py'),
                    str(root), '--platform', platform, '--source-commit', source_commit,
                    '--report', str(report)], check=True, cwd=REPOSITORY)


def kaggle_client():
    from kaggle.api.kaggle_api_extended import KaggleApi

    class SingleVersionWrite(KaggleApi):
        def with_retry(self, function, *args, **kwargs):
            if getattr(function, '__name__', '') in {'create_dataset_version', 'create_dataset_version_by_id', 'update_dataset_metadata'}:
                return function
            return super().with_retry(function, *args, **kwargs)

    api = SingleVersionWrite()
    api.authenticate()
    return api


def semantic_metadata(value):
    if isinstance(value, dict):
        return {key: semantic_metadata(item) for key, item in value.items()
                if not key.endswith('Nullable') and not re.match(r'^has[A-Z]', key)}
    if isinstance(value, list):
        return [semantic_metadata(item) for item in value]
    return value


def source_metadata(sources, revision):
    assert isinstance(sources, str), 'Expected the reviewed Kaggle source text'
    result = sources.replace(ORIGIN + '/graph.jsonld#dataset', DATASET)
    hub = 'https://huggingface.co/datasets/' + HF_REPO
    result = re.sub(re.escape(hub) + r'(?: at commit |/tree/)[0-9a-f]{40}',
                    hub + '/tree/' + revision, result)
    assert DATASET in result and hub + '/tree/' + revision in result, 'Expected source pointers were not found'
    return result


def correct_kaggle_sources(client, root, control, revision, expected_version):
    directory = root / 'kaggle-metadata-before'
    directory.mkdir(exist_ok=True)
    client.dataset_metadata(KAGGLE_REF, str(directory))
    wrapped = load(directory / 'dataset-metadata.json')
    before = dict(wrapped.get('info') or wrapped)
    preserved = ['title', 'subtitle', 'isPrivate', 'licenses', 'keywords',
                 'collaborators', 'data', 'expectedUpdateFrequency', 'description']
    for name in preserved:
        if name in control and name not in {'data', 'description'}:
            assert semantic_metadata(before.get(name)) == semantic_metadata(control[name]), ('Kaggle metadata changed independently', name)
    assert before['description'].strip() == control['description'].strip(), 'Kaggle description changed independently'
    assert before['userSpecifiedSources'] == control['userSpecifiedSources'], 'Kaggle sources changed independently'
    desired = source_metadata(before['userSpecifiedSources'], revision)
    target = dict(before)
    target['userSpecifiedSources'] = desired
    # No payload or cover-image files are present in this metadata-only directory.
    dump(directory / 'dataset-metadata.json', target)
    guard_kaggle_version(json.loads(fetch('https://www.kaggle.com/api/v1/datasets/view/' + KAGGLE_REF)), expected_version)
    error = None
    if desired != before['userSpecifiedSources']:
        try:
            client.dataset_metadata_update(KAGGLE_REF, str(directory))
        except Exception as exception:
            error = type(exception).__name__
    after_directory = root / 'kaggle-metadata-after'
    after_directory.mkdir(exist_ok=True)
    client.dataset_metadata(KAGGLE_REF, str(after_directory))
    wrapped = load(after_directory / 'dataset-metadata.json')
    after = wrapped.get('info') or wrapped
    assert after['userSpecifiedSources'] == desired, 'Source metadata update was not confirmed: ' + str(error)
    for name in preserved:
        assert semantic_metadata(before.get(name)) == semantic_metadata(after.get(name)), ('Unexpected metadata change', name)
    return {'verified': True, 'canonicalDatasetIri': DATASET,
            'pinnedHuggingFaceRevision': revision, 'preservedFields': preserved}


def prepare(args):
    from huggingface_hub import hf_hub_download
    hf_info, kg_info, _ = guard(args)
    root = args.root
    root.mkdir(parents=True, exist_ok=True)
    manifest_body = fetch(ORIGIN + '/integrity-manifest.json')
    manifest = json.loads(manifest_body)
    baseline = root / 'hf-before'
    website = root / 'website'
    baseline.mkdir(exist_ok=True)
    website.mkdir(exist_ok=True)
    site_names = {relative_path(name) for name in manifest['files']} | {'integrity-manifest.json'}
    hub_names = {relative_path(file['rfilename']) for file in hf_info['siblings']}

    def hub_file(name):
        cached = hf_hub_download(HF_REPO, filename=name, repo_type='dataset',
                                 revision=args.hf_revision, token=False)
        target = baseline / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cached, target)
        return target

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(hub_file, sorted(hub_names - site_names)))
    old_inventory = load(baseline / 'dist-sha256.json')['files']
    sources = {}

    def website_file(item):
        public_path, expected = item
        name = relative_path(public_path)
        target = website / name
        target.parent.mkdir(parents=True, exist_ok=True)
        compiled = args.compiled_root / name
        if compiled.is_file() and compiled.stat().st_size == expected['bytes'] and sha(compiled) == expected['sha256']:
            shutil.copyfile(compiled, target)
            sources[name] = 'compiled-exact-match'
        elif old_inventory.get(name, {}).get('sha256') == expected['sha256'] and name in hub_names:
            cached = hub_file(name)
            assert cached.stat().st_size == expected['bytes'] and sha(cached) == expected['sha256'], name
            shutil.copyfile(cached, target)
            sources[name] = 'pinned-HF-exact-match'
        else:
            target.write_bytes(fetch(ORIGIN + '/' + urllib.parse.quote(name, safe='/')))
            assert target.stat().st_size == expected['bytes'] and sha(target) == expected['sha256'], name
            sources[name] = 'verified-live-origin'

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(website_file, manifest['files'].items()))
    (website / 'integrity-manifest.json').write_bytes(manifest_body)
    assert load(website / 'release-provenance.json')['sourceCommit'] == args.website_commit
    assert fetch(ORIGIN + '/integrity-manifest.json') == manifest_body, 'Website changed during snapshot download'

    previous = root / 'kaggle-before'
    download_kaggle(args.kaggle_version, previous, root / 'kaggle-before.zip')
    if not args.prepare_only:
        api = kaggle_client()
        api.dataset_metadata(KAGGLE_REF, str(previous))
        control = load(previous / 'dataset-metadata.json')
        control = dict(control.get('info') or control)
    else:
        # Local review contains the public payload; CI reads full owner metadata.
        control = {'id': KAGGLE_REF, 'title': kg_info['title'],
                   'description': kg_info.get('description', ''), 'keywords': []}
    control['id'] = KAGGLE_REF
    if control.get('id_no'):
        assert int(control['id_no']) == int(kg_info['id'])
    dump(previous / 'dataset-metadata.json', control)

    ctx = context(args.website_commit, os.environ.get('GITHUB_RUN_ID', '0'))
    ctx.update(publication_scope=['hf', 'kaggle'], archived_snapshots_updated=False,
               publication_commit=os.environ.get('GITHUB_SHA') or subprocess.check_output(
                   ['git', 'rev-parse', 'HEAD'], cwd=REPOSITORY).decode().strip())
    if args.website_run_url:
        ctx['website_publication_run_url'] = args.website_run_url
    hf_stage = root / 'hf'
    build_hf(website, baseline, hf_stage, ctx)
    kg_preview = root / 'kaggle-preview'
    description = build_kaggle(hf_stage, previous, kg_preview, ctx,
                               args.kaggle_version + 1, args.hf_revision)
    control['description'] = description
    dump(kg_preview / 'dataset-metadata.json', control)
    dump(root / 'context.json', ctx)
    dump(root / 'website-file-sources.json', sources)
    validate_package(hf_stage, 'hf', args.website_commit, root / 'hf-validation.json')
    validate_package(kg_preview, 'kaggle', args.website_commit, root / 'kaggle-preview-validation.json')
    guard(args)
    print('Both staged packages passed before publication', flush=True)
    return ctx, control


def publish(args, ctx, control):
    from huggingface_hub import HfApi, CommitOperationAdd, hf_hub_download
    root = args.root
    api = HfApi(token=os.environ['HF_TOKEN'])
    old = load(root / 'hf-before/dist-sha256.json')['files']
    stage = root / 'hf'
    changes = [file for file in stage.rglob('*') if file.is_file() and
               old.get(file.relative_to(stage).as_posix(), {}).get('sha256') != sha(file)]
    guard(args)
    result = api.create_commit(HF_REPO, repo_type='dataset', revision='main',
        parent_commit=args.hf_revision,
        operations=[CommitOperationAdd(path_in_repo=file.relative_to(stage).as_posix(),
                                       path_or_fileobj=str(file)) for file in changes],
        commit_message='Synchronize verified Croissant, complete SHACL, vCards and DCAT',
        commit_description='Published website source ' + args.website_commit + '; package run ' + ctx['run_url'])
    revision = result.oid
    report = {'websiteSourceCommit': args.website_commit, 'publicationRun': ctx['run_url'],
              'hfRevision': revision, 'hfChangedFiles': len(changes), 'scope': ['hf', 'kaggle']}
    dump(root / 'publication-report.json', report)
    for file in changes:
        name = file.relative_to(stage).as_posix()
        actual = hf_hub_download(HF_REPO, filename=name, repo_type='dataset', revision=revision,
                                token=os.environ['HF_TOKEN'], force_download=True)
        assert sha(actual) == sha(file), ('Published HF bytes', name)
    print('Published HF immutable revision ' + revision, flush=True)

    kg_stage = root / 'kaggle'
    description = build_kaggle(stage, root / 'kaggle-before', kg_stage, ctx,
                               args.kaggle_version + 1, revision)
    control['description'] = description
    dump(kg_stage / 'dataset-metadata.json', control)
    validate_package(kg_stage, 'kaggle', args.website_commit, root / 'kaggle-validation.json')
    kaggle = json.loads(fetch('https://www.kaggle.com/api/v1/datasets/view/' + KAGGLE_REF))
    guard_kaggle_version(kaggle, args.kaggle_version)
    assert json.loads(fetch(ORIGIN + '/release-provenance.json'))['sourceCommit'] == args.website_commit
    assert fetch(ORIGIN + '/integrity-manifest.json') == (root / 'website/integrity-manifest.json').read_bytes(), 'Website changed before Kaggle publication'
    client = kaggle_client()
    response = None
    ambiguous_error = None
    try:
        response = client.dataset_create_version(str(kg_stage),
            version_notes='Synchronize complete SHACL, valid Croissant, vCards, measured DCAT and exact package hashes',
            quiet=True, convert_to_csv=False, delete_old_versions=False, dir_mode='zip')
        if response is None or getattr(response, 'invalid_tags', None) or str(getattr(response, 'status', '')).lower() != 'ok':
            ambiguous_error = 'Kaggle did not return a confirmed successful version submission'
    except Exception as error:
        # No automatic second version POST. Public version/hash proof resolves an ambiguous response.
        ambiguous_error = type(error).__name__ + ': ' + str(error)[:300]
    if ambiguous_error:
        report['kaggleSubmissionUncertain'] = ambiguous_error
        dump(root / 'publication-report.json', report)

    desired_version = args.kaggle_version + 1
    verified = None
    for attempt in range(30):
        view = json.loads(fetch('https://www.kaggle.com/api/v1/datasets/view/' + KAGGLE_REF))
        version = int(view['currentVersionNumber'])
        assert version <= desired_version, 'A newer external Kaggle version appeared during verification'
        if version == desired_version:
            candidate = root / ('kaggle-live-' + str(attempt))
            try:
                download_kaggle(desired_version, candidate, root / ('kaggle-live-' + str(attempt) + '.zip'))
                assert load(candidate / 'kaggle-manifest.json')['upstream_revision'] == revision
                for line in (kg_stage / 'checksums.sha256').read_text().splitlines():
                    digest, name = line.split('  ', 1)
                    assert sha(candidate / relative_path(name)) == digest, ('Published Kaggle bytes', name)
                assert sha(candidate / 'checksums.sha256') == sha(kg_stage / 'checksums.sha256')
                verified = candidate
                break
            except (AssertionError, urllib.error.URLError, zipfile.BadZipFile, json.JSONDecodeError, TimeoutError):
                if attempt == 29:
                    raise
        time.sleep(10)
    assert verified is not None, 'Kaggle publication was not confirmed; inspect public version before any retry'
    validate_package(verified, 'kaggle', args.website_commit, root / 'kaggle-live-validation.json')
    report['kaggle'] = {'version': desired_version, 'verified': True,
                         'payloadFiles': sum(1 for path in verified.rglob('*') if path.is_file())}
    dump(root / 'publication-report.json', report)
    report['kaggleSourceMetadata'] = correct_kaggle_sources(client, root, control, revision, desired_version)
    report['websiteUnchanged'] = json.loads(fetch(ORIGIN + '/release-provenance.json'))['sourceCommit'] == args.website_commit
    dump(root / 'publication-report.json', report)
    print(json.dumps(report), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--compiled-root', type=Path, default=REPOSITORY / 'dist')
    parser.add_argument('--hf-revision', required=True)
    parser.add_argument('--kaggle-version', type=int, required=True)
    parser.add_argument('--website-commit', required=True)
    parser.add_argument('--website-run-url', default='')
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    for value in [args.hf_revision, args.website_commit]:
        assert re.fullmatch(r'[0-9a-f]{40}', value), 'Expected an exact 40-character revision'
    if args.website_run_url:
        assert re.fullmatch(r'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/\d+', args.website_run_url)
    assert args.kaggle_version > 0
    if not args.prepare_only:
        missing = [name for name in ['HF_TOKEN', 'KAGGLE_API_TOKEN'] if not os.environ.get(name)]
        assert not missing, 'Missing existing publication bindings: ' + ', '.join(missing)
    ctx, control = prepare(args)
    if not args.prepare_only:
        publish(args, ctx, control)


if __name__ == '__main__':
    main()
