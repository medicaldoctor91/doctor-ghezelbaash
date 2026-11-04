"""Exercise release recovery trust boundaries locally; never contact a provider."""
import copy
import hashlib
import io
import json
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlsplit
import warnings
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.github/scripts'))
import release_recovery as recovery
from release_plan import canonical_sha

SOURCE = 'a' * 40
APPROVED = {
    'refs': {'buildSource': SOURCE},
    'policy': {'currentArchive': {'recordId': 987654321},
               'coordinatedRelease': {'kaggleTargetVersion': 35, 'notebookTargetVersion': 18}},
}
FROZEN = b'{"controls":{"release-plan.json":"reviewed-fixture"}}'
FROZEN_SHA = hashlib.sha256(FROZEN).hexdigest()
ENV = {'GITHUB_RUN_ID': '100', 'GITHUB_RUN_ATTEMPT': '1',
       'GITHUB_REPOSITORY': 'owner/repository', 'GITHUB_SHA': SOURCE,
       'GITHUB_TOKEN': 'local-test-token'}


def context(operation='publish-frozen', run=90):
    return {'schemaVersion': 1, 'operation': operation, 'runId': run, 'runAttempt': 1,
            'sourceCommit': SOURCE, 'approvedReleasePlanSHA256': canonical_sha(APPROVED),
            'frozenManifestSHA256': FROZEN_SHA}


def journals():
    return {
        'kaggle-submission-attempt.json': {'action': 'create-dataset-version', 'version': 35, 'sourceCommit': SOURCE},
        'notebook-submission-attempt.json': {'action': 'push-notebook', 'version': 18, 'sourceCommit': SOURCE},
        'site-deployment-attempt.json': {'action': 'deploy-website', 'sourceCommit': SOURCE, 'frozenManifestSHA256': FROZEN_SHA},
        'zenodo-publish-attempt.json': {'action': 'publish', 'record': 987654321, 'sourceCommit': SOURCE},
    }


def evidence_zip(marker=None, attempts=None, extra=()):
    output = io.BytesIO()
    with warnings.catch_warnings(), zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        warnings.simplefilter('ignore', UserWarning)
        if marker is not False:
            archive.writestr('release-workflow-context.json', json.dumps(marker or context()))
        for name, value in (attempts if attempts is not None else journals()).items():
            archive.writestr(name, json.dumps(value))
        for name, value in extra:
            archive.writestr(name, value)
    return output.getvalue()


class Response:
    def __init__(self, value=None, content=b''):
        self.value = value
        self.content = content
    def json(self):
        return self.value
    def raise_for_status(self):
        return None


class GetOnlySession:
    """A write or an unexpected network endpoint fails the fixture immediately."""
    def __init__(self, callback):
        self.callback = callback
        self.headers = {}
        self.calls = []
    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.callback(urlsplit(url).path, kwargs)
    def post(self, *args, **kwargs):
        raise AssertionError('Recovery must never POST')
    put = post
    delete = post


class BaseTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.parent = Path(self.folder.name)
        self.work = self.parent / 'coordinated-release'
        patcher = patch('release_plan.load_plan', return_value=copy.deepcopy(APPROVED))
        patcher.start()
        self.addCleanup(patcher.stop)


