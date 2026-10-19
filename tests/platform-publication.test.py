"""Exercise publication transport boundaries without contacting external accounts."""
import importlib.util
import os
import pathlib
import sys
import threading
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.github/scripts'))
import platform_publish as publication
import sync_platform_machine_resources as sync


class PublicationTransportTests(unittest.TestCase):
    def test_existing_verification_records_owner_state_before_public_drift_rejection(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            args = SimpleNamespace(root=root, website_run_url='reviewed-run', website_commit='a' * 40,
                                   hf_revision='b' * 40, kaggle_version=18)
            def metadata(dataset, target):
                pathlib.Path(target, 'dataset-metadata.json').write_text(json.dumps({
                    'description': 'published card', 'userSpecifiedSources': 'reviewed sources'}))
            with patch.object(sync, 'verify_website_run'), patch.object(sync, 'kaggle_client') as client, \
                    patch.object(sync, 'guard', side_effect=AssertionError('public revision still differs')):
                client.return_value.dataset_metadata.side_effect = metadata
                client.return_value.dataset_status.return_value = json.dumps({'status': 'ready', 'current_version_number': 18})
                with self.assertRaisesRegex(AssertionError, 'public revision still differs'):
                    sync.verify_existing(args)
                report = json.loads((root / 'publication-report.json').read_text())
                self.assertEqual(report['kaggleOwnerState']['current_version_number'], 18)
                self.assertEqual(report['ownerSourceMetadata'], 'reviewed sources')
                client.return_value.dataset_metadata_update.assert_not_called()
                client.return_value.dataset_create_version.assert_not_called()

    def test_coordinated_source_update_uses_authenticated_guard_not_public_default(self):
        import json
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            sources=(sync.DATASET+'; Data distribution: https://huggingface.co/datasets/'+sync.HF_REPO+'/tree/'+'a'*40+' ; Website source commit: '+'b'*40)
            control={'description':'unchanged card','userSpecifiedSources':sources}
            client=Mock();calls=[]
            desired=sync.source_metadata(sources,'c'*40,'d'*40)
            def metadata(dataset,target):
                value=dict(control)
                if calls:value['userSpecifiedSources']=desired
                calls.append(target)
                pathlib.Path(target,'dataset-metadata.json').write_text(json.dumps(value))
            client.dataset_metadata.side_effect=metadata
            owner_guard=Mock()
            with patch.object(sync,'fetch',side_effect=AssertionError('stale public default must not guard writes')):
                sync.correct_kaggle_sources(client,root,control,'c'*40,23,'d'*40,version_guard=owner_guard)
            owner_guard.assert_called_once()
            client.dataset_metadata_update.assert_called_once()
            client.dataset_create_version.assert_not_called()

    def test_source_metadata_pins_both_current_hf_and_website_without_rewriting_archives(self):
        hub = 'https://huggingface.co/datasets/' + sync.HF_REPO
        value = (sync.DATASET + '; Data distribution: ' + hub + '/tree/' + 'a' * 40
                 + ' ; Website source commit: ' + 'b' * 40
                 + ' ; Archived website source DOI: https://doi.org/10.5281/zenodo.23289009')
        result = sync.source_metadata(value, 'c' * 40, 'd' * 40)
        self.assertIn(hub + '/tree/' + 'c' * 40, result)
        self.assertIn('Website source commit: ' + 'd' * 40, result)
        self.assertNotIn('a' * 40, result)
        self.assertNotIn('b' * 40, result)
        self.assertIn('https://doi.org/10.5281/zenodo.23289009', result)

    def test_verify_existing_never_prepares_or_republishes_packages(self):
        command = ['sync', '--root', '/tmp/reviewed-verification', '--hf-revision', 'b' * 40,
                   '--kaggle-version', '17', '--website-commit', 'a' * 40,
                   '--website-run-url', 'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345',
                   '--verify-existing']
        with patch.object(sys, 'argv', command), patch.dict(os.environ, {'HF_TOKEN': 'test', 'KAGGLE_API_TOKEN': 'test'}), \
                patch.object(sync, 'verify_existing', create=True) as verify, \
                patch.object(sync, 'prepare', side_effect=AssertionError('must not prepare another release')), \
                patch.object(sync, 'publish', side_effect=AssertionError('must not create another revision or version')):
            sync.main()
        verify.assert_called_once()

    def test_ready_version_guard_requires_current_version_and_rejects_newer_inventory(self):
        value = {'currentVersionNumber': 17, 'versions': [
            {'versionNumber': 17, 'status': 'Ready'}, {'versionNumber': 16, 'status': 'Ready'}]}
        sync.guard_kaggle_version(value, 17)
        for expected, changed in [(16, value), (18, value),
                                  (17, {**value, 'currentVersionNumber': 16}),
                                  (17, {**value, 'currentVersionNumber': 18}),
                                  (17, {**value, 'versions': [{'versionNumber': 17, 'status': 'Processing'}]}),
                                  (17, {**value, 'versions': [*value['versions'], {'versionNumber': 18, 'status': 'Processing'}]})]:
            with self.subTest(expected=expected, changed=changed):
                with self.assertRaises(AssertionError):
                    sync.guard_kaggle_version(changed, expected)

    def test_website_receipt_requires_successful_reviewed_deployment_run(self):
        import json
        url = 'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345'
        commit = 'a' * 40
        run = {'head_sha': commit, 'head_branch': 'main', 'status': 'completed',
               'conclusion': 'success', 'path': '.github/workflows/machine-readable-interop.yml'}
        with patch.dict(os.environ, {'GITHUB_TOKEN': 'read-only-receipt-token', 'GITHUB_REF_NAME': 'main'}), \
                patch.object(sync, 'fetch', return_value=json.dumps(run).encode()) as fetch:
            sync.verify_website_run(url, commit)
            fetch.assert_called_once_with(
                'https://api.github.com/repos/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345',
                headers={'Authorization': 'Bearer read-only-receipt-token'})
        for changed in [{'head_sha': 'b' * 40}, {'head_branch': 'unreviewed'}, {'conclusion': 'failure'},
                        {'status': 'in_progress'}, {'path': '.github/workflows/platform-convergence.yml'}]:
            with self.subTest(changed=changed), patch.dict(os.environ, {'GITHUB_REF_NAME': 'main'}), \
                    patch.object(sync, 'fetch', return_value=json.dumps({**run, **changed}).encode()):
                with self.assertRaises(AssertionError):
                    sync.verify_website_run(url, commit)

    def test_branch_receipt_must_match_the_dispatched_reviewed_branch(self):
        import json
        branch='codex/p0-semantic-integrity-20261018'
        run={'head_sha':'a'*40,'head_branch':branch,'status':'completed','conclusion':'success','path':'.github/workflows/machine-readable-interop.yml'}
        with patch.dict(os.environ,{'GITHUB_REF_NAME':branch}),patch.object(sync,'fetch',return_value=json.dumps(run).encode()):
            sync.verify_website_run('https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345','a'*40)
        with patch.dict(os.environ,{'GITHUB_REF_NAME':'unreviewed'}),patch.object(sync,'fetch',return_value=json.dumps(run).encode()):
            with self.assertRaises(AssertionError):sync.verify_website_run('https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345','a'*40)

    def test_verification_only_accepts_promoted_source_with_identical_product_inputs(self):
        import json
        run = {'head_sha': 'a' * 40, 'head_branch': 'codex/p0-semantic-integrity-20261018',
               'status': 'completed', 'conclusion': 'success',
               'path': '.github/workflows/machine-readable-interop.yml'}
        url = 'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/12345'
        with patch.dict(os.environ, {'GITHUB_REF_NAME': 'main'}), \
                patch.object(sync, 'fetch', return_value=json.dumps(run).encode()), \
                patch.object(sync.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as git:
            with self.assertRaisesRegex(AssertionError, 'different source branch'):
                sync.verify_website_run(url, 'a' * 40)
            git.assert_not_called()
            sync.verify_website_run(url, 'a' * 40, allow_promoted_source=True)
            self.assertEqual(git.call_count, 2)
        for results, message in [([1], 'not on main'), ([0, 1], 'Product inputs differ')]:
            with self.subTest(results=results), patch.dict(os.environ, {'GITHUB_REF_NAME': 'main'}), \
                    patch.object(sync, 'fetch', return_value=json.dumps(run).encode()), \
                    patch.object(sync.subprocess, 'run', side_effect=[SimpleNamespace(returncode=x) for x in results]):
                with self.assertRaisesRegex(AssertionError, message):
                    sync.verify_website_run(url, 'a' * 40, allow_promoted_source=True)

    def test_zenodo_metadata_path_never_calls_file_or_new_version_apis(self):
        from copy import deepcopy
        before={'revision':33,'doi':'10.5281/zenodo.22838416','conceptdoi':'10.5281/zenodo.18765168',
                'files':[{'key':'graph.jsonld','checksum':'md5:abc','size':12}],
                'metadata':{'version':'1.3.3','description':'before'}}
        spec={'record':'22838416','expected_revision':33,'doi':before['doi'],'version':'1.3.3','description':'verified archive description'}
        md={'version':'1.3.3','description':'before','creators':[{'name':'Original creator'}],'related_identifiers':[]}
        stored=deepcopy(md);calls=[]
        def request(method,url,payload=None,**kwargs):
            calls.append((method,url))
            self.assertNotIn('/files',url);self.assertNotIn('newversion',url)
            if url.endswith('/records/22838416'):
                obj=deepcopy(before)
                if any(v[0]=='PUT' for v in calls):obj['revision']=34;obj['metadata']['description']=spec['description']
                return 200,obj
            if method=='PUT':stored.update(payload['metadata'])
            return 200,{'submitted':True,'metadata':deepcopy(stored)}
        with patch.object(publication,'request',side_effect=request):result=publication.correct_zenodo_metadata(spec,'redacted-token')
        self.assertTrue(result['filesUnchanged'] and result['metadataVerified'])
        self.assertEqual(result['version'],'1.3.3')
        with patch.object(publication,'request',return_value=(200,{**before,'revision':34})):
            with self.assertRaisesRegex(AssertionError,'revision changed'):publication.correct_zenodo_metadata(spec,'redacted-token')

    def test_zenodo_already_published_metadata_is_read_only_and_accepts_apostrophe_typography(self):
        links=['https://www.ghezelbaash.ir/','https://www.ghezelbaash.ir/graph.jsonld',
               'https://huggingface.co/datasets/'+publication.HF_REPO,
               'https://www.kaggle.com/datasets/'+publication.KAGGLE_REF]
        current={'revision':34,'doi':'10.5281/zenodo.22838416',
                 'metadata':{'version':'1.3.3','description':"This record's preserved archive.",
                             'related_identifiers':[{'identifier':url} for url in links]}}
        spec={'record':'22838416','expected_revision':33,'doi':current['doi'],
              'version':'1.3.3','description':'This record’s preserved archive.'}
        with patch.object(publication,'request',return_value=(200,current)) as request:
            result=publication.correct_zenodo_metadata(spec,'redacted-token')
        self.assertTrue(result['metadataVerified'])
        self.assertFalse(result['writePerformed'] or result['filesTouched'])
        request.assert_called_once_with('GET',publication.BASE+'/records/22838416',token='redacted-token')
        for description in ['A different claim.', 'This record’s updated archive.']:
            with self.subTest(description=description), patch.object(publication,'request',return_value=(200,current)) as request:
                with self.assertRaisesRegex(AssertionError,'revision changed'):
                    publication.correct_zenodo_metadata({**spec,'description':description},'redacted-token')
                self.assertEqual(request.call_count,1)

    def test_download_retries_temporary_404_without_publishing(self):
        class Handler(BaseHTTPRequestHandler):
            reads = 0
            def do_GET(self):
                Handler.reads += 1
                self.send_response(404 if Handler.reads < 3 else 200)
                self.end_headers()
                self.wfile.write(b'not ready' if Handler.reads < 3 else b'exact payload')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = publication.download_bytes(f'http://127.0.0.1:{server.server_port}/version/12', attempts=3, delay=0)
            self.assertEqual(result, b'exact payload')
            self.assertEqual(Handler.reads, 3)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_large_source_upload_uses_streaming_and_a_trusted_bucket(self):
        command = publication.bucket_upload_command('/tmp/source.zip', 'https://zenodo.org/api/files/bucket/source.zip', 'test-token')
        self.assertIn('--upload-file', command)
        self.assertIn('--retry-all-errors', command)
        self.assertEqual(command[command.index('--max-time') + 1], '600')
        with self.assertRaises(ValueError):
            publication.bucket_upload_command('/tmp/source.zip', 'https://example.org/source.zip', 'test-token')

    def test_approved_existing_record_can_be_inprogress_and_submitted(self):
        import hashlib
        import json
        import subprocess
        body=b'verified source archive'
        key='medicaldoctor91/source.zip'
        dep=publication.BASE+'/deposit/depositions/23289009'
        calls=[]
        def request(method,url,**kwargs):
            calls.append((method,url))
            if method=='GET' and url==dep:
                return 200,{'submitted':True,'state':'inprogress','links':{'bucket':publication.BASE+'/files/approved-bucket'}}
            if method=='GET' and url==dep+'/files':return 200,[{'filename':key,'id':'old-file'}]
            return 204,{}
        def upload(command,**kwargs):
            path=pathlib.Path(command[command.index('--upload-file')+1])
            self.assertEqual(path.read_bytes(),body)
            return subprocess.CompletedProcess(command,0,json.dumps({'key':key,'size':len(body),'checksum':'md5:'+hashlib.md5(body).hexdigest()}),'')
        with patch.object(publication,'request',side_effect=request),patch.object(publication.subprocess,'run',side_effect=upload):
            publication.publish_source_bucket('23289009',{key:body},'test-token')
        self.assertIn(('DELETE',dep+'/files/old-file'),calls)
        self.assertEqual(calls[-1],('POST',dep+'/actions/publish'))

    def test_published_source_record_is_not_modified_without_an_editable_draft(self):
        with patch.object(publication,'request',return_value=(200,{'submitted':True,'state':'done'})) as request:
            with self.assertRaises(AssertionError):publication.publish_source_bucket('23289009',{'source.zip':b'archive'},'test-token')
        self.assertEqual(request.call_count,1)


if __name__ == '__main__':
    unittest.main()
