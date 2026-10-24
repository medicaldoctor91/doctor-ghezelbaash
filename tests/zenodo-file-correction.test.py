"""Exercise the frozen same-record transaction without any live service access."""
import copy
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import requests

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('zenodo_file_correction', ROOT / '.github/scripts/zenodo_file_correction.py')
correction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(correction)

BUNDLE = 'dr-saeed-ghezelbash-dataset-1.3.4-zenodo.3.zip'
PUB_BUCKET = 'https://zenodo.org/api/files/73da425f-a810-40eb-8667-f7d45f5e9bfe'
DRAFT_BUCKET = 'https://zenodo.org/api/files/5a9af002-3ce7-4194-80fb-1d4d919c4d40'
NAMES = '''croissant.json graph.jsonld knowledge.xml sitemap.xml README.md query-matrix.jsonl
release-attestation.json instruction_examples_fa_market_positioning.csv graph.ttl entity-facts.csv-metadata.json
datapackage.json dcat.ttl doctor.vcf current-release-matrix.json clinic.vcf checksums.sha256 shapes.ttl
query-matrix.json-seq answers.txt index.html archive-validation.json clinical-passages.jsonl
market-positioning-evidence.json site.webmanifest instruction_examples_fa_market_positioning.jsonl
positioning-strategy.json doi-policy.json provenance.jsonld linkset.json entity-facts.csv robots.txt
evidence-snapshot.json index.md archive-provenance.json void.ttl llms-full.txt fact-map.json
release-provenance.json doi-role-inventory.json dist-sha256.json llms.txt audit-summary.json'''.split()


class Response:
    def __init__(self, payload=None, *, status=200, content=None):
        self.status_code = status
        self.content = content if content is not None else json.dumps(payload).encode()
        self.payload = payload

    def json(self):
        return copy.deepcopy(self.payload) if self.payload is not None else json.loads(self.content)


def zip_body(home):
    body = io.BytesIO()
    with zipfile.ZipFile(body, 'w') as archive:
        archive.writestr('website/index.html', home)
        archive.writestr('website/botox.html', b'article schema')
        for index in range(186):
            archive.writestr('website/p%03d.bin' % index, str(index).encode())
    return body.getvalue()


