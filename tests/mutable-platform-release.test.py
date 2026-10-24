"""Guards for the non-archival maintenance path; no platform requests."""
import ast,importlib.util,json,sys,unittest,tempfile,contextlib
from unittest.mock import Mock,patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.github/scripts'))
import mutable_platform_release as release
class Tests(unittest.TestCase):
 def test_superseded_notebook_citation_candidate_stops_before_external_operations(self):
  for version in ['mutable-distributions-2','mutable-distributions-3']:
   plan={'candidateSchema':version,'archiveWrites':False,'archivePublicStatus':200}
   with self.subTest(version=version),contextlib.ExitStack() as stack:
    stack.enter_context(patch.object(release,'load',return_value=plan))
    operations=[stack.enter_context(patch.object(owner,name)) for owner,name in [
     (release,'guard_frozen'),(release,'snapshot'),(release,'verify_published_archive'),
     (release,'kaggle_client'),(release.gates,'run'),(release.subprocess,'run')]]
    with self.assertRaisesRegex(AssertionError,'Superseded archive-citation candidate'):
     release.publish(Path('/unused'))
    for operation in operations:operation.assert_not_called()
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
 def test_notebook_citation_prose_preserves_actual_executable_cells_and_dois(self):
  import copy,re
  from platform_bundle import render_doi_text
  original=json.loads(render_doi_text((ROOT/'src/canonical/platforms/kaggle-starter.ipynb').read_text()))
  # This literal must remain code, even though its words also need correction
  # in the public citation prose.
  original['cells'].append({'cell_type':'code','metadata':{'keep':True},'execution_count':None,'outputs':[],
   'source':['print("The exact DOI identifies this release cohort; its live availability is verified separately in publication receipts.")\n']})
  code=copy.deepcopy([cell for cell in original['cells'] if cell['cell_type']=='code'])
  code_bytes=[(''.join(cell['source']) if isinstance(cell['source'],list) else cell['source']).encode() for cell in code]
  doi_ids=set(re.findall(r'10\.5281/zenodo\.\d+',json.dumps(original)))
  archive=release.DOI_POLICY['currentArchive'];explicit_source='e'*40
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'starter.ipynb';path.write_text(json.dumps(original,ensure_ascii=False))
   self.assertTrue(release.scope_notebook_archive(path,archive_doi=archive['doi'],archive_source_commit=explicit_source))
   transformed=json.loads(path.read_text());first_bytes=path.read_bytes()
   self.assertFalse(release.scope_notebook_archive(path,archive_doi=archive['doi'],archive_source_commit=explicit_source))
   self.assertEqual(path.read_bytes(),first_bytes,'Repeated scoping must be byte-idempotent')
  self.assertEqual([cell for cell in transformed['cells'] if cell['cell_type']=='code'],code)
  self.assertEqual([(''.join(cell['source']) if isinstance(cell['source'],list) else cell['source']).encode() for cell in transformed['cells'] if cell['cell_type']=='code'],code_bytes)
  self.assertEqual(set(re.findall(r'10\.5281/zenodo\.\d+',json.dumps(transformed))),doi_ids)
  prose='\n'.join(''.join(cell['source']) for cell in transformed['cells'] if cell['cell_type']=='markdown')
  self.assertNotIn('The exact DOI identifies this release cohort',prose)
  self.assertNotIn('Exact release binding',prose)
  self.assertIn('Published immutable archive',prose)
  self.assertIn('preserves source '+explicit_source,prose)
  self.assertIn('platform revision and website source',prose)
  self.assertEqual(transformed['metadata'],original['metadata'])
 def test_notebook_archive_scope_preserves_string_sources_and_ignores_missing_hf_copy(self):
  archive=release.DOI_POLICY['currentArchive']
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'starter.ipynb'
   self.assertFalse(release.scope_notebook_archive(path,archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit']))
   document={'cells':[{'cell_type':'markdown','source':'The exact DOI identifies this release cohort; its live availability is verified separately in publication receipts.'}], 'metadata':{}}
   path.write_text(json.dumps(document))
   self.assertTrue(release.scope_notebook_archive(path,archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit']))
   result=json.loads(path.read_text());self.assertIsInstance(result['cells'][0]['source'],str)
   self.assertIn(archive['sourceCommit'],result['cells'][0]['source'])
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

class ArchiveCitationTests(unittest.TestCase):
 def fixture(self,root):
  from platform_bundle import render_doi_text
  archive=release.DOI_POLICY['currentArchive']
  for folder,template in [('hf-stage','huggingface-card.md'),('kaggle','kaggle-card.md')]:
   target=root/folder/'README.md';target.parent.mkdir(parents=True,exist_ok=True)
   text=render_doi_text((ROOT/'src/canonical/platforms'/template).read_text())
   target.write_text(release.archive_scope(text,published=True))
  for folder in ['kaggle','notebook']:
   target=root/folder/'starter.ipynb';target.parent.mkdir(parents=True,exist_ok=True)
   target.write_text(render_doi_text((ROOT/'src/canonical/platforms/kaggle-starter.ipynb').read_text()))
   release.scope_notebook_archive(target,archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit'])
  return archive
 def test_all_actual_card_languages_keep_immutable_archive_distinct(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);archive=self.fixture(root);proof=release.guard_frozen_archive_scope(root,archive)
   self.assertEqual(proof['status'],'PASS');self.assertEqual(len(proof['checked']),4)
   hf=(root/'hf-stage/README.md').read_text();kg=(root/'kaggle/README.md').read_text()
   self.assertNotIn('The exact Zenodo Dataset snapshot for this release is',hf)
   self.assertNotIn('DOI دقیق، شناسهٔ همین انتشار است',kg)
   self.assertNotIn('از فایل‌های یکسان استفاده می‌کنند',kg)
   self.assertIn('شخص پزشک، کلینیک و مجموعه‌داده شناسه‌های مستقل و ارتباط‌های روشن دارند.',kg)
 def test_restored_ambiguous_card_or_notebook_cannot_pass(self):
  for mutation in ['persian-card','english-card','notebook']:
   with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);archive=self.fixture(root)
    if mutation=='notebook':
     p=root/'notebook/starter.ipynb';d=json.loads(p.read_text());d['cells'][0]['source']=['The exact DOI identifies this release cohort; its live availability is verified separately in publication receipts.'];p.write_text(json.dumps(d))
    else:
     p=root/('kaggle/README.md' if mutation=='persian-card' else 'hf-stage/README.md')
     sentence='DOI مجموعه، پیوند پایدار مجموعه است و DOI دقیق، شناسهٔ همین انتشار است.' if mutation=='persian-card' else 'The exact Zenodo Dataset snapshot for this release is 1.3.4+zenodo.3.'
     p.write_text(p.read_text()+'\n'+sentence)
    with self.assertRaisesRegex(AssertionError,'Ambiguous frozen'):
     release.guard_frozen_archive_scope(root,archive)

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
  plan={'candidateSchema':'mutable-distributions-4','archiveWrites':False,'archivePublicStatus':200,'hfRevision':revision}
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

class FrozenHomeProjectionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  from browser_projection import expected_home_search_projection
  origin='https://www.ghezelbaash.ir';person=origin+'/#saeed-ghezelbash';address=origin+'/clinic-postal-address'
  cls.graph={'@context':'https://schema.org','@graph':[
   {'@id':origin+'/webpage','@type':['ProfilePage','MedicalWebPage'],'url':origin+'/', 'name':'Physician profile','mainEntity':{'@id':person}},
   {'@id':person,'@type':['Person','IndividualPhysician'],'name':'Example physician','telephone':'+980000000001','email':'mailto:test@example.invalid','address':{'@id':address}},
   {'@id':origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah','@type':['PhysiciansOffice','LocalBusiness'],'name':'Example clinic','telephone':'+980000000001','address':{'@id':address}},
   {'@id':address,'@type':'PostalAddress','streetAddress':'Example street','addressLocality':'Example city','addressCountry':'IR','postalCode':'0000000000'},
   {'@id':origin+'/graph.jsonld/dataset','@type':'Dataset','name':'Example physician-authored dataset',
    'description':'A complete public knowledge graph of the physician and supporting clinic.',
    'creator':{'@id':person},'license':'https://creativecommons.org/licenses/by/4.0/'},
   {'@id':origin+'/graph.jsonld/download','@type':'DataDownload','contentUrl':origin+'/graph.jsonld','encodingFormat':'application/ld+json'}]}
  cls.search=expected_home_search_projection(cls.graph)
 def fixture(self,root,*,legacy=False,cyclic=False):
  website=root/'website';website.mkdir()
  release.dump(website/'graph.jsonld',self.graph)
  search=json.loads(json.dumps(self.search))
  if cyclic:
   physician=next(node for node in search['@graph'] if 'Person' in (node['@type'] if isinstance(node['@type'],list) else [node['@type']]))
   physician['mainEntityOfPage']={'@id':'https://www.ghezelbaash.ir/webpage'}
  def dump(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
  ld='<script id="schema-core-mainentity" type="application/ld+json">'+dump(self.graph if legacy else search)+'</script>'
  canonical='' if legacy else '<script id="canonical-entity-graph" type="application/json">'+dump(self.graph)+'</script>'
  (website/'index.html').write_text('<!doctype html><html><head>'+ld+'</head><body><p>Visible authored content</p>'+canonical+'</body></html>')
 def test_restored_home_is_rechecked_from_actual_bytes(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);self.fixture(root)
   proof=release.guard_frozen_home_projection(root)
   self.assertEqual(proof['status'],'PASS');self.assertEqual(proof['canonicalGraphStorage'],'application/json#canonical-entity-graph')
   self.assertEqual(proof['homepageSHA256'],release.sha(root/'website/index.html'))
   self.assertEqual(proof['canonicalGraphSHA256'],release.sha(root/'website/graph.jsonld'))
   self.assertEqual(json.loads((root/'frozen-home-projection.json').read_text()),proof)
 def test_old_format_or_reintroduced_cycle_blocks_all_publication_operations(self):
  plan={'candidateSchema':'mutable-distributions-4','archiveWrites':False,'archivePublicStatus':200,'hfRevision':'a'*40}
  for mutation,message in [('legacy','inert canonical-entity-graph'),('cyclic','Cyclic search reference')]:
   with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);self.fixture(root,legacy=mutation=='legacy',cyclic=mutation=='cyclic')
    with contextlib.ExitStack() as stack:
     stack.enter_context(patch.object(release,'load',side_effect=[plan,{'status':'PASS'}]))
     stack.enter_context(patch.object(release,'guard_frozen'));stack.enter_context(patch.object(release,'guard_hf_git'))
     operations=[stack.enter_context(patch.object(owner,name)) for owner,name in [
      (release,'snapshot'),(release,'verify_published_archive'),(release,'kaggle_client'),
      (release.gates,'run'),(release.gates,'publish_notebook'),(release.subprocess,'run')]]
     with self.assertRaisesRegex(AssertionError,message):release.publish(root)
     for operation in operations:operation.assert_not_called()
    self.assertFalse((root/'publication-report.json').exists())

class ExactVersionNotebookTests(unittest.TestCase):
 source='94611168bacf7630022499204c493f6e4af64f70'
 hf='d5d5d17e2b4584fba2da326060f9b3202d712a1e'
 fingerprint='82aa6b793ca90cf1027a27e454d4e41c83fb71d24c502aa862b28c25c045df05'
 def setup(self,root):
  plan={'candidateSchema':'mutable-distributions-4','archiveWrites':False,'sourceCommit':self.source,'hfRevision':self.hf,'kaggleVersion':29,'notebookVersion':13,'notebookPreviousVersion':12}
  state={'siteSource':self.source,'hfRevision':self.hf,'kaggleOwner':{'version':29,'status':'ready'},'notebookVersion':12}
  public={'currentVersionNumber':27,'versions':[{'versionNumber':29,'status':'Ready'}]}
  exact={'filesSha256Matched':48,'packageChecksumsVerified':47,'sourceCommit':self.source,'hfRevision':self.hf}
  provenance=json.dumps({'sourceCommit':self.source}).encode()
  for folder in ['website','hf-stage','kaggle','notebook']:(root/folder).mkdir()
  for folder in ['website','hf-stage']:(root/folder/'release-provenance.json').write_bytes(provenance)
  values={'release-plan.json':plan,'preflight-report.json':{'status':'PASS'},'kaggle-public-before.json':public,'archive-baseline.json':{'sourceCommit':'a'*40}}
  def load(path):return values[Path(path).name]
  stack=contextlib.ExitStack();self.addCleanup(stack.close)
  stack.enter_context(patch.object(release,'load',side_effect=load));stack.enter_context(patch.object(release,'guard_frozen'))
  stack.enter_context(patch.object(release,'sha',return_value=self.fingerprint));stack.enter_context(patch.object(release,'snapshot',return_value=state))
  stack.enter_context(patch.object(release,'read',side_effect=lambda url:Mock(json=lambda:{'sha':self.hf}) if '/api/datasets/' in url else Mock(content=provenance)))
  verify=stack.enter_context(patch.object(release,'verify_exact_public_files',return_value=exact))
  stack.enter_context(patch.object(release,'verify_published_archive'))
  client=Mock();client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':29});stack.enter_context(patch.object(release,'kaggle_client',return_value=client))
  return plan,state,public,verify,client
 def test_unreviewed_candidate_pins_block_before_notebook_write(self):
  for field,value in [('sourceCommit','c'*40),('hfRevision','c'*40),('kaggleVersion',28),('notebookVersion',12)]:
   with self.subTest(field=field),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);plan,state,public,verify,client=self.setup(root);plan[field]=value
    with patch.object(release.gates,'publish_notebook') as push:
     with self.assertRaises(AssertionError):release.complete_notebook_exact_version(root)
     push.assert_not_called();verify.assert_not_called()
 def test_public_hash_or_version_failure_blocks_notebook_write(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);plan,state,public,verify,client=self.setup(root)
   verify.side_effect=AssertionError('Exact-version public file hash differs')
   with patch.object(release.gates,'publish_notebook') as push:
    with self.assertRaisesRegex(AssertionError,'hash differs'):release.complete_notebook_exact_version(root)
    push.assert_not_called()
   verify.side_effect=None;public['versions']=[{'versionNumber':30,'status':'Ready'}]
   with patch.object(release.gates,'publish_notebook') as push:
    with self.assertRaises(AssertionError):release.complete_notebook_exact_version(root)
    push.assert_not_called()
 def test_existing_notebook13_uses_real_source_execution_guard_without_repush(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);plan,state,public,verify,client=self.setup(root);state['notebookVersion']=13
   notebook={'cells':[{'cell_type':'code','source':['print(1)'],'metadata':{}}]}
   release.dump(root/'notebook/starter.ipynb',notebook);(root/'kaggle/checksums.sha256').write_text('frozen inputs')
   live={'metadata':{'currentVersionNumber':13},'blob':{'source':json.dumps(notebook)}}
   client.kernels_status.return_value.status='complete'
   def output(ref,path,**kwargs):
    release.dump(Path(path)/'doi-release-execution.json',{'status':'PASS','kaggle_version':29,'upstream_revision':self.hf,'source_commit':self.source,'input_checksums_sha256':self.fingerprint,'exact_doi':release.gates.P['currentArchive']['doi']})
   client.kernels_output.side_effect=output
   with patch.object(release.gates,'get',return_value=Mock(json=lambda:live)),patch.object(release.gates,'sha',return_value=self.fingerprint):
    release.dump(root/'release-plan.json',plan);release.dump(root/'frozen-sha256.json',{})
    release.complete_notebook_exact_version(root)
   client.kernels_push.assert_not_called();client.dataset_create_version.assert_not_called()
   report=json.loads((root/'notebook-completion-report.json').read_text())
   self.assertEqual(report['status'],'NOTEBOOK_VERIFIED');self.assertFalse(report['fullPublicationVerified'])
   self.assertEqual(report['proof']['version'],13);self.assertEqual(report['observedPublicDefaultVersion'],27)
   self.assertFalse((root/'publication-report.json').exists())
 def test_last_moment_owner_or_site_change_blocks_notebook_write(self):
  for changed in ['owner','site']:
   with self.subTest(changed=changed),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);plan,state,public,verify,client=self.setup(root)
    if changed=='owner':client.dataset_status.return_value=json.dumps({'status':'processing','current_version_number':29})
    else:
     provenance=(root/'website/release-provenance.json').read_bytes()
     release.read.side_effect=[Mock(content=provenance),Mock(content=provenance),Mock(content=b'changed site')]
    with patch.object(release.gates,'publish_notebook') as push:
     with self.assertRaises(AssertionError):release.complete_notebook_exact_version(root)
     push.assert_not_called()

class ArticleExactVersionNotebookTests(unittest.TestCase):
 source='0f72c5e6ef832adef66d003069e3e3c189cf5079'
 hf='017269f382c41c5eb27c5cfcebaf7a365368903e'
 fingerprint='4b369026533ee309ba7b92a62e0a33ac99a3fe5738d8fe5039f97c67e3826fea'
 def setup(self,root):
  plan,state,public,verify,client=ExactVersionNotebookTests.setup(self,root)
  plan.update(kaggleVersion=31,kagglePreviousVersion=30,notebookVersion=15,notebookPreviousVersion=14)
  state.update(kaggleOwner={'version':31,'status':'ready'},notebookVersion=14)
  public.update(currentVersionNumber=30,versions=[{'versionNumber':31,'status':'Ready'}])
  client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':31})
  return plan,state,public,verify,client
 def test_only_the_exact_frozen_article_cohort_may_complete_notebook15(self):
  for field,value in [('sourceCommit','c'*40),('hfRevision','c'*40),('kaggleVersion',32),('notebookVersion',16),('notebookPreviousVersion',13)]:
   with self.subTest(field=field),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);plan,state,public,verify,client=self.setup(root);plan[field]=value
    with patch.object(release.gates,'publish_notebook') as push:
     with self.assertRaisesRegex(AssertionError,'cohort pins differ'):release.complete_notebook_exact_version(root)
     push.assert_not_called();verify.assert_not_called()
 def test_notebook15_uses_exact31_files_and_actual_execution_without_an_extra_dataset_version(self):
  import hashlib
  for already_published in [False,True]:
   with self.subTest(already_published=already_published),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);plan,state,public,verify,client=self.setup(root)
    state['notebookVersion']=15 if already_published else 14
    notebook={'cells':[{'cell_type':'code','source':['print(31)'],'metadata':{}}]}
    release.dump(root/'notebook/starter.ipynb',notebook)
    (root/'kaggle/checksums.sha256').write_text('frozen article cohort inputs')
    checksum=hashlib.sha256((root/'kaggle/checksums.sha256').read_bytes()).hexdigest()
    live={'metadata':{'currentVersionNumber':15},'blob':{'source':json.dumps(notebook)}}
    client.kernels_status.return_value.status='complete'
    def output(ref,path,**kwargs):
     release.dump(Path(path)/'doi-release-execution.json',{'status':'PASS','kaggle_version':31,'upstream_revision':self.hf,'source_commit':self.source,
      'input_checksums_sha256':checksum,'exact_doi':release.gates.P['currentArchive']['doi']})
    client.kernels_output.side_effect=output
    before={'metadata':{'currentVersionNumber':state['notebookVersion']}}
    with patch.object(release.gates,'get',side_effect=[Mock(json=lambda:before),Mock(json=lambda:live),Mock(json=lambda:live)]):
     release.dump(root/'release-plan.json',plan);release.dump(root/'frozen-sha256.json',{})
     release.complete_notebook_exact_version(root)
    if already_published:client.kernels_push.assert_not_called()
    else:client.kernels_push.assert_called_once_with(str(root/'notebook'))
    client.dataset_create_version.assert_not_called()
    verify.assert_called_once_with(root/'exact-notebook-public-files',release.KAGGLE_REF,31,root/'kaggle',release.read)
    report=json.loads((root/'notebook-completion-report.json').read_text())
    self.assertEqual(report['proof']['version'],15);self.assertEqual(report['observedPublicDefaultVersion'],30)
    self.assertFalse(report['fullPublicationVerified']);self.assertIn('full publication gate',report['outstanding']['currentDefaultAndExactDefaultZipEquality'])
    self.assertFalse((root/'publication-report.json').exists())

class FinalConsistencyTests(unittest.TestCase):
 def setup(self,root):
  source='a'*40;hf='b'*40;archive_source=release.DOI_POLICY['currentArchive']['sourceCommit']
  plan={'candidateSchema':'mutable-distributions-4','archiveWrites':False,'archivePublicStatus':200,'archiveSourceCommit':archive_source,
        'sourceCommit':source,'sitePreviousSource':'c'*40,'hfRevision':hf,'hfParent':'d'*40,'kaggleVersion':29,'kagglePreviousVersion':28,
        'notebookVersion':13,'notebookPreviousVersion':12}
  for folder in ['website','kaggle','notebook']:(root/folder).mkdir()
  provenance=json.dumps({'sourceCommit':source}).encode();(root/'website/release-provenance.json').write_bytes(provenance)
  (root/'kaggle/checksums.sha256').write_text('frozen input checksums')
  notebook={'cells':[{'cell_type':'code','source':['print(1)'],'metadata':{}}]};release.dump(root/'notebook/starter.ipynb',notebook)
  execution={'status':'PASS','kaggle_version':29,'upstream_revision':hf,'source_commit':source,
             'input_checksums_sha256':release.gates.sha(root/'kaggle/checksums.sha256'),'exact_doi':release.gates.P['currentArchive']['doi']}
  release.dump(root/'notebook-live.json',{'status':'PASS','result':{'executionEvidence':execution}})
  release.dump(root/'release-plan.json',plan);release.dump(root/'preflight-report.json',{'status':'PASS'})
  release.dump(root/'archive-baseline.json',{'sourceCommit':archive_source,'files':{'archive.txt':{}}});release.dump(root/'frozen-sha256.json',{})
  public={'currentVersionNumber':29,'versions':[{'versionNumber':29,'status':'Ready'}]}
  live={'metadata':{'currentVersionNumber':13},'blob':{'source':json.dumps(notebook)}}
  responses={'site':Mock(content=provenance),'hf':{'sha':hf},'kaggle':public,'notebook':live}
  def read(url):
   if url==release.SITE+'release-provenance.json':return responses['site']
   if '/api/datasets/' in url:return Mock(json=lambda:responses['hf'])
   if '/datasets/view/' in url:return Mock(json=lambda:responses['kaggle'])
   if '/kernels/pull/' in url:return Mock(json=lambda:responses['notebook'])
   raise AssertionError('Unexpected final read')
  client=Mock();client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':29})
  return plan,responses,client,read
 def run_publish(self,root,plan,client,read):
  state={'siteSource':plan['sourceCommit'],'hfRevision':plan['hfRevision'],'kaggleOwner':{'version':29,'status':'ready'}}
  with patch.object(release,'guard_frozen'),patch.object(release,'guard_hf_git'),patch.object(release,'guard_frozen_home_projection',return_value={'status':'PASS'}),patch.object(release,'guard_frozen_archive_scope',return_value={'status':'PASS'}),patch.object(release,'verify_published_archive'),patch.object(release,'snapshot',return_value=state),patch.object(release,'kaggle_client',return_value=client),patch.object(release,'read',side_effect=read),patch.object(release.gates,'retry',return_value={}),patch.object(release.gates,'publish_notebook'),patch.object(release,'fresh_viewer_reads',side_effect=lambda w,original:original):
   release.publish(root)
 def test_final_cohort_recheck_allows_pass_only_when_current_identities_agree(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);plan,responses,client,read=self.setup(root)
   self.run_publish(root,plan,client,read)
   report=json.loads((root/'publication-report.json').read_text())
   self.assertEqual(report['status'],'PASS');self.assertTrue(report['finalOutsideConsistency']['notebookSourceAndExecutionReceiptRechecked'])
   client.dataset_create_version.assert_not_called();client.kernels_push.assert_not_called()
 def test_late_site_hf_kaggle_or_notebook_drift_prevents_final_pass_report(self):
  for changed in ['site','hf','kaggle_default','kaggle_owner','notebook_version','notebook_source']:
   with self.subTest(changed=changed),tempfile.TemporaryDirectory() as folder:
    root=Path(folder);plan,responses,client,read=self.setup(root)
    if changed=='site':responses['site']=Mock(content=json.dumps({'sourceCommit':'e'*40}).encode())
    elif changed=='hf':responses['hf']['sha']='e'*40
    elif changed=='kaggle_default':responses['kaggle']['currentVersionNumber']=28
    elif changed=='kaggle_owner':client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':30})
    elif changed=='notebook_version':responses['notebook']['metadata']['currentVersionNumber']=14
    else:responses['notebook']['blob']['source']=json.dumps({'cells':[{'cell_type':'code','source':['print(2)'],'metadata':{}}]})
    with self.assertRaises(AssertionError):self.run_publish(root,plan,client,read)
    self.assertFalse((root/'publication-report.json').exists())
if __name__=='__main__':unittest.main()
