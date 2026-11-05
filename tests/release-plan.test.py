"""Offline migration fixtures: no DOI reservation or provider writes are possible."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.github/scripts'))
import release_plan as release

OLD_SOURCE = 'ed767f6e6726e1453196e2ec2b312fcad00677e2'


def fixture():
    # Synthetic IDs belong only to this fixture; no actual policy is rewritten.
    previous = json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())
    previous['currentArchive']['sourceCommit'] = OLD_SOURCE
    policy = copy.deepcopy(previous)
    old = copy.deepcopy(previous['currentArchive']); old['role'] = 'historical'
    policy['historical'].append(old)
    archive = policy['currentArchive']
    archive.update(recordId=90000001, doi='10.5281/zenodo.90000001',
                   url='https://doi.org/10.5281/zenodo.90000001',
                   packagingVersion=previous['currentArchive']['packagingVersion']+'.fixture-next', contentBaseline='1.3.5',
                   edition='2026-11-03', inputBaselineHfRevision='c' * 40)
    archive.pop('sourceCommit')
    policy['downloadBindings'] = {
        'recordId': 90000001, 'publicPrefix': 'https://zenodo.org/records/90000001/files/',
        'apiPrefix': 'https://zenodo.org/api/records/90000001/files/',
        'bundle': 'https://zenodo.org/records/90000001/files/fixture.zip', 'role': 'download_binding',
    }
    policy['coordinatedRelease'].update(
        hfParent='c' * 40, websiteBaselineCommit='d' * 40,
        previousZenodoRecord=previous['currentArchive']['recordId'],
        kaggleBaselineVersion=34, kaggleTargetVersion=35,
        notebookBaselineVersion=17, notebookTargetVersion=18,
        expectedGraphNodes=1601, expectedGraphTriples=22250)
    return {
        'schemaVersion': 1, 'context': 'new-reserved', 'policy': policy,
        'previousPolicy': previous, 'previousPolicySHA256': release.canonical_sha(previous),
        'previousArchiveSourceCommit': OLD_SOURCE,
        'previousArchiveInventorySHA256': release.canonical_sha({'fixture.zip': 'md5:' + '0' * 32}),
        'reservation': {'published': False, 'previousRecord': previous['currentArchive']['recordId'],
                        'reservedRecord': 90000001, 'reservedDoi': archive['doi'],
                        'conceptDoi': policy['concept']['doi']},
        'refs': {'applicationCheckpoint': 'a' * 40, 'buildSource': 'b' * 40,
                 'publicationToolCommit': 'b' * 40, 'reviewedRef': 'refs/tags/fixture-reviewed-M',
                 'toolInventory': {'.github/scripts/example.py': 'e' * 64}},
        'approvedPublicationScope': ['website', 'hf', 'kaggle', 'notebook', 'zenodo_dataset'],
        'identity': {'personIri': 'https://www.ghezelbaash.ir/#saeed-ghezelbash',
                     'clinicIri': 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
                     'datasetIri': policy['canonicalDatasetIri']},
        'positioningCorpusRelease': '1.3.4', 'reviewedTables': {'market_positioning': 60},
        'requireHfSearchFilter': True, 'publicationDate': '2026-11-03',
        'maintenanceDate': '2026-11-03', 'contentEdition': '2026-11-03',
        'hfCommitTimestamp': '2026-11-03T14:00:00Z',
        'expectedPrimaryRoutes': 72, 'expectedSourceFiles': 190,
        'websitePreviousDeploymentId': '0d7582cc-ca2f-400c-b452-b363fb6823be',
        'backupManifestSHA256': 'f' * 64,
    }


class ReleasePlanTests(unittest.TestCase):
    def test_new_edition_keeps_previous_identity_and_frozen_corpus(self):
        plan = release.validate_plan(fixture())
        self.assertEqual(plan['policy']['currentArchive']['contentBaseline'], '1.3.5')
        self.assertEqual(plan['positioningCorpusRelease'], '1.3.4')
        self.assertEqual(plan['previousPolicy']['currentArchive']['sourceCommit'], OLD_SOURCE)

    def test_future_archive_label_cannot_mask_an_unbound_dataset_version(self):
        plan=fixture();policy=plan['policy']
        graph={'@graph':[{'@id':policy['canonicalDatasetIri'],'@type':'Dataset','version':'1.3.4'}]}
        with self.assertRaisesRegex(AssertionError,'content baseline'):
            release.validate_dataset_baseline(graph,policy)
        graph['@graph'][0]['version']='1.3.5'
        self.assertEqual(release.validate_dataset_baseline(graph,policy),'1.3.5')

    def test_wrong_record_concept_history_version_and_runtime_fail_closed(self):
        changes = [
            lambda p: p['reservation'].update(reservedRecord=23474664),
            lambda p: p['policy']['concept'].update(recordId=123),
            lambda p: p['policy']['downloadBindings'].update(recordId=23474664),
            lambda p: p.update(previousPolicySHA256='0' * 64),
            lambda p: p['policy']['historical'].pop(),
            lambda p: p['policy']['historical'][0].update(version='changed'),
            lambda p: p['policy']['coordinatedRelease'].update(previousZenodoRecord=23473947),
            lambda p: p['policy']['coordinatedRelease'].update(kaggleTargetVersion=37),
            lambda p: p.update(positioningCorpusRelease='1.3.5'),
            lambda p: p.update(requireHfSearchFilter=False),
            lambda p: p['policy']['currentArchive'].update(sourceCommitMode='fixed'),
            lambda p: p['policy']['currentArchive'].pop('sourceCommitMode'),
            lambda p: p['policy']['currentArchive'].update(sourceCommit=OLD_SOURCE),
        ]
        for change in changes:
            plan = fixture(); change(plan)
            with self.subTest(change=change), self.assertRaises((AssertionError, KeyError)):
                release.validate_plan(plan)

    def test_three_source_contexts_and_old_pin_rejection(self):
        plan = fixture(); policy = plan['policy']; source = plan['refs']['buildSource']
        env = {'PREPARE_RESERVED_DOI': str(policy['currentArchive']['recordId']), 'GITHUB_SHA': source}
        self.assertEqual(release.resolve_policy(policy, env, source, plan)['currentArchive']['sourceCommit'], source)
        for changed_env, head in [({**env, 'ARCHIVE_SOURCE_COMMIT': OLD_SOURCE}, source),
                                  ({**env, 'GITHUB_SHA': 'f' * 40}, source),
                                  (env, 'f' * 40), ({**env, 'PREPARE_RESERVED_DOI': '23474664'}, source)]:
            with self.assertRaises(AssertionError): release.resolve_policy(policy, changed_env, head, plan)
        plan['context'] = 'published-maintenance'
        self.assertEqual(release.resolve_policy(policy, {'ARCHIVE_SOURCE_COMMIT': source}, 'f' * 40, plan)['currentArchive']['sourceCommit'], source)
        with self.assertRaises(AssertionError): release.resolve_policy(policy, {'ARCHIVE_SOURCE_COMMIT': OLD_SOURCE}, source, plan)
        old = release.resolve_policy(plan['previousPolicy'], {'ARCHIVE_SOURCE_COMMIT': OLD_SOURCE}, 'f' * 40)
        self.assertEqual(old['currentArchive']['sourceCommit'], OLD_SOURCE)

    def test_python_and_javascript_source_context_parity(self):
        script = "import {resolveDoiPolicy} from './src/lib/doi-policy.mjs'; console.log(JSON.stringify(resolveDoiPolicy(JSON.parse(process.argv[3]),JSON.parse(process.argv[1]),()=>process.argv[2])));"
        plan = fixture(); source = plan['refs']['buildSource']
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'approved.json'
            def js(env, expected_success=True, template=None):
                path.write_text(json.dumps(plan, ensure_ascii=False))
                result = subprocess.run(['node', '--input-type=module', '-e', script,
                                         json.dumps({**env, 'RELEASE_PLAN_PATH': str(path)}), source,
                                         json.dumps(plan['policy'] if template is None else template)],
                                        cwd=ROOT, text=True, capture_output=True,
                                        env={**os.environ, 'RELEASE_PLAN_PATH': '', 'ARCHIVE_SOURCE_COMMIT': OLD_SOURCE})
                self.assertEqual(result.returncode == 0, expected_success, result.stderr)
                return json.loads(result.stdout) if expected_success else None
            env = {'PREPARE_RESERVED_DOI': '90000001', 'GITHUB_SHA': source}
            self.assertEqual(js(env), release.resolve_policy(plan['policy'], env, source, plan))
            js(env, False, plan['previousPolicy'])
            js({**env, 'ARCHIVE_SOURCE_COMMIT': OLD_SOURCE}, False)
            for mode in (None, 'fixed'):
                plan['policy']['currentArchive']['sourceCommitMode'] = mode
                js(env, False)
            plan = fixture(); plan['context'] = 'published-maintenance'
            self.assertEqual(js({'ARCHIVE_SOURCE_COMMIT': source}), release.resolve_policy(plan['policy'], {'ARCHIVE_SOURCE_COMMIT': source}, source, plan))

    def test_invalid_explicit_plan_cannot_bypass_the_python_source_resolver(self):
        for mode in (None, 'fixed'):
            plan=fixture();plan['policy']['currentArchive']['sourceCommitMode']=mode
            with self.assertRaises(AssertionError):
                release.resolve_policy(plan['policy'], {}, 'b'*40, plan)
        plan=fixture()
        with self.assertRaisesRegex(AssertionError,'differs from the approved'):
            release.resolve_policy(plan['previousPolicy'], {}, 'b'*40, plan)

    def test_effective_policy_requires_canonical_binding_before_checkpoint(self):
        plan=fixture()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);target=root/'src/canonical/doi-policy.json';target.parent.mkdir(parents=True)
            target.write_text(json.dumps(plan['previousPolicy']))
            with patch.object(release,'ROOT',root),patch.object(release,'load_plan',return_value=plan):
                with self.assertRaises(AssertionError):release.policy_template()
                target.write_text(json.dumps(plan['policy']))
                self.assertEqual(release.policy_template(),plan['policy'])
                stale=copy.deepcopy(plan['policy']);stale['downloadBindings']['recordId']=23474664
                target.write_text(json.dumps(stale))
                with self.assertRaisesRegex(AssertionError,'differs from the canonical'):
                    release.policy_template()
                stale=copy.deepcopy(plan['policy']);stale['currentArchive']['sourceCommit']='b'*40
                target.write_text(json.dumps(stale))
                with self.assertRaisesRegex(AssertionError,'own future commit'):
                    release.policy_template()

    def test_workflow_separates_source_unit_fixtures_from_selected_final_build(self):
        import yaml
        workflow=yaml.load((ROOT/'.github/workflows/coordinated-doi-release.yml').read_text(),Loader=yaml.BaseLoader)
        steps=workflow['jobs']['coordinated']['steps']
        old=next(step for step in steps if step.get('name')=='Run source unit fixtures without the publication plan')['run']
        final=next(step for step in steps if step.get('name')=='Build and validate the selected reserved-edition candidate')['run']
        self.assertNotIn('npm run build',old)
        self.assertIn('tests/physician-page-output.test.mjs|tests/guide-search-manifest.test.mjs) ;;',old)
        for command in old.splitlines():
            if any(value in command for value in ('npm run build','node --test','python tests/')):
                self.assertIn('env -u RELEASE_PLAN_PATH ARCHIVE_SOURCE_COMMIT="$REVIEWED_COMMIT" PREPARE_RESERVED_DOI=',command)
        self.assertTrue(final.startswith('npm run build\n'))
        self.assertNotIn('ARCHIVE_SOURCE_COMMIT',final)
        self.assertNotIn('env -u RELEASE_PLAN_PATH',final)
        for file in ('physician-page-output.test.mjs','guide-search-manifest.test.mjs','reader-browser-regression.py','validate_machine_resources.py','validate_canonical_invariants.py'):
            self.assertIn(file,final)
        self.assertLess(steps.index(next(step for step in steps if step.get('name')=='Run source unit fixtures without the publication plan')),
                        steps.index(next(step for step in steps if step.get('name')=='Build and validate the selected reserved-edition candidate')))

    def test_reader_asset_cleanup_is_narrow(self):
        for name in ['assets/guide.abcdef123456.html', 'assets/guide.abcdef123456.json', 'assets/guide-meta.abcdef123456.json', 'assets/guide-search.abcdef123456.json', 'assets/reader.63584d2612aa.js', 'assets/reader.c860ea7c6a8f.js']:
            self.assertTrue(release.obsolete_reader_asset(name))
        for name in ['assets/guide-search.json', 'assets/guide-search.x.js', 'assets/other.x.json', '../assets/guide.x.html', 'assets/guide-search.x/extra.json', 'assets/guide-search.important.json', 'assets/guide-search.abcdef123456.html', 'assets/reader.js', 'assets/reader.63584d2612aa.json', 'assets/reader.63584d2612a.js', 'assets/reader.63584d2612aaa.js', 'assets/reader.63584D2612AA.js', 'assets/reader.63584d2612aa.js.map', 'assets/reader.63584d2612aa.js/extra', 'assets/site.396fbb0b79dc.css', '../assets/reader.63584d2612aa.js', 'assets/../assets/reader.63584d2612aa.js', 'assets//reader.63584d2612aa.js', 'assets/reader.63584d2612aa.js\n']:
            self.assertFalse(release.obsolete_reader_asset(name))

    def test_published_hf_reader_inventory_can_be_replaced_without_extra_deletions(self):
        # Public HF parent ca61e0e2: both runtime revisions are tracked alongside
        # the guide and the stylesheet. Only absent generated assets are removed.
        previous = {
            'assets/guide-meta.14616fd6ac6d.json',
            'assets/guide.2c625772f14d.json',
            'assets/reader.63584d2612aa.js',
            'assets/reader.c860ea7c6a8f.js',
            'assets/site.396fbb0b79dc.css',
        }
        generated = {
            'assets/guide-meta.18f5165d54d0.json',
            'assets/guide-search.baebf5951362.json',
            'assets/guide.9ca37e298aaf.json',
            'assets/reader.103a36d6fb38.js',
            'assets/site.396fbb0b79dc.css',
        }
        removed = previous - generated
        self.assertEqual(len(removed), 4)
        self.assertTrue(all(release.obsolete_reader_asset(name) for name in removed))
        self.assertEqual(previous - removed, {'assets/site.396fbb0b79dc.css'})
        # The cleanup guard must still reject any undeclared non-reader file.
        self.assertFalse(all(release.obsolete_reader_asset(name)
                             for name in removed | {'assets/research-data.63584d2612aa.js'}))

    def test_resumed_candidate_binds_plan_controls_and_upload_bytes(self):
        plan=fixture()
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory);upload=work/'fixture.zip';upload.write_bytes(b'frozen candidate')
            payload={'sourceCommit':plan['refs']['buildSource'],'record':90000001,
                     'doi':plan['policy']['currentArchive']['doi'],
                     'upstreamParentChecksums':{'fixture.zip':'md5:'+'0'*32},
                     'files':{'fixture.zip':{'path':str(upload),'bytes':upload.stat().st_size,
                                           'sha256':hashlib.sha256(upload.read_bytes()).hexdigest(),
                                           'md5':hashlib.md5(upload.read_bytes()).hexdigest()}}}
            values={'approved-release-plan.json':plan,'release-plan.json':{
                'approvedReleasePlanSHA256':release.canonical_sha(plan),'sourceCommit':plan['refs']['buildSource']},
                'zenodo-metadata.json':{'version':'fixture'},'payload.json':payload}
            for name,value in values.items():(work/name).write_text(json.dumps(value))
            controls={name:hashlib.sha256((work/name).read_bytes()).hexdigest() for name in values}
            (work/'frozen-sha256.json').write_text(json.dumps({'controls':controls}))
            with patch.object(release,'load_plan',return_value=plan),patch.object(release,'validate_checkout'):
                release.validate_candidate_binding(work)
                plan['publicationDate']='2026-11-04'
                with self.assertRaises(AssertionError):release.validate_candidate_binding(work)
                plan['publicationDate']='2026-11-03'
                upload.write_bytes(b'changed candidate')
                with self.assertRaises(AssertionError):release.validate_candidate_binding(work)
                upload.write_bytes(b'frozen candidate')
                (work/'payload.json').write_text(json.dumps({**payload,'record':23474664}))
                with self.assertRaises(AssertionError):release.validate_candidate_binding(work)

    def test_ambiguous_reservation_post_is_never_repeated(self):
        import doi_release
        from unittest.mock import Mock
        previous=fixture()['previousPolicy']
        response=Mock();response.json.return_value={
            'id':previous['currentArchive']['recordId'],'conceptdoi':previous['concept']['doi'],
            'metadata':{'title':'fixture','description':'fixture'}}
        drafts=Mock();drafts.json.return_value=[]
        session=Mock();session.headers={};session.get.side_effect=[response,drafts,response,drafts]
        session.post.side_effect=doi_release.requests.Timeout('ambiguous reservation response')
        with tempfile.TemporaryDirectory() as directory,patch.object(doi_release,'policy',return_value=previous),patch.object(doi_release.requests,'Session',return_value=session),patch.dict(os.environ,{'ZENODO_TOKEN':'fixture'}):
            path=Path(directory)/'reservation.json'
            with self.assertRaises(doi_release.requests.Timeout):doi_release.reserve(previous['currentArchive']['recordId'],path)
            with self.assertRaisesRegex(AssertionError,'already attempted'):doi_release.reserve(previous['currentArchive']['recordId'],path)
            self.assertEqual(session.post.call_count,1)

    def test_runtime_verification_requires_real_search_filter_and_stays_read_only(self):
        import coordinated_doi_release as controller
        import mutable_platform_release as mutable
        import sync_platform_machine_resources as sync
        from unittest.mock import Mock
        plan=fixture();source=plan['refs']['buildSource']
        client=Mock();client.dataset_create_version.side_effect=AssertionError('verification cannot create a dataset version')
        client.kernels_push.side_effect=AssertionError('verification cannot push a notebook')
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            with patch.object(controller,'APPROVED',plan),patch.object(controller,'require_reviewable_candidate',return_value={'sourceCommit':source}), \
                 patch.object(controller,'check_frozen'),patch.object(controller,'verify_site',return_value={'site':True}), \
                 patch.object(controller,'verify_kaggle',return_value={'kaggle':True}),patch.object(controller,'verify_notebook',return_value={'notebook':True}), \
                 patch.object(sync,'kaggle_client',return_value=client),patch.object(mutable,'fresh_viewer_reads',side_effect=lambda work,get:get), \
                 patch.object(mutable,'verify_media',return_value={'media':True}),patch.object(controller,'verify_hf',return_value={'search':True,'filter':True}) as hf:
                report=controller.verify_public_runtime(work)
                hf.assert_called_once_with(work,runtime_features=True)
                self.assertEqual(report['status'],'PASS')
                self.assertIs(report['searchFilter'],True)
                self.assertEqual(report['approvedReleasePlanSHA256'],release.canonical_sha(plan))
                client.dataset_create_version.assert_not_called();client.kernels_push.assert_not_called()
                hf.side_effect=AssertionError('Viewer Search still pending')
                with self.assertRaisesRegex(AssertionError,'Search still pending'):
                    controller.verify_public_runtime(work)
                self.assertEqual(json.loads((work/'runtime-readiness.json').read_text())['status'],'PENDING')

    def test_immutable_publication_rejects_pending_or_wrong_cohort_runtime_before_http(self):
        import doi_release
        from unittest.mock import Mock
        plan=fixture()
        good={'status':'PASS','sourceCommit':plan['refs']['buildSource'],
              'approvedReleasePlanSHA256':release.canonical_sha(plan),'searchFilter':True}
        for key,value in [('status','PENDING'),('searchFilter',False),('sourceCommit','f'*40),('approvedReleasePlanSHA256','0'*64)]:
            with self.subTest(key=key),tempfile.TemporaryDirectory() as directory:
                work=Path(directory);(work/'runtime-readiness.json').write_text(json.dumps({**good,key:value}))
                session=Mock()
                with patch.object(release,'load_plan',return_value=plan),patch.object(doi_release.requests,'Session',session):
                    with self.assertRaises(AssertionError):doi_release.publish(plan['previousPolicy']['currentArchive']['recordId'],work)
                    session.assert_not_called()

    def test_ambiguous_notebook_push_is_recovered_by_reads_without_another_post(self):
        import coordinated_doi_release as controller
        from unittest.mock import Mock
        client=Mock();client.kernels_push.side_effect=TimeoutError('ambiguous notebook response')
        plan={'notebookPreviousVersion':17,'notebookVersion':18,'sourceCommit':'b'*40}
        observed=Mock();observed.json.return_value={'metadata':{'currentVersionNumber':17}}
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory);(work/'release-plan.json').write_text(json.dumps(plan))
            with patch.object(controller,'get',return_value=observed),patch.object(controller,'check_frozen'):
                with self.assertRaises(TimeoutError):controller.publish_notebook(work,client)
                with self.assertRaisesRegex(AssertionError,'already attempted'):controller.publish_notebook(work,client)
                self.assertEqual(client.kernels_push.call_count,1)
                observed.json.return_value={'metadata':{'currentVersionNumber':18}}
                with patch.object(controller,'verify_notebook',return_value={'version':18}):
                    self.assertEqual(controller.publish_notebook(work,client),{'version':18})
                self.assertEqual(client.kernels_push.call_count,1)

    def test_actual_application_checkpoint_and_management_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
            git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
            for name in ['.github/scripts/example.py', '.github/workflows/example.yml']:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('application fixture\n')
            git('add', '.'); git('commit', '-qm', 'application-only C'); checkpoint = git('rev-parse', 'HEAD')
            for name in release.MANAGEMENT:
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('management fixture\n')
            git('add', '.'); git('commit', '-qm', 'management M'); source = git('rev-parse', 'HEAD')
            git('tag', 'fixture-reviewed-M')
            plan = fixture(); plan['expectedSourceFiles'] = 2
            plan['refs'].update(applicationCheckpoint=checkpoint, buildSource=source, publicationToolCommit=source,
                                toolInventory={name: hashlib.sha256((root/name).read_bytes()).hexdigest()
                                               for name in git('ls-files').splitlines()
                                               if name.startswith(('.github/scripts/', '.github/workflows/'))})
            with patch.dict(os.environ, {'GITHUB_SHA': source}):
                self.assertEqual(release.validate_checkout(plan, root)['sourceCommit'], source)
                (root / '.github/scripts/example.py').write_text('changed\n')
                with self.assertRaises(AssertionError): release.validate_checkout(plan, root)
                git('checkout', '--', '.github/scripts/example.py')
                (root / '.github/scripts/untracked.py').write_text('unreviewed tool\n')
                with self.assertRaisesRegex(AssertionError,'untracked'):
                    release.validate_checkout(plan, root)
                (root / '.github/scripts/untracked.py').unlink()
                git('commit', '--allow-empty', '-qm', 'merge-like R')
                with self.assertRaisesRegex(AssertionError, 'HEAD'): release.validate_checkout(plan, root)


if __name__ == '__main__':
    unittest.main()
