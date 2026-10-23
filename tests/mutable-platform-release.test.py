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
  self.assertEqual(release.archive_scope(original,published=True),original)
 def test_published_archive_has_its_own_source_and_citation_boundary(self):
  original='Use the assigned exact DOI to cite this coordinated archive.'
  text=release.archive_scope(original,published=True)
  self.assertIn(release.DOI_POLICY['currentArchive']['sourceCommit'],text)
  self.assertIn('unchanged',text)
  self.assertIn('platform revision and website source',text)
  self.assertNotIn('reserved',text)
  self.assertNotIn('unpublished',text)
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
class PreviewSchemaTests(unittest.TestCase):
 def test_real_bounded_preview_without_partial_is_valid(self):
  rows=[{'example_id':'positioning-001'},{'example_id':'positioning-002'}]
  preview={'dataset':'d','config':'market_positioning','split':'train','features':[],'truncated':True,'rows':[{'row_idx':0,'row':rows[0],'truncated_cells':[]}]}
  self.assertEqual(release.gates.assert_viewer_preview_rows(preview,rows,'market_positioning'),1)
  for change in [{'row':{'example_id':'wrong'}},{'truncated_cells':['example_id']},{'row_idx':9}]:
   bad={**preview,'rows':[{**preview['rows'][0],**change}]}
   with self.assertRaises(AssertionError):release.gates.assert_viewer_preview_rows(bad,rows,'market_positioning')
 def test_search_still_requires_explicit_nonpartial(self):
  with self.assertRaises(AssertionError):release.gates.assert_viewer_result_rows({'rows':[{'row_idx':0,'row':{'x':'a'}}]},[{'x':'a'}],'c','search')
class NotebookOnlyTests(unittest.TestCase):
 def test_only_notebook_writer_is_reachable_directly(self):
  tree=ast.parse((ROOT/'.github/scripts/mutable_platform_release.py').read_text())
  fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='complete_notebook')
  calls=[ast.unparse(n.func) for n in ast.walk(fn) if isinstance(n,ast.Call)]
  for forbidden in ['publish','preflight','subprocess.run','client.dataset_create_version','client.dataset_metadata_update','verify_media']:
   self.assertNotIn(forbidden,calls)
  self.assertIn('gates.publish_notebook',calls)
 def test_data_integrity_failure_blocks_notebook(self):
  plan={'sourceCommit':'bbda1167e1ed05bda5e8a600b1ad4a9547629489','hfRevision':'b3bf6162c411f924b1f70dee372e17c337397568','kaggleVersion':26,'notebookVersion':11,'archiveWrites':False}
  state={'siteSource':plan['sourceCommit'],'hfRevision':plan['hfRevision'],'kaggleOwner':{'version':26,'status':'ready'},'kagglePublicDefault':26,'notebookVersion':10}
  with tempfile.TemporaryDirectory() as folder,patch.object(release,'load',side_effect=[plan,{'status':'PASS'}]),patch.object(release,'sha',return_value='0a4eff9164fa8ba76604e2cd4588cf644b48beed0ba9084fe0eeb389dabfb5fd'),patch.object(release,'guard_frozen'),patch.object(release,'snapshot',return_value=state),patch.object(release,'kaggle_client'),patch.object(release.gates,'verify_site',side_effect=AssertionError('bytes differ')),patch.object(release.gates,'publish_notebook') as push:
   with self.assertRaisesRegex(AssertionError,'bytes differ'):release.complete_notebook(Path(folder))
   push.assert_not_called()
 def test_runtime_default_remains_strict(self):
  import inspect
  self.assertIs(inspect.signature(release.gates.verify_hf).parameters['runtime_features'].default,True)
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

class FrozenGitTests(unittest.TestCase):
 def repo(self,root):
  import subprocess
  repo=root/'hf-git';repo.mkdir();stage=root/'hf-stage';stage.mkdir()
  def git(*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL).decode().strip()
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid')
  for folder in [repo,stage]:(folder/'data.txt').write_text('frozen payload\n')
  git('add','data.txt');git('commit','-qm','Frozen payload')
  return repo,stage,git,git('rev-parse','HEAD')
 def assert_blocked_before_external_operations(self,root,revision,message):
  plan={'candidateSchema':'mutable-distributions-2','archiveWrites':False,'archivePublicStatus':200,'hfRevision':revision}
  with patch.object(release,'load',side_effect=[plan,{'status':'PASS'}]),patch.object(release,'guard_frozen'),patch.object(release,'verify_published_archive') as archive,patch.object(release,'snapshot') as snapshot:
   with self.assertRaisesRegex(AssertionError,message):release.publish(root)
   archive.assert_not_called();snapshot.assert_not_called()
 def test_restored_hf_head_drift_blocks_before_any_platform_operation(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);repo,stage,git,revision=self.repo(root)
   (repo/'data.txt').write_text('different commit\n');git('add','data.txt');git('commit','-qm','Unexpected commit')
   self.assert_blocked_before_external_operations(root,revision,'commit differs')
 def test_dirty_restored_hf_worktree_blocks_before_any_platform_operation(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);repo,stage,git,revision=self.repo(root)
   (repo/'data.txt').write_text('uncommitted alteration\n')
   self.assert_blocked_before_external_operations(root,revision,'tree is dirty')
 def test_clean_hf_index_must_match_frozen_logical_payload(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);repo,stage,git,revision=self.repo(root)
   self.assertEqual(release.guard_hf_git(root,{'hfRevision':revision})['files'],1)
   (stage/'data.txt').write_text('different candidate payload\n')
   self.assert_blocked_before_external_operations(root,revision,'data.txt')
if __name__=='__main__':unittest.main()
