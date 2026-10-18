"""Exercise publication transport boundaries without contacting external accounts."""
import importlib.util
import os
import pathlib
import sys
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.github/scripts'))
import platform_publish as publication
import sync_platform_machine_resources as sync


class PublicationTransportTests(unittest.TestCase):
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

    def test_ready_version_guard_uses_version_inventory_when_overview_is_stale(self):
        value = {'currentVersionNumber': 16, 'versions': [
            {'versionNumber': 17, 'status': 'Ready'}, {'versionNumber': 16, 'status': 'Ready'}]}
        sync.guard_kaggle_version(value, 17)
        for expected, changed in [(16, value), (18, value),
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
        with patch.object(sync, 'fetch', return_value=json.dumps(run).encode()):
            sync.verify_website_run(url, commit)
        for changed in [{'head_sha': 'b' * 40}, {'conclusion': 'failure'},
                        {'status': 'in_progress'}, {'path': '.github/workflows/platform-convergence.yml'}]:
            with self.subTest(changed=changed), patch.object(sync, 'fetch', return_value=json.dumps({**run, **changed}).encode()):
                with self.assertRaises(AssertionError):
                    sync.verify_website_run(url, commit)

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
