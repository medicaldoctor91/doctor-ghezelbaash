"""Local bootstrap trust/recovery fixtures; no provider or Actions requests."""
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
import zipfile

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.github/scripts'))
import release_bootstrap as bootstrap

SOURCE = 'a' * 40
OLD_SOURCE = 'c' * 40
POLICY = {'concept': {'recordId': 11, 'doi': '10.5281/zenodo.11'},
          'currentArchive': {'recordId': 22, 'doi': '10.5281/zenodo.22'}}
ENV = {'GITHUB_SHA': SOURCE, 'REVIEWED_COMMIT': SOURCE, 'GITHUB_REPOSITORY': 'owner/repository',
       'GITHUB_WORKFLOW_REF': 'owner/repository/' + bootstrap.WORKFLOW + '@refs/tags/bootstrap-reviewed',
       'GITHUB_REF': 'refs/tags/bootstrap-reviewed', 'GITHUB_RUN_ID': '100', 'GITHUB_RUN_ATTEMPT': '1',
       'GITHUB_TOKEN': 'never-output-github-token', 'ZENODO_TOKEN': 'never-output-zenodo-token',
       'HF_TOKEN': 'never-output-hf-token', 'KAGGLE_API_TOKEN': 'never-output-kaggle-token',
       'CLOUDFLARE_API_TOKEN': 'never-output-cf-token', 'CLOUDFLARE_ACCOUNT_ID': bootstrap.ACCOUNT}


class Response:
    def __init__(self, value=None, content=b''):
        self.value = value; self.content = content
    def json(self):
        return self.value
    def raise_for_status(self):
        return None


class Zenodo:
    def __init__(self, draft=None, new_version_doi=True):
        self.draft = copy.deepcopy(draft); self.new_version_doi = new_version_doi
        self.latest_record = 22
        self.metadata = {'title': 'Reviewed parent', 'description': 'Exact reviewed description'}
        old_policy = copy.deepcopy(POLICY); old_policy['currentArchive']['sourceCommit'] = OLD_SOURCE
        self.controls = {'doi-policy.json': old_policy, 'release-provenance.json': {'sourceCommit': OLD_SOURCE},
                         'archive-provenance.json': {'sourceCommit': OLD_SOURCE}}
        self.bodies = {name: json.dumps(value).encode() for name, value in self.controls.items()}
        self.files = [{'key': name, 'checksum': 'md5:' + hashlib.md5(body).hexdigest()}
                      for name, body in self.bodies.items()]
        self.calls = []; self.posts = []

    def get(self, url, **kwargs):
        self.calls.append(url)
        if '/files/' in url:
            return Response(content=self.bodies[url.split('/files/')[1].split('/')[0]])
        if url.endswith('/records/22/versions/latest'):
            return Response({'id': self.latest_record, 'doi': '10.5281/zenodo.' + str(self.latest_record),
                             'conceptdoi': '10.5281/zenodo.11'})
        if url.endswith('/records/22'):
            return Response({'id': 22, 'doi': '10.5281/zenodo.22', 'conceptdoi': '10.5281/zenodo.11',
                             'metadata': copy.deepcopy(self.metadata), 'files': copy.deepcopy(self.files)})
        if url.endswith('/deposit/depositions/22'):
            return Response({'id': 22, 'conceptrecid': 11, 'submitted': True})
        if url.endswith('/deposit/depositions'):
            return Response([copy.deepcopy(self.draft)] if self.draft else [])
        raise AssertionError('Unexpected GET endpoint')

    def post(self, url, **kwargs):
        self.posts.append(url)
        if url.endswith('/records/22/versions'):
            self.draft = draft(with_doi=self.new_version_doi)
        elif url.endswith('/records/33/draft/pids/doi'):
            self.draft['doi'] = '10.5281/zenodo.33'
        else:
            raise AssertionError('Unexpected POST endpoint')
        return Response(copy.deepcopy(self.draft))


def draft(with_doi=True):
    value = {'id': 33, 'conceptrecid': 11, 'submitted': False,
             'metadata': {'title': 'Reviewed parent', 'description': 'Exact reviewed description'}}
    if with_doi:
        value['doi'] = '10.5281/zenodo.33'
    return value


