"""A frozen, minor technical correction to the existing Zenodo record and DOI.

This deliberately separate controller does not weaken the older metadata-only
publisher. Callers supply a fresh public-cohort guard; no publication can proceed
without it. Only the existing record's edit/unlock, draft-bucket replacements,
metadata PUT and publish actions are permitted.
"""
import copy
import datetime as dt
import hashlib
import html
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
from urllib.parse import quote
import uuid
import zipfile

import requests

RECORD = 23474664
DOI = '10.5281/zenodo.23474664'
CONCEPT = '10.5281/zenodo.18765168'
VERSION = '1.3.4+zenodo.3'
ORIGINAL_SOURCE = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'
DELIVERY_SOURCE = '0f72c5e6ef832adef66d003069e3e3c189cf5079'
PUBLIC = 'https://zenodo.org/api/records/' + str(RECORD)
DEPOSIT = 'https://zenodo.org/api/deposit/depositions/' + str(RECORD)
RDM = 'application/vnd.inveniordm.v1+json'
CHANGED_METADATA = {'description', 'related_identifiers'}
CORE_UNCHANGED = {'graph.jsonld', 'graph.ttl', 'provenance.jsonld', 'entity-facts.csv',
                  'clinical-passages.jsonl', 'answers.txt', 'positioning-strategy.json',
                  'market-positioning-evidence.json',
                  'instruction_examples_fa_market_positioning.jsonl',
                  'instruction_examples_fa_market_positioning.csv'}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def md5(data):
    return 'md5:' + hashlib.md5(data).hexdigest()


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load(path):
    return json.loads(Path(path).read_text())


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def inventory(record):
    entries = record['files']
    result = {entry['key']: {'checksum': entry['checksum'], 'bytes': entry['size']}
              for entry in entries}
    assert len(result) == len(entries) == 43, 'Expected the same 43 existing archive filenames'
    for name, entry in result.items():
        assert PurePosixPath(name).name == name and name not in {'', '.', '..'}, 'Unsafe archive key'
        assert re.fullmatch(r'md5:[0-9a-f]{32}', entry['checksum']), 'Unexpected file checksum'
        assert type(entry['bytes']) is int and entry['bytes'] > 0
    return result


def identity(record):
    assert record['id'] == RECORD and record['doi'] == DOI and record['conceptdoi'] == CONCEPT
    assert record['metadata']['version'] == VERSION, 'The existing packaging version must be retained'
    inventory(record)


def window(record, days, now=None):
    created = dt.datetime.fromisoformat(record['created'].replace('Z', '+00:00'))
    assert created.tzinfo is not None, 'Archive creation date must include a timezone'
    current = now or dt.datetime.now(dt.timezone.utc)
    assert dt.timedelta(0) <= current - created < dt.timedelta(days=days), 'Outside the owner file-correction window'


def validate_plan(plan):
    assert plan['sourceCommit'] == DELIVERY_SOURCE, 'Unexpected technical delivery source'
    assert plan['originalArchiveSourceCommit'] == ORIGINAL_SOURCE, 'Original scientific provenance changed'
    assert re.fullmatch('[0-9a-f]{40}', plan['hfRevision']), 'Invalid HF revision'
    assert type(plan['kaggleVersion']) is int and plan['kaggleVersion'] == 32
    assert type(plan['notebookVersion']) is int and plan['notebookVersion'] == 16
    dt.date.fromisoformat(plan['technicalCorrectionDate'])
    for field, expected in [('record', RECORD), ('doi', DOI), ('conceptDOI', CONCEPT), ('version', VERSION)]:
        if field in plan:
            assert plan[field] == expected, 'Attempt to change the existing archive identity'


