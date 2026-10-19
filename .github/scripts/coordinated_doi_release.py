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
 ap=argparse.ArgumentParser();ap.add_argument('operation',choices=['inspect','preflight','publish-frozen']);ap.add_argument('--root',type=Path,default=Path('/tmp/coordinated-release'));a=ap.parse_args();a.root.mkdir(parents=True,exist_ok=True)
 if a.operation=='inspect':inspect(a.root)
 elif a.operation=='preflight':preflight(a.root)
 else:publish_all(a.root)

# Source builds and publication receipts are distinct: no publication receipt is
# inserted into frozen candidate directories after this point.
def run(args,**kwargs):
 return subprocess.check_output([str(x) for x in args],text=True,**kwargs).strip()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in sorted(root.rglob('*')) if p.is_file() and '.git' not in p.relative_to(root).parts}
def check_frozen(work):
 for platform,files in json.loads((work/'frozen-sha256.json').read_text()).items():
  actual=({name:sha(work/name) for name in files} if platform=='controls' else inventory(work/platform))
  assert actual==files, ('Frozen candidate changed',platform)
def preflight(work):
 from doi_release import prepare
 from platform_bundle import build_kaggle,context
 from sync_platform_machine_resources import extract_package,kaggle_client,source_metadata
 from doi_validation import validate_policy,validate_archive
 state=inspect(work);assert not state['submitted'] and state['hfRevision']==P['currentArchive']['inputBaselineHfRevision']
 auth=requests.get('https://huggingface.co/api/whoami-v2',headers={'Authorization':'Bearer '+os.environ['HF_TOKEN']},timeout=60);auth.raise_for_status()
 cf=requests.get('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/pages/projects/doctor-ghezelbaash',headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']},timeout=60);cf.raise_for_status();assert cf.json()['success']
 dump(work/'read-only-publication-bindings.json',{'hfAuthenticated':True,'cloudflareProjectAccessible':True,'zenodoReservedDraftAccessible':True})
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
 # Remove superseded hashed reader assets from the Git tree, preserving only
 # the current complete mirror plus explicitly declared platform resources.
 tracked=run(['git','ls-files'],cwd=repo).splitlines()
 obsolete=[]
 for name in tracked:
  if not (hf/name).exists() and name!='.gitattributes':
   assert name.startswith(('assets/guide.','assets/guide-meta.')),('Uninventoried HF resource',name)
   (repo/name).unlink();obsolete.append(name)
 dump(work/'removed-obsolete-reader-assets.json',obsolete)
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
 from archive_bundle import build_archive
 before_archive=inventory(work/'archive');before_zip=sha(work/Path(P['downloadBindings']['bundle']).name)
 build_archive(hf,work/'previous-archive',work/'rebuild'/'archive',source)
 assert inventory(work/'rebuild/archive')==before_archive,'Archive rebuild changes file bytes'
 assert sha(work/'rebuild'/Path(P['downloadBindings']['bundle']).name)==before_zip,'Archive ZIP rebuild is not reproducible'
 dump(work/'archive-reproducibility.json',{'status':'PASS','files':len(before_archive),'zipSha256':before_zip})
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
 r=requests.get('https://zenodo.org/api/deposit/depositions/23474664',headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN']},timeout=60);r.raise_for_status();md=r.json()['metadata']
 md.update(upload_type='dataset',version=P['currentArchive']['packagingVersion'],doi=P['currentArchive']['doi'])
 md['description']='<p>Public collection and latest version: <a href="'+P['concept']['url']+'">'+P['concept']['doi']+'</a>.</p><p>Exact reproducible Dataset snapshot: <a href="'+P['currentArchive']['url']+'">'+P['currentArchive']['doi']+'</a>; packaging '+P['currentArchive']['packagingVersion']+'; content baseline 1.3.4, edition 2026-10-18.</p><p>Source commit '+source+'. Frozen Hugging Face revision '+revision+'; Kaggle dataset version 23; pinned notebook version '+str(nb_version)+'. The source commit identifies build inputs; publication/execution receipts are external and do not modify the frozen files.</p><p>The five root archive descriptors use this record’s own immutable file URLs and measured checksums. Person, Clinic and canonical Dataset IRI '+P['canonicalDatasetIri']+' are distinct from collection/archive DOI entities. Files under upstream/ retain explicitly historical input receipts; older releases retain their own immutable payloads.</p>'
 md['related_identifiers']=[{'identifier':P['concept']['doi'],'scheme':'doi','relation':'isVersionOf','resource_type':'dataset'}, {'identifier':'10.5281/zenodo.23473947','scheme':'doi','relation':'isNewVersionOf','resource_type':'dataset'}, {'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source,'scheme':'url','relation':'isDerivedFrom','resource_type':'software'}, {'identifier':'https://huggingface.co/datasets/'+HF+'/tree/'+revision,'scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}, {'identifier':'https://www.kaggle.com/datasets/'+KG+'/versions/23','scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}, {'identifier':SITE,'scheme':'url','relation':'isDescribedBy'}, {'identifier':'https://www.kaggle.com/code/'+NB,'scheme':'url','relation':'references','resource_type':'software-computationalnotebook'}]
 dump(work/'zenodo-metadata.json',md)
 dump(work/'frozen-sha256.json',{**{name:inventory(folder) for name,folder in roots.items()},'controls':{'zenodo-metadata.json':sha(work/'zenodo-metadata.json')}})
 dump(work/'preflight-report.json',{'status':'PASS','draft':state,'plan':json.loads((work/'release-plan.json').read_text()),'localNotebookExecution':local,'intentionalDifferences':sorted(differences),'frozenManifestSha256':sha(work/'frozen-sha256.json'),'publicationReceiptsOutsidePayload':True})
 check_frozen(work);print('ALL PLATFORM CANDIDATES FROZEN AND VALIDATED',flush=True)



def retry(work,label,callback,attempts=60):
 last=None
 for attempt in range(attempts):
  try:
   result=callback();dump(work/(label+'-live.json'),{'status':'PASS','attempt':attempt,'result':result});return result
  except (AssertionError,requests.RequestException,ValueError,KeyError,FileNotFoundError,zipfile.BadZipFile) as error:
   last=type(error).__name__+': '+str(error)[:350];dump(work/(label+'-pending.json'),{'attempt':attempt,'status':'pending','reason':last})
   print(label+' pending '+str(attempt)+': '+last,flush=True)
   if attempt+1<attempts:time.sleep(10)
 raise RuntimeError(label+' not publicly converged: '+str(last))

def verify_site(work):
 from doi_validation import validate_policy
 expected=inventory(work/'website');live=work/'site-live';live.mkdir(exist_ok=True)
 def fetch(item):
  name,digest=item;r=get(SITE+requests.utils.quote(name,safe='/'));assert hashlib.sha256(r.content).hexdigest()==digest,('Site bytes',name)
  target=live/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(r.content)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(fetch,expected.items()))
 assert json.loads((live/'release-provenance.json').read_text())['sourceCommit']==os.environ['GITHUB_SHA']
 validate_policy(live)
 subprocess.run([sys.executable,str(ROOT/'tests/validate_machine_resources.py'),str(live)],check=True)
 # Test the actual five-document union independently of archive bindings.
 import rdflib
 from pyshacl import validate
 union=rdflib.Graph()
 for name,fmt in [('graph.jsonld','json-ld'),('provenance.jsonld','json-ld'),('dcat.ttl','turtle'),('void.ttl','turtle'),('croissant.json','json-ld')]:union.parse(live/name,format=fmt)
 conforms,_,report=validate(union,shacl_graph=rdflib.Graph().parse(live/'shapes.ttl',format='turtle'),advanced=True,inference='none');assert conforms,report
 return {'filesSha256Matched':len(expected),'advancedFiveDocumentUnion':True,'sourceCommit':os.environ['GITHUB_SHA']}

def verify_hf(work):
 from urllib.parse import urlencode
 plan=json.loads((work/'release-plan.json').read_text());revision=plan['hfRevision']
 assert get('https://huggingface.co/api/datasets/'+HF).json()['sha']==revision
 expected=inventory(work/'hf-stage')
 def fetch(item):
  name,digest=item;r=get('https://huggingface.co/datasets/'+HF+'/resolve/'+revision+'/'+requests.utils.quote(name,safe='/'));assert hashlib.sha256(r.content).hexdigest()==digest,('HF bytes',name)
 if not (work/'hf-bytes-verified.json').exists():
  with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,expected.items()))
  dump(work/'hf-bytes-verified.json',{'revision':revision,'files':len(expected)})
 packaging=json.loads((work/'hf-stage/viewer/packaging.json').read_text());sizes=get('https://datasets-server.huggingface.co/size?'+urlencode({'dataset':HF})).json()
 counts={item['config']:item['num_rows'] for item in sizes['size']['configs']}
 evidence={}
 for config,spec in packaging['tables'].items():
  assert counts[config]==spec['rows'],('Viewer row count',config,counts[config])
  params={'dataset':HF,'config':config,'split':'train'};base='https://datasets-server.huggingface.co/'
  preview=get(base+'first-rows?'+urlencode(params)).json();assert preview['rows'],('Empty viewer',config)
  rows=get(base+'rows?'+urlencode({**params,'offset':0,'length':2})).json();assert rows['rows']
  stats=get(base+'statistics?'+urlencode(params)).json();assert 'statistics' in stats
  first=preview['rows'][0]['row'];field,value=next((k,v) for k,v in first.items() if isinstance(v,str) and v and len(v)<200)
  search=get(base+'search?'+urlencode({**params,'query':value[:30]})).json();assert 'rows' in search
  quoted=value.replace("'","''")
  filtered=get(base+'filter?'+urlencode({**params,'where':'"'+field+'"=\''+quoted+'\''})).json();assert filtered['rows'],('Viewer filter',config)
  evidence[config]={'rows':counts[config],'preview':True,'viewer':True,'search':True,'filter':True,'statistics':True}
 return {'revision':revision,'filesSha256Matched':len(expected),'viewer':evidence}

def verify_kaggle(work):
 from sync_platform_machine_resources import extract_package,verify_public_kaggle_sources
 from doi_validation import validate_policy
 plan=json.loads((work/'release-plan.json').read_text());info=get('https://api.kaggle.com/v1/datasets/view/'+KG).json();assert info['currentVersionNumber']==plan['kaggleVersion']
 z=work/'kaggle-live.zip';z.write_bytes(get('https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber=23').content)
 live=work/'kaggle-live';extract_package(z,live)
 controls={'dataset-metadata.json','kernel-metadata.json'}
 expected={k:v for k,v in inventory(work/'kaggle').items() if k not in controls};assert inventory(live)==expected,'Public Kaggle ZIP differs from frozen candidate'
 owner,slug=KG.split('/');r=requests.post('https://api.kaggle.com/v1/datasets.DatasetApiService/GetDatasetMetadata',json={'ownerSlug':owner,'datasetSlug':slug},timeout=60);r.raise_for_status();public=r.json();public=public.get('info') or public
 control=json.loads((work/'kaggle/dataset-metadata.json').read_text());assert public['description'].strip()==control['description'].strip(),'Public Kaggle description differs';assert public['userSpecifiedSources']==control['userSpecifiedSources'],'Public Kaggle sources differ'
 validate_policy(live)
 return {'version':23,'publicMetadataVerified':True,'publicZipSha256':sha(z),'filesSha256Matched':len(expected)}

def notebook_identity(work,public,evidence):
 plan=json.loads((work/'release-plan.json').read_text());blob=public['blob'];source=json.loads(blob.get('source') or blob.get('sourceNullable'))
 assert public['metadata']['currentVersionNumber']==plan['notebookVersion'],'Notebook version has not converged'
 assert source['cells']==json.loads((work/'notebook/starter.ipynb').read_text())['cells'],'Public notebook source differs'
 assert evidence['status']=='PASS' and evidence['kaggle_version']==plan['kaggleVersion']
 assert evidence['upstream_revision']==plan['hfRevision'] and evidence['source_commit']==plan['sourceCommit']
 assert evidence['input_checksums_sha256']==sha(work/'kaggle/checksums.sha256')
 assert evidence['exact_doi']==P['currentArchive']['doi']
 return True

def publish_notebook(work,client):
 plan=json.loads((work/'release-plan.json').read_text());before=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();assert before['metadata']['currentVersionNumber']==plan['notebookPreviousVersion']
 check_frozen(work);client.kernels_push(str(work/'notebook'))
 def proof():
  public=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();assert public['metadata']['currentVersionNumber']==plan['notebookVersion']
  status=str(client.kernels_status(NB).status).lower();assert 'complete' in status,status
  out=work/'notebook-execution-output';out.mkdir(exist_ok=True)
  client.kernels_output(NB,str(out),file_pattern='doi-release-execution.json',force=True,quiet=True)
  evidence=json.loads((out/'doi-release-execution.json').read_text());notebook_identity(work,public,evidence)
  after=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();notebook_identity(work,after,evidence)
  return {'version':plan['notebookVersion'],'status':status,'publicSourceVerified':True,'executionEvidence':evidence,'inputDataset':KG+'/23'}
 return retry(work,'notebook',proof,attempts=90)

def publish_all(work):
 from sync_platform_machine_resources import kaggle_client,correct_kaggle_sources,guard_kaggle_version
 from doi_release import publish as publish_zenodo
 plan=json.loads((work/'release-plan.json').read_text());check_frozen(work)
 state=inspect(work);assert not state['submitted'] and state['hfRevision']==plan['hfParent'] and state['kaggleVersion']==22 and state['siteSource']==plan['sitePreviousSource']
 # The preflight report and checksums exist before this first payload publication.
 assert json.loads((work/'preflight-report.json').read_text())['status']=='PASS'
 askpass=work/'git-askpass.py';askpass.write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.environ["HF_TOKEN"] if "password" in sys.argv[1].lower() else "hf_user")\n');askpass.chmod(0o700)
 env={**os.environ,'GIT_ASKPASS':str(askpass),'GIT_TERMINAL_PROMPT':'0','GIT_LFS_SKIP_SMUDGE':'1'}
 assert run(['git','rev-parse','HEAD'],cwd=work/'hf-git')==plan['hfRevision']
 assert not run(['git','status','--porcelain'],cwd=work/'hf-git'), 'Frozen HF Git tree is dirty'
 run(['git','push','origin','HEAD:main'],cwd=work/'hf-git',env=env)
 assert get('https://huggingface.co/api/datasets/'+HF).json()['sha']==plan['hfRevision']
 check_frozen(work)
 subprocess.run(['npx','--yes','wrangler@4','pages','deploy',str(work/'website'),'--project-name=doctor-ghezelbaash','--branch=main','--commit-hash='+plan['sourceCommit'],'--commit-message=Frozen DOI-policy coordinated release','--commit-dirty=false'],cwd=ROOT,check=True)
 retry(work,'site',lambda:verify_site(work),attempts=18)
 client=kaggle_client();old=json.loads((work/'kaggle-before/dataset-metadata.json').read_text())
 correct_kaggle_sources(client,work,old,plan['hfRevision'],22,plan['sourceCommit'])
 guard_kaggle_version(get('https://api.kaggle.com/v1/datasets/view/'+KG).json(),22)
 check_frozen(work)
 # Never retry a dataset version write or compensate for cache with a new version.
 result=client.dataset_create_version(str(work/'kaggle'),version_notes='Frozen DOI 10.5281/zenodo.23474664; validated website/HF/Parquet/notebook alignment',quiet=True,convert_to_csv=False,delete_old_versions=False,dir_mode='zip')
 dump(work/'kaggle-submission.json',{'status':str(getattr(result,'status','submitted')),'version':23})
 retry(work,'kaggle',lambda:verify_kaggle(work),attempts=120)
 publish_notebook(work,client)
 retry(work,'hf',lambda:verify_hf(work),attempts=90)
 # Zenodo is published last, after every platform candidate and live user flow.
 check_frozen(work);publish_zenodo(23473947,work);check_frozen(work)
 report={'status':'PASS','sourceCommit':plan['sourceCommit'],'publicationToolCommit':os.environ['GITHUB_SHA'],'plan':plan,'frozenManifestSha256':sha(work/'frozen-sha256.json'),'noPostPublicationPayloadChanges':True,'completedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 dump(work/'coordinated-publication-report.json',report);print(json.dumps(report),flush=True)

if __name__=='__main__':main()