class Reads:
    def __init__(self):
        self.calls = []
    def get(self, url, **kwargs):
        self.calls.append(url)
        if 'whoami-v2' in url:
            return Response({'name': 'doctor-ghezelbaash', 'auth': {'accessToken': {'role': 'write', 'displayName': 'never-store'}}})
        if 'huggingface.co/api/datasets/' in url:
            return Response({'sha': 'b' * 40})
        if '/datasets/view/' in url:
            return Response({'currentVersionNumber': 34})
        if '/kernels/pull/' in url:
            return Response({'metadata': {'currentVersionNumber': 17}})
        if 'api.cloudflare.com' in url:
            return Response({'success': True, 'result': {'name': 'doctor-ghezelbaash',
                 'deployment_configs': {'production': {'env_vars': {'SECRET': {'value': 'never-store-secret'}}}},
                 'source': {'config': {'production_branch': 'main', 'deployments_enabled': False,
                                      'production_deployments_enabled': False, 'preview_deployment_setting': 'none'}},
                 'canonical_deployment': {'id': '0d7582cc-ca2f-400c-b452-b363fb6823be',
                                          'deployment_trigger': {'metadata': {'commit_hash': OLD_SOURCE}}}}})
        if url.endswith('/release-provenance.json'):
            return Response({'sourceCommit': OLD_SOURCE})
        raise AssertionError('Unexpected GET endpoint')
    def post(self, *args, **kwargs):
        raise AssertionError('Audit must never POST')
    put = post
    delete = post


def kaggle():
    return types.SimpleNamespace(dataset_status=lambda *a, **k: json.dumps({'status': 'Ready', 'current_version_number': 34}),
                                 kernels_status=lambda *a: types.SimpleNamespace(status='complete'))


class FakeHistory:
    def __init__(self, prior=()):
        self.values = list(prior); self.checked = False
    def prior(self, marker):
        return self.values
    def current(self, intent):
        self.checked = True


