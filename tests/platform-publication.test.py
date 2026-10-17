"""Exercise publication transport boundaries without contacting external accounts."""
import importlib.util
import pathlib
import sys
import threading
import unittest
import copy
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.github/scripts'))
import platform_publish as publication


class PublicationTransportTests(unittest.TestCase):
    def test_same_run_resume_reuses_only_its_own_publications(self):
        ctx=publication.context('a'*40,54321,'2026-10-17')
        receipt={'sourceCommit':ctx['source_commit'],'publicationRun':ctx['run_url']}
        self.assertFalse(publication.guard_hf_publication(ctx,'b'*40,'b'*40,None))
        self.assertTrue(publication.guard_hf_publication(ctx,'c'*40,'b'*40,receipt))
        with self.assertRaises(AssertionError):
            publication.guard_hf_publication(ctx,'c'*40,'b'*40,{**receipt,'publicationRun':'another run'})
        manifest={'website_source_commit':ctx['source_commit'],'package_publication_run_url':ctx['run_url'],
                  'upstream_revision':'c'*40,'desired_kaggle_version':13}
        self.assertFalse(publication.guard_kaggle_publication(ctx,12,12,None,'c'*40))
        self.assertTrue(publication.guard_kaggle_publication(ctx,13,12,manifest,'c'*40))
        for version,wrong in [(14,manifest),(13,{**manifest,'package_publication_run_url':'another run'}),
                              (13,{**manifest,'upstream_revision':'unreviewed'})]:
            with self.assertRaises(AssertionError):publication.guard_kaggle_publication(ctx,version,12,wrong,'c'*40)

    def test_public_verification_waits_for_visibility_and_fails_closed(self):
        with patch.object(publication,'request',side_effect=[(200,{'subtitle':'old'}),(200,{'subtitle':'current'})]) as request:
            result=publication.wait_for_public_metadata('https://www.kaggle.com/api/v1/datasets/view/example',
                    lambda value:value.get('subtitle')=='current',attempts=2,delay=0)
        self.assertEqual(result['subtitle'],'current')
        self.assertEqual(request.call_count,2)
        with patch.object(publication,'request',return_value=(200,{'subtitle':'old'})):
            with self.assertRaises(RuntimeError):
                publication.wait_for_public_metadata('https://zenodo.org/api/records/22838416',lambda value:False,attempts=2,delay=0)

    def test_zenodo_verification_detects_stale_description_and_creator_changes(self):
        original={'doi':'10.5281/zenodo.22838416','metadata':{'version':'1.3.3',
                  'creators':[{'name':'Existing author'}],'license':{'id':'cc-by-4.0'}}}
        expected={**original['metadata'],'description':'<p>Current source and Hub.</p>',
                  'related_identifiers':[{'identifier':'https://example.org/current','relation':'isSupplementTo'}]}
        final={'doi':original['doi'],'metadata':copy.deepcopy(expected)}
        self.assertTrue(publication.zenodo_metadata_matches(final,original,expected))
        for key,value in [('description','<p>Stale receipt.</p>'),('creators',[{'name':'Unexpected author'}]),
                          ('license',{'id':'cc0'}),('related_identifiers',[])]:
            changed=copy.deepcopy(final);changed['metadata'][key]=value
            self.assertFalse(publication.zenodo_metadata_matches(changed,original,expected))

    def test_zenodo_metadata_has_one_current_receipt_and_retains_unrelated_authorship(self):
        old_source='2501e2f06db79b292e9533e345e53a1a21832b26'
        old_hf='f383edb5eaad67cd86dc5887cd0d97a4ff492b1d'
        ctx=publication.context('a'*40,54321,'2026-10-17')
        old_url=ctx['hf']+'/tree/'+old_hf
        metadata={'version':'1.3.3','creators':[{'name':'Existing author','orcid':'0009-0001-9346-8475'}],
                  'license':'cc-by-4.0','custom':{'preserve':'yes'},
                  'description':'<p>Unrelated clinical scope remains.</p>'
                    '<p><strong>Archive and current-distribution scope:</strong> Current website source commit <code>'+old_source+'</code>; verified Hugging Face revision '+old_hf+'.</p>'
                    '<p><strong>Publication convergence — 2026-10-16:</strong> obsolete receipt</p>',
                  'related_identifiers':[{'identifier':old_url,'scheme':'url','relation':'isSupplementTo'}]}
        before=copy.deepcopy(metadata)
        result=publication.build_zenodo_metadata(metadata,'10.5281/zenodo.22838416',ctx,'b'*40)
        self.assertEqual(metadata,before)
        self.assertEqual(result['creators'],before['creators'])
        self.assertEqual(result['custom'],before['custom'])
        self.assertEqual(result['license'],'cc-by-4.0')
        self.assertEqual(result['version'],'1.3.3')
        self.assertIn('Unrelated clinical scope remains.',result['description'])
        self.assertNotIn(old_source,result['description'])
        self.assertNotIn(old_hf,result['description'])
        self.assertEqual(result['description'].count('Publication convergence —'),1)
        self.assertIn('a'*40,result['description'])
        self.assertIn('b'*40,result['description'])
        self.assertIn('concept DOI',result['description'])
        old=next(x for x in result['related_identifiers'] if x['identifier']==old_url)
        self.assertEqual(old['relation'],'references')
        again=publication.build_zenodo_metadata(result,'10.5281/zenodo.22838416',ctx,'b'*40)
        self.assertEqual(again,result)

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
        modern=publication.BASE+'/records/23289009/draft'
        calls=[]
        def request(method,url,**kwargs):
            calls.append((method,url))
            if method=='GET' and url==dep:
                return 200,{'submitted':True,'state':'inprogress','links':{'bucket':publication.BASE+'/files/approved-bucket'}}
            if method=='GET' and url==dep+'/files':return 200,[{'filename':key,'id':'old-file'}]
            if method=='GET' and url==modern+'/files':
                return 200,{'entries':[{'key':key,'size':len(body),'checksum':'md5:'+hashlib.md5(body).hexdigest()}]}
            return 204,{}
        def upload(command,**kwargs):
            path=pathlib.Path(command[command.index('--upload-file')+1])
            self.assertEqual(path.read_bytes(),body)
            return subprocess.CompletedProcess(command,0,json.dumps({'key':key,'size':len(body),'checksum':'md5:'+hashlib.md5(body).hexdigest()}),'')
        with patch.object(publication,'request',side_effect=request),patch.object(publication.subprocess,'run',side_effect=upload):
            publication.publish_source_bucket('23289009',{key:body},'test-token')
        self.assertIn(('DELETE',modern+'/files/medicaldoctor91%2Fsource.zip'),calls)
        self.assertIn(('POST',modern+'/files/medicaldoctor91%2Fsource.zip/commit'),calls)
        self.assertEqual(calls[-1],('POST',modern+'/actions/publish'))

    def test_published_source_record_is_not_modified_without_an_editable_draft(self):
        with patch.object(publication,'request',return_value=(200,{'submitted':True,'state':'done'})) as request:
            with self.assertRaises(AssertionError):publication.publish_source_bucket('23289009',{'source.zip':b'archive'},'test-token')
        self.assertEqual(request.call_count,1)


if __name__ == '__main__':
    unittest.main()
