"""Read-only verification of a published archive kept outside mutable releases."""
import concurrent.futures
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import quote


def verify_published_archive(work, policy, source_commit, read, *, expected=None, verify_bytes=True):
    """Pin public metadata and actual archived bytes without any archive write API."""
    work = Path(work)
    work.mkdir(parents=True, exist_ok=True)
    assert re.fullmatch(r'[a-f0-9]{40}', source_commit or ''), 'Missing immutable archive source pin'
    archive, concept = policy['currentArchive'], policy['concept']
    record = read('https://zenodo.org/api/records/' + str(archive['recordId'])).json()
    assert record['id'] == archive['recordId'] and record['doi'] == archive['doi'], 'Archive record/DOI changed'
    assert record['conceptdoi'] == concept['doi'] and str(record['conceptrecid']) == str(concept['recordId']), 'Archive collection changed'
    assert record['metadata']['version'] == archive['packagingVersion'], 'Archive version changed'
    source_url = 'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + source_commit
    assert any(x['identifier'] == source_url and x['relation'] == 'isDerivedFrom'
               for x in record['metadata'].get('related_identifiers', [])), 'Published archive source pin differs'
    files = {}
    for item in record['files']:
        name = item['key']
        assert name and PurePosixPath(name).name == name and '\\' not in name and name not in files, 'Unsafe or duplicate archive filename'
        assert re.fullmatch(r'md5:[a-f0-9]{32}', item['checksum']), 'Unexpected archive checksum'
        files[name] = {'bytes': item['size'], 'checksum': item['checksum']}
    assert files and {'release-provenance.json', 'archive-provenance.json', 'doi-policy.json'} <= files.keys(), 'Archive provenance missing'
    result = {'record': record['id'], 'doi': record['doi'], 'conceptDOI': record['conceptdoi'],
              'version': record['metadata']['version'], 'sourceCommit': source_commit,
              'metadataSHA256': hashlib.sha256(json.dumps(record['metadata'], sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
              'files': files}
    if expected is not None:
        previous = {**expected, 'files': {n: {k: v for k, v in meta.items() if k != 'sha256'} for n, meta in expected['files'].items()}}
        assert result == previous, 'Published archive metadata or file inventory changed'
    if verify_bytes:
        def download(item):
            name, meta = item
            body = read('https://zenodo.org/records/' + str(record['id']) + '/files/' + quote(name, safe='')).content
            assert len(body) == meta['bytes'] and 'md5:' + hashlib.md5(body).hexdigest() == meta['checksum'], ('Archive bytes differ', name)
            meta['sha256'] = hashlib.sha256(body).hexdigest()
            if expected is not None:
                assert meta == expected['files'][name], ('Archived file changed', name)
            (work / name).write_bytes(body)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(download, files.items()))
        archived_policy = json.loads((work / 'doi-policy.json').read_text())
        assert archived_policy['currentArchive']['sourceCommit'] == source_commit, 'Archived DOI source differs'
        assert archived_policy['currentArchive']['doi'] == archive['doi'] and archived_policy['concept']['doi'] == concept['doi']
        binding = archived_policy['currentArchive']
        delivery = binding.get('deliverySourceCommit')
        for name in ['release-provenance.json', 'archive-provenance.json']:
            provenance = json.loads((work / name).read_text())
            if provenance['sourceCommit'] == source_commit:
                continue
            # The existing same-DOI correction records original science and
            # technical delivery separately. Verify every explicit binding;
            # never relabel corrected delivery bytes as the scientific source.
            assert (binding.get('originalScientificSourceCommit') == source_commit and
                    binding.get('sourceCommitReference') == 'release-provenance.json#/originalScientificSourceCommit' and
                    re.fullmatch(r'[a-f0-9]{40}', delivery or '') and
                    provenance.get('originalScientificSourceCommit') == source_commit and
                    provenance.get('deliverySourceCommit') == delivery == provenance['sourceCommit']), ('Archived provenance differs', name)
        bundle = Path(policy['downloadBindings']['bundle']).name
        assert bundle in files, 'Published archive bundle missing'
        with zipfile.ZipFile(io.BytesIO((work / bundle).read_bytes())) as zipped:
            names = zipped.namelist()
            assert len(names) == len(set(names)) and zipped.testzip() is None, 'Duplicate or corrupt archive ZIP'
            assert all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and '\\' not in n for n in names), 'Unsafe archive ZIP'
            checksums = {}
            for line in zipped.read('checksums.sha256').decode().splitlines():
                digest, name = line.split('  ', 1)
                assert name not in checksums and re.fullmatch(r'[a-f0-9]{64}', digest), 'Invalid archive SHA256 inventory'
                checksums[name] = digest
                assert hashlib.sha256(zipped.read(name)).hexdigest() == digest, ('Archive ZIP checksum differs', name)
            assert set(checksums) == {n for n in names if not n.endswith('/') and n != 'checksums.sha256'}, 'Incomplete archive SHA256 inventory'
            for name in files:
                if name == bundle:
                    continue
                matches = [n for n in names if not n.startswith(('viewer/', 'upstream/', 'website/')) and PurePosixPath(n).name == name]
                assert len(matches) == 1 and zipped.read(matches[0]) == (work / name).read_bytes(), ('Archive standalone/ZIP mismatch', name)
    (work / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    return result
