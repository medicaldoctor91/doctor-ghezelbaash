"""Read a complete exact Kaggle baseline while public bundle creation is pending."""
import concurrent.futures
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import quote, urlencode

import requests


def public_baseline_state(owner, public, version):
    assert owner == {'version': version, 'status': 'ready'}, 'Kaggle owner baseline is not Ready'
    current = public['currentVersionNumber']
    assert current in {version, version - 1}, ('Unexpected public Kaggle baseline', current, version)
    versions = public.get('versions', [])
    assert any(v['versionNumber'] == version and v.get('status', '').lower() == 'ready' for v in versions), 'Exact Kaggle baseline is not publicly listed Ready'
    assert not any(v['versionNumber'] > version for v in versions), 'A newer Kaggle baseline exists'
    return {'ownerVersion': version, 'ownerStatus': 'ready', 'publicDefaultVersion': current,
            'exactVersionListedReady': True, 'publicDefaultPending': current != version}


def safe_path(name):
    assert isinstance(name, str) and name and not name.startswith('/') and '\\' not in name and '\0' not in name, 'Unsafe Kaggle baseline path'
    parts = PurePosixPath(name).parts
    assert parts and not ({'..', '.git'} & set(parts)) and PurePosixPath(name).as_posix() == name, 'Unsafe Kaggle baseline path'
    return name


def checksum_inventory(body):
    expected = {}
    for line in body.decode().splitlines():
        digest, name = line.split('  ', 1)
        safe_path(name)
        assert re.fullmatch(r'[a-f0-9]{64}', digest) and name not in expected and name != 'checksums.sha256', 'Invalid Kaggle checksum inventory'
        expected[name] = digest
    assert expected, 'Empty Kaggle checksum inventory'
    return expected


def prepare_baseline(work, ref, version, hf_revision, source_commit, read, extract_package, publication):
    """Use the exact ZIP, or verified public files only for its specific missing-bundle error."""
    work = Path(work)
    target = work / 'kaggle-before'
    target.mkdir(parents=True, exist_ok=True)
    base = 'https://www.kaggle.com/api/v1/datasets/'
    download = base + 'download/' + ref
    evidence = {**publication, 'version': version, 'sourceCommit': source_commit, 'hfRevision': hf_revision}
    try:
        response = read(download + '?' + urlencode({'datasetVersionNumber': version}))
    except requests.HTTPError as error:
        response = error.response
        if response is None or response.status_code != 404:
            raise
        try:
            message = response.json().get('message')
        except (ValueError, AttributeError):
            raise error
        if message != 'No gcs url found':
            raise
        evidence.update(method='public-exact-version-individual-files', exactBundleStatus=404,
                        exactBundleError=message, bundlePublic=False)
        listed = {}
        token = ''
        seen_tokens = set()
        for _ in range(100):
            params = {'datasetVersionNumber': version, 'pageSize': 1000}
            if token:
                params['pageToken'] = token
            page = read(base + 'list/' + ref + '?' + urlencode(params)).json()
            assert not page.get('errorMessage'), 'Kaggle file listing failed'
            files = page.get('datasetFiles')
            assert isinstance(files, list) and files, 'Empty or invalid Kaggle file-list page'
            for item in files:
                name = safe_path(item['name'])
                assert name not in listed and type(item['totalBytes']) is int and item['totalBytes'] >= 0, 'Duplicate or invalid Kaggle file listing'
                listed[name] = item['totalBytes']
            token = page.get('nextPageToken', '')
            if not token:
                break
            assert isinstance(token, str) and token not in seen_tokens, 'Repeated Kaggle pagination token'
            seen_tokens.add(token)
        else:
            raise AssertionError('Kaggle file listing exceeded bounded pagination')
        assert 'checksums.sha256' in listed, 'Kaggle file listing omits checksums'
        def file_body(name):
            body = read(download + '/' + quote(name, safe='') + '?' + urlencode({'datasetVersionNumber': version, 'raw': 'true'})).content
            assert len(body) == listed[name], ('Kaggle file size differs', name)
            return body
        checksums = file_body('checksums.sha256')
        expected = checksum_inventory(checksums)
        assert set(listed) == set(expected) | {'checksums.sha256'}, 'Incomplete Kaggle file-list/checksum coverage'
        (target / 'checksums.sha256').write_bytes(checksums)
        def download_file(item):
            name, digest = item
            body = file_body(name)
            assert hashlib.sha256(body).hexdigest() == digest, ('Kaggle baseline checksum differs', name)
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(download_file, expected.items()))
        evidence.update(publicFilesVerified=len(listed), completeFileListing=True)
    else:
        archive = work / 'kaggle-before.zip'
        archive.write_bytes(response.content)
        extract_package(archive, target)
        evidence.update(method='public-exact-version-zip', exactBundleStatus=200, bundlePublic=True,
                        zipSHA256=hashlib.sha256(response.content).hexdigest())
    expected = checksum_inventory((target / 'checksums.sha256').read_bytes())
    actual = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
    assert actual == set(expected) | {'checksums.sha256'}, 'Incomplete Kaggle baseline checksum coverage'
    for name, digest in expected.items():
        assert hashlib.sha256((target / name).read_bytes()).hexdigest() == digest, ('Kaggle baseline checksum differs', name)
    manifest = json.loads((target / 'kaggle-manifest.json').read_text())
    assert manifest['desired_kaggle_version'] == version, 'Wrong Kaggle baseline version'
    assert manifest['upstream_revision'] == hf_revision, 'Wrong Kaggle baseline HF revision'
    assert manifest['website_source_commit'] == source_commit, 'Wrong Kaggle baseline website source'
    for item in manifest['original_files']:
        name = safe_path(item['path'])
        assert name in expected and (target / name).stat().st_size == item['bytes'] and expected[name] == item['sha256'], ('Kaggle original resource differs', name)
    evidence.update(publicFilesVerified=len(actual), packageChecksumsVerified=len(expected),
                    fullPublicBaselineVerified=False, defaultBundleVerified=False,
                    verificationScope='Exact-version inputs verified; default ZIP is checked by the final publication gate',
                    finalPublicationGate='Still requires target current/default pointer plus exact/default ZIP equality before notebook publication')
    (work / 'baseline-publication-evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    return evidence
