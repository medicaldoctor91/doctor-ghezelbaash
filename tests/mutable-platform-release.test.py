"""Guards for the non-archival maintenance path; no platform requests."""
import ast,importlib.util,json,sys,unittest,tempfile
from unittest.mock import Mock,patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.github/scripts'))
import mutable_platform_release as release
class Tests(unittest.TestCase):
 def test_scope_includes_notebook_distribution(self):
  import tempfile
  from platform_bundle import common_release, dump, load
  ctx=release.mutable_context('a'*40)
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);dump(root/'datapackage.json',{'edition':'2026-10-18','version':'1.3.4'})
   common_release(root,ctx)
   matrix=load(root/'current-release-matrix.json')
  self.assertEqual(set(matrix['publicationScope']),{'website','hf','kaggle','notebook'})
  self.assertEqual(set(matrix['distributions']),set(matrix['publicationScope']))
  self.assertEqual(matrix['distributions']['notebook'],'https://www.kaggle.com/code/'+release.gates.NB)
  self.assertFalse(matrix['archivedSnapshotsUpdated'])
 def test_reserved_archive_not_claimed_published(self):
  text='Use the assigned exact DOI to cite this coordinated archive.'
  self.assertIn('reserved',release.archive_scope(text));self.assertNotIn('cite this coordinated archive',release.archive_scope(text))
 def test_positioning_text_is_untouched(self):
  original=(ROOT/'src/canonical/enrichment/instruction_examples_fa_market_positioning.jsonl').read_text()
  self.assertEqual(release.archive_scope(original),original)
 def test_no_zenodo_mutation_calls(self):
  source=(ROOT/'.github/scripts/mutable_platform_release.py').read_text();tree=ast.parse(source)
  for node in ast.walk(tree):
   if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr in {'post','put','delete','patch'}:
    self.fail('Unexpected direct HTTP mutation')
  self.assertNotIn('publish_zenodo',source);self.assertNotIn('mint',source.replace('No Zenodo write or mint operation.',''))
 def test_frozen_validation_and_full_viewer_gate_retained(self):
  source=(ROOT/'.github/scripts/mutable_platform_release.py').read_text()
  self.assertIn('gates.verify_hf(w)',source);self.assertIn('guard_frozen(w)',source)
  workflow=(ROOT/'.github/workflows/mutable-platform-release.yml').read_text()
  self.assertIn('Restore exact validated bytes without rebuild',workflow)
  self.assertNotIn('zenodo-only',workflow)
class FreshViewerTests(unittest.TestCase):
 def test_query_refresh_retains_all_original_api_parameters(self):
  response=Mock(status_code=200,content=b'{"rows":[]}',headers={'X-Revision':'current'},url='https://datasets-server.huggingface.co/rows?live_audit=1')
  with tempfile.TemporaryDirectory() as folder,patch.object(release.requests,'get',return_value=response) as get,patch.object(release.time,'time_ns',side_effect=[11,12]):
   original=Mock();read=release.fresh_viewer_reads(folder,original);url='https://datasets-server.huggingface.co/rows?dataset=d&config=c&split=train&offset=0&length=2'
   self.assertIs(read(url),response);self.assertIs(read(url),response)
   self.assertEqual([c.kwargs['params']['live_audit'] for c in get.call_args_list],['11','12'])
   self.assertTrue(all(c.args==(url,) for c in get.call_args_list));self.assertIn('no-store',get.call_args.kwargs['headers']['Cache-Control']);original.assert_not_called()
 def test_kaggle_download_never_receives_unknown_parameters(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(release.requests,'get') as get:
   original=Mock(return_value='unchanged');url='https://www.kaggle.com/api/v1/datasets/download/o/d?datasetVersionNumber=26'
   self.assertEqual(release.fresh_viewer_reads(folder,original)(url),'unchanged');original.assert_called_once_with(url);get.assert_not_called()
 def test_transport_failure_still_raises_and_saves_evidence(self):
  response=Mock(status_code=500,content=b'{"error":"index loading"}',headers={},url='https://datasets-server.huggingface.co/search');response.raise_for_status.side_effect=release.requests.HTTPError('500')
  with tempfile.TemporaryDirectory() as folder,patch.object(release.requests,'get',return_value=response):
   with self.assertRaises(release.requests.HTTPError):release.fresh_viewer_reads(folder,Mock())(response.url)
   self.assertEqual(len(list((Path(folder)/'viewer-response-evidence').glob('*.json'))),1)
if __name__=='__main__':unittest.main()
