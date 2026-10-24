import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.github/scripts'))
import schema_distribution_correction as correction


class Response:
    def __init__(self, status=200, body=b'{}', content_type='application/json'):
        self.status_code, self.content = status, body
        self.headers = {'Content-Type': content_type}
        self.text = body.decode(errors='replace')

    def json(self):
        return json.loads(self.content)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError('Unexpected unhandled status')

    def close(self):
        pass


def zipped(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        for name, body in files.items():
            archive.writestr(name, body)
    return output.getvalue()


class CorrectionTests(unittest.TestCase):
    def plan(self):
        return {'candidateSchema': 'same-doi-delivery-correction-1', 'sourceCommit': correction.SOURCE,
                'originalArchiveSourceCommit': correction.ORIGINAL, 'hfParent': correction.PARENT,
                'hfRevision': 'b' * 40, 'kagglePreviousVersion': 31, 'kaggleVersion': 32,
                'notebookPreviousVersion': 15, 'notebookVersion': 16,
                'doi': correction.DOI, 'record': 23474664, 'websiteWrites': False, 'newDoi': False}

    def test_resume_rejects_foreign_dataset_before_any_mutation(self):
        with self.assertRaisesRegex(AssertionError, 'another HF cohort'):
            correction.guard_resume_identity(self.plan(), {'hfRevision': correction.PARENT, 'notebookVersion': 15}, {'version': 32})

    def test_resume_rejects_notebook_without_its_frozen_dataset(self):
        with self.assertRaisesRegex(AssertionError, 'no target dataset'):
            correction.guard_resume_identity(self.plan(), {'hfRevision': 'b' * 40, 'notebookVersion': 16}, {'version': 31})

    def test_reviewed_plan_cannot_enable_new_doi_or_website_write(self):
        for field in ['websiteWrites', 'newDoi']:
            plan = self.plan()
            plan[field] = True
            with self.assertRaises(AssertionError):
                correction.expected_plan(plan)

    def test_access_restrictions_are_never_retried(self):
        for status in [401, 403, 429]:
            calls = []
            def callback():
                calls.append(status)
                return correction.checked(Response(status))
            with tempfile.TemporaryDirectory() as work, patch.object(correction.time, 'sleep') as sleep:
                with self.assertRaises(correction.AccessStop):
                    correction.retry(Path(work), 'access', callback, attempts=3)
                self.assertEqual(calls, [status])
                sleep.assert_not_called()

    def test_challenge_response_is_not_treated_as_readiness(self):
        with self.assertRaises(correction.AccessStop):
            correction.checked(Response(200, b'<html>captcha verification</html>', 'text/html'))

    def test_only_gateway_failures_receive_a_bounded_read_retry(self):
        with patch.object(correction.requests, 'Session') as session, patch.object(correction.time, 'sleep'):
            session.return_value.__enter__.return_value.get.side_effect = [Response(502), Response(200)]
            self.assertEqual(correction.read('https://datasets-server.huggingface.co/rows').status_code, 200)
            self.assertEqual(session.return_value.__enter__.return_value.get.call_count, 2)
        for status in [401, 403, 429]:
            with patch.object(correction.requests, 'Session') as session, patch.object(correction.time, 'sleep') as sleep:
                session.return_value.__enter__.return_value.get.return_value = Response(status)
                with self.assertRaises(correction.AccessStop):
                    correction.read('https://datasets-server.huggingface.co/rows')
                self.assertEqual(session.return_value.__enter__.return_value.get.call_count, 1)
                sleep.assert_not_called()

    def test_pending_is_caught_by_existing_notebook_retry_but_access_is_not(self):
        with tempfile.TemporaryDirectory() as work, patch.object(correction.gates.time, 'sleep'):
            calls = []
            def readiness():
                calls.append(1)
                if len(calls) == 1:
                    raise correction.Pending('Temporary output readiness')
                return {'status': 'PASS'}
            self.assertEqual(correction.gates.retry(Path(work), 'notebook', readiness, attempts=2), {'status': 'PASS'})
            self.assertEqual(len(calls), 2)
            with self.assertRaises(correction.AccessStop):
                correction.gates.retry(Path(work), 'access', lambda: (_ for _ in ()).throw(correction.AccessStop()), attempts=2)

    def packages(self, work):
        previous = {'kaggle-manifest.json': json.dumps({'desired_kaggle_version': 31}).encode(), 'data.txt': b'original-data'}
        current = {'kaggle-manifest.json': json.dumps({'desired_kaggle_version': 32}).encode(), 'data.txt': b'original-data'}
        for directory, files in [('kaggle-before', previous), ('kaggle', current)]:
            root = work / directory
            root.mkdir()
            for name, body in files.items():
                (root / name).write_bytes(body)
        return previous, current

    def test_known_previous_default_is_reported_pending(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            previous, current = self.packages(work)
            def read(url):
                return Response(body=zipped(current if '?' in url else previous))
            with patch.object(correction, 'read', read):
                report = correction.public_kaggle_downloads(work, self.plan())
            self.assertFalse(report['allCurrent'])
            self.assertEqual(report['exact']['status'], 'CURRENT')
            self.assertEqual(report['default']['status'], 'PREVIOUS_DEFAULT_PENDING')

    def test_unknown_default_download_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            _, current = self.packages(work)
            with patch.object(correction, 'read', lambda url: Response(body=zipped(current if '?' in url else {'foreign.txt': b'unknown'}))):
                with self.assertRaisesRegex(AssertionError, 'Unknown'):
                    correction.public_kaggle_downloads(work, self.plan())

    def test_wrong_exact_version_is_never_accepted_as_pending(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            previous, _ = self.packages(work)
            with patch.object(correction, 'read', lambda url: Response(body=zipped(previous))):
                with self.assertRaisesRegex(AssertionError, 'Unknown'):
                    correction.public_kaggle_downloads(work, self.plan())

    def test_public_landing_sources_must_match_the_reviewed_cohort(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            (work / 'kaggle').mkdir()
            expected = {'description': 'Corrected same DOI package', 'subtitle': 'Scientific data', 'userSpecifiedSources': 'HF reviewed pin'}
            (work / 'kaggle/dataset-metadata.json').write_text(json.dumps(expected))
            wrong = {**expected, 'userSpecifiedSources': 'foreign revision'}
            with patch.object(correction, 'public_post', lambda *a, **k: Response(body=json.dumps(wrong).encode())):
                with self.assertRaisesRegex(AssertionError, 'userSpecifiedSources'):
                    correction.public_kaggle_metadata(work)

    def test_public_execution_cannot_accept_cached_previous_version_results(self):
        import hashlib
        plan = self.plan()
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            (work / 'notebook').mkdir()
            (work / 'kaggle').mkdir()
            notebook = {'cells': [{'cell_type': 'code', 'source': ['assert True\n'], 'metadata': {}, 'outputs': [], 'execution_count': None}]}
            (work / 'notebook/starter.ipynb').write_text(json.dumps(notebook))
            (work / 'release-plan.json').write_text(json.dumps(plan))
            (work / 'kaggle/checksums.sha256').write_bytes(b'exact-reviewed-inputs\n')
            public = {'metadata': {'currentVersionNumber': 16}, 'blob': {'source': json.dumps(notebook)}}
            execution = {'status': 'PASS', 'kaggle_version': 32, 'upstream_revision': plan['hfRevision'],
                         'source_commit': plan['sourceCommit'], 'input_checksums_sha256': hashlib.sha256(b'exact-reviewed-inputs\n').hexdigest(),
                         'exact_doi': correction.DOI}
            with patch.object(correction, 'read', lambda url: Response(body=json.dumps(public).encode())):
                for field, wrong in [('kaggle_version', 31), ('upstream_revision', correction.PARENT), ('source_commit', correction.ORIGINAL), ('input_checksums_sha256', '0' * 64)]:
                    stale = {**execution, field: wrong}
                    with patch.object(correction, 'public_post', lambda *a, value=stale, **k: Response(body=json.dumps(value).encode())):
                        with self.assertRaises(AssertionError):
                            correction.public_notebook_execution(work, plan)
                with patch.object(correction, 'public_post', lambda *a, **k: Response(body=json.dumps(execution).encode())):
                    self.assertTrue(correction.public_notebook_execution(work, plan)['publicSourceAndExecutionVerified'])

    def test_private_staging_does_not_claim_notebook_execution(self):
        plan = self.plan()
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            (work / 'notebook').mkdir()
            notebook = {'cells': []}
            (work / 'notebook/starter.ipynb').write_text(json.dumps(notebook))
            public = {'metadata': {'currentVersionNumber': 16}, 'blob': {'source': json.dumps(notebook)}}
            with patch.object(correction, 'provenance_and_heads', return_value={'kagglePublicDefault': 32}), \
                    patch.object(correction, 'read', return_value=Response(body=json.dumps(public).encode())), \
                    patch.object(correction, 'exact_kaggle', return_value={'filesSha256Matched': 48}), \
                    patch.object(correction, 'public_kaggle_metadata', return_value={'verified': True}), \
                    patch.object(correction, 'public_kaggle_downloads', return_value={'allCurrent': True}), \
                    patch.object(correction.gates, 'verify_hf', return_value={'verified': True}), \
                    patch.object(correction, 'public_notebook_execution', side_effect=AssertionError('Execution must not be claimed')):
                result = correction.verify_current_cohort(work, plan, stage_only=True)
                self.assertTrue(result['stageOnly'])
                self.assertFalse(result['notebookActualExecutionVerified'])
                self.assertFalse(result['hfCore']['checkedInThisPhase'])
                with self.assertRaisesRegex(AssertionError, 'must not be claimed'):
                    correction.verify_current_cohort(work, plan)


if __name__ == '__main__':
    unittest.main()
