"""Frozen cross-platform release for the already reserved Zenodo record. No mint API."""
import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, sys, time, zipfile
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[2]
P=json.loads((ROOT/'src/canonical/doi-policy.json').read_text())
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
SITE='https://www.ghezelbaash.ir/'
def dump(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def get(url):
 r=requests.get(url,timeout=180,headers={'Cache-Control':'no-cache'});r.raise_for_status();return r

def inspect(work):
 assert P['currentArchive']['recordId']==23474664 and P['currentArchive']['doi']=='10.5281/zenodo.23474664'
 r=requests.get('https://zenodo.org/api/deposit/depositions/23474664',headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN']},timeout=60);r.raise_for_status();d=r.json()
 doi=d.get('doi') or d.get('metadata',{}).get('prereserve_doi',{}).get('doi')
 assert doi==P['currentArchive']['doi'] and str(d['conceptrecid'])=='18765168'
 result={'record':d['id'],'reservedDoi':doi,'submitted':d.get('submitted'),'state':d.get('state'),'files':len(d.get('files',[])),
 'siteSource':get(SITE+'release-provenance.json').json()['sourceCommit'],
 'hfRevision':get('https://huggingface.co/api/datasets/'+HF).json()['sha'],
 'kaggleVersion':get('https://api.kaggle.com/v1/datasets/view/'+KG).json()['currentVersionNumber']}
 dump(work/'inspection.json',result);print(json.dumps(result),flush=True);return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('operation',choices=['inspect','preflight']);ap.add_argument('--root',type=Path,default=Path('/tmp/coordinated-release'));a=ap.parse_args();a.root.mkdir(parents=True,exist_ok=True)
 if a.operation=='inspect':inspect(a.root)
 else:preflight(a.root)

# Source builds and publication receipts are distinct: no publication receipt is
# inserted into frozen candidate directories after this point.
def run(args,**kwargs):
 return subprocess.check_output([str(x) for x in args],text=True,**kwargs).strip()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in sorted(root.rglob('*')) if p.is_file() and '.git' not in p.relative_to(root).parts}
def check_frozen(work):
 for platform,files in json.loads((work/'frozen-sha256.json').read_text()).items():
  assert inventory(work/platform)==files, ('Frozen candidate changed',platform)
def preflight(work):
 from doi_release import prepare
 from platform_bundle import build_kaggle,context
 from sync_platform_machine_resources import extract_package,kaggle_client,source_metadata
 from doi_validation import validate_policy,validate_archive
 state=inspect(work);assert not state['submitted'] and state['hfRevision']==P['currentArchive']['inputBaselineHfRevision']
 assert state['kaggleVersion']==22
 source=os.environ['GITHUB_SHA'];os.environ['CANDIDATE_RUN_ID']='0'
 # Stable build provenance points to actual source, not a future run receipt.
 prepare(23473947,work)
 shutil.copytree(ROOT/'dist',work/'website',dirs_exist_ok=True)
 hf=work/'hf-stage';repo=work/'hf-git'
 env={**os.environ,'GIT_LFS_SKIP_SMUDGE':'1'}
 run(['git','clone','--depth','1','https://huggingface.co/datasets/'+HF,repo],env=env)
 assert run(['git','rev-parse','HEAD'],cwd=repo)==state['hfRevision']
 for file in hf.rglob('*'):
  if file.is_file():
   dest=repo/file.relative_to(hf);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,dest)
 run(['git','lfs','install','--local'],cwd=repo)
 run(['git','add','--all'],cwd=repo,env=env)
 fixed={**env,'GIT_AUTHOR_NAME':'Dataset Release Automation','GIT_AUTHOR_EMAIL':'medicaldoctor91@users.noreply.github.com','GIT_COMMITTER_NAME':'Dataset Release Automation','GIT_COMMITTER_EMAIL':'medicaldoctor91@users.noreply.github.com','GIT_AUTHOR_DATE':'2026-10-19T00:00:00Z','GIT_COMMITTER_DATE':'2026-10-19T00:00:00Z'}
 run(['git','commit','-m','Frozen DOI 23474664; source '+source],cwd=repo,env=fixed)
 revision=run(['git','rev-parse','HEAD'],cwd=repo)
 # This is the actual local Git commit object which will be pushed unchanged.
 assert run(['git','cat-file','-t',revision],cwd=repo)=='commit'
 before=work/'kaggle-before';archive=work/'kaggle-before.zip';archive.write_bytes(get('https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber=22').content);extract_package(archive,before)
 client=kaggle_client();client.dataset_metadata(KG,str(before));wrapped=json.loads((before/'dataset-metadata.json').read_text());control=dict(wrapped.get('info') or wrapped);control['id']=KG;dump(before/'dataset-metadata.json',control)
 ctx=context(source,'0',maintenance_date='2026-10-19');ctx['run_url']='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source
 kg=work/'kaggle';description=build_kaggle(hf,before,kg,ctx,23,revision)
 control['description']=description;control['userSpecifiedSources']=source_metadata(control['userSpecifiedSources'],revision,source);dump(kg/'dataset-metadata.json',control)
 notebook=work/'notebook';notebook.mkdir(exist_ok=True);client.kernels_pull(NB,str(notebook),metadata=True,quiet=True)
 public=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();nb_version=public['metadata']['currentVersionNumber']+1
 meta=json.loads((notebook/'kernel-metadata.json').read_text());meta.update(id=NB,code_file='starter.ipynb',dataset_sources=[KG+'/23'],enable_internet=True);dump(notebook/'kernel-metadata.json',meta);shutil.copyfile(kg/'starter.ipynb',notebook/'starter.ipynb')
 # Full validators execute every final notebook cell against these exact inputs.
 os.environ['RELEASE_EXECUTION_REPORT']=str(work/'local-notebook-execution.json')
 for folder,platform in [(hf,'hf'),(kg,'kaggle')]:
  dump(work/(platform+'-doi-policy.json'),validate_policy(folder))
  subprocess.run([sys.executable,str(ROOT/'tests/validate_platform_sync.py'),str(folder),'--platform',platform,'--source-commit',source,'--report',str(work/(platform+'-preflight.json'))],check=True)
 local=json.loads((work/'local-notebook-execution.json').read_text());assert local['status']=='PASS' and local['input_checksums_sha256']==sha(kg/'checksums.sha256')
 dump(work/'archive-five-union-preflight.json',validate_archive(work/'archive'))
 # All candidate overlaps are either exactly identical or explicitly projected.
 roots={'website':work/'website','hf-stage':hf,'kaggle':kg,'archive':work/'archive','notebook':notebook}
 variants={}
 for platform,folder in roots.items():
  for name,digest in inventory(folder).items():variants.setdefault(name,{})[platform]=digest
 allowed={'README.md','CITATION.cff','current-release-matrix.json','release-attestation.json','dist-sha256.json','checksums.sha256','croissant.json','datapackage.json','dcat.ttl','void.ttl','entity-facts.csv-metadata.json'}
 differences={name:items for name,items in variants.items() if len(set(items.values()))>1}
 assert set(differences)<=allowed, ('Undocumented byte differences',set(differences)-allowed)
 dump(work/'intentional-platform-differences.json',{'differences':differences,'reason':'Platform cards/receipts, immutable archive descriptors and inventories are scoped; all other shared originals are byte-identical.','identicalSharedFiles':sum(len(v)>1 and len(set(v.values()))==1 for v in variants.values())})
 dump(work/'release-plan.json',{'sourceCommit':source,'hfParent':state['hfRevision'],'hfRevision':revision,'kagglePreviousVersion':22,'kaggleVersion':23,'notebookPreviousVersion':nb_version-1,'notebookVersion':nb_version,'sitePreviousSource':state['siteSource'],'record':23474664})
 dump(work/'frozen-sha256.json',{name:inventory(folder) for name,folder in roots.items()})
 dump(work/'preflight-report.json',{'status':'PASS','draft':state,'plan':json.loads((work/'release-plan.json').read_text()),'localNotebookExecution':local,'intentionalDifferences':sorted(differences),'frozenManifestSha256':sha(work/'frozen-sha256.json'),'publicationReceiptsOutsidePayload':True})
 check_frozen(work);print('ALL PLATFORM CANDIDATES FROZEN AND VALIDATED',flush=True)

if __name__=='__main__':main()
