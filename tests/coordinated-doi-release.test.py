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
if __name__=='__main__':unittest.main()