class Fixture:
    def __init__(self):
        assert len(NAMES) == 42
        self.names = NAMES + [BUNDLE]
        self.before_bodies = {name: ('preserved:' + name).encode() for name in self.names}
        self.before_bodies['index.html'] = b'<html>old schema delivery</html>'
        self.before_bodies[BUNDLE] = zip_body(self.before_bodies['index.html'])
        self.after_bodies = copy.deepcopy(self.before_bodies)
        self.after_bodies['index.html'] = b'<html>corrected schema delivery</html>'
        self.after_bodies['README.md'] = b'Minor technical correction, original scientific source retained.'
        self.after_bodies[BUNDLE] = zip_body(self.after_bodies['index.html'])
        self.metadata = {'title': 'Dr. Saeed Ghezelbash clinical Dataset', 'version': correction.VERSION,
                         'description': 'Prior public description', 'upload_type': 'dataset',
                         'publication_date': '2026-10-22', 'license': 'cc-by-4.0',
                         'creators': [{'name': 'Ghezelbash, Saeed'}],
                         'related_identifiers': [{'identifier': 'https://www.ghezelbaash.ir/',
                                                  'scheme': 'url', 'relation': 'isSupplementedBy'}]}
        self.plan = {'record': correction.RECORD, 'doi': correction.DOI, 'conceptDOI': correction.CONCEPT,
                     'version': correction.VERSION, 'sourceCommit': correction.DELIVERY_SOURCE,
                     'originalArchiveSourceCommit': correction.ORIGINAL_SOURCE,
                     'hfRevision': 'a' * 40, 'kaggleVersion': 32, 'notebookVersion': 16,
                     'technicalCorrectionDate': '2026-10-24'}
        self.record = self.public_record(self.before_bodies, self.metadata)

    def public_record(self, bodies, metadata):
        return {'id': correction.RECORD, 'doi': correction.DOI, 'conceptdoi': correction.CONCEPT,
                'created': (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat(),
                'metadata': copy.deepcopy(metadata),
                'links': {'file_modification': correction.PUBLIC + '/file-modification'},
                'files': [{'key': name, 'size': len(body), 'checksum': correction.md5(body),
                           'links': {'self': correction.PUBLIC + '/files/' + name + '/content'}}
                          for name, body in bodies.items()]}


class FakeZenodo:
    """The public and draft stores are separate, matching the official API model."""
    def __init__(self, fixture):
        self.fixture = fixture
        self.public_bodies = copy.deepcopy(fixture.before_bodies)
        self.public_metadata = copy.deepcopy(fixture.metadata)
        self.draft_bodies = None
        self.draft_metadata = None
        self.calls = []
        self.public_reads = []
        self.unlocked = False
        self.wrong_draft_bucket = False
        self.uncertain_label = None
        self.publish_before_timeout = False
        self.reject_label = None
        self.corrupt_after_upload = None

    def record(self):
        return self.fixture.public_record(self.public_bodies, self.public_metadata)

    def open_draft(self):
        self.draft_bodies = copy.deepcopy(self.public_bodies)
        self.draft_metadata = copy.deepcopy(self.public_metadata)

    def owner(self):
        draft = self.draft_bodies is not None
        bodies = self.draft_bodies if draft else self.public_bodies
        metadata = self.draft_metadata if draft else self.public_metadata
        bucket = DRAFT_BUCKET if draft and not self.wrong_draft_bucket else PUB_BUCKET
        return {'id': correction.RECORD, 'doi': correction.DOI, 'submitted': True,
                'metadata': copy.deepcopy(metadata), 'links': {'bucket': bucket},
                'files': [{'filename': name, 'filesize': len(body), 'checksum': correction.md5(body).split(':')[1],
                           'links': {'download': correction.PUBLIC + '/draft/files/' + name + '/content'}}
                          for name, body in bodies.items()]}

    def read(self, url):
        self.public_reads.append(url)
        if url == correction.PUBLIC:
            return Response(self.record())
        prefix = correction.PUBLIC + '/files/'
        if url.startswith(prefix) and url.endswith('/content'):
            name = url[len(prefix):-len('/content')]
            return Response(content=self.public_bodies[name])
        raise AssertionError('Unexpected public GET ' + url)

    def request(self, method, url, **kwargs):
        self.calls.append((method, url))
        if method == 'GET':
            if url == correction.DEPOSIT:
                return Response(self.owner())
            if url == correction.PUBLIC:
                return Response({'metadata': self.public_metadata})
            if url == correction.PUBLIC + '/draft':
                return Response({'metadata': self.draft_metadata}, status=200 if self.draft_bodies is not None else 404)
            if url == correction.PUBLIC + '/draft/files':
                assert self.draft_bodies is not None
                return Response({'entries': [{'key': name, 'size': len(body), 'checksum': correction.md5(body)}
                                              for name, body in self.draft_bodies.items()]})
            prefix = correction.PUBLIC + '/draft/files/'
            if url.startswith(prefix) and url.endswith('/content'):
                assert self.draft_bodies is not None
                return Response(content=self.draft_bodies[url[len(prefix):-len('/content')]])
            raise AssertionError('Unexpected owner GET ' + url)
        assert kwargs.get('allow_redirects') is False, 'Credentials must not follow redirects'
        label = ('edit' if url.endswith('/actions/edit') else 'unlock' if url.endswith('/file-modification')
                 else 'publish' if url.endswith('/actions/publish') else 'metadata' if url == correction.DEPOSIT
                 else 'file:' + url.rsplit('/', 1)[-1])
        if label == self.reject_label:
            return Response({'error': 'rejected'}, status=403)
        if label == self.uncertain_label and not (label == 'publish' and self.publish_before_timeout):
            raise requests.Timeout('Uncertain transport outcome')
        if label == 'edit':
            assert method == 'POST' and self.draft_bodies is None
            self.open_draft()
            result = Response(self.owner(), status=201)
        elif label == 'unlock':
            assert method == 'POST' and self.draft_bodies is not None
            assert len(json.loads(kwargs['data'])['comment']) >= 25
            self.unlocked = True
            result = Response({'status': 'accepted'}, status=201)
        elif label.startswith('file:'):
            assert method == 'PUT' and self.unlocked and url.startswith(DRAFT_BUCKET + '/')
            name = label.removeprefix('file:')
            assert name in self.draft_bodies, 'Only existing allowlisted filenames may be replaced'
            body = kwargs['data']
            self.draft_bodies[name] = body
            result = Response({'key': name, 'size': len(body), 'checksum': correction.md5(body)}, status=201)
            if name == self.corrupt_after_upload:
                self.draft_bodies[name] += b'corruption'
        elif label == 'metadata':
            assert method == 'PUT'
            self.draft_metadata = json.loads(kwargs['data'])['metadata']
            result = Response(self.owner())
        else:
            assert method == 'POST' and label == 'publish'
            self.public_bodies = copy.deepcopy(self.draft_bodies)
            self.public_metadata = copy.deepcopy(self.draft_metadata)
            self.draft_bodies = self.draft_metadata = None
            result = Response(self.record(), status=202)
        if label == self.uncertain_label:
            raise requests.Timeout('The publish may have succeeded')
        return result

    def writes(self):
        return [(method, url) for method, url in self.calls if method != 'GET']


class CorrectionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.prepared = self.root / 'prepared'
        self.manifest = correction.prepare(self.fixture.record, self.fixture.after_bodies, self.fixture.plan,
                                            self.prepared, owner_metadata=self.fixture.metadata)
        self.fake = FakeZenodo(self.fixture)
        self.guard_calls = 0

    def guard(self, plan):
        self.guard_calls += 1
        self.assertEqual(plan, self.fixture.plan)
        self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies,
                         'The published files must stay unchanged until publication')
        return {'status': 'PASS', 'actualPublicCohortVerified': True}

    def publish(self, **kwargs):
        return correction.publish(self.prepared, self.root / 'work', session=self.fake,
                                  public_read=self.fake.read, cohort_guard=kwargs.pop('cohort_guard', self.guard), **kwargs)

    def test_full_same_record_transaction_verifies_all_43_public_files(self):
        result = self.publish(reviewed_sha256=correction.sha(correction.canonical(self.manifest)))
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['publicFilesSHA256Verified'], 43)
        self.assertEqual(self.guard_calls, 2)
        self.assertEqual(self.fake.public_bodies, self.fixture.after_bodies)
        writes = self.fake.writes()
        self.assertEqual(writes[0], ('POST', correction.DEPOSIT + '/actions/edit'))
        self.assertEqual(writes[1], ('POST', correction.PUBLIC + '/file-modification'))
        self.assertEqual(writes[-1], ('POST', correction.DEPOSIT + '/actions/publish'))
        self.assertEqual(sum(method == 'PUT' and url.startswith(DRAFT_BUCKET + '/') for method, url in writes), 3)
        self.assertFalse(any('newversion' in url or method == 'DELETE' for method, url in writes))
        self.assertEqual(len([url for url in self.fake.public_reads if '/files/' in url]), 43)
        for key in correction.CHANGED_METADATA:
            self.assertEqual(self.fake.public_metadata[key], self.manifest['target']['metadata'][key])
        for key in set(self.fixture.metadata) - correction.CHANGED_METADATA:
            self.assertEqual(self.fake.public_metadata[key], self.fixture.metadata[key])

    def test_already_published_target_is_read_only_and_checks_every_file_again(self):
        self.publish()
        calls = len(self.fake.writes())
        result = self.publish()
        self.assertTrue(result['alreadyPublished'])
        self.assertEqual(len(self.fake.writes()), calls)
        self.assertEqual(self.guard_calls, 2)

    def test_wrong_doi_is_rejected_before_preparation(self):
        record = copy.deepcopy(self.fixture.record)
        record['doi'] = '10.5281/zenodo.999999'
        with self.assertRaises(AssertionError):
            correction.prepare(record, self.fixture.after_bodies, self.fixture.plan,
                               self.root / 'wrong', owner_metadata=self.fixture.metadata)

    def test_missing_or_extra_filename_is_rejected(self):
        bodies = copy.deepcopy(self.fixture.after_bodies)
        del bodies['README.md']
        bodies['extra.txt'] = b'extra'
        with self.assertRaisesRegex(AssertionError, '43 existing'):
            correction.prepare(self.fixture.record, bodies, self.fixture.plan,
                               self.root / 'wrong', owner_metadata=self.fixture.metadata)

    def test_original_scientific_bytes_cannot_be_replaced(self):
        bodies = copy.deepcopy(self.fixture.after_bodies)
        bodies['graph.jsonld'] += b'scientific change'
        with self.assertRaisesRegex(AssertionError, 'Scientific file changed'):
            correction.prepare(self.fixture.record, bodies, self.fixture.plan,
                               self.root / 'wrong', owner_metadata=self.fixture.metadata)

    def test_incomplete_website_snapshot_is_rejected(self):
        bodies = copy.deepcopy(self.fixture.after_bodies)
        body = io.BytesIO()
        with zipfile.ZipFile(body, 'w') as zipped:
            zipped.writestr('website/index.html', bodies['index.html'])
        bodies[BUNDLE] = body.getvalue()
        with self.assertRaisesRegex(AssertionError, '188-file'):
            correction.prepare(self.fixture.record, bodies, self.fixture.plan,
                               self.root / 'wrong', owner_metadata=self.fixture.metadata)

    def test_payload_or_reviewed_manifest_tampering_stops_before_any_service_call(self):
        with self.assertRaisesRegex(AssertionError, 'reviewed artifact'):
            self.publish(reviewed_sha256='f' * 64)
        self.assertEqual(self.fake.calls, [])
        (self.prepared / 'payload/README.md').write_bytes(b'tampered')
        with self.assertRaisesRegex(AssertionError, 'Frozen correction body changed'):
            self.publish()
        self.assertEqual(self.fake.calls, [])

    def test_published_baseline_change_is_rejected_before_writes(self):
        self.fake.public_bodies['README.md'] += b'concurrent change'
        with self.assertRaisesRegex(AssertionError, 'Published archive files changed'):
            self.publish()
        self.assertEqual(self.fake.writes(), [])

    def test_unrelated_public_metadata_change_is_rejected(self):
        self.fake.public_metadata['title'] = 'Concurrent different title'
        with self.assertRaisesRegex(AssertionError, 'Published metadata changed'):
            self.publish()
        self.assertEqual(self.fake.writes(), [])

    def test_unknown_pending_metadata_or_file_changes_are_preserved(self):
        self.fake.open_draft()
        self.fake.draft_metadata['title'] = 'Unpublished author edit'
        with self.assertRaisesRegex(AssertionError, 'Unknown unpublished metadata'):
            self.publish()
        self.assertEqual(self.fake.writes(), [])
        self.fake.draft_metadata = copy.deepcopy(self.fixture.metadata)
        self.fake.draft_bodies['README.md'] += b'unpublished file edit'
        with self.assertRaisesRegex(AssertionError, 'Unknown or partial unpublished file'):
            self.publish()
        self.assertEqual(self.fake.writes(), [])

    def test_published_bucket_is_never_used_as_the_draft_upload_target(self):
        self.fake.wrong_draft_bucket = True
        with self.assertRaisesRegex(AssertionError, 'published bucket'):
            self.publish()
        self.assertEqual(self.fake.writes(), [('POST', correction.DEPOSIT + '/actions/edit')])
        self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies)

    def test_real_cohort_guard_is_required_and_must_pass_before_writes(self):
        with self.assertRaisesRegex(AssertionError, 'did not pass'):
            self.publish(cohort_guard=lambda plan: {'status': 'PENDING'})
        self.assertEqual(self.fake.writes(), [])
        with self.assertRaisesRegex(AssertionError, 'mandatory'):
            correction.publish(self.prepared, self.root / 'other', session=self.fake,
                               public_read=self.fake.read, cohort_guard=None)

    def test_upload_corruption_is_detected_without_publishing(self):
        self.fake.corrupt_after_upload = 'README.md'
        with self.assertRaisesRegex(AssertionError, 'Staged file inventory differs'):
            self.publish()
        self.assertFalse(any(url.endswith('/actions/publish') for method, url in self.fake.writes()))
        self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies)

    def test_permission_rejection_is_not_retried(self):
        self.fake.reject_label = 'unlock'
        with self.assertRaisesRegex(RuntimeError, 'HTTP 403'):
            self.publish()
        writes = self.fake.writes()
        self.assertEqual(sum(url.endswith('/file-modification') for method, url in writes), 1)
        with self.assertRaisesRegex(RuntimeError, 'read-only recovery'):
            self.publish()
        self.assertEqual(self.fake.writes(), writes)

    def test_uncertain_file_mutation_is_not_automatically_repeated(self):
        self.fake.uncertain_label = 'file:README.md'
        with self.assertRaisesRegex(RuntimeError, 'Uncertain file:README.md'):
            self.publish()
        writes = self.fake.writes()
        with self.assertRaisesRegex(RuntimeError, 'read-only recovery'):
            self.publish()
        self.assertEqual(self.fake.writes(), writes)
        self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies)

    def test_exact_staged_recovery_skips_edit_unlock_upload_and_metadata(self):
        self.fake.open_draft()
        self.fake.draft_bodies = copy.deepcopy(self.fixture.after_bodies)
        self.fake.draft_metadata = copy.deepcopy(self.manifest['target']['metadata'])
        report = self.publish()
        self.assertEqual(report['status'], 'PASS')
        self.assertEqual(self.fake.writes(), [('POST', correction.DEPOSIT + '/actions/publish')])

    def test_prestage_guard_stages_private_files_but_cannot_authorize_publication(self):
        preparation_calls = []
        strict_calls = []

        def preparation(plan):
            self.assertEqual(plan, self.fixture.plan)
            preparation_calls.append(plan)
            return {'status': 'PASS', 'publicDatasetAndSourceVerified': True,
                    'notebookExecution': 'PENDING'}

        def strict_pending(plan):
            strict_calls.append(plan)
            # The strict check must occur only after the complete target draft
            # has been independently verified; public content is still old.
            self.assertEqual(self.fake.draft_bodies, self.fixture.after_bodies)
            self.assertEqual(self.fake.draft_metadata, self.manifest['target']['metadata'])
            self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies)
            self.assertEqual(self.fake.public_metadata, self.fixture.metadata)
            raise RuntimeError('Notebook16 actual execution remains pending')

        with self.assertRaisesRegex(RuntimeError, 'actual execution remains pending'):
            self.publish(prestage_guard=preparation, cohort_guard=strict_pending)
        self.assertEqual(len(preparation_calls), 1)
        self.assertEqual(len(strict_calls), 1)
        self.assertEqual(self.fake.draft_bodies, self.fixture.after_bodies)
        self.assertEqual(self.fake.draft_metadata, self.manifest['target']['metadata'])
        self.assertEqual(self.fake.public_bodies, self.fixture.before_bodies)
        self.assertEqual(self.fake.public_metadata, self.fixture.metadata)
        before_writes = self.fake.writes()
        self.assertFalse(any(url.endswith('/actions/publish') for method, url in before_writes))
        journal = json.loads((self.root / 'work/mutation-journal.json').read_text())
        self.assertTrue(journal['operations'])
        self.assertTrue(all(item['state'] == 'acknowledged' for item in journal['operations']))
        self.assertEqual(journal['operations'][-1]['label'], 'metadata')
        self.assertNotIn('publish', [item['label'] for item in journal['operations']])
        receipt = json.loads((self.root / 'work/cohort-before-stage.json').read_text())
        self.assertEqual(receipt['phase'], 'private-draft-preparation')
        self.assertEqual(receipt['guardKind'], 'prestage')
        self.assertIs(receipt['authorizesPublication'], False)
        self.assertEqual(receipt['result']['notebookExecution'], 'PENDING')

        # The exact saved draft resumes without repeating any edit, unlock,
        # upload or metadata write. Only a new strict check can permit publish.
        def strict_ready(plan):
            strict_calls.append(plan)
            self.assertEqual(plan, self.fixture.plan)
            return self.guard(plan)

        report = self.publish(prestage_guard=preparation, cohort_guard=strict_ready)
        self.assertEqual(report['status'], 'PASS')
        self.assertEqual(len(strict_calls), 2)
        self.assertEqual(self.fake.writes(), before_writes + [
            ('POST', correction.DEPOSIT + '/actions/publish')])
        self.assertEqual(self.fake.public_bodies, self.fixture.after_bodies)

    def test_preparation_guard_cannot_replace_or_bypass_the_mandatory_strict_guard(self):
        with self.assertRaisesRegex(AssertionError, 'mandatory'):
            self.publish(prestage_guard=lambda plan: {'status': 'PASS'}, cohort_guard=None)
        self.assertEqual(self.fake.writes(), [])
        with self.assertRaisesRegex(AssertionError, 'did not pass'):
            self.publish(prestage_guard=lambda plan: {'status': 'PENDING'})
        self.assertEqual(self.fake.writes(), [])
        self.assertEqual(self.guard_calls, 0)

    def test_uncertain_publish_is_not_repeated_when_public_still_old(self):
        self.fake.uncertain_label = 'publish'
        with self.assertRaisesRegex(RuntimeError, 'Uncertain publish'):
            self.publish()
        writes = self.fake.writes()
        with self.assertRaisesRegex(AssertionError, 'never repeat'):
            self.publish()
        self.assertEqual(self.fake.writes(), writes)

    def test_uncertain_publish_that_succeeded_is_recovered_read_only(self):
        self.fake.uncertain_label = 'publish'
        self.fake.publish_before_timeout = True
        with self.assertRaisesRegex(RuntimeError, 'Uncertain publish'):
            self.publish()
        writes = self.fake.writes()
        report = self.publish()
        self.assertTrue(report['alreadyPublished'])
        self.assertEqual(self.fake.writes(), writes)

    def test_correction_window_prevents_new_staging_beyond_30_days(self):
        record = copy.deepcopy(self.fixture.record)
        record['created'] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=31)).isoformat()
        with self.assertRaisesRegex(AssertionError, 'correction window'):
            correction.prepare(record, self.fixture.after_bodies, self.fixture.plan,
                               self.root / 'late', owner_metadata=self.fixture.metadata)


if __name__ == '__main__':
    unittest.main()
