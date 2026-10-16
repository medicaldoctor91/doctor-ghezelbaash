"""Exercise publication transport boundaries without contacting external accounts."""
import importlib.util
import pathlib
import sys
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.github/scripts'))
import platform_publish as publication


class PublicationTransportTests(unittest.TestCase):
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
