"""Safety and outside-observer identity checks for the same-record metadata edit."""
import copy
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('zenodo_inplace_metadata', ROOT / '.github/scripts/zenodo_inplace_metadata.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Response:
    def __init__(self, value=None, status=200, content=None):
        self.status_code = status
        self.content = content if content is not None else json.dumps(value).encode()

    def json(self):
        return json.loads(self.content)


def fixtures():
    plan = {'candidateSchema': 'mutable-distributions-4', 'sourceCommit': 'a' * 40,
            'hfRevision': 'b' * 40, 'kaggleVersion': 30, 'notebookVersion': 14,
            'kagglePreviousVersion': 29, 'notebookPreviousVersion': 13,
            'archiveSourceCommit': m.ARCHIVE_SOURCE, 'archiveWrites': False}
    metadata = {'title': 'Dr. Saeed Ghezelbash Public Knowledge Graph — Reproducible Dataset Archive',
                'version': m.VERSION, 'description': 'Original archive introduction',
                'doi': m.DOI, 'creators': [{'name': 'Ghezelbash, Saeed', 'orcid': '0009-0001-9346-8475'}],
                'keywords': ['RDF', 'دکتر سعید قزلباش'], 'publication_date': '2026-10-22',
                'related_identifiers': [
                    {'identifier': m.CONCEPT, 'relation': 'isVersionOf', 'scheme': 'doi'},
                    {'identifier': m.HUB + '/tree/old', 'relation': 'isSupplementedBy', 'scheme': 'url'},
                    {'identifier': m.KAGGLE + '/versions/27', 'relation': 'isSupplementedBy', 'scheme': 'url'},
                    {'identifier': m.SITE, 'relation': 'isDescribedBy', 'scheme': 'url'}]}
    files = [{'key': str(i) + '.json', 'checksum': 'md5:' + str(i).zfill(32), 'size': i + 1} for i in range(43)]
    public = {'id': m.RECORD, 'doi': m.DOI, 'conceptdoi': m.CONCEPT,
              'metadata': copy.deepcopy(metadata), 'files': files}
    owner = {'id': m.RECORD, 'doi': m.DOI, 'submitted': True, 'metadata': copy.deepcopy(metadata)}
    baseline = {'record': m.RECORD, 'doi': m.DOI, 'conceptDOI': m.CONCEPT,
                'version': m.VERSION, 'sourceCommit': m.ARCHIVE_SOURCE,
                'files': {f['key']: {'checksum': f['checksum'], 'bytes': f['size']} for f in files}}
    return plan, metadata, public, owner, baseline


def seal_controls(folder, plan, frozen):
    m.dump(folder / 'release-plan.json', plan)
    m.dump(folder / 'archive-baseline.json', fixtures()[-1])
    frozen['controls'] = {name: m.digest((folder / name).read_bytes())
                          for name in ['release-plan.json', 'archive-baseline.json']}
    m.dump(folder / 'frozen-sha256.json', frozen)


class MetadataTests(unittest.TestCase):
    def test_future_cohort_targets_come_from_frozen_plan(self):
        plan, metadata, _, _, _ = fixtures()
        plan.update(kagglePreviousVersion=30, kaggleVersion=31,
                    notebookPreviousVersion=14, notebookVersion=15)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            frozen = {}
            seal_controls(folder, plan, frozen)
            m.guard_reviewed_plan(folder, plan, frozen)
            wanted = m.desired_metadata(metadata, plan)
            self.assertIn(m.KAGGLE + '/versions/31', wanted['description'])
            self.assertIn('notebook</a>, version 15', wanted['description'])
            self.assertNotIn(m.KAGGLE + '/versions/30', wanted['description'])
            self.assertIn('https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+plan['sourceCommit'],wanted['description'])

    def test_inconsistent_or_non_integer_plan_increments_fail(self):
        for update in [{'kaggleVersion': 31}, {'notebookVersion': 15},
                       {'kagglePreviousVersion': 0, 'kaggleVersion': 1},
                       {'notebookPreviousVersion': True, 'notebookVersion': 2},
                       {'kaggleVersion': '30'}, {'candidateSchema': 'mutable-distributions-3'}]:
            with self.subTest(update=update), tempfile.TemporaryDirectory() as directory:
                plan = dict(fixtures()[0], **update)
                folder = Path(directory)
                frozen = {}
                seal_controls(folder, plan, frozen)
                with self.assertRaises(AssertionError):
                    m.guard_reviewed_plan(folder, plan, frozen)

    def test_frozen_plan_and_archive_control_tampering_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            plan = fixtures()[0]
            frozen = {}
            seal_controls(folder, plan, frozen)
            (folder / 'release-plan.json').write_text('{}')
            with self.assertRaisesRegex(AssertionError, 'Frozen control changed'):
                m.guard_reviewed_plan(folder, plan, frozen)
            seal_controls(folder, plan, frozen)
            baseline = fixtures()[-1]
            baseline['sourceCommit'] = 'c' * 40
            m.dump(folder / 'archive-baseline.json', baseline)
            frozen['controls']['archive-baseline.json'] = m.digest((folder / 'archive-baseline.json').read_bytes())
            with self.assertRaises(AssertionError):
                m.guard_reviewed_plan(folder, plan, frozen)

    def test_current_machine_relations_replace_old_pins_without_changing_identity(self):
        plan, metadata, _, _, _ = fixtures()
        wanted = m.desired_metadata(metadata, plan)
        self.assertEqual(metadata['description'], 'Original archive introduction')
        self.assertEqual({k: v for k, v in wanted.items() if k not in m.CHANGED_FIELDS},
                         {k: v for k, v in metadata.items() if k not in m.CHANGED_FIELDS})
        links = [r['identifier'] for r in wanted['related_identifiers']]
        self.assertIn(m.HUB + '/tree/' + plan['hfRevision'], links)
        self.assertIn(m.KAGGLE + '/versions/30', links)
        self.assertIn(m.NOTEBOOK, links)
        self.assertNotIn(m.KAGGLE + '/versions/27', links)
        self.assertNotIn(m.HUB + '/tree/old', links)
        self.assertIn('historical snapshot bindings', wanted['description'])
        self.assertIn('notebook</a>, version 14', wanted['description'])
        self.assertEqual(m.desired_metadata(wanted, plan), wanted)

    def test_changed_files_or_doi_are_rejected(self):
        _, _, public, _, baseline = fixtures()
        m.invariant(public, baseline)
        for mutate in [lambda j: j.update(doi='10.5281/zenodo.999'),
                       lambda j: j['files'][0].update(checksum='md5:changed'),
                       lambda j: j['metadata'].update(version='new')]:
            changed = copy.deepcopy(public)
            mutate(changed)
            with self.assertRaises(AssertionError):
                m.invariant(changed, baseline)

    def test_unrelated_public_metadata_change_is_rejected(self):
        plan, metadata, public, _, _ = fixtures()
        wanted = m.desired_metadata(metadata, plan)
        after = copy.deepcopy(public)
        after['metadata'] = wanted
        m.verify_public_metadata(public, after, wanted)
        after['metadata']['creators'][0]['name'] = 'Wrong creator'
        with self.assertRaises(AssertionError):
            m.verify_public_metadata(public, after, wanted)

    def test_pending_metadata_or_file_edits_are_not_overwritten(self):
        _, _, public, owner, _ = fixtures()
        modern = {'metadata': {'title': 'Original'}}
        draft = {'metadata': {'title': 'Unpublished edits'}}
        with patch.object(m, 'get', side_effect=[Response(owner), Response(draft), Response(modern)]):
            with self.assertRaisesRegex(AssertionError, 'Unpublished metadata'):
                m.inspect_owner(object(), public)
        entries = [{'key': f['key'], 'checksum': f['checksum'], 'size': f['size']} for f in public['files']]
        entries[0]['size'] += 1
        with patch.object(m, 'get', side_effect=[Response(owner), Response(modern), Response(modern), Response({'entries': entries})]):
            with self.assertRaisesRegex(AssertionError, 'Unpublished file'):
                m.inspect_owner(object(), public)

    def test_file_and_new_version_write_endpoints_are_impossible(self):
        class Session:
            def request(self, *args, **kwargs):
                raise AssertionError('network must not be invoked')
        for url in [m.PUBLIC + '/file-modification', m.DEPOSIT + '/actions/newversion',
                    m.PUBLIC + '/draft/files', 'https://other.example/']:
            with self.assertRaisesRegex(AssertionError, 'Out-of-scope'):
                m.mutate(Session(), 'POST', url)

    def test_http_write_failure_is_not_retried(self):
        class Session:
            calls = 0
            def request(self, *args, **kwargs):
                self.calls += 1
                return Response({}, status=403)
        session = Session()
        with self.assertRaisesRegex(RuntimeError, 'no automatic retry'):
            m.mutate(session, 'POST', m.DEPOSIT + '/actions/edit')
        self.assertEqual(session.calls, 1)

    def test_transmitted_put_body_matches_saved_exact_request_hash(self):
        class Session:
            def request(self, *args, **kwargs):
                self.body = kwargs['data']
                return Response({})
        session = Session()
        payload = {'metadata': {'description': 'دکتر سعید قزلباش'}}
        m.mutate(session, 'PUT', m.DEPOSIT, payload=payload)
        self.assertEqual(session.body, m.canonical(payload))
        self.assertEqual(json.loads(session.body), payload)

    def test_live_gate_failure_precedes_every_zenodo_write(self):
        _, _, _, _, baseline = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            m.dump(folder / 'archive-baseline.json', baseline)
            m.dump(folder / 'release-plan.json', fixtures()[0])
            with patch.object(m, 'guard_live_cohort', side_effect=AssertionError('Wrong notebook')), \
                 patch.object(m, 'mutate') as write:
                with self.assertRaisesRegex(AssertionError, 'Wrong notebook'):
                    m.run('publish', folder, folder / 'out', folder)
                write.assert_not_called()

    def test_preflight_performs_no_write(self):
        plan, _, public, owner, baseline = fixtures()
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            m.dump(folder / 'archive-baseline.json', baseline)
            m.dump(folder / 'release-plan.json', plan)
            with patch.object(m, 'guard_live_cohort', return_value={'status': 'PASS'}), \
                 patch.object(m, 'get', return_value=Response(public)), \
                 patch.object(m, 'inspect_owner', return_value=(owner, False)), \
                 patch.dict(m.os.environ, {'ZENODO_TOKEN': 'unit-test-never-sent'}), \
                 patch.object(m, 'mutate') as write:
                m.run('preflight', folder, folder / 'out')
                write.assert_not_called()
                report = m.load(folder / 'out/preflight-report.json')
                self.assertFalse(report['writesPerformed'])

    def test_publish_uses_only_same_record_actions_and_preserves_all_files(self):
        plan, metadata, public, owner, baseline = fixtures()
        wanted = m.desired_metadata(metadata, plan)
        after = copy.deepcopy(public)
        after['metadata'] = wanted
        staged = copy.deepcopy(owner)
        staged['metadata'] = wanted
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            m.dump(folder / 'archive-baseline.json', baseline)
            m.dump(folder / 'release-plan.json', plan)
            common = [patch.object(m, 'guard_live_cohort', return_value={'status': 'PASS'}),
                      patch.object(m, 'inspect_owner', return_value=(owner, False)),
                      patch.dict(m.os.environ, {'ZENODO_TOKEN': 'unit-test-never-sent'})]
            with common[0], common[1], common[2], patch.object(m, 'get', return_value=Response(public)):
                m.run('preflight', folder, folder / 'prepared')
            with patch.object(m, 'guard_live_cohort', return_value={'status': 'PASS'}), \
                 patch.object(m, 'inspect_owner', return_value=(owner, False)), \
                 patch.dict(m.os.environ, {'ZENODO_TOKEN': 'unit-test-never-sent'}), \
                 patch.object(m, 'get', side_effect=[Response(public), Response(staged), Response(after)]), \
                 patch.object(m, 'mutate') as write:
                m.run('publish', folder, folder / 'published', folder / 'prepared')
                self.assertEqual([(c.args[1], c.args[2]) for c in write.call_args_list],
                                 [('POST', m.DEPOSIT + '/actions/edit'), ('PUT', m.DEPOSIT),
                                  ('POST', m.DEPOSIT + '/actions/publish')])
                report = m.load(folder / 'published/publication-report.json')
                self.assertEqual(report['archiveFilesUnchanged'], 43)
                self.assertEqual(report['doi'], m.DOI)

    def test_zip_path_traversal_is_rejected_without_extraction(self):
        body = io.BytesIO()
        with zipfile.ZipFile(body, 'w') as archive:
            archive.writestr('../outside', b'bad')
        with self.assertRaisesRegex(AssertionError, 'Unsafe ZIP'):
            m.zip_inventory(body.getvalue())

    def test_cohort_guard_checks_actual_output_and_complete_public_zip(self):
        plan = fixtures()[0]
        starter = {'cells': [{'cell_type': 'code', 'source': ['print(1)\n'], 'metadata': {}, 'outputs': [], 'execution_count': None}]}
        zip_bytes = io.BytesIO()
        with zipfile.ZipFile(zip_bytes, 'w') as archive:
            archive.writestr('starter.ipynb', json.dumps(starter))
            archive.writestr('checksums.sha256', 'frozen inventory')
        inventory, _ = m.zip_inventory(zip_bytes.getvalue())
        provenance = json.dumps({'sourceCommit': plan['sourceCommit']}).encode()
        frozen = {'website': {'release-provenance.json': m.digest(provenance)},
                  'hf-stage': {'release-provenance.json': m.digest(provenance)}, 'kaggle': inventory}
        execution = {'status': 'PASS', 'source_commit': plan['sourceCommit'], 'upstream_revision': plan['hfRevision'],
                     'kaggle_version': 30, 'exact_doi': m.DOI, 'input_checksums_sha256': inventory['checksums.sha256'],
                     'all_table_rows_reconstructed': True, 'unresolved_query_references': 0}
        notebook = {'metadata': {'currentVersionNumber': 14}, 'blob': {'source': json.dumps(starter)}}
        def read(url):
            if url.endswith('release-provenance.json'):
                return Response(content=provenance)
            if '/api/datasets/' in url:
                return Response({'sha': plan['hfRevision']})
            if '/datasets/view/' in url:
                return Response({'currentVersionNumber': plan['kaggleVersion'],
                                 'versions': [{'versionNumber': plan['kaggleVersion']}]})
            if '/datasets/download/' in url:
                return Response(content=zip_bytes.getvalue())
            if '/kernels/pull/' in url:
                return Response(notebook)
            raise AssertionError('Unexpected read URL: ' + url)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            seal_controls(folder, plan, frozen)
            self.assertEqual(m.guard_live_cohort(folder, read=read, post=lambda *a, **k: Response(execution))['status'], 'PASS')
            wrong = dict(execution, kaggle_version=29)
            with self.assertRaises(AssertionError):
                m.guard_live_cohort(folder, read=read, post=lambda *a, **k: Response(wrong))
            notebook['metadata']['currentVersionNumber'] = 15
            with self.assertRaises(AssertionError):
                m.guard_live_cohort(folder, read=read, post=lambda *a, **k: Response(execution))
            notebook['metadata']['currentVersionNumber'] = 14
            frozen['kaggle']['starter.ipynb'] = 'wrong frozen hash'
            m.dump(folder / 'frozen-sha256.json', frozen)
            with self.assertRaisesRegex(AssertionError, 'Kaggle exact files'):
                m.guard_live_cohort(folder, read=read, post=lambda *a, **k: Response(execution))
            # The same real-byte/output guard must support the next frozen
            # cohort, rather than merely rendering a new version label.
            plan.update(kagglePreviousVersion=30, kaggleVersion=31,
                        notebookPreviousVersion=14, notebookVersion=15,
                        sourceCommit='c' * 40, hfRevision='d' * 40)
            provenance = json.dumps({'sourceCommit': plan['sourceCommit']}).encode()
            frozen['website']['release-provenance.json'] = m.digest(provenance)
            frozen['hf-stage']['release-provenance.json'] = m.digest(provenance)
            frozen['kaggle']['starter.ipynb'] = m.zip_inventory(zip_bytes.getvalue())[0]['starter.ipynb']
            notebook['metadata']['currentVersionNumber'] = 15
            execution.update(source_commit=plan['sourceCommit'], upstream_revision=plan['hfRevision'], kaggle_version=31)
            seal_controls(folder, plan, frozen)
            def next_output(*args, **kwargs):
                self.assertEqual(kwargs['json']['versionNumber'], 15)
                return Response(execution)
            self.assertEqual(m.guard_live_cohort(folder, read=read, post=next_output)['status'], 'PASS')
            previous_zip = io.BytesIO()
            with zipfile.ZipFile(previous_zip, 'w') as archive:
                archive.writestr('starter.ipynb', json.dumps({'cells': []}))
                archive.writestr('checksums.sha256', 'previous frozen inventory')
            previous_body = previous_zip.getvalue()
            plan['kaggleBaselinePublication'] = {'version': 30, 'zipSHA256': m.digest(previous_body)}
            seal_controls(folder, plan, frozen)
            def lag_read(url):
                if '/datasets/view/' in url:
                    return Response({'currentVersionNumber': 30, 'versions': [{'versionNumber': 31, 'status': 'Ready'}]})
                if '/datasets/download/' in url and '?' not in url:
                    return Response(content=previous_body)
                return read(url)
            proof = m.guard_live_cohort(folder, read=lag_read, post=next_output)
            self.assertEqual(proof['status'], 'PINNED_COHORT_VERIFIED_DEFAULT_PENDING')
            self.assertFalse(proof['unversionedKaggleDefaultCurrent'])
            self.assertTrue(proof['kaggle']['exact']['matchesPinnedDistribution'])
            self.assertEqual(proof['kaggle']['default']['verifiedPreviousVersion'], 30)
            def unknown_default(url):
                if '/datasets/download/' in url and '?' not in url:
                    return Response(content=previous_body + b'unknown mutation')
                return lag_read(url)
            with self.assertRaisesRegex(AssertionError, 'Unreviewed default Kaggle distribution'):
                m.guard_live_cohort(folder, read=unknown_default, post=next_output)
            def wrong_exact(url):
                if '/datasets/download/' in url and '?' in url:
                    return Response(content=previous_body)
                return lag_read(url)
            with self.assertRaisesRegex(AssertionError, 'Kaggle exact files'):
                m.guard_live_cohort(folder, read=wrong_exact, post=next_output)
            # A specifically reviewed older default is allowed only for the
            # exact frozen candidate and remains explicitly NOT default-ready.
            fingerprint=m.digest((folder/'frozen-sha256.json').read_bytes())
            older_zip=io.BytesIO()
            with zipfile.ZipFile(older_zip,'w') as archive:
                archive.writestr('starter.ipynb',json.dumps({'cells':[],'metadata':{'older':True}}))
                archive.writestr('checksums.sha256','older reviewed inventory')
            older_body=older_zip.getvalue()
            reviewed={fingerprint:{'version':29,'zipSHA256':m.digest(older_body)}}
            def older_default(url):
                if '/datasets/view/' in url:
                    return Response({'currentVersionNumber':29,'versions':[{'versionNumber':31,'status':'Ready'}]})
                if '/datasets/download/' in url and '?' not in url:
                    return Response(content=older_body)
                return lag_read(url)
            with self.assertRaises(AssertionError):
                m.guard_live_cohort(folder,read=older_default,post=next_output)
            with patch.object(m,'REVIEWED_STALE_DEFAULTS',reviewed):
                proof=m.guard_live_cohort(folder,read=older_default,post=next_output)
                self.assertFalse(proof['unversionedKaggleDefaultCurrent'])
                self.assertEqual(proof['kaggle']['default']['verifiedPreviousVersion'],29)


if __name__ == '__main__':
    unittest.main()