class JournalRecoveryTests(BaseTests):
    def setUp(self):
        super().setUp()
        self.work.mkdir()
        (self.work / 'frozen-sha256.json').write_bytes(FROZEN)
        self.control = self.work / 'release-plan.json'
        self.control.write_text('frozen control; must not be restored from evidence')

    def session(self, archive=None, *, run=None, artifact=None, jobs=None, missing=False):
        archive = evidence_zip() if archive is None else archive
        prior = {'id': 90, 'head_sha': SOURCE, 'status': 'completed', 'run_attempt': 1}
        prior.update(run or {})
        item = {'id': 80, 'name': 'coordinated-release-evidence', 'expired': False, 'size_in_bytes': len(archive)}
        item.update(artifact or {})
        default_jobs = [{'steps': [{'name': 'Execute validated release operation', 'status': 'completed', 'conclusion': 'success'}]}]
        def get(path, kwargs):
            if path.endswith('/workflows/coordinated-doi-release.yml/runs'):
                return Response({'workflow_runs': [prior]})
            if path.endswith('/runs/90/artifacts'):
                return Response({'total_count': 0 if missing else 1, 'artifacts': [] if missing else [item]})
            if path.endswith('/runs/90/jobs'):
                return Response({'total_count': len(default_jobs if jobs is None else jobs), 'jobs': default_jobs if jobs is None else jobs})
            if path.endswith('/artifacts/80/zip'):
                return Response(content=archive)
            raise AssertionError('Unexpected endpoint: ' + path)
        return GetOnlySession(get)

    def recover(self, session=None, env=None):
        return recovery.recover_attempts(self.work, env=env or ENV, session=session or self.session())

    def test_authenticated_get_only_recovery_restores_only_attempt_journals(self):
        archive = evidence_zip(extra=[('release-plan.json', 'malicious replacement'), ('arbitrary.py', 'raise RuntimeError()')])
        session = self.session(archive)
        with patch.object(recovery.requests, 'Session', return_value=session):
            result = recovery.recover_attempts(self.work, env=ENV)
        self.assertEqual(session.headers['Authorization'], 'Bearer local-test-token')
        self.assertTrue(all(url.startswith('https://api.github.com/repos/owner/repository/') for url, _ in session.calls))
        self.assertEqual(result['status'], 'PASS')
        self.assertFalse(result['providerWrites'])
        self.assertEqual({item['journal'] for item in result['recovered']}, set(journals()))
        for name, value in journals().items():
            self.assertEqual(json.loads((self.work / name).read_text()), value)
        self.assertEqual(self.control.read_text(), 'frozen control; must not be restored from evidence')
        self.assertFalse((self.work / 'arbitrary.py').exists())

    def test_recovered_attempt_blocks_another_post_and_existing_journal_is_immutable(self):
        self.recover()
        path = self.work / 'kaggle-submission-attempt.json'
        before = path.read_bytes()
        with self.assertRaisesRegex(AssertionError, 'already attempted'):
            recovery.begin_attempt(path, {'replacement': True})
        self.assertEqual(path.read_bytes(), before)
        path.write_text(json.dumps({'different': True}))
        with self.assertRaisesRegex(AssertionError, 'changed between runs'):
            self.recover()

    def test_pending_run_and_unknown_executed_step_fail_closed(self):
        for status in ['queued', 'in_progress', 'waiting']:
            with self.subTest(status=status), self.assertRaisesRegex(AssertionError, 'still pending'):
                self.recover(self.session(run={'status': status}, missing=True))
        for conclusion in [None, 'success', 'failure', 'cancelled']:
            steps = [{'steps': [{'name': 'Execute validated release operation', 'conclusion': conclusion}]}]
            with self.subTest(conclusion=conclusion), self.assertRaisesRegex(AssertionError, 'no recoverable evidence'):
                self.recover(self.session(missing=True, jobs=steps))

    def test_missing_or_expired_executed_evidence_blocks_a_fresh_attempt(self):
        for session in [self.session(missing=True), self.session(artifact={'expired': True})]:
            with self.assertRaisesRegex(AssertionError, 'no recoverable evidence'):
                self.recover(session)
        self.assertFalse(any((self.work / name).exists() for name in journals()))

    def test_prior_validation_failure_without_an_executed_operation_is_safe(self):
        result = self.recover(self.session(missing=True, jobs=[{'steps': [{'name': 'Execute validated release operation', 'conclusion': 'skipped'}]}]))
        self.assertEqual(result['checked'], [{'runId': 90, 'operationExecuted': False}])
        self.assertEqual(result['recovered'], [])

    def test_context_source_plan_frozen_run_and_attempt_must_match(self):
        for key, value in [('schemaVersion', 2), ('runId', 89), ('runAttempt', 2), ('sourceCommit', 'b' * 40),
                           ('approvedReleasePlanSHA256', 'b' * 64), ('frozenManifestSHA256', 'b' * 64)]:
            marker = context(); marker[key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.recover(self.session(evidence_zip(marker=marker)))
        with self.assertRaises(AssertionError):
            self.recover(env={**ENV, 'GITHUB_RUN_ATTEMPT': '2'})
        with self.assertRaises(AssertionError):
            self.recover(env={**ENV, 'GITHUB_SHA': 'b' * 40})

    def test_a_read_only_context_cannot_smuggle_mutation_journals(self):
        with self.assertRaisesRegex(AssertionError, 'read-only'):
            self.recover(self.session(evidence_zip(marker=context('verify-runtime'))))
        with self.assertRaisesRegex(AssertionError, 'context is unavailable'):
            self.recover(self.session(evidence_zip(marker=False)))

    def test_actions_sources_versions_records_and_site_bytes_must_match(self):
        changes = [('kaggle-submission-attempt.json', 'action', 'other'),
                   ('kaggle-submission-attempt.json', 'sourceCommit', 'b' * 40),
                   ('kaggle-submission-attempt.json', 'version', 34),
                   ('notebook-submission-attempt.json', 'version', 17),
                   ('zenodo-publish-attempt.json', 'record', 987654320),
                   ('site-deployment-attempt.json', 'frozenManifestSHA256', 'b' * 64)]
        for name, key, value in changes:
            attempts = {name: copy.deepcopy(journals()[name])}; attempts[name][key] = value
            with self.subTest(name=name, key=key), self.assertRaises(AssertionError):
                self.recover(self.session(evidence_zip(attempts=attempts)))

    def test_unsafe_duplicate_and_symbolic_zip_members_are_rejected(self):
        symbolic = zipfile.ZipInfo('link.json'); symbolic.external_attr = (stat.S_IFLNK | 0o777) << 16
        variants = [[('../escape.json', '{}')], [('/absolute.json', '{}')],
                    [('duplicate.txt', 'a'), ('duplicate.txt', 'b')],
                    [('nested/kaggle-submission-attempt.json', '{}')], [(symbolic, 'target')]]
        for extra in variants:
            with self.subTest(extra=str(extra)[:100]), self.assertRaises(AssertionError):
                self.recover(self.session(evidence_zip(extra=extra)))

    def test_archive_and_selected_control_bounds_are_checked_before_decompression(self):
        with patch.object(recovery, 'MAX_EVIDENCE_BYTES', 128):
            with self.assertRaisesRegex(AssertionError, 'size bound'):
                self.recover(self.session(b'', artifact={'size_in_bytes': 129}))
            with self.assertRaisesRegex(AssertionError, 'size bound'):
                self.recover(self.session(b'x' * 129, artifact={'size_in_bytes': 64}))
        oversized = evidence_zip(attempts={}, extra=[('kaggle-submission-attempt.json', ' ' * (1024 * 1024 + 1))])
        with self.assertRaisesRegex(AssertionError, 'control exceeds'):
            self.recover(self.session(oversized))
        many = evidence_zip(attempts={}, extra=[('ignored/' + str(i), '') for i in range(2000)])
        with self.assertRaisesRegex(AssertionError, 'too many entries'):
            self.recover(self.session(many))

    def test_ignored_members_are_not_decompressed_or_restored(self):
        archive = evidence_zip(extra=[('ignored-log.json', 'x' * (1024 * 1024 + 1))])
        read = zipfile.ZipFile.read
        def selected_only(zipped, name, *args, **kwargs):
            filename = name.filename if isinstance(name, zipfile.ZipInfo) else name
            self.assertNotEqual(filename, 'ignored-log.json')
            return read(zipped, name, *args, **kwargs)
        with patch.object(zipfile.ZipFile, 'read', selected_only):
            self.assertEqual(self.recover(self.session(archive))['status'], 'PASS')
        self.assertFalse((self.work / 'ignored-log.json').exists())


class CandidateRestoreTests(BaseTests):
    def archive(self, marker=None, members=()):
        path = self.parent / 'candidate.tar.gz'
        with tarfile.open(path, 'w:gz') as packed:
            root = tarfile.TarInfo('coordinated-release'); root.type = tarfile.DIRTYPE; root.mode = 0o755
            packed.addfile(root)
            for name, value in [('release-workflow-context.json', json.dumps(marker or context('preflight', 80)).encode()),
                                ('frozen-sha256.json', FROZEN)]:
                info = tarfile.TarInfo('coordinated-release/' + name); info.size = len(value); info.mode = 0o600
                packed.addfile(info, io.BytesIO(value))
            for info, value in members:
                packed.addfile(info, io.BytesIO(value) if info.isfile() else None)
        return path

    def session(self, *, run=None, artifact=None):
        producer = {'id': 80, 'head_sha': SOURCE, 'event': 'workflow_dispatch', 'status': 'completed',
                    'conclusion': 'success', 'path': '.github/workflows/coordinated-doi-release.yml', 'run_attempt': 1}
        producer.update(run or {})
        item = {'id': 70, 'name': 'frozen-coordinated-candidate', 'expired': False}
        item.update(artifact or {})
        def get(path, kwargs):
            if path.endswith('/runs/80'): return Response(producer)
            if path.endswith('/runs/80/artifacts'): return Response({'total_count': 1, 'artifacts': [item]})
            raise AssertionError('Unexpected endpoint: ' + path)
        return GetOnlySession(get)

    def restore(self, archive=None, session=None):
        return recovery.restore_candidate(self.work, archive or self.archive(),
                                          env={**ENV, 'CANDIDATE_RUN': '80'}, session=session or self.session())

    def test_only_successful_exact_workflow_source_and_plan_can_restore(self):
        session = self.session()
        result = self.restore(session=session)
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual((self.work / 'frozen-sha256.json').read_bytes(), FROZEN)
        self.assertEqual(result['artifactId'], 70)
        self.assertEqual(len(session.calls), 2)
        with self.assertRaisesRegex(AssertionError, 'fresh candidate'):
            self.restore()

    def test_wrong_source_workflow_event_status_and_expired_producer_fail_before_extraction(self):
        for key, value in [('head_sha', 'b' * 40), ('path', '.github/workflows/other.yml'),
                           ('event', 'push'), ('status', 'in_progress'), ('conclusion', 'failure')]:
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.restore(session=self.session(run={key: value}))
            self.assertFalse(self.work.exists())
        with self.assertRaisesRegex(AssertionError, 'unavailable'):
            self.restore(session=self.session(artifact={'expired': True}))
        self.assertFalse(self.work.exists())

    def test_a_dangling_candidate_root_symlink_is_not_a_fresh_directory(self):
        outside = self.parent / 'unexpected-destination'
        self.work.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(AssertionError, 'fresh candidate'):
            self.restore()
        self.assertFalse(outside.exists())

    def test_context_must_bind_candidate_run_attempt_source_plan_and_preflight(self):
        for key, value in [('schemaVersion', 2), ('operation', 'publish-frozen'), ('runId', 79),
                           ('runAttempt', 2), ('sourceCommit', 'b' * 40), ('approvedReleasePlanSHA256', 'b' * 64)]:
            marker = context('preflight', 80); marker[key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.restore(archive=self.archive(marker=marker))
            self.assertFalse(self.work.exists())

    def test_every_tar_header_is_checked_before_any_file_is_written(self):
        variants = [('../escape', tarfile.REGTYPE, 0o600), ('/absolute', tarfile.REGTYPE, 0o600),
                    ('another-root/escape', tarfile.REGTYPE, 0o600),
                    ('coordinated-release/link', tarfile.SYMTYPE, 0o777),
                    ('coordinated-release/hard', tarfile.LNKTYPE, 0o600),
                    ('coordinated-release/device', tarfile.CHRTYPE, 0o600),
                    ('coordinated-release/setuid', tarfile.REGTYPE, 0o4755),
                    ('coordinated-release/frozen-sha256.json', tarfile.REGTYPE, 0o600),
                    ('coordinated-release/./frozen-sha256.json', tarfile.REGTYPE, 0o600),
                    ('coordinated-release//frozen-sha256.json', tarfile.REGTYPE, 0o600)]
        for name, kind, mode in variants:
            member = tarfile.TarInfo(name); member.type = kind; member.mode = mode; member.linkname = '/tmp/untrusted'
            member.size = 1 if kind == tarfile.REGTYPE else 0
            with self.subTest(name=name), self.assertRaises(AssertionError):
                self.restore(archive=self.archive(members=[(member, b'x')]))
            self.assertFalse(self.work.exists(), 'Even earlier valid members must remain unextracted')

    def test_unpacked_candidate_size_bound_blocks_extraction(self):
        member = tarfile.TarInfo('coordinated-release/huge'); member.size = 4 * 1024 ** 3 + 1
        packed = Mock(); packed.getmembers.return_value = [member]
        manager = Mock(); manager.__enter__ = Mock(return_value=packed); manager.__exit__ = Mock(return_value=False)
        with patch.object(recovery.tarfile, 'open', return_value=manager), self.assertRaisesRegex(AssertionError, 'size bound'):
            self.restore()
        packed.extractall.assert_not_called()
        self.assertFalse(self.work.exists())


class AttemptPersistenceTests(BaseTests):
    def test_attempt_is_persisted_exclusively_before_another_call_can_start(self):
        path = self.parent / 'new-attempt.json'
        value = {'sourceCommit': SOURCE, 'action': 'create-dataset-version', 'version': 35}
        recovery.begin_attempt(path, value)
        self.assertEqual(json.loads(path.read_text()), value)
        with self.assertRaisesRegex(AssertionError, 'already attempted'):
            recovery.begin_attempt(path, {'changed': True})
        self.assertEqual(json.loads(path.read_text()), value)

    def test_existing_symbolic_attempt_cannot_overwrite_another_file(self):
        target = self.parent / 'frozen-control.json'; target.write_text('protected')
        path = self.parent / 'attempt.json'; path.symlink_to(target)
        with self.assertRaises(AssertionError): recovery.begin_attempt(path, {'changed': True})
        self.assertEqual(target.read_text(), 'protected')


if __name__ == '__main__':
    unittest.main()
