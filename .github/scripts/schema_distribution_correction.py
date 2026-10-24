"""Correct the existing DOI's delivery files using the already verified website.

The live website is never rebuilt or deployed. Only publication prose/package
receipts change on the mutable platforms; scientific data and all website bytes
are pinned to the successful Article release. Zenodo is corrected last.
"""
import argparse
import concurrent.futures
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import quote
import zipfile

import requests

import coordinated_doi_release as gates
from platform_bundle import build_kaggle, context, dump, load, sha
from sync_platform_machine_resources import kaggle_client, source_metadata

ROOT = Path(__file__).resolve().parents[2]
SOURCE = '0f72c5e6ef832adef66d003069e3e3c189cf5079'
ORIGINAL = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'
PARENT = '017269f382c41c5eb27c5cfcebaf7a365368903e'
RECORD = 'https://zenodo.org/api/records/23474664'
DEPOSIT = 'https://zenodo.org/api/deposit/depositions/23474664'
SEED_SHA = '4b369026533ee309ba7b92a62e0a33ac99a3fe5738d8fe5039f97c67e3826fea'
DOI = '10.5281/zenodo.23474664'


class AccessStop(RuntimeError):
    pass


class Pending(requests.RequestException):
    pass


class Anonymous(requests.auth.AuthBase):
    def __call__(self, request):
        return request


def checked(response, *, pending=(404, 500, 502, 503, 504)):
    if response.status_code in {401, 403, 429} or (
            'text/html' in response.headers.get('Content-Type', '') and
            re.search('captcha|unusual traffic|access denied', response.text, re.I)):
        raise AccessStop('Access restriction; no retry or workaround: HTTP ' + str(response.status_code))
    if response.status_code in pending:
        raise Pending('Public response not ready: HTTP ' + str(response.status_code))
    response.raise_for_status()
    return response


def read(url):
    with requests.Session() as session:
        session.auth = Anonymous()
        return checked(session.get(url, timeout=(15, 90)))


def public_post(url, **kwargs):
    with requests.Session() as session:
        session.auth = Anonymous()
        return checked(session.post(url, **kwargs))


def retry(work, name, callback, attempts=90):
    for attempt in range(attempts):
        try:
            result = callback()
            dump(work / (name + '-live.json'), {'status': 'PASS', 'result': result})
            return result
        except (Pending, AssertionError, requests.Timeout, requests.ConnectionError,
                ValueError, KeyError, FileNotFoundError, zipfile.BadZipFile) as error:
            dump(work / (name + '-pending.json'), {'attempt': attempt, 'status': 'PENDING',
                 'reason': type(error).__name__ + ': ' + str(error)[:300]})
            print(name + ' pending ' + str(attempt) + ': ' + str(error)[:250], flush=True)
            if attempt + 1 == attempts:
                raise
            time.sleep(10)


def expected_plan(plan):
    assert plan['candidateSchema'] == 'same-doi-delivery-correction-1'
    assert plan['sourceCommit'] == SOURCE and plan['originalArchiveSourceCommit'] == ORIGINAL
    assert plan['hfParent'] == PARENT and re.fullmatch('[a-f0-9]{40}', plan['hfRevision'])
    assert plan['kagglePreviousVersion'] == 31 and plan['kaggleVersion'] == 32
    assert plan['notebookPreviousVersion'] == 15 and plan['notebookVersion'] == 16
    assert plan['doi'] == DOI and plan['record'] == 23474664
    assert plan['websiteWrites'] is False and plan['newDoi'] is False


def guard_resume_identity(plan, heads, owner):
    assert owner['version'] in {31, 32}
    if owner['version'] == 32 or heads['notebookVersion'] == 16:
        assert heads['hfRevision'] == plan['hfRevision'], 'Existing target versions belong to another HF cohort'
    if heads['notebookVersion'] == 16:
        assert owner['version'] == 32, 'Target notebook has no target dataset'


def guard_frozen(work):
    plan = load(work / 'release-plan.json')
    expected_plan(plan)
    gates.check_frozen(work)
    assert gates.run(['git', 'rev-parse', 'HEAD'], cwd=work / 'hf-git') == plan['hfRevision']
    assert not gates.run(['git', 'status', '--porcelain'], cwd=work / 'hf-git')
    from git_payload import validate_index
    validate_index(work / 'hf-git', work / 'hf-stage')
    return plan


