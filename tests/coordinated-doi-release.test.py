"""Race and freeze guards for the actual coordinated publication path."""
import importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.github/scripts'))
import coordinated_doi_release as release
class Guards(unittest.TestCase):
 def test_old_complete_execution_cannot_match_new_notebook(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'notebook').mkdir();(root/'kaggle').mkdir()
   notebook={'cells':[{'cell_type':'code','source':['new code']} ]};release.dump(root/'notebook/starter.ipynb',notebook);(root/'kaggle/checksums.sha256').write_text('new inputs')
   plan={'notebookVersion':9,'kaggleVersion':24,'hfRevision':'a'*40,'sourceCommit':'b'*40};release.dump(root/'release-plan.json',plan)
   public={'metadata':{'currentVersionNumber':9},'blob':{'source':json.dumps(notebook)}}
   evidence={'status':'PASS','kaggle_version':23,'upstream_revision':'c'*40,'source_commit':'d'*40,'input_checksums_sha256':'old','exact_doi':'10.5281/zenodo.22838416'}
   with self.assertRaises(AssertionError):release.notebook_identity(root,public,evidence)
   evidence.update(kaggle_version=24,upstream_revision='a'*40,source_commit='b'*40,input_checksums_sha256=release.sha(root/'kaggle/checksums.sha256'),exact_doi=release.P['currentArchive']['doi'])
   self.assertTrue(release.notebook_identity(root,public,evidence))
   public['metadata']['currentVersionNumber']=8
   with self.assertRaises(AssertionError):release.notebook_identity(root,public,evidence)
 def test_owner_baseline_is_not_stale_public_default(self):
  from unittest.mock import Mock
  client=Mock();client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':23})
  self.assertEqual(release.guard_owner(client,23),{'version':23,'status':'ready'})
  for state in [{'status':'ready','current_version_number':22},{'status':'processing','current_version_number':23},{'status':'ready','current_version_number':24}]:
   client.dataset_status.return_value=json.dumps(state)
   with self.assertRaises(AssertionError):release.guard_owner(client,23)
  client.dataset_create_version.assert_not_called()
 def test_inspect_separates_authenticated_owner_and_public_default(self):
  from unittest.mock import patch,Mock
  with tempfile.TemporaryDirectory() as folder:
   client=Mock();client.dataset_status.return_value=json.dumps({'status':'ready','current_version_number':23})
   def response(url,**kwargs):
    value=({'id':23474664,'conceptrecid':'18765168','metadata':{'prereserve_doi':{'doi':'10.5281/zenodo.23474664'}},'submitted':False,'files':[]} if '/deposit/' in url else {'currentVersionNumber':22} if 'kaggle.com' in url else {'sha':release.COHORT['hfParent']} if 'huggingface.co' in url else {'sourceCommit':release.COHORT['websiteBaselineCommit']})
    result=Mock();result.json.return_value=value;return result
   with patch('sync_platform_machine_resources.kaggle_client',return_value=client),patch.object(release.requests,'get',side_effect=response),patch.dict(os.environ,{'ZENODO_TOKEN':'unit-test'}):
    state=release.inspect(Path(folder))
   self.assertEqual(state['kaggleOwnerVersion'],23)
   self.assertEqual(state['kagglePublicDefaultVersion'],22)
   self.assertEqual(state['kaggleOwnerStatus'],'ready')
   client.dataset_metadata.assert_called_once()
   client.dataset_metadata_update.assert_not_called();client.dataset_create_version.assert_not_called()
 def test_reviewed_plan_rejects_old_target_and_manifest_protects_plan(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);c=release.COHORT
   plan={'candidateSchema':3,'sourceCommit':'f'*40,'hfParent':c['hfParent'],'sitePreviousSource':c['websiteBaselineCommit'],'kagglePreviousVersion':c['kaggleBaselineVersion'],'kaggleVersion':c['kaggleTargetVersion'],'notebookPreviousVersion':c['notebookBaselineVersion'],'notebookVersion':c['notebookTargetVersion']}
   release.dump(root/'release-plan.json',plan);release.require_reviewable_candidate(root)
   release.dump(root/'frozen-sha256.json',{'controls':{'release-plan.json':release.sha(root/'release-plan.json')}});release.check_frozen(root)
   plan['kaggleVersion']=23;release.dump(root/'release-plan.json',plan)
   with self.assertRaises(AssertionError):release.require_reviewable_candidate(root)
   with self.assertRaises(AssertionError):release.check_frozen(root)
 def test_public_default_must_converge_even_when_owner_target_is_ready(self):
  from unittest.mock import patch,Mock
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);release.dump(root/'release-plan.json',{'kaggleVersion':24})
   response=Mock();response.json.return_value={'currentVersionNumber':22}
   with patch.object(release,'get',return_value=response) as read:
    with self.assertRaisesRegex(AssertionError,'public default has not converged'):release.verify_kaggle(root)
   self.assertEqual(read.call_count,1)
   self.assertEqual(json.loads((root/'kaggle-public-observation.json').read_text())['publicDefaultVersion'],22)
 def test_default_zip_cannot_remain_old_when_versioned_zip_is_correct(self):
  import io,zipfile
  from unittest.mock import patch,Mock
  def zipped(value):
   output=io.BytesIO()
   with zipfile.ZipFile(output,'w') as z:z.writestr('graph.jsonld',value)
   return output.getvalue()
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'kaggle').mkdir();(root/'kaggle/graph.jsonld').write_text('new')
   release.dump(root/'release-plan.json',{'kaggleVersion':24})
   def get(url):
    result=Mock()
    if '/view/' in url:result.json.return_value={'currentVersionNumber':24}
    else:result.content=zipped('new' if 'datasetVersionNumber=24' in url else 'old')
    return result
   with patch.object(release,'get',side_effect=get):
    with self.assertRaisesRegex(AssertionError,'default ZIP differs'):release.verify_kaggle(root)
 def test_frozen_bytes_cannot_change_after_preflight(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'candidate').mkdir();file=root/'candidate/file.txt';file.write_text('frozen');release.dump(root/'frozen-sha256.json',{'candidate':release.inventory(root/'candidate')});release.check_frozen(root);file.write_text('changed')
   with self.assertRaises(AssertionError):release.check_frozen(root)
 def test_git_normalization_is_not_a_payload_exception(self):
  import subprocess
  from git_payload import validate_index
  with tempfile.TemporaryDirectory() as folder:
   repo=Path(folder)/'git';stage=Path(folder)/'stage';repo.mkdir();stage.mkdir()
   subprocess.run(['git','init','-q',str(repo)],check=True)
   attrs='* text=auto eol=lf\n*.csv text eol=lf\n*.vcf -text\n*.parquet filter=lfs diff=lfs merge=lfs -text\n'
   (stage/'.gitattributes').write_text(attrs)
   (stage/'data.csv').write_bytes(b'a,b\r\n1,2\r\n')
   (stage/'doctor.vcf').write_bytes(b'BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD\r\n')
   (stage/'data.parquet').write_bytes(b'PAR1\x00binary\r\nPAR1')
   import shutil
   for p in stage.iterdir():shutil.copyfile(p,repo/p.name)
   subprocess.run(['git','lfs','install','--local'],cwd=repo,check=True,stdout=subprocess.DEVNULL)
   subprocess.run(['git','add','--all'],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   with self.assertRaisesRegex(AssertionError,'data.csv'):validate_index(repo,stage)
   (stage/'data.csv').write_bytes(b'a,b\n1,2\n');shutil.copyfile(stage/'data.csv',repo/'data.csv')
   subprocess.run(['git','add','--all'],cwd=repo,check=True)
   result=validate_index(repo,stage)
   self.assertEqual(result['files'],4)
   self.assertEqual(result['objects']['doctor.vcf']['bytes'],len((stage/'doctor.vcf').read_bytes()))
   self.assertEqual(result['objects']['data.parquet']['transport'],'lfs')
 def test_superseded_candidate_is_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);release.dump(root/'release-plan.json',{'sourceCommit':'14304eb2ed06d8d87563a2979df2175407399da0'})
   with self.assertRaises(AssertionError):release.require_reviewable_candidate(root)
 def test_compact_home_candidate_is_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);release.dump(root/'release-plan.json',{'candidateSchema':2,'sourceCommit':'650e0c2e9d44e44f3dba8085378bcbe218ffbb94','hfParent':release.P['currentArchive']['inputBaselineHfRevision']})
   with self.assertRaises(AssertionError):release.require_reviewable_candidate(root)
 def test_home_inline_must_preserve_entities_and_values(self):
  from browser_projection import validate_home_projection
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);graph={'@context':'https://schema.org','@graph':[{'@id':'home','@type':'WebPage','name':'اصل'},{'@id':'answer','@type':'Answer','text':'پاسخ کامل'}]};release.dump(root/'graph.jsonld',graph)
   self.assertTrue(validate_home_projection(root/'graph.jsonld',[graph],b'html')['completeCanonicalGraph'])
   for compact in [dict(graph, **{'@graph':graph['@graph'][:1]}),dict(graph, **{'@graph':[dict(graph['@graph'][0],name='changed'),graph['@graph'][1]]})]:
    with self.assertRaises(AssertionError):validate_home_projection(root/'graph.jsonld',[compact],b'html')
 def test_missing_route_is_not_literal_404_file(self):
  from types import SimpleNamespace
  body=b'<html><head><meta name="robots" content="noindex"></head></html>'
  self.assertTrue(release.validate_missing_route(SimpleNamespace(status_code=404,content=body),body))
  with self.assertRaises(AssertionError):release.validate_missing_route(SimpleNamespace(status_code=200,content=body),body)
  with self.assertRaises(AssertionError):release.validate_missing_route(SimpleNamespace(status_code=404,content=b'wrong'),body)
 def test_literal_404_file_requires_200_and_frozen_bytes(self):
  import hashlib
  from types import SimpleNamespace
  body=b'not found page';digest=hashlib.sha256(body).hexdigest()
  self.assertTrue(release.validate_public_file('404.html',SimpleNamespace(status_code=200,content=body),digest))
  for name in ['404.html','graph.jsonld']:
   with self.assertRaises(AssertionError):release.validate_public_file(name,SimpleNamespace(status_code=404,content=body),digest)
   with self.assertRaises(AssertionError):release.validate_public_file(name,SimpleNamespace(status_code=200,content=b'wrong'),digest)
 def test_real_positioning_csv_uses_lf_without_changing_rows(self):
  import csv,shutil
  from platform_bundle import sync_positioning
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'enrichment').mkdir()
   source=ROOT/'src/canonical/enrichment/instruction_examples_fa_market_positioning.jsonl'
   shutil.copyfile(source,root/'enrichment'/source.name)
   release.dump(root/'datapackage.json',{'version':'1.3.4'})
   sync_positioning(root)
   payload=root/'enrichment/instruction_examples_fa_market_positioning.csv'
   self.assertNotIn(b'\r\n',payload.read_bytes())
   with payload.open(newline='') as f:rows=list(csv.DictReader(f))
   original=[json.loads(line) for line in source.read_text().splitlines()]
   self.assertEqual(len(rows),60)
   self.assertEqual([json.loads(row['messages']) for row in rows],[row['messages'] for row in original])
if __name__=='__main__':unittest.main()