class Fixtures(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(); self.addCleanup(self.folder.cleanup)
        self.work = Path(self.folder.name)
        self.patcher = patch.object(bootstrap, 'policy', return_value=copy.deepcopy(POLICY))
        self.patcher.start(); self.addCleanup(self.patcher.stop)
        self.env = ENV.copy(); self.zn = Zenodo(); self.reads = Reads()

    def audit(self, root=None, env=None):
        return bootstrap.audit(root or self.work, env or self.env,
                               clients={'zenodo': self.zn, 'hf': self.reads, 'cloudflare': self.reads,
                                        'public': self.reads}, kaggle=kaggle())

    def prepare(self, history=None):
        return bootstrap.prepare(self.work, self.env, history=history or FakeHistory(),
                                 auditor=self.audit, zenodo=self.zn)

    def reserve(self, history=None):
        return bootstrap.reserve(self.work, self.env, history=history or FakeHistory(), zenodo=self.zn)


class AuditTests(Fixtures):
    def test_get_only_audit_captures_real_published_policy_and_independent_baselines(self):
        result = self.audit(); bootstrap.require_baselines(result)
        self.assertTrue(result['allAuthenticatedReadsPassed'])
        self.assertFalse(result['providerWrites']); self.assertFalse(result['writePermissionProven'])
        archived = json.loads((self.work / 'previous-policy.json').read_text())
        self.assertEqual(archived['currentArchive']['sourceCommit'], OLD_SOURCE)
        self.assertEqual(result['providers']['zenodo']['previousPolicySHA256'], bootstrap.digest(archived))
        self.assertEqual(len(result['providers']['zenodo']['publicFileChecksums']), 3)
        text = ''.join(path.read_text() for path in self.work.glob('*.json'))
        self.assertNotIn('never-store', text)
        for key, value in ENV.items():
            if 'TOKEN' in key:
                self.assertNotIn(value, text)
        self.assertEqual(self.zn.posts, [])

    def test_missing_one_provider_does_not_suppress_other_outcomes(self):
        env = self.env.copy(); env.pop('ZENODO_TOKEN')
        result = self.audit(env=env)
        self.assertEqual(result['providers']['zenodo']['status'], 'MISSING_CREDENTIAL')
        self.assertTrue(result['providers']['hf']['authenticated'])
        self.assertFalse(result['allAuthenticatedReadsPassed'])

    def test_provider_errors_never_store_response_body_or_exception_text(self):
        with patch.object(self.zn, 'get', side_effect=RuntimeError('never-store-ZENODO_TOKEN-body')):
            result = self.audit()
        self.assertEqual(result['providers']['zenodo']['errorType'], 'RuntimeError')
        self.assertNotIn('never-store', (self.work / 'access-audit.json').read_text())

    def test_wrong_published_control_checksum_blocks_only_zenodo(self):
        self.zn.bodies['doi-policy.json'] += b' '
        result = self.audit()
        self.assertFalse(result['providers']['zenodo']['authenticated'])
        self.assertTrue(result['providers']['cloudflare']['authenticated'])

    def test_inconsistent_archive_provenance_is_rejected(self):
        self.zn.bodies['archive-provenance.json'] = json.dumps({'sourceCommit': 'd' * 40}).encode()
        self.zn.files[-1]['checksum'] = 'md5:' + hashlib.md5(self.zn.bodies['archive-provenance.json']).hexdigest()
        self.assertFalse(self.audit()['providers']['zenodo']['authenticated'])

    def test_distinct_documented_scientific_and_delivery_sources_are_preserved(self):
        delivery = 'd' * 40
        previous = self.zn.controls['doi-policy.json']
        previous['currentArchive'].update(originalScientificSourceCommit=OLD_SOURCE,
                                          deliverySourceCommit=delivery,
                                          sourceCommitReference='release-provenance.json#/originalScientificSourceCommit')
        for name in ('release-provenance.json', 'archive-provenance.json'):
            self.zn.controls[name].update(sourceCommit=delivery, deliverySourceCommit=delivery,
                                          originalScientificSourceCommit=OLD_SOURCE, doiPolicy=copy.deepcopy(previous))
        self.zn.bodies = {name: json.dumps(value).encode() for name, value in self.zn.controls.items()}
        self.zn.files = [{'key': name, 'checksum': 'md5:' + hashlib.md5(body).hexdigest()}
                         for name, body in self.zn.bodies.items()]
        result = self.audit()['providers']['zenodo']
        self.assertTrue(result['authenticated'])
        self.assertEqual(result['previousArchiveSourceCommit'], OLD_SOURCE)
        self.assertEqual(result['previousArchiveDeliverySourceCommit'], delivery)

    def test_public_owner_divergence_blocks_reservation(self):
        report = self.audit(); report['providers']['kaggle']['publicDefaultVersion'] = 33
        with self.assertRaisesRegex(AssertionError, 'divergent'):
            bootstrap.require_baselines(report)

    def test_automatic_deployment_and_site_mismatch_are_blocked(self):
        for key, value in [('deploymentsEnabled', True), ('productionDeploymentsEnabled', True),
                           ('previewDeploymentSetting', 'all'), ('deploymentSourceCommit', 'e' * 40)]:
            report = self.audit(); report['providers']['cloudflare'][key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError):
                bootstrap.require_baselines(report)


class ReservationTests(Fixtures):
    def test_real_doi_new_version_uses_one_post_after_authenticated_intent(self):
        intent = self.prepare(); self.assertEqual(intent['action'], 'new-version')
        history = FakeHistory(); result = self.reserve(history)
        self.assertTrue(history.checked); self.assertEqual(result['status'], 'RESERVED')
        self.assertEqual(len(self.zn.posts), 1)
        receipt = json.loads((self.work / 'reservation.json').read_text())
        self.assertEqual(receipt['reservedDoi'], '10.5281/zenodo.33')
        self.assertFalse(receipt['published'])

    def test_missing_doi_never_causes_second_post_in_one_run(self):
        self.zn.new_version_doi = False; self.prepare()
        result = self.reserve()
        self.assertEqual(result['status'], 'NEEDS_DOI_RESERVATION')
        self.assertEqual(len(self.zn.posts), 1)
        self.assertFalse((self.work / 'reservation.json').exists())

    def test_next_run_can_authorize_doi_after_unique_new_version_is_observed(self):
        self.zn.draft = draft(with_doi=False)
        history = FakeHistory([{'action': 'new-version', 'context': {'runId': 90}}])
        self.assertEqual(self.prepare(history)['action'], 'reserve-doi')
        self.assertEqual(self.reserve(history)['status'], 'RESERVED')
        self.assertEqual(self.zn.posts, ['https://zenodo.org/api/records/33/draft/pids/doi'])

    def test_unique_unchanged_real_draft_is_recovered_without_post(self):
        self.zn.draft = draft()
        self.assertEqual(self.prepare()['action'], 'recover-existing')
        self.assertFalse(self.reserve()['providerWrites'])
        self.assertEqual(self.zn.posts, [])

    def test_unresolved_new_version_without_owner_draft_cannot_post_again(self):
        history = FakeHistory([{'action': 'new-version', 'context': {'runId': 90}}])
        with self.assertRaisesRegex(AssertionError, 'new-version outcome remains unresolved'):
            self.prepare(history)
        self.assertEqual(self.zn.posts, [])

    def test_unresolved_doi_reservation_cannot_repeat_post(self):
        self.zn.draft = draft(with_doi=False)
        with self.assertRaisesRegex(AssertionError, 'DOI reservation remains unresolved'):
            self.prepare(FakeHistory([{'action': 'reserve-doi', 'context': {'runId': 90}}]))
        self.assertEqual(self.zn.posts, [])

    def test_changed_owner_draft_metadata_is_never_overwritten(self):
        self.zn.draft = draft(); self.zn.draft['metadata']['title'] = 'Independent draft'
        with self.assertRaisesRegex(AssertionError, 'baseline checks are incomplete'):
            self.prepare()
        self.assertEqual(self.zn.posts, [])

    def test_external_new_published_version_blocks_preparation_and_any_post(self):
        self.zn.latest_record = 44
        with self.assertRaisesRegex(AssertionError, 'baseline checks are incomplete'):
            self.prepare()
        self.assertEqual(self.zn.posts, [])

    def test_external_new_version_after_intent_blocks_before_any_post(self):
        self.prepare(); self.zn.latest_record = 44
        with self.assertRaisesRegex(AssertionError, 'newer or unrelated published archive'):
            self.reserve()
        self.assertEqual(self.zn.posts, [])

    def test_missing_current_durable_intent_blocks_before_post(self):
        self.prepare(); history = FakeHistory(); history.current = Mock(side_effect=AssertionError('No durable artifact'))
        with self.assertRaisesRegex(AssertionError, 'No durable artifact'):
            self.reserve(history)
        self.assertEqual(self.zn.posts, [])

    def test_changed_audit_blocks_before_post(self):
        self.prepare(); report = json.loads((self.work / 'access-audit.json').read_text())
        report['observedUTC'] = 'changed'; bootstrap.dump(self.work / 'access-audit.json', report)
        with self.assertRaisesRegex(AssertionError, 'audit changed'):
            self.reserve()
        self.assertEqual(self.zn.posts, [])

    def test_changed_parent_inventory_blocks_before_post(self):
        self.prepare(); self.zn.files[0]['checksum'] = 'md5:' + '0' * 32
        with self.assertRaisesRegex(AssertionError, 'baseline changed'):
            self.reserve()
        self.assertEqual(self.zn.posts, [])

    def test_same_local_attempt_cannot_be_repeated(self):
        self.prepare()
        bootstrap.dump(self.work / 'zenodo-bootstrap-attempt.json', {'action': 'new-version'})
        with self.assertRaisesRegex(AssertionError, 'POST already attempted'):
            self.reserve()
        self.assertEqual(self.zn.posts, [])

    def test_branch_and_workflow_rerun_cannot_reserve(self):
        for key, value in [('GITHUB_REF', 'refs/heads/development'), ('GITHUB_RUN_ATTEMPT', '2')]:
            self.env = ENV.copy(); self.env[key] = value
            with self.subTest(key=key), self.assertRaises(AssertionError):
                self.prepare()


def packed(intent=None, entries=()):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as archive:
        if intent is not None:
            archive.writestr('bootstrap-intent.json', json.dumps(intent))
        for name, body in entries:
            archive.writestr(name, body)
    return output.getvalue()


class HistoryTests(Fixtures):
    def fixture(self, marker=None, intent=None, run=None, absent=False, expired=False, executed=False):
        marker = marker or bootstrap.context(self.env)
        intent = intent or {'context': dict(marker, runId=90), 'action': 'new-version'}
        prior = {'id': 90, 'head_sha': SOURCE, 'event': 'workflow_dispatch', 'path': bootstrap.WORKFLOW,
                 'status': 'completed', 'run_attempt': 1}
        prior.update(run or {})
        blob = packed(intent)
        def read(url, **kwargs):
            if url.endswith('/runs'):
                return Response({'workflow_runs': [prior]})
            if url.endswith('/runs/90/artifacts'):
                items = [] if absent else [{'id': 80, 'name': bootstrap.INTENT_ARTIFACT,
                                             'expired': expired, 'size_in_bytes': len(blob)}]
                return Response({'total_count': len(items), 'artifacts': items})
            if url.endswith('/runs/90/jobs'):
                steps = [{'name': bootstrap.STEP, 'conclusion': 'success'}] if executed else []
                return Response({'total_count': 1, 'jobs': [{'steps': steps}]})
            if url.endswith('/artifacts/80/zip'):
                return Response(content=blob)
            raise AssertionError('Unexpected GitHub GET')
        client = Mock(); client.get.side_effect = read
        client.post.side_effect = AssertionError('History must never POST')
        return bootstrap.History(self.env, client), marker

    def test_authenticated_history_scans_all_sources_and_recovers_matching_intent(self):
        history, marker = self.fixture()
        values = history.prior(marker)
        self.assertEqual(values[0]['context']['runId'], 90)
        self.assertNotIn('head_sha', history.client.get.call_args_list[0].kwargs['params'])
        history.client.post.assert_not_called()

    def test_executed_reservation_without_intent_blocks(self):
        history, marker = self.fixture(absent=True, executed=True)
        with self.assertRaisesRegex(AssertionError, 'no durable intent'):
            history.prior(marker)

    def test_old_read_only_media_run_without_intent_is_ignored(self):
        history, marker = self.fixture(absent=True)
        self.assertEqual(history.prior(marker), [])

    def test_changed_source_tool_policy_and_expired_artifact_fail_closed(self):
        marker = bootstrap.context(self.env)
        for key, value in [('sourceCommit', 'b' * 40), ('toolSHA256', '0' * 64),
                           ('canonicalPolicySHA256', '0' * 64)]:
            old = dict(marker, runId=90); old[key] = value
            history, _ = self.fixture(intent={'context': old, 'action': 'new-version'},
                                      run={'head_sha': old['sourceCommit']})
            with self.subTest(key=key), self.assertRaisesRegex(AssertionError, 'another reviewed bootstrap'):
                history.prior(marker)
        history, marker = self.fixture(expired=True)
        with self.assertRaisesRegex(AssertionError, 'unavailable'):
            history.prior(marker)

    def test_active_prior_run_blocks_reservation(self):
        history, marker = self.fixture(run={'status': 'in_progress'})
        with self.assertRaisesRegex(AssertionError, 'still active'):
            history.prior(marker)

    def test_traversal_duplicate_and_oversized_artifact_are_rejected(self):
        for blob in [packed(entries=[('../bootstrap-intent.json', '{}')]),
                     packed(entries=[('a/bootstrap-intent.json', '{}'), ('b/bootstrap-intent.json', '{}')]),
                     b'0' * (bootstrap.MAX_ARTIFACT + 1)]:
            with self.subTest(size=len(blob)), self.assertRaises(AssertionError):
                bootstrap.archive_controls(blob)


if __name__ == '__main__':
    unittest.main()