def provenance_and_heads(work, plan, *, target=False):
    assert read(gates.SITE + 'release-provenance.json').content == (work / 'website/release-provenance.json').read_bytes()
    assert read(gates.SITE).content == (work / 'website/index.html').read_bytes()
    assert read(gates.SITE + 'botox').content == (work / 'website/botox.html').read_bytes()
    hub = read('https://huggingface.co/api/datasets/' + gates.HF).json()
    assert hub['sha'] in ({plan['hfRevision']} if target else {plan['hfParent'], plan['hfRevision']})
    assert hub.get('private') is False and not hub.get('gated')
    kg = read('https://api.kaggle.com/v1/datasets/view/' + gates.KG).json()
    assert kg['currentVersionNumber'] in {31, 32}
    assert not any(item['versionNumber'] > 32 for item in kg.get('versions', []))
    nb = read('https://www.kaggle.com/api/v1/kernels/pull/' + gates.NB).json()
    assert nb['metadata']['currentVersionNumber'] in ({16} if target else {15, 16})
    return {'sourceCommit': SOURCE, 'hfRevision': hub['sha'],
            'kagglePublicDefault': kg['currentVersionNumber'],
            'notebookVersion': nb['metadata']['currentVersionNumber']}


def seal_hf(stage):
    inventory = load(stage / 'dist-sha256.json')
    inventory['files'] = {name: {'bytes': (stage / name).stat().st_size, 'sha256': digest}
                          for name, digest in gates.inventory(stage).items() if name != 'dist-sha256.json'}
    dump(stage / 'dist-sha256.json', inventory)


def seal_kaggle(stage):
    excluded = {'checksums.sha256', 'dataset-metadata.json', 'kernel-metadata.json'}
    (stage / 'checksums.sha256').write_text(''.join(digest + '  ' + name + '\n'
        for name, digest in gates.inventory(stage).items() if name not in excluded))


