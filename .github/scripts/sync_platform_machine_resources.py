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


def fetch(url, *, headers=None):
    request = urllib.request.Request(url, headers={
        'Cache-Control': 'no-cache', 'User-Agent': 'ghezelbaash-machine-resource-sync/1.0', **(headers or {})})
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
    kaggle = json.loads(fetch('https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF))
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


def verify_website_run(url, source_commit, *, allow_promoted_source=False):
    match = re.fullmatch(r'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/(\d+)', url)
    assert match, 'Expected the reviewed website deployment run URL'
    token = os.environ.get('GITHUB_TOKEN')
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    run = json.loads(fetch('https://api.github.com/repos/medicaldoctor91/doctor-ghezelbaash/actions/runs/' + match[1], headers=headers))
    assert run['head_sha'] == source_commit, 'Website run has a different source revision'
    branch = os.environ.get('GITHUB_REF_NAME', 'main')
    if run['head_branch'] != branch:
        assert allow_promoted_source and branch == 'main', 'Website run has a different source branch'
        # Verification may follow an owner-approved promotion to main. The
        # reviewed deployed commit must be an ancestor, with identical product
        # inputs; only publication tooling, tests and evidence may differ.
        assert subprocess.run(['git', 'merge-base', '--is-ancestor', source_commit, 'HEAD'],
                              cwd=REPOSITORY, capture_output=True).returncode == 0, 'Deployed source is not on main'
        assert subprocess.run(['git', 'diff', '--quiet', source_commit, 'HEAD', '--',
                               '.', ':!.github', ':!tests', ':!reports'],
                              cwd=REPOSITORY, capture_output=True).returncode == 0, 'Product inputs differ from deployed source'
    assert run['status'] == 'completed' and run['conclusion'] == 'success', 'Website deployment run did not complete successfully'
    assert run['path'] == '.github/workflows/machine-readable-interop.yml', 'Expected the scoped website deployment workflow'


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


def source_metadata(sources, revision, website_commit):
    assert isinstance(sources, str), 'Expected the reviewed Kaggle source text'
    result = sources.replace(ORIGIN + '/graph.jsonld#dataset', DATASET)
    hub = 'https://huggingface.co/datasets/' + HF_REPO
    result = re.sub(re.escape(hub) + r'(?: at commit |/tree/)[0-9a-f]{40}',
                    hub + '/tree/' + revision, result)
    result = re.sub(r'(Website source commit:\s*)[0-9a-f]{40}',
                    lambda match: match[1] + website_commit, result)
    assert DATASET in result and hub + '/tree/' + revision in result, 'Expected source pointers were not found'
    assert 'Website source commit: ' + website_commit in result, 'Expected website source pointer was not found'
    return result


def correct_kaggle_sources(client, root, control, revision, expected_version, website_commit):
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
    desired = source_metadata(before['userSpecifiedSources'], revision, website_commit)
    target = dict(before)
    target['userSpecifiedSources'] = desired
    # No payload or cover-image files are present in this metadata-only directory.
    dump(directory / 'dataset-metadata.json', target)
    guard_kaggle_version(json.loads(fetch('https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF)), expected_version)
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
    return {'verified': True, 'verificationScope': 'owner metadata settings', 'canonicalDatasetIri': DATASET,
            'pinnedHuggingFaceRevision': revision, 'websiteSourceCommit': website_commit, 'preservedFields': preserved}


def verify_public_kaggle_sources(revision, website_commit):
    # Kaggle's documented GetDatasetMetadata RPC is a read-only POST.
    owner, dataset = KAGGLE_REF.split('/')
    request = urllib.request.Request('https://api.kaggle.com/v1/datasets.DatasetApiService/GetDatasetMetadata',
        data=json.dumps({'ownerSlug': owner, 'datasetSlug': dataset}).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=60) as response:
        wrapped = json.load(response)
    public = wrapped.get('info') or wrapped
    sources = public['userSpecifiedSources']
    assert sources == source_metadata(sources, revision, website_commit), 'Public Kaggle source metadata still differs from the published release'
    return {'verified': True, 'pinnedHuggingFaceRevision': revision, 'websiteSourceCommit': website_commit}


def prepare(args):
    from huggingface_hub import hf_hub_download
    if args.website_run_url:
        verify_website_run(args.website_run_url, args.website_commit)
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
    positioning_rows = load(stage / 'viewer/packaging.json')['tables']['market_positioning']['rows']
    changes = [file for file in stage.rglob('*') if file.is_file() and
               old.get(file.relative_to(stage).as_posix(), {}).get('sha256') != sha(file)]
    guard(args)
    result = api.create_commit(HF_REPO, repo_type='dataset', revision='main',
        parent_commit=args.hf_revision,
        operations=[CommitOperationAdd(path_in_repo=file.relative_to(stage).as_posix(),
                                       path_or_fileobj=str(file)) for file in changes],
        commit_message=f'Preserve original positioning and distribute {positioning_rows} competitive training examples (v1.3.4 maintenance)',
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
    kaggle = json.loads(fetch('https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF))
    guard_kaggle_version(kaggle, args.kaggle_version)
    assert json.loads(fetch(ORIGIN + '/release-provenance.json'))['sourceCommit'] == args.website_commit
    assert fetch(ORIGIN + '/integrity-manifest.json') == (root / 'website/integrity-manifest.json').read_bytes(), 'Website changed before Kaggle publication'
    client = kaggle_client()
    # The SDK version upload reads description/files but inherits source settings.
    # Stage the verified source pointers before creating the immutable version.
    baseline_control = load(root / 'kaggle-before/dataset-metadata.json')
    report['kaggleSourceMetadataBeforeVersion'] = correct_kaggle_sources(
        client, root, baseline_control, revision, args.kaggle_version, args.website_commit)
    control['userSpecifiedSources'] = source_metadata(control['userSpecifiedSources'], revision, args.website_commit)
    dump(kg_stage / 'dataset-metadata.json', control)
    dump(root / 'publication-report.json', report)
    response = None
    ambiguous_error = None
    try:
        response = client.dataset_create_version(str(kg_stage),
            version_notes=f'Maintain content baseline v1.3.4: preserve original positioning and distribute {positioning_rows} typed competitive training examples',
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
        view = json.loads(fetch('https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF))
        assert int(view['currentVersionNumber']) <= desired_version, 'A newer external Kaggle version appeared during verification'
        assert not any(int(item['versionNumber']) > desired_version for item in view.get('versions', [])), 'A newer Kaggle version appeared during verification'
        ready = any(int(item['versionNumber']) == desired_version and item['status'] == 'Ready' for item in view.get('versions', []))
        if ready and int(view['currentVersionNumber']) == desired_version:
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
    report['kaggleSourceMetadata'] = correct_kaggle_sources(client, root, control, revision, desired_version, args.website_commit)
    dump(root / 'publication-report.json', report)
    report['kagglePublicSourceMetadata'] = verify_public_kaggle_sources(revision, args.website_commit)
    report['websiteUnchanged'] = (
        json.loads(fetch(ORIGIN + '/release-provenance.json'))['sourceCommit'] == args.website_commit
        and fetch(ORIGIN + '/integrity-manifest.json') == (root / 'website/integrity-manifest.json').read_bytes())
    dump(root / 'publication-report.json', report)
    assert report['websiteUnchanged'], 'Website changed during platform publication'
    assert json.loads(fetch('https://huggingface.co/api/datasets/' + HF_REPO))['sha'] == revision, 'HF changed during platform publication'
    guard_kaggle_version(json.loads(fetch('https://api.kaggle.com/v1/datasets/view/' + KAGGLE_REF)), desired_version)
    print(json.dumps(report), flush=True)


def verify_existing(args):
    """Finish byte/metadata verification without another HF commit or Kaggle version."""
    verify_website_run(args.website_run_url, args.website_commit, allow_promoted_source=True)
    root = args.root
    root.mkdir(parents=True, exist_ok=True)
    client = kaggle_client()
    control_dir = root / 'kaggle-owner-metadata'
    control_dir.mkdir(exist_ok=True)
    client.dataset_metadata(KAGGLE_REF, str(control_dir))
    wrapped = load(control_dir / 'dataset-metadata.json')
    control = dict(wrapped.get('info') or wrapped)
    report = {'websiteSourceCommit': args.website_commit, 'hfRevision': args.hf_revision,
              'reviewedKaggleVersion': args.kaggle_version, 'phase': 'read-only preflight',
              'kaggleOwnerState': json.loads(client.dataset_status(KAGGLE_REF, format='json(status,current_version_number)')),
              'ownerSourceMetadata': control.get('userSpecifiedSources'),
              'ownerDescriptionSha256': hashlib.sha256(control['description'].strip().encode()).hexdigest()}
    dump(root / 'publication-report.json', report)
    _, overview, _ = guard(args)
    manifest_body = fetch(ORIGIN + '/integrity-manifest.json')
    website_files = json.loads(manifest_body)['files']
    payload = root / 'kaggle-published'
    download_kaggle(args.kaggle_version, payload, root / 'kaggle-published.zip')
    package = load(payload / 'kaggle-manifest.json')
    assert package['upstream_revision'] == args.hf_revision, 'Published Kaggle pins a different HF revision'
    validate_package(payload, 'kaggle', args.website_commit, root / 'kaggle-live-validation.json')
    inventory = json.loads(fetch('https://huggingface.co/datasets/' + HF_REPO + '/resolve/' + args.hf_revision + '/dist-sha256.json'))['files']
    mirrored = {item['path'] for item in package['original_files']}
    mirrored |= {item['file'] for item in load(payload / 'viewer/packaging.json')['tables'].values()}
    for name in mirrored:
        source = 'datapackage.json' if name == 'frictionless-datapackage.json' else name
        digest = sha(payload / relative_path(name))
        assert digest == inventory[source]['sha256'], ('Kaggle/HF byte mismatch', name)
        if '/' + source in website_files:
            assert digest == website_files['/' + source]['sha256'], ('Kaggle/website byte mismatch', name)
    report.update({'packagePublicationRun': package['package_publication_run_url'], 'phase': 'payload verified',
              'verificationRun': context(args.website_commit, os.environ.get('GITHUB_RUN_ID', '0'))['run_url'],
              'kaggle': {'version': args.kaggle_version, 'payloadVerified': True, 'mirroredFiles': len(mirrored)},
              'kaggleOverviewVersionNumber': int(overview['currentVersionNumber']),
              'ownerDescriptionMatchesPayload': control['description'].strip() == (payload / 'README.md').read_text().strip()})
    dump(root / 'publication-report.json', report)
    assert report['ownerDescriptionMatchesPayload'], 'Owner description differs from the published payload; do not overwrite independent metadata'
    guard(args)
    assert fetch(ORIGIN + '/integrity-manifest.json') == manifest_body, 'Website changed during verification'
    report['kaggleSourceMetadata'] = correct_kaggle_sources(client, root, control, args.hf_revision, args.kaggle_version, args.website_commit)
    dump(root / 'publication-report.json', report)
    report['kagglePublicSourceMetadata'] = verify_public_kaggle_sources(args.hf_revision, args.website_commit)
    _, final_overview, _ = guard(args)
    assert fetch(ORIGIN + '/integrity-manifest.json') == manifest_body, 'Website changed during metadata verification'
    report['kaggleOverviewVersionNumber'] = int(final_overview['currentVersionNumber'])
    report['verified'] = True
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
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args()
    for value in [args.hf_revision, args.website_commit]:
        assert re.fullmatch(r'[0-9a-f]{40}', value), 'Expected an exact 40-character revision'
    if args.website_run_url:
        assert re.fullmatch(r'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/\d+', args.website_run_url)
    assert args.kaggle_version > 0
    assert not (args.prepare_only and args.verify_existing)
    if not args.prepare_only:
        assert args.website_run_url, 'Publishing requires the verified website deployment run'
        missing = [name for name in ['HF_TOKEN', 'KAGGLE_API_TOKEN'] if not os.environ.get(name)]
        assert not missing, 'Missing existing publication bindings: ' + ', '.join(missing)
    if args.verify_existing:
        verify_existing(args)
        return
    ctx, control = prepare(args)
    if not args.prepare_only:
        publish(args, ctx, control)


if __name__ == '__main__':
    main()
