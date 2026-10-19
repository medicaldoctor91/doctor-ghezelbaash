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
   plan={'notebookVersion':9,'kaggleVersion':23,'hfRevision':'a'*40,'sourceCommit':'b'*40};release.dump(root/'release-plan.json',plan)
   public={'metadata':{'currentVersionNumber':9},'blob':{'source':json.dumps(notebook)}}
   evidence={'status':'PASS','kaggle_version':22,'upstream_revision':'c'*40,'source_commit':'d'*40,'input_checksums_sha256':'old','exact_doi':'10.5281/zenodo.22838416'}
   with self.assertRaises(AssertionError):release.notebook_identity(root,public,evidence)
   evidence.update(kaggle_version=23,upstream_revision='a'*40,source_commit='b'*40,input_checksums_sha256=release.sha(root/'kaggle/checksums.sha256'),exact_doi=release.P['currentArchive']['doi'])
   self.assertTrue(release.notebook_identity(root,public,evidence))
   public['metadata']['currentVersionNumber']=8
   with self.assertRaises(AssertionError):release.notebook_identity(root,public,evidence)
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
