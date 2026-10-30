"""Published archive preservation checks use public bytes, never mutation APIs."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.github/scripts'))
from immutable_archive import verify_published_archive

SOURCE = 'a' * 40
POLICY = {'currentArchive': {'recordId': 12, 'doi': '10.5281/zenodo.12', 'packagingVersion': '1.3.4+zenodo.3'},
          'concept': {'recordId': 10, 'doi': '10.5281/zenodo.10'},
          'downloadBindings': {'bundle': 'https://zenodo.org/records/12/files/bundle.zip'}}


def fixture(*, zip_change=None, delivery_source=None, website_copy=False):
    bodies = {name: json.dumps({'sourceCommit': SOURCE}).encode()
              for name in ['release-provenance.json', 'archive-provenance.json']}
    bodies['doi-policy.json'] = json.dumps({'currentArchive': {**POLICY['currentArchive'], 'sourceCommit': SOURCE},
                                           'concept': POLICY['concept']}).encode()
    if delivery_source:
        for name in ['release-provenance.json','archive-provenance.json']:
            bodies[name] = json.dumps({'sourceCommit':delivery_source,'deliverySourceCommit':delivery_source,
                                      'originalScientificSourceCommit':SOURCE}).encode()
        policy=json.loads(bodies['doi-policy.json'])
        policy['currentArchive'].update(originalScientificSourceCommit=SOURCE,deliverySourceCommit=delivery_source,
                                       sourceCommitReference='release-provenance.json#/originalScientificSourceCommit')
        bodies['doi-policy.json']=json.dumps(policy).encode()
    bodies['graph.jsonld'] = b'{"@graph":[]}'
    payload={**bodies,**({'website/graph.jsonld':bodies['graph.jsonld']} if website_copy else {})}
    manifest = ''.join(hashlib.sha256(body).hexdigest() + '  ' + name + '\n' for name, body in sorted(payload.items())).encode()
    zip_bodies = {**payload, 'checksums.sha256': manifest}
    if zip_change:
        zip_change(zip_bodies)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as zipped:
        for name, body in zip_bodies.items():
            zipped.writestr(name, body)
    bodies.update({'checksums.sha256': manifest, 'bundle.zip': output.getvalue()})
    record = {'id': 12, 'doi': POLICY['currentArchive']['doi'], 'conceptdoi': POLICY['concept']['doi'], 'conceptrecid': '10',
              'metadata': {'version': POLICY['currentArchive']['packagingVersion'], 'title': 'Frozen archive',
                           'related_identifiers': [{'identifier': 'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/' + SOURCE, 'relation': 'isDerivedFrom'}]},
              'files': [{'key': name, 'size': len(body), 'checksum': 'md5:' + hashlib.md5(body).hexdigest()} for name, body in bodies.items()]}
    def read(url):
        if '/api/records/' in url:
            return Mock(json=lambda: copy.deepcopy(record))
        return Mock(content=bodies[url.rsplit('/', 1)[-1]])
    return record, bodies, Mock(side_effect=read)


class PublishedArchive(unittest.TestCase):
    def test_nested_website_copy_does_not_ambiguate_the_standalone_archive_file(self):
        _,_,read=fixture(delivery_source='b'*40,website_copy=True)
        with tempfile.TemporaryDirectory() as folder:
            verify_published_archive(folder,POLICY,SOURCE,read)

    def test_recorded_technical_correction_preserves_distinct_science_and_delivery_sources(self):
        record,bodies,read=fixture(delivery_source='b'*40)
        with tempfile.TemporaryDirectory() as folder:
            proof=verify_published_archive(folder,POLICY,SOURCE,read)
            self.assertEqual(proof['sourceCommit'],SOURCE)
            self.assertEqual(json.loads(bodies['release-provenance.json'])['sourceCommit'],'b'*40)
            self.assertEqual(verify_published_archive(folder,POLICY,SOURCE,read,expected=proof),proof)
            verify_published_archive(folder,POLICY,SOURCE,read,expected=proof,verify_bytes=False)

    def test_technical_correction_cannot_hide_an_unbound_or_different_source(self):
        for field,value in [('originalScientificSourceCommit','c'*40),('deliverySourceCommit','c'*40)]:
            record,bodies,read=fixture(delivery_source='b'*40)
            document=json.loads(bodies['release-provenance.json']);document[field]=value
            bodies['release-provenance.json']=json.dumps(document).encode()
            item=next(x for x in record['files'] if x['key']=='release-provenance.json')
            item.update(size=len(bodies[item['key']]),checksum='md5:'+hashlib.md5(bodies[item['key']]).hexdigest())
            with tempfile.TemporaryDirectory() as folder,self.assertRaisesRegex(AssertionError,'Archived provenance differs'):
                verify_published_archive(folder,POLICY,SOURCE,read)

    def test_public_bytes_zip_inventory_and_source_are_verified(self):
        record, bodies, read = fixture()
        with tempfile.TemporaryDirectory() as folder:
            proof = verify_published_archive(folder, POLICY, SOURCE, read)
            self.assertEqual(proof['sourceCommit'], SOURCE)
            self.assertEqual(set(proof['files']), set(bodies))
            for name, body in bodies.items():
                self.assertEqual(proof['files'][name]['sha256'], hashlib.sha256(body).hexdigest())
            self.assertEqual(read.call_count, 1 + len(bodies))
            second = verify_published_archive(folder, POLICY, SOURCE, read, expected=proof)
            self.assertEqual(proof, second)

    def test_wrong_source_pin_blocks_before_any_file_read(self):
        _, _, read = fixture()
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'source pin differs'):
            verify_published_archive(folder, POLICY, 'b' * 40, read)
        self.assertEqual(read.call_count, 1)

    def test_bad_actual_file_bytes_fail_published_checksum(self):
        _, bodies, read = fixture()
        bodies['graph.jsonld'] = b'wrong bytes'
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'Archive bytes differ'):
            verify_published_archive(folder, POLICY, SOURCE, read)

    def test_metadata_and_inventory_changes_block_cutover(self):
        record, _, read = fixture()
        with tempfile.TemporaryDirectory() as folder:
            baseline = verify_published_archive(folder, POLICY, SOURCE, read)
            for change in [lambda: record['metadata'].update(title='Independent edit'),
                           lambda: record['files'][0].update(checksum='md5:' + 'b' * 32)]:
                original = copy.deepcopy(record)
                change()
                read.reset_mock()
                with self.assertRaisesRegex(AssertionError, 'metadata or file inventory changed'):
                    verify_published_archive(folder, POLICY, SOURCE, read, expected=baseline, verify_bytes=False)
                self.assertEqual(read.call_count, 1)
                record.clear()
                record.update(original)

    def test_internal_zip_sha256_cannot_differ_from_its_files(self):
        _, _, read = fixture(zip_change=lambda files: files.update({'graph.jsonld': b'changed only in zip'}))
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'ZIP checksum differs'):
            verify_published_archive(folder, POLICY, SOURCE, read)

    def test_zip_inventory_cannot_omit_an_extra_file(self):
        _, _, read = fixture(zip_change=lambda files: files.update({'extra.txt': b'not inventoried'}))
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'Incomplete archive SHA256 inventory'):
            verify_published_archive(folder, POLICY, SOURCE, read)

    def test_archive_embedded_source_cannot_be_relabelled(self):
        record, bodies, read = fixture()
        bodies['release-provenance.json'] = json.dumps({'sourceCommit': 'b' * 40}).encode()
        item = next(x for x in record['files'] if x['key'] == 'release-provenance.json')
        item.update(size=len(bodies[item['key']]), checksum='md5:' + hashlib.md5(bodies[item['key']]).hexdigest())
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(AssertionError, 'Archived provenance differs'):
            verify_published_archive(folder, POLICY, SOURCE, read)


if __name__ == '__main__':
    unittest.main()
