"""Align the existing Dataset record with verified live distributions, without a new DOI.

Only description and related_identifiers may change. No file, version or PID write
endpoint is used. Preflight prepares a concrete patch; publish rechecks its exact
public/owner baseline and the live cohort before editing the same record.
"""
import argparse
import copy
import hashlib
import io
import json
import os
import re
import time
import zipfile
from pathlib import Path, PurePosixPath

import requests

RECORD = 23474664
DOI = '10.5281/zenodo.23474664'
CONCEPT = '10.5281/zenodo.18765168'
VERSION = '1.3.4+zenodo.3'
ARCHIVE_SOURCE = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'
SITE = 'https://www.ghezelbaash.ir/'
HF = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB = 'saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
HUB = 'https://huggingface.co/datasets/' + HF
KAGGLE = 'https://www.kaggle.com/datasets/' + KG
NOTEBOOK = 'https://www.kaggle.com/code/' + NB
API = 'https://zenodo.org/api/'
PUBLIC = API + 'records/' + str(RECORD)
DEPOSIT = API + 'deposit/depositions/' + str(RECORD)
RDM = 'application/vnd.inveniordm.v1+json'
CHANGED_FIELDS = {'description', 'related_identifiers'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def load(path):
    return json.loads(Path(path).read_text())


def dump(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def utc():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def get(url, *, session=None, accept='application/json', allowed=(200,)):
    client = session or requests
    response = client.get(url, headers={'Accept': accept}, timeout=120)
    if response.status_code not in allowed:
        # No retries, challenge workarounds or credential-bearing response dumps.
        raise RuntimeError('GET failed with HTTP ' + str(response.status_code) + ': ' + url)
    return response


def files(record):
    return {item['key']: {'checksum': item['checksum'], 'bytes': item['size']}
            for item in record['files']}


def invariant(record, baseline):
    assert record['id'] == RECORD and record['doi'] == DOI and record['conceptdoi'] == CONCEPT
    assert record['metadata']['version'] == VERSION
    assert len(record['files']) == len(files(record)) == 43
    expected = {name: {'checksum': spec['checksum'], 'bytes': spec['bytes']}
                for name, spec in baseline['files'].items()}
    assert files(record) == expected, 'Published archive files differ from the reviewed archive'


def notebook_cells(notebook):
    result = copy.deepcopy(notebook['cells'])
    for cell in result:
        if isinstance(cell['source'], list):
            cell['source'] = ''.join(cell['source'])
    return result


def zip_inventory(body):
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate ZIP entry'
        assert all(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
                   for name in names), 'Unsafe ZIP entry'
        content = {name: archive.read(name) for name in names if not name.endswith('/')}
    return {name: digest(data) for name, data in content.items()}, content


def guard_reviewed_plan(evidence, plan, frozen):
    """Bind future maintenance targets to the exact frozen plan and archive."""
    assert plan['candidateSchema'] == 'mutable-distributions-4'
    assert plan['archiveSourceCommit'] == ARCHIVE_SOURCE and plan['archiveWrites'] is False
    assert re.fullmatch('[a-f0-9]{40}', plan['sourceCommit'])
    assert re.fullmatch('[a-f0-9]{40}', plan['hfRevision'])
    for previous, target in [('kagglePreviousVersion', 'kaggleVersion'),
                             ('notebookPreviousVersion', 'notebookVersion')]:
        assert type(plan[previous]) is int and type(plan[target]) is int, 'Version targets must be integers'
        assert plan[previous] > 0 and plan[target] == plan[previous] + 1, 'Version target must increment its reviewed baseline exactly once'
    controls = frozen['controls']
    assert {'release-plan.json', 'archive-baseline.json'} <= controls.keys(), 'Missing frozen plan/archive controls'
    for name, expected in controls.items():
        assert PurePosixPath(name).name == name and name not in {'', '.', '..'}, 'Unsafe frozen control filename'
        assert re.fullmatch('[a-f0-9]{64}', expected)
        assert digest((evidence / name).read_bytes()) == expected, 'Frozen control changed: ' + name
    baseline = load(evidence / 'archive-baseline.json')
    assert baseline['record'] == RECORD and baseline['doi'] == DOI and baseline['conceptDOI'] == CONCEPT
    assert baseline['version'] == VERSION and baseline['sourceCommit'] == ARCHIVE_SOURCE and len(baseline['files']) == 43


def guard_live_cohort(evidence, read=get, post=requests.post):
    """Anonymous bytes and actual version-specific notebook output, not receipt assertions."""
    plan = load(evidence / 'release-plan.json')
    frozen = load(evidence / 'frozen-sha256.json')
    guard_reviewed_plan(evidence, plan, frozen)
    provenance = read(SITE + 'release-provenance.json').content
    assert digest(provenance) == frozen['website']['release-provenance.json']
    assert json.loads(provenance)['sourceCommit'] == plan['sourceCommit']
    assert read('https://huggingface.co/api/datasets/' + HF).json()['sha'] == plan['hfRevision']
    hf_provenance = read(HUB + '/resolve/' + plan['hfRevision'] + '/release-provenance.json').content
    assert digest(hf_provenance) == frozen['hf-stage']['release-provenance.json']
    assert json.loads(hf_provenance)['sourceCommit'] == plan['sourceCommit']
    kg = read('https://api.kaggle.com/v1/datasets/view/' + KG).json()
    assert kg['currentVersionNumber'] in {plan['kagglePreviousVersion'], plan['kaggleVersion']}
    assert not any(v['versionNumber'] > plan['kaggleVersion'] for v in kg.get('versions', []))
    if kg['currentVersionNumber'] != plan['kaggleVersion']:
        assert any(v['versionNumber'] == plan['kaggleVersion'] and v.get('status', '').lower() == 'ready'
                   for v in kg.get('versions', [])), 'Pinned Kaggle version is not publicly Ready'
    expected = {name: sha for name, sha in frozen['kaggle'].items()
                if name not in {'dataset-metadata.json', 'kernel-metadata.json'}}
    observations = {}
    for label, suffix in [('exact', '?datasetVersionNumber=' + str(plan['kaggleVersion'])), ('default', '')]:
        body = read('https://www.kaggle.com/api/v1/datasets/download/' + KG + suffix).content
        actual, content = zip_inventory(body)
        current = actual == expected
        if label == 'exact':
            assert current, 'Kaggle exact files differ from frozen distribution'
        elif not current:
            # A stale unversioned download is a separate, explicitly reported
            # platform state. The DOI links the fully verified pinned version.
            baseline = plan.get('kaggleBaselinePublication', {})
            assert baseline.get('version') == plan['kagglePreviousVersion']
            assert digest(body) == baseline.get('zipSHA256'), 'Unreviewed default Kaggle distribution'
        observations[label] = {'filesSha256Verified': len(actual) if current else 0,
                               'zipSHA256': digest(body), 'matchesPinnedDistribution': current}
        if not current:
            observations[label]['verifiedPreviousVersion'] = plan['kagglePreviousVersion']
        if label == 'exact':
            starter = json.loads(content['starter.ipynb'])
    public_notebook = read('https://www.kaggle.com/api/v1/kernels/pull/' + NB).json()
    assert public_notebook['metadata']['currentVersionNumber'] == plan['notebookVersion']
    blob = public_notebook['blob']
    source = json.loads(blob.get('source') or blob['sourceNullable'])
    assert notebook_cells(source) == notebook_cells(starter), 'Live notebook source differs from the frozen dataset'
    owner, slug = NB.split('/')
    response = post('https://api.kaggle.com/v1/kernels.KernelsApiService/DownloadKernelOutput',
                    json={'ownerSlug': owner, 'kernelSlug': slug,
                          'filePath': 'doi-release-execution.json', 'versionNumber': plan['notebookVersion']},
                    timeout=120)
    assert response.status_code == 200, 'Actual public notebook output is unavailable'
    execution = response.json()
    assert execution['status'] == 'PASS' and execution['source_commit'] == plan['sourceCommit']
    assert execution['upstream_revision'] == plan['hfRevision'] and execution['kaggle_version'] == plan['kaggleVersion']
    assert execution['exact_doi'] == DOI and execution['input_checksums_sha256'] == frozen['kaggle']['checksums.sha256']
    assert execution['all_table_rows_reconstructed'] is True and execution['unresolved_query_references'] == 0
    # The slow ZIP/output reads must not hide a concurrent platform release.
    assert read('https://huggingface.co/api/datasets/' + HF).json()['sha'] == plan['hfRevision']
    final_kg = read('https://api.kaggle.com/v1/datasets/view/' + KG).json()
    assert final_kg['currentVersionNumber'] in {plan['kagglePreviousVersion'], plan['kaggleVersion']}
    assert not any(v['versionNumber'] > plan['kaggleVersion'] for v in final_kg.get('versions', []))
    assert read('https://www.kaggle.com/api/v1/kernels/pull/' + NB).json()['metadata']['currentVersionNumber'] == plan['notebookVersion']
    assert read(SITE + 'release-provenance.json').content == provenance
    default_current = (final_kg['currentVersionNumber'] == plan['kaggleVersion'] and
                       observations['default']['matchesPinnedDistribution'])
    return {'status': 'PASS' if default_current else 'PINNED_COHORT_VERIFIED_DEFAULT_PENDING',
            'observedUTC': utc(), 'cohort': plan, 'unversionedKaggleDefaultCurrent': default_current,
            'observedKaggleDefaultVersion': final_kg['currentVersionNumber'],
            'kaggle': observations, 'notebookPublicSourceAndExecutionVerified': True,
            'notebookExecutionSHA256': digest(response.content),
            'scope': 'Published pinned distribution identity, complete exact-version ZIP and notebook execution; '
                     'unversioned default readiness is reported separately; no HF search/filter health assertion'}


def desired_metadata(original, plan):
    metadata = copy.deepcopy(original)
    hf_pin = HUB + '/tree/' + plan['hfRevision']
    kg_pin = KAGGLE + '/versions/' + str(plan['kaggleVersion'])
    viewer = HUB + '/viewer'
    metadata['description'] = (
        '<p><strong>Dr. Saeed Ghezelbash (دکتر سعید قزلباش) Public Knowledge Graph.</strong> '
        'Physician-authored clinical education, source-linked answers, professional identity and multilingual retrieval data. '
        'Content baseline 1.3.4; edition 2026-10-18. Canonical Dataset IRI: '
        'https://www.ghezelbaash.ir/graph.jsonld/dataset.</p>'
        '<p><strong>Connected versioned distributions — 2026-10-30.</strong> '
        '<a href="' + SITE + '">Canonical website</a>; '
        '<a href="' + HUB + '">Hugging Face dataset</a> '
        '(<a href="' + hf_pin + '">pinned revision ' + plan['hfRevision'] + '</a>); '
        '<a href="' + viewer + '">Hugging Face Dataset Viewer</a>; '
        '<a href="' + KAGGLE + '">Kaggle dataset</a> '
        '(<a href="' + kg_pin + '">version ' + str(plan['kaggleVersion']) + '</a>); '
        '<a href="' + NOTEBOOK + '">Kaggle starter notebook</a>, version ' + str(plan['notebookVersion']) + '. '
        'Use the linked Kaggle version ' + str(plan['kaggleVersion']) + ' and notebook ' + str(plan['notebookVersion']) +
        ' to select the verified files for this distribution. '
        'The website search markup has been corrected; the complete scientific graph and authored clinical content remain available. '
        'These distributions share the same canonical identities and scientific baseline; their platform packaging and HTML can differ.</p>'
        '<p><strong>Creator and entity identifiers.</strong> Dr. Saeed Ghezelbash; Iran Medical Council 167430; '
        '<a href="https://www.wikidata.org/wiki/Q140287622">Wikidata Q140287622</a>; '
        '<a href="https://orcid.org/0009-0001-9346-8475">ORCID 0009-0001-9346-8475</a>; '
        '<a href="https://openalex.org/A5146521397">OpenAlex A5146521397</a>. '
        'The physician, clinic, canonical Dataset and DOI archive retain distinct, explicitly connected identities.</p>'
        '<p><strong>Persistent citation and preserved archive.</strong> This record retains DOI '
        '<a href="https://doi.org/' + DOI + '">' + DOI + '</a> and packaging ' + VERSION + '. '
        'The public collection is <a href="https://doi.org/' + CONCEPT + '">' + CONCEPT + '</a>. '
        'All 43 deposited files remain unchanged by this metadata update. The original scientific source is ' + ARCHIVE_SOURCE + '. '
        'Prior technical delivery corrections and their historical snapshot bindings remain recorded in the archive provenance; '
        'the current connected distributions are linked above. '
        'The archive descriptors retain record-specific download URLs and checksums; files under upstream/ retain historical provenance.</p>'
        '<p>این رکورد با همان DOI، آرشیو پایدار گراف دانش دکتر سعید قزلباش را نگه می‌دارد و به نسخه‌های جاری سایت، '
        'هاگینگ‌فیس، دیتاست ویور و دیتاست و نوت‌بوک کاگل پیوند دارد. داده‌های علمی مشترک و هویت‌های اصلی حفظ شده‌اند؛ '
        'شناسه‌های قدیمیِ بستهٔ آرشیو با پیوندهای نسخه‌های جاری تفکیک شده‌اند.</p>')
    # Remove obsolete distribution pointers from the machine-readable current links.
    # Their exact historical bindings remain explicitly documented in the archive paragraph.
    prefixes = (HUB, KAGGLE, NOTEBOOK)
    related = [copy.deepcopy(item) for item in metadata.get('related_identifiers', [])
               if not item['identifier'].startswith(prefixes)]
    additions = [(HUB, 'isSupplementedBy', 'dataset'), (hf_pin, 'isSupplementedBy', 'dataset'),
                 (KAGGLE, 'isSupplementedBy', 'dataset'), (kg_pin, 'isSupplementedBy', 'dataset'),
                 (viewer, 'isSupplementedBy', None), (NOTEBOOK, 'references', 'software-computationalnotebook')]
    for url, relation, resource in additions:
        item = {'identifier': url, 'relation': relation, 'scheme': 'url'}
        if resource:
            item['resource_type'] = resource
        related.append(item)
    assert len({(item['identifier'], item['relation']) for item in related}) == len(related)
    metadata['related_identifiers'] = related
    assert {k: v for k, v in metadata.items() if k not in CHANGED_FIELDS} == {
        k: v for k, v in original.items() if k not in CHANGED_FIELDS}
    return metadata


def verify_public_metadata(before, after, expected):
    assert {k: v for k, v in before['metadata'].items() if k not in CHANGED_FIELDS} == {
        k: v for k, v in after['metadata'].items() if k not in CHANGED_FIELDS}, 'An unrelated public metadata field changed'
    assert after['metadata']['description'] == expected['description'], 'Public description differs from reviewed patch'
    order = lambda items: sorted(canonical(item) for item in items)
    assert order(after['metadata']['related_identifiers']) == order(expected['related_identifiers'])


def inspect_owner(session, public, prepared_metadata=None):
    owner = get(DEPOSIT, session=session).json()
    assert owner['id'] == RECORD and owner['submitted'] is True
    assert owner['metadata']['version'] == VERSION and owner['metadata']['title'] == public['metadata']['title']
    assert owner['doi'] == DOI
    pending = get(PUBLIC + '/draft', session=session, accept=RDM, allowed=(200, 404))
    if pending.status_code == 200:
        # Compare modern representations; legacy and modern metadata schemas differ.
        modern_public = get(PUBLIC, session=session, accept=RDM).json()
        assert (pending.json()['metadata'] == modern_public['metadata'] or
                (prepared_metadata is not None and owner['metadata'] == prepared_metadata)), 'Unpublished metadata changes already exist; preserve them'
        draft_files = get(PUBLIC + '/draft/files', session=session, accept=RDM).json()['entries']
        assert {item['key']: {'checksum': item['checksum'], 'bytes': item['size']}
                for item in draft_files} == files(public), 'Unpublished file changes already exist; preserve them'
    return owner, pending.status_code == 200


def mutate(session, method, url, *, payload=None):
    assert (method, url) in {('PUT', DEPOSIT), ('POST', DEPOSIT + '/actions/edit'),
                             ('POST', DEPOSIT + '/actions/publish')}, 'Out-of-scope write endpoint'
    response = session.request(method, url, data=canonical(payload) if payload is not None else None,
                               headers={'Content-Type': 'application/json'}, timeout=120)
    if response.status_code not in {200, 201, 202, 204}:
        raise RuntimeError(method + ' failed with HTTP ' + str(response.status_code) + '; no automatic retry')
    return response


def run(mode, evidence, work, prepared=None):
    work.mkdir(parents=True, exist_ok=True)
    baseline = load(evidence / 'archive-baseline.json')
    plan = load(evidence / 'release-plan.json')
    assert baseline['record'] == RECORD and baseline['doi'] == DOI and baseline['sourceCommit'] == ARCHIVE_SOURCE
    cohort = guard_live_cohort(evidence)
    dump(work / 'live-cohort.json', cohort)
    before_response = get(PUBLIC)
    before = before_response.json()
    invariant(before, baseline)
    session = requests.Session()
    session.headers['Authorization'] = 'Bearer ' + os.environ['ZENODO_TOKEN']
    approved = load(prepared / 'metadata-patch.json') if prepared else None
    owner, pending = inspect_owner(session, before, approved['metadata'] if approved else None)
    expected = desired_metadata(owner['metadata'], plan)
    patch = {'schema': 'zenodo-inplace-metadata-1', 'record': RECORD, 'doi': DOI, 'conceptDOI': CONCEPT,
             'changedFields': sorted(CHANGED_FIELDS), 'cohort': plan,
             'publicMetadataBeforeSHA256': digest(canonical(before['metadata'])),
             'ownerMetadataBeforeSHA256': digest(canonical(owner['metadata'])),
             'metadataAfterSHA256': digest(canonical(expected)), 'metadata': expected,
             'archiveFiles': files(before), 'fileWrites': False}
    dump(work / 'public-before.json', before)
    dump(work / 'metadata-patch.json', patch)
    (work / 'metadata-request.json').write_bytes(canonical({'metadata': expected}))
    if mode == 'preflight':
        dump(work / 'preflight-report.json', {'status': 'PASS', 'record': RECORD, 'doi': DOI,
             'patchSHA256': digest(canonical(patch)), 'archiveFilesUnchanged': 43,
             'fileWrites': False, 'writesPerformed': False, 'observedUTC': utc()})
        print('ZENODO SAME-RECORD METADATA PREFLIGHT PASS', flush=True)
        return
    assert prepared, 'Publication requires the reviewed preflight patch'
    # A successful earlier publish is idempotent and can be verified without another POST.
    if before['metadata']['description'] == approved['metadata']['description']:
        verify_public_metadata(load(prepared / 'public-before.json'), before, approved['metadata'])
        dump(work / 'publication-report.json', {'status': 'PASS', 'record': RECORD, 'doi': DOI,
             'alreadyPublished': True, 'writesPerformed': False, 'archiveFilesUnchanged': 43})
        return
    # A prior unambiguous metadata PUT may have succeeded before a later live
    # platform gate stopped publication. Resume only that exact reviewed draft.
    resume_staged = (pending and owner['metadata'] == approved['metadata'] and
                     digest(canonical(before['metadata'])) == approved['publicMetadataBeforeSHA256'] and
                     plan == approved['cohort'] and files(before) == approved['archiveFiles'])
    assert patch == approved or resume_staged, 'Prepared metadata or public baseline changed; review a new preflight'
    assert not (work / 'publish-attempt.json').exists(), 'An earlier write attempt needs read-only recovery'
    dump(work / 'publish-attempt.json', {'record': RECORD, 'patchSHA256': digest(canonical(patch)), 'utc': utc()})
    if not pending:
        mutate(session, 'POST', DEPOSIT + '/actions/edit')
    expected = approved['metadata']
    if not resume_staged:
        mutate(session, 'PUT', DEPOSIT, payload={'metadata': expected})
    staged = get(DEPOSIT, session=session).json()
    assert staged['metadata']['description'] == expected['description']
    assert digest(canonical(staged['metadata'])) == digest(canonical(expected)), 'Staged metadata differs from exact reviewed patch'
    # Last anonymous identity check before the publication action.
    guard_live_cohort(evidence)
    mutate(session, 'POST', DEPOSIT + '/actions/publish')
    after_response = get(PUBLIC)
    after = after_response.json()
    invariant(after, baseline)
    verify_public_metadata(before, after, expected)
    dump(work / 'public-after.json', after)
    dump(work / 'publication-report.json', {'status': 'PASS', 'record': RECORD, 'doi': DOI,
         'conceptDOI': CONCEPT, 'version': VERSION, 'archiveFilesUnchanged': 43, 'fileWrites': False,
         'publicMetadataBeforeSHA256': digest(canonical(before['metadata'])),
         'publicMetadataAfterSHA256': digest(canonical(after['metadata'])),
         'exactRequestBodySHA256': digest((work / 'metadata-request.json').read_bytes()),
         'publishedSameRecord': True, 'cohort': plan, 'observedUTC': utc()})
    print('ZENODO SAME DOI METADATA PUBLISHED AND PUBLICLY VERIFIED', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['preflight', 'publish'])
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--work', type=Path, default=Path('/tmp/zenodo-inplace-metadata'))
    parser.add_argument('--prepared', type=Path)
    args = parser.parse_args()
    run(args.mode, args.evidence, args.work, args.prepared)