def corrected_metadata(owner_metadata, plan):
    """Keep legacy metadata fields, replacing only the reviewed description/links."""
    path = Path(__file__).with_name('zenodo_inplace_metadata.py')
    spec = importlib.util.spec_from_file_location('_zenodo_metadata_for_file_correction', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    metadata = module.desired_metadata(owner_metadata, plan)
    paragraph = (
        '<p><strong>Persistent citation and minor technical file correction.</strong> '
        'This record retains DOI <a href="https://doi.org/' + DOI + '">' + DOI +
        '</a>, packaging ' + VERSION + ', and collection '
        '<a href="https://doi.org/' + CONCEPT + '">' + CONCEPT + '</a>. '
        'The original authored scientific snapshot has source ' + ORIGINAL_SOURCE + '. '
        'On ' + html.escape(plan['technicalCorrectionDate']) +
        ', the archived structured-data delivery, technical discovery files and distribution receipts '
        'were corrected in place. The corrected HTML and the complete 188-file website subtree '
        'inside the downloadable ZIP preserve the verified website delivery from source ' + DELIVERY_SOURCE + '. '
        'Current query rows record that delivery source; the canonical scientific graph, clinical content '
        'and original scientific provenance remain unchanged. The same 43 top-level filenames are retained; '
        'changed technical files have new checksums documented in the corrected package. '
        'The original snapshot bindings to Hugging Face 51ec078fc5e5ff5945fd4c36ab37ea5a9449e879, '
        'Kaggle 27 and notebook 12 remain historical provenance, while current connected distributions '
        'are linked above. Files under upstream/ retain their explicitly historical scope.</p>')
    description, count = re.subn(r'<p><strong>Persistent citation and preserved archive\.</strong>.*?</p>',
                                 lambda match: paragraph, metadata['description'], flags=re.S)
    assert count == 1, 'The metadata template changed; review the correction description'
    assert 'All 43 deposited files remain unchanged' not in description
    metadata['description'] = description
    assert {k: v for k, v in metadata.items() if k not in CHANGED_METADATA} == {
        k: v for k, v in owner_metadata.items() if k not in CHANGED_METADATA}
    return metadata


def zip_entries(body):
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive ZIP key'
        assert all(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts
                   for name in names), 'Unsafe archive ZIP path'
        return {name: sha(archive.read(name)) for name in names if not name.endswith('/')}


def prepare(original_public_record, corrected_files, plan, work, *, owner_metadata):
    """Freeze all 43 target bodies and exact metadata. This function never makes a request."""
    identity(original_public_record)
    window(original_public_record, 30)
    validate_plan(plan)
    assert owner_metadata['title'] == original_public_record['metadata']['title']
    assert owner_metadata['version'] == VERSION
    if isinstance(corrected_files, (str, Path)):
        folder = Path(corrected_files)
        assert not any(path.is_symlink() for path in folder.rglob('*')), 'Symlink in correction payload'
        corrected_files = {str(path.relative_to(folder)): path for path in folder.rglob('*') if path.is_file()}
    baseline = inventory(original_public_record)
    assert set(corrected_files) == set(baseline), 'Correction must retain exactly the 43 existing filenames'
    bodies = {name: value if isinstance(value, bytes) else Path(value).read_bytes()
              for name, value in corrected_files.items()}
    target = {name: {'checksum': md5(body), 'bytes': len(body), 'SHA256': sha(body)}
              for name, body in bodies.items()}
    assert CORE_UNCHANGED <= baseline.keys(), 'Missing original scientific files'
    for name in CORE_UNCHANGED:
        assert {k: target[name][k] for k in ('checksum', 'bytes')} == baseline[name], 'Scientific file changed: ' + name
    changed = sorted(name for name in baseline if any(target[name][k] != baseline[name][k]
                                                    for k in ('checksum', 'bytes')))
    assert changed, 'There are no reviewed file corrections to publish'
    zip_inventory = {name: zip_entries(body) for name, body in bodies.items() if name.endswith('.zip')}
    assert len(zip_inventory) == 1, 'Expected the existing single archive ZIP'
    website = {name: digest for entries in zip_inventory.values() for name, digest in entries.items()
               if name.startswith('website/')}
    assert len(website) == 188, 'The full verified 188-file website subtree must be included'
    assert 'website/index.html' in website and 'website/botox.html' in website
    assert sha(bodies['index.html']) == website['website/index.html'], 'Top-level and website homepage differ'
    work = Path(work)
    assert not (work / 'correction-manifest.json').exists(), 'Do not overwrite an existing frozen correction'
    payload = work / 'payload'
    payload.mkdir(parents=True, exist_ok=True)
    for name, body in bodies.items():
        (payload / name).write_bytes(body)
    manifest = {
        'schema': 'zenodo-file-correction-1', 'preparedUTC': utc(), 'record': RECORD,
        'doi': DOI, 'conceptDOI': CONCEPT, 'version': VERSION, 'plan': copy.deepcopy(plan),
        'originalPublicRecord': copy.deepcopy(original_public_record),
        'baseline': {'files': baseline, 'publicMetadataSHA256': sha(canonical(original_public_record['metadata'])),
                     'ownerMetadata': copy.deepcopy(owner_metadata),
                     'ownerMetadataSHA256': sha(canonical(owner_metadata))},
        'target': {'files': target, 'metadata': corrected_metadata(owner_metadata, plan)},
        'changedFiles': changed, 'scientificFilesUnchanged': sorted(CORE_UNCHANGED),
        'ZIPEntriesSHA256': zip_inventory, 'websiteFiles': 188,
    }
    dump(work / 'correction-manifest.json', manifest)
    (work / 'correction-manifest.sha256').write_text(sha(canonical(manifest)) + '\n')
    return manifest


class Anonymous(requests.auth.AuthBase):
    def __call__(self, request):
        return request


def checked(response, allowed=(200,)):
    if response.status_code not in allowed:
        raise RuntimeError('HTTP ' + str(response.status_code) + '; stop without automatic retry')
    return response


def read_public(url):
    return checked(requests.get(url, auth=Anonymous(), headers={'Accept': 'application/json'},
                                timeout=(15, 120), allow_redirects=False))


def read_owner(session, url, *, allowed=(200,), accept='application/json'):
    return checked(session.request('GET', url, headers={'Accept': accept},
                                   timeout=(15, 120), allow_redirects=False), allowed)


def draft_inventory(value):
    entries = value['entries']
    if isinstance(entries, dict):
        entries = list(entries.values())
    return inventory({'files': entries})


def bucket_url(owner):
    bucket = owner['links']['bucket'].rstrip('/')
    prefix = 'https://zenodo.org/api/files/'
    assert bucket.startswith(prefix), 'Unexpected draft bucket host or route'
    identifier = bucket[len(prefix):]
    assert str(uuid.UUID(identifier)) == identifier, 'Invalid draft bucket identifier'
    return bucket


def public_metadata_matches(record, manifest):
    before = manifest['originalPublicRecord']['metadata']
    after = record['metadata']
    expected = manifest['target']['metadata']
    assert {k: v for k, v in after.items() if k not in CHANGED_METADATA} == {
        k: v for k, v in before.items() if k not in CHANGED_METADATA}, 'Unrelated public metadata changed'
    assert after['description'] == expected['description'], 'Published correction description differs'
    order = lambda values: sorted(canonical(value) for value in values)
    assert order(after['related_identifiers']) == order(expected['related_identifiers']), 'Published relations differ'


def target_inventory(manifest):
    return {name: {k: entry[k] for k in ('checksum', 'bytes')}
            for name, entry in manifest['target']['files'].items()}


def verify_public_bytes(record, manifest, read):
    actual = inventory(record)
    assert actual == target_inventory(manifest), 'Public file checksums differ from reviewed correction'
    links = {entry['key']: entry['links']['self'] for entry in record['files']}
    for name, expected in manifest['target']['files'].items():
        url = links[name]
        assert url == PUBLIC + '/files/' + quote(name, safe='') + '/content', 'Unexpected public file link'
        body = checked(read(url)).content
        assert len(body) == expected['bytes'] and sha(body) == expected['SHA256'] and md5(body) == expected['checksum'], 'Public bytes differ: ' + name


def verify_draft_bytes(session, owner, manifest):
    entries = owner['files']
    links = {entry.get('filename', entry.get('key')): entry['links']['download'] for entry in entries}
    assert set(links) == set(manifest['target']['files']), 'Draft filename set differs'
    for name, expected in manifest['target']['files'].items():
        url = links[name]
        assert url == PUBLIC + '/draft/files/' + quote(name, safe='') + '/content', 'Unexpected draft file link'
        body = read_owner(session, url).content
        assert len(body) == expected['bytes'] and sha(body) == expected['SHA256'] and md5(body) == expected['checksum'], 'Draft bytes differ: ' + name


def publish(prepared, work, *, cohort_guard, session=None, public_read=None, reviewed_sha256=None):
    """Publish only an exact reviewed correction; uncertain mutations are never retried."""
    assert callable(cohort_guard), 'A real fresh public-cohort guard is mandatory'
    prepared, work = Path(prepared), Path(work)
    manifest = load(prepared / 'correction-manifest.json')
    manifest_sha = sha(canonical(manifest))
    assert (prepared / 'correction-manifest.sha256').read_text().strip() == manifest_sha, 'Frozen correction manifest changed'
    if reviewed_sha256 is not None:
        assert reviewed_sha256 == manifest_sha, 'Correction differs from the reviewed artifact'
    assert manifest['schema'] == 'zenodo-file-correction-1'
    assert (manifest['record'], manifest['doi'], manifest['conceptDOI'], manifest['version']) == (RECORD, DOI, CONCEPT, VERSION)
    validate_plan(manifest['plan'])
    for name, expected in manifest['target']['files'].items():
        assert PurePosixPath(name).name == name and name not in {'', '.', '..'}
        body = (prepared / 'payload' / name).read_bytes()
        assert sha(body) == expected['SHA256'] and md5(body) == expected['checksum'] and len(body) == expected['bytes'], 'Frozen correction body changed: ' + name
    work.mkdir(parents=True, exist_ok=True)
    journal_path = work / 'mutation-journal.json'
    journal = load(journal_path) if journal_path.exists() else {'manifestSHA256': manifest_sha, 'operations': []}
    assert journal['manifestSHA256'] == manifest_sha, 'Work directory belongs to another correction'
    read = public_read or read_public
    before = checked(read(PUBLIC)).json()
    identity(before)
    desired_files = target_inventory(manifest)

    def finish(record, already_published):
        identity(record)
        public_metadata_matches(record, manifest)
        verify_public_bytes(record, manifest, read)
        report = {'status': 'PASS', 'record': RECORD, 'doi': DOI, 'conceptDOI': CONCEPT,
                  'version': VERSION, 'manifestSHA256': manifest_sha, 'sameRecordPublished': True,
                  'alreadyPublished': already_published, 'publicFilesSHA256Verified': 43,
                  'changedFiles': manifest['changedFiles'], 'websiteFilesInZIP': 188,
                  'observedUTC': utc(), 'cohort': manifest['plan']}
        dump(work / 'publication-report.json', report)
        return report

    if inventory(before) == desired_files:
        return finish(before, True)
    assert inventory(before) == manifest['baseline']['files'], 'Published archive files changed since review'
    assert sha(canonical(before['metadata'])) == manifest['baseline']['publicMetadataSHA256'], 'Published metadata changed since review'
    window(before, 45)
    if session is None:
        session = requests.Session()
        session.headers['Authorization'] = 'Bearer ' + os.environ['ZENODO_TOKEN']
    owner = read_owner(session, DEPOSIT).json()
    assert owner['id'] == RECORD and owner['doi'] == DOI and owner['metadata']['version'] == VERSION
    pending_response = read_owner(session, PUBLIC + '/draft', allowed=(200, 404), accept=RDM)
    pending = pending_response.status_code == 200
    staged_ready = False
    if pending:
        current_draft = draft_inventory(read_owner(session, PUBLIC + '/draft/files', accept=RDM).json())
        owner_target = canonical(owner['metadata']) == canonical(manifest['target']['metadata'])
        staged_ready = current_draft == desired_files and owner_target
        if not staged_ready:
            modern_public = read_owner(session, PUBLIC, accept=RDM).json()
            assert pending_response.json()['metadata'] == modern_public['metadata'], 'Unknown unpublished metadata changes'
            assert current_draft == manifest['baseline']['files'], 'Unknown or partial unpublished file changes'
            assert sha(canonical(owner['metadata'])) == manifest['baseline']['ownerMetadataSHA256'], 'Unknown owner metadata changes'
    else:
        assert sha(canonical(owner['metadata'])) == manifest['baseline']['ownerMetadataSHA256'], 'Owner metadata changed since review'
    if journal['operations']:
        if not staged_ready:
            raise RuntimeError('Earlier mutation attempt needs read-only recovery; no automatic retry')
        assert not any(item['label'] == 'publish' for item in journal['operations']), 'An earlier publish attempt is uncertain or already acknowledged; never repeat it'
        # All intended staged bytes and metadata prove earlier non-publication
        # operations succeeded; skip every edit, unlock, upload and metadata PUT.
    guard = cohort_guard(copy.deepcopy(manifest['plan']))
    assert isinstance(guard, dict) and guard.get('status') == 'PASS', 'Fresh public-cohort verification did not pass'
    dump(work / 'cohort-before-stage.json', guard)

    def mutate(label, method, url, *, data=None, json_payload=None, draft_bucket=None):
        allowed = {( 'POST', DEPOSIT + '/actions/edit'), ('POST', PUBLIC + '/file-modification'),
                   ('PUT', DEPOSIT), ('POST', DEPOSIT + '/actions/publish')}
        if draft_bucket is not None:
            allowed |= {('PUT', draft_bucket + '/' + quote(name, safe='')) for name in manifest['changedFiles']}
        assert (method, url) in allowed, 'Out-of-scope write endpoint'
        assert not any(item['label'] == label for item in journal['operations']), 'A mutation must never be repeated'
        payload = canonical(json_payload) if json_payload is not None else data
        entry = {'label': label, 'method': method, 'url': url, 'attemptedUTC': utc(),
                 'requestSHA256': sha(payload) if payload is not None else None, 'state': 'attempted'}
        journal['operations'].append(entry)
        dump(journal_path, journal)
        try:
            response = session.request(method, url, data=payload,
                                       headers={'Content-Type': 'application/json' if json_payload is not None else 'application/octet-stream'},
                                       timeout=(15, 180), allow_redirects=False)
        except Exception as error:
            entry.update(state='uncertain', errorType=type(error).__name__)
            dump(journal_path, journal)
            raise RuntimeError('Uncertain ' + label + ' request; inspect state without repeating the mutation') from None
        entry.update(HTTP=response.status_code, state='acknowledged' if response.status_code in (200, 201, 202, 204) else 'rejected')
        dump(journal_path, journal)
        return checked(response, (200, 201, 202, 204))

    if not staged_ready:
        window(before, 30)
        old_bucket = bucket_url(owner) if not pending else None
        if not pending:
            mutate('edit', 'POST', DEPOSIT + '/actions/edit')
        owner = read_owner(session, DEPOSIT).json()
        draft_bucket = bucket_url(owner)
        assert draft_bucket != old_bucket, 'The returned bucket is still the published bucket'
        if 'publishedBucket' in journal:
            assert draft_bucket != journal['publishedBucket'], 'Wrong draft bucket'
        if old_bucket:
            journal['publishedBucket'] = old_bucket
        journal['draftBucket'] = draft_bucket
        dump(journal_path, journal)
        # Ensure this owner representation really resolves to the existing draft.
        read_owner(session, PUBLIC + '/draft', accept=RDM)
        assert draft_inventory(read_owner(session, PUBLIC + '/draft/files', accept=RDM).json()) == manifest['baseline']['files'], 'Draft files differ before unlock'
        public_baseline = checked(read(PUBLIC)).json()
        assert inventory(public_baseline) == manifest['baseline']['files'] and sha(canonical(public_baseline['metadata'])) == manifest['baseline']['publicMetadataSHA256'], 'Public baseline changed before staging'
        unlock = before['links']['file_modification']
        assert unlock == PUBLIC + '/file-modification', 'Unexpected file-modification link'
        mutate('unlock', 'POST', unlock, json_payload={'comment':
               'Minor technical correction of structured-data delivery and current distribution links; '
               'authored scientific content, original scientific provenance and the existing DOI are preserved.'})
        for name in manifest['changedFiles']:
            expected = manifest['target']['files'][name]
            body = (prepared / 'payload' / name).read_bytes()
            response = mutate('file:' + name, 'PUT', draft_bucket + '/' + quote(name, safe=''), data=body, draft_bucket=draft_bucket)
            uploaded = response.json()
            assert uploaded['key'] == name and uploaded['size'] == expected['bytes'] and uploaded['checksum'] == expected['checksum'], 'Upload acknowledgement differs from reviewed body'
        assert draft_inventory(read_owner(session, PUBLIC + '/draft/files', accept=RDM).json()) == desired_files, 'Staged file inventory differs'
        mutate('metadata', 'PUT', DEPOSIT, json_payload={'metadata': manifest['target']['metadata']})
    staged_owner = read_owner(session, DEPOSIT).json()
    assert canonical(staged_owner['metadata']) == canonical(manifest['target']['metadata']), 'Staged metadata differs from reviewed correction'
    assert draft_inventory(read_owner(session, PUBLIC + '/draft/files', accept=RDM).json()) == desired_files, 'Staged file inventory differs'
    verify_draft_bytes(session, staged_owner, manifest)
    public_before_publish = checked(read(PUBLIC)).json()
    assert inventory(public_before_publish) == manifest['baseline']['files'], 'Published files changed before the reviewed publish action'
    assert sha(canonical(public_before_publish['metadata'])) == manifest['baseline']['publicMetadataSHA256'], 'Public metadata changed before publish'
    final_guard = cohort_guard(copy.deepcopy(manifest['plan']))
    assert isinstance(final_guard, dict) and final_guard.get('status') == 'PASS', 'Final public-cohort verification did not pass'
    dump(work / 'cohort-before-publish.json', final_guard)
    window(before, 45)
    mutate('publish', 'POST', DEPOSIT + '/actions/publish')
    return finish(checked(read(PUBLIC)).json(), False)