def preflight(seed, work):
    assert not work.exists(), 'Use a fresh preparation directory'
    assert sha(seed / 'frozen-sha256.json') == SEED_SHA
    gates.check_frozen(seed)
    old = load(seed / 'release-plan.json')
    assert old['sourceCommit'] == SOURCE and old['hfRevision'] == PARENT
    work.mkdir(parents=True)
    for name in ['website', 'hf-stage', 'hf-git', 'notebook']:
        shutil.copytree(seed / name, work / name)
    assert gates.run(['git', 'rev-parse', 'HEAD'], cwd=work / 'hf-git') == PARENT
    client = kaggle_client()
    gates.guard_owner(client, 31)
    assert read('https://huggingface.co/api/datasets/' + gates.HF).json()['sha'] == PARENT
    assert read('https://www.kaggle.com/api/v1/kernels/pull/' + gates.NB).json()['metadata']['currentVersionNumber'] == 15
    assert read(gates.SITE + 'release-provenance.json').content == (work / 'website/release-provenance.json').read_bytes()
    before = read(RECORD).json()
    assert before['doi'] == DOI and len(before['files']) == 43
    original = work / 'original-archive'
    original.mkdir()
    dump(original / 'public-record.json', before)
    def archive_download(item):
        body = read(item['links']['self']).content
        assert len(body) == item['size'] and 'md5:' + hashlib.md5(body).hexdigest() == item['checksum']
        (original / item['key']).write_bytes(body)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(archive_download, before['files']))
    with requests.Session() as owner:
        owner.headers['Authorization'] = 'Bearer ' + os.environ['ZENODO_TOKEN']
        response = owner.get(DEPOSIT, timeout=90)
        checked(response, pending=())
        owner_before = response.json()
        assert owner_before['submitted'] is True and owner_before['doi'] == DOI
        pending = owner.get(RECORD + '/draft', timeout=90, headers={'Accept': 'application/vnd.inveniordm.v1+json'})
        if pending.status_code != 404:
            checked(pending, pending=())
            modern = checked(owner.get(RECORD, timeout=90, headers={'Accept': 'application/vnd.inveniordm.v1+json'}), pending=()).json()
            assert pending.json()['metadata'] == modern['metadata'], 'Preserve existing unpublished metadata'
            draft = checked(owner.get(RECORD + '/draft/files', timeout=90), pending=()).json()
            assert {x['key']: (x['checksum'], x['size']) for x in draft['entries']} == {
                x['key']: (x['checksum'], x['size']) for x in before['files']}, 'Preserve existing unpublished files'
    dump(work / 'zenodo-owner-before.json', owner_before)
    from schema_correction_prose import correct_prose, scope_notebook
    args = {'original_source': ORIGINAL, 'delivery_source': SOURCE, 'doi': DOI}
    hf = work / 'hf-stage'
    (hf / 'README.md').write_text(correct_prose((hf / 'README.md').read_text(), **args))
    if (hf / 'starter.ipynb').is_file():
        scope_notebook(hf / 'starter.ipynb', **args)
    correction = {'doi': DOI, 'originalScientificSourceCommit': ORIGINAL,
                  'technicalDeliverySourceCommit': SOURCE, 'date': '2026-10-24',
                  'scope': 'Minor technical structured-data delivery and distribution provenance correction; scientific content unchanged',
                  'publishedState': 'Established by the public archive files and external publication receipts'}
    for name in ['current-release-matrix.json', 'release-attestation.json']:
        document = load(hf / name)
        document.update(archiveBindingStatus='Same DOI technical delivery correction; original scientific source retained',
                        historicalArchivesUnchanged=True, currentArchiveIncludedInRelease=True,
                        archivedSnapshotsUpdated=True, archiveTechnicalCorrection=correction,
                        publicationScope=['website', 'hf', 'kaggle', 'notebook', 'zenodo_dataset'])
        dump(hf / name, document)
    import yaml
    if (hf / 'CITATION.cff').is_file():
        citation = yaml.safe_load((hf / 'CITATION.cff').read_text())
        citation['message'] = ('Cite platform revision and website source ' + SOURCE +
            '; DOI ' + DOI + ' preserves the original scientific source ' + ORIGINAL +
            ' with minor technical delivery corrections documented in its archive provenance.')
        for item in citation.get('references', []):
            if item.get('doi') == DOI:
                item['title'] = 'Zenodo Dataset with documented same-DOI technical delivery corrections'
        (hf / 'CITATION.cff').write_text(yaml.safe_dump(citation, allow_unicode=True, sort_keys=False))
    seal_hf(hf)
    # A prose/receipt correction cannot silently change the actual scientific data.
    protected = [name for name in gates.inventory(hf) if name not in {
        'README.md', 'starter.ipynb', 'CITATION.cff', 'current-release-matrix.json',
        'release-attestation.json', 'dist-sha256.json'}]
    for name in protected:
        assert sha(hf / name) == sha(seed / 'hf-stage' / name), ('Unexpected data change', name)
    shutil.copytree(hf, work / 'hf-git', dirs_exist_ok=True)
    env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1', 'GIT_AUTHOR_NAME': 'Dataset Release Automation',
           'GIT_AUTHOR_EMAIL': 'medicaldoctor91@users.noreply.github.com',
           'GIT_COMMITTER_NAME': 'Dataset Release Automation', 'GIT_COMMITTER_EMAIL': 'medicaldoctor91@users.noreply.github.com'}
    gates.run(['git', 'lfs', 'install', '--local'], cwd=work / 'hf-git')
    gates.run(['git', 'add', '--all'], cwd=work / 'hf-git', env=env)
    gates.run(['git', 'commit', '-m', 'Document same-DOI structured-data delivery correction'], cwd=work / 'hf-git', env=env)
    revision = gates.run(['git', 'rev-parse', 'HEAD'], cwd=work / 'hf-git')
    previous = work / 'kaggle-before'
    shutil.copytree(seed / 'kaggle', previous)
    client.dataset_metadata(gates.KG, str(previous))
    control = load(previous / 'dataset-metadata.json')
    control = dict(control.get('info') or control)
    control['id'] = gates.KG
    dump(previous / 'dataset-metadata.json', control)
    ctx = context(SOURCE, '0', '2026-10-24')
    ctx.update(coordinated_release=True, publication_scope=['website', 'hf', 'kaggle', 'notebook', 'zenodo_dataset'],
               archived_snapshots_updated=True, run_url='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + SOURCE)
    kg = work / 'kaggle'
    build_kaggle(hf, previous, kg, ctx, 32, revision)
    (kg / 'README.md').write_text(correct_prose((kg / 'README.md').read_text(), **args))
    scope_notebook(kg / 'starter.ipynb', **args)
    citation = yaml.safe_load((kg / 'CITATION.cff').read_text())
    citation['message'] = ('Cite Kaggle32, pinned HF ' + revision + ' and website source ' + SOURCE +
        '; DOI ' + DOI + ' documents the original scientific source and same-DOI technical delivery corrections.')
    (kg / 'CITATION.cff').write_text(yaml.safe_dump(citation, allow_unicode=True, sort_keys=False))
    seal_kaggle(kg)
    tables = load(hf / 'viewer/packaging.json')['tables']
    control.update(description=(kg / 'README.md').read_text(),
                   subtitle=', '.join(format(tables[name]['rows'], ',') + ' ' + label for name, label in
                       [('entity_facts', 'facts'), ('clinical_passages', 'clinical passages'), ('query_matrix', 'queries'), ('clinical_answers', 'source-linked answers')]),
                   userSpecifiedSources=source_metadata(control['userSpecifiedSources'], revision, SOURCE))
    dump(kg / 'dataset-metadata.json', control)
    notebook = work / 'notebook'
    meta = load(notebook / 'kernel-metadata.json')
    meta.update(id=gates.NB, code_file='starter.ipynb', dataset_sources=[gates.KG + '/32'], enable_internet=True)
    dump(notebook / 'kernel-metadata.json', meta)
    shutil.copyfile(kg / 'starter.ipynb', notebook / 'starter.ipynb')
    plan = {'candidateSchema': 'same-doi-delivery-correction-1', 'record': 23474664, 'doi': DOI,
            'sourceCommit': SOURCE, 'originalArchiveSourceCommit': ORIGINAL,
            'hfParent': PARENT, 'hfRevision': revision, 'kagglePreviousVersion': 31, 'kaggleVersion': 32,
            'notebookPreviousVersion': 15, 'notebookVersion': 16, 'technicalCorrectionDate': '2026-10-24',
            'websiteWrites': False, 'newDoi': False, 'sitePreviousSource': SOURCE,
            'originalPublicRecordPath': str(original / 'public-record.json'),
            'hfSearchFilter': 'Deferred by user while index warms; no overall runtime health claim'}
    expected_plan(plan)
    dump(work / 'release-plan.json', plan)
    os.environ['RELEASE_EXECUTION_REPORT'] = str(work / 'local-notebook-execution.json')
    for name, platform in [('hf-stage', 'hf'), ('kaggle', 'kaggle')]:
        subprocess.run([sys.executable, str(ROOT / 'tests/validate_platform_sync.py'), str(work / name),
                        '--platform', platform, '--source-commit', SOURCE,
                        '--report', str(work / (platform + '-validation.json'))], cwd=ROOT, check=True)
    execution = load(work / 'local-notebook-execution.json')
    assert execution['status'] == 'PASS' and execution['input_checksums_sha256'] == sha(kg / 'checksums.sha256')
    from zenodo_correction_bundle import build_correction
    corrected_files, archive_report = build_correction(original, work / 'website', hf, work / 'archive-build', plan)
    dump(work / 'archive-build-report.json', archive_report)
    from zenodo_file_correction import prepare
    prepare(before, corrected_files, plan, work / 'zenodo-prepared', owner_metadata=owner_before['metadata'])
    folders = ['website', 'hf-stage', 'kaggle', 'notebook', 'archive-build', 'zenodo-prepared']
    dump(work / 'frozen-sha256.json', {**{name: gates.inventory(work / name) for name in folders},
        'controls': {name: sha(work / name) for name in ['release-plan.json', 'zenodo-owner-before.json']}})
    guard_frozen(work)
    provenance_and_heads(work, plan)
    gates.guard_owner(client, 31)
    dump(work / 'preflight-report.json', {'status': 'PASS', 'plan': plan,
         'frozenManifestSHA256': sha(work / 'frozen-sha256.json'), 'archive': archive_report,
         'websiteWrites': False, 'platformWrites': False, 'localExecution': execution})
    print('SAME DOI DELIVERY CORRECTION FROZEN ' + sha(work / 'frozen-sha256.json'), flush=True)


def exact_kaggle(work, plan):
    from kaggle_baseline import verify_exact_public_files
    return verify_exact_public_files(work / 'kaggle-exact-public', gates.KG, plan['kaggleVersion'], work / 'kaggle', read)


def public_kaggle_metadata(work):
    owner, slug = gates.KG.split('/')
    metadata = public_post('https://api.kaggle.com/v1/datasets.DatasetApiService/GetDatasetMetadata',
        json={'ownerSlug': owner, 'datasetSlug': slug}, timeout=90).json()
    metadata = metadata.get('info') or metadata
    expected = load(work / 'kaggle/dataset-metadata.json')
    for field in ['description', 'subtitle', 'userSpecifiedSources']:
        assert metadata[field].strip() == expected[field].strip(), 'Public Kaggle metadata differs: ' + field
    return {'publicDescriptionSubtitleAndSourcesVerified': True}


def public_kaggle_downloads(work, plan):
    """Observe cache convergence separately from verified pinned individual files."""
    from zenodo_inplace_metadata import zip_inventory
    expected = {name: digest for name, digest in gates.inventory(work / 'kaggle').items()
                if name not in {'dataset-metadata.json', 'kernel-metadata.json'}}
    result = {}
    baseline = load(work / 'kaggle-before/kaggle-manifest.json')
    assert baseline['desired_kaggle_version'] == 31
    old = {name: digest for name, digest in gates.inventory(work / 'kaggle-before').items()
           if name not in {'dataset-metadata.json', 'kernel-metadata.json'}}
    # Owner metadata may have been refreshed; downloadable baseline files remain
    # the exactly frozen previous version, including its checksum manifest.
    for label, suffix in [('exact', '?datasetVersionNumber=32'), ('default', '')]:
        try:
            response = read('https://www.kaggle.com/api/v1/datasets/download/' + gates.KG + suffix)
            actual, _ = zip_inventory(response.content)
            if actual == expected:
                result[label] = {'status': 'CURRENT', 'filesVerified': len(expected), 'SHA256': hashlib.sha256(response.content).hexdigest()}
            else:
                assert label == 'default' and actual == old, 'Unknown or wrong public download contents'
                result[label] = {'status': 'PREVIOUS_DEFAULT_PENDING', 'version': 31,
                                 'SHA256': hashlib.sha256(response.content).hexdigest()}
        except Pending as error:
            result[label] = {'status': 'PROCESSING', 'reason': str(error)[:120]}
    result['allCurrent'] = all(result[name]['status'] == 'CURRENT' for name in ['exact', 'default'])
    return result


def verify_current_cohort(work, plan):
    expected_plan(plan)
    heads = provenance_and_heads(work, plan, target=True)
    exact = exact_kaggle(work, plan)
    metadata = public_kaggle_metadata(work)
    downloads = public_kaggle_downloads(work, plan)
    public = read('https://www.kaggle.com/api/v1/kernels/pull/' + gates.NB).json()
    owner, slug = gates.NB.split('/')
    response = public_post('https://api.kaggle.com/v1/kernels.KernelsApiService/DownloadKernelOutput',
        json={'ownerSlug': owner, 'kernelSlug': slug, 'filePath': 'doi-release-execution.json', 'versionNumber': 16}, timeout=90)
    gates.notebook_identity(work, public, response.json())
    core = gates.verify_hf(work, runtime_features=False)
    return {'status': 'PASS', 'scope': 'Pinned complete public files, actual notebook execution and primary Viewer; search/filter deferred by user',
            'heads': heads, 'exactKaggle': exact, 'hfCore': core,
            'kaggleMetadata': metadata, 'kaggleDownloads': downloads,
            'unversionedDefaultCurrent': heads['kagglePublicDefault'] == 32 and downloads['allCurrent'],
            'notebookActualExecutionVerified': True, 'hfSearchFilter': 'Deferred; no runtime health assertion'}


def publish(work):
    plan = guard_frozen(work)
    assert load(work / 'preflight-report.json')['status'] == 'PASS'
    heads = provenance_and_heads(work, plan)
    client = kaggle_client()
    state = gates.owner_state(client)
    guard_resume_identity(plan, heads, state)
    if heads['notebookVersion'] == 16:
        notebook = read('https://www.kaggle.com/api/v1/kernels/pull/' + gates.NB).json()
        blob = notebook['blob']
        assert gates.notebook_cells_for_comparison(json.loads(blob.get('source') or blob['sourceNullable'])) == gates.notebook_cells_for_comparison(load(work / 'notebook/starter.ipynb')), 'Existing notebook belongs to another frozen cohort'
    # A frozen plan is resumed only at its own already-created target versions.
    if heads['hfRevision'] == PARENT:
        ask = work / 'askpass.py'
        ask.write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.environ["HF_TOKEN"] if "password" in sys.argv[1].lower() else "hf_user")\n')
        ask.chmod(0o700)
        gates.run(['git', 'push', 'origin', 'HEAD:main'], cwd=work / 'hf-git',
            env={**os.environ, 'GIT_ASKPASS': str(ask), 'GIT_TERMINAL_PROMPT': '0', 'GIT_LFS_SKIP_SMUDGE': '1'})
    assert read('https://huggingface.co/api/datasets/' + gates.HF).json()['sha'] == plan['hfRevision']
    if state['version'] == 31:
        gates.guard_owner(client, 31)
        client.dataset_create_version(str(work / 'kaggle'), version_notes='Same DOI minor technical schema-delivery correction; current website preserved',
            quiet=True, convert_to_csv=False, delete_old_versions=False, dir_mode='zip')
        dump(work / 'kaggle-write.json', {'targetVersion': 32, 'submitted': True})
    def owner_ready():
        gates.guard_owner(client, 32)
        exact_kaggle(work, plan)
        directory = work / 'owner-after'
        directory.mkdir(exist_ok=True)
        client.dataset_metadata(gates.KG, str(directory))
        current = load(directory / 'dataset-metadata.json')
        current = dict(current.get('info') or current)
        desired = load(work / 'kaggle/dataset-metadata.json')
        fields = ['description', 'subtitle', 'userSpecifiedSources']
        if any(current.get(key) != desired[key] for key in fields):
            assert not (work / 'metadata-write-attempt.json').exists(), 'Inspect prior metadata write before resuming'
            dump(work / 'metadata-write-attempt.json', {'fields': fields})
            current.update({key: desired[key] for key in fields})
            dump(directory / 'dataset-metadata.json', current)
            client.dataset_metadata_update(gates.KG, str(directory))
        return {'version': 32, 'status': 'ready'}
    retry(work, 'kaggle-owner', owner_ready, attempts=18)
    retry(work, 'kaggle-exact', lambda: exact_kaggle(work, plan))
    gates.get = read
    gates.publish_notebook(work, client)
    retry(work, 'hf-primary-viewer', lambda: gates.verify_hf(work, runtime_features=False), attempts=18)
    cohort = retry(work, 'pre-zenodo-cohort', lambda: verify_current_cohort(work, plan), attempts=3)
    dump(work / 'cohort-before-zenodo.json', cohort)
    from zenodo_file_correction import publish as publish_archive
    result = publish_archive(work / 'zenodo-prepared', work / 'zenodo-publish',
                             cohort_guard=lambda prepared_plan: verify_current_cohort(work, prepared_plan))
    final = verify_current_cohort(work, plan)
    dump(work / 'publication-report.json', {'status': 'PASS' if final['unversionedDefaultCurrent'] else 'PINNED_COHORT_PUBLISHED_DEFAULT_PENDING', 'plan': plan,
         'zenodo': result, 'cohort': final,
         'websiteWrites': False, 'sameDOI': True, 'hfSearchFilter': 'Deferred by user'})
    print('SAME DOI FILE CORRECTION PUBLISHED AND PUBLICLY VERIFIED', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['preflight', 'publish'])
    parser.add_argument('--seed', type=Path, default=Path('/tmp/mutable-release'))
    parser.add_argument('--work', type=Path, default=Path('/tmp/schema-distribution-correction'))
    arguments = parser.parse_args()
    gates.get = read
    if arguments.operation == 'preflight':
        preflight(arguments.seed, arguments.work)
    else:
        publish(arguments.work)
