"""Frozen cross-platform release for the already reserved Zenodo record. No mint API."""
import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, sys, time, zipfile
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[2]
P=json.loads((ROOT/'src/canonical/doi-policy.json').read_text())
COHORT=P['coordinatedRelease']
assert COHORT['hfParent']==P['currentArchive']['inputBaselineHfRevision']
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
SITE='https://www.ghezelbaash.ir/'
def dump(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def get(url):
 r=requests.get(url,timeout=180,headers={'Cache-Control':'no-cache'});r.raise_for_status();return r

def owner_state(client):
 state=json.loads(client.dataset_status(KG,format='json(status,current_version_number)'))
 return {'version':state['current_version_number'],'status':state['status'].lower()}

def guard_owner(client,expected):
 state=owner_state(client)
 assert state=={'version':expected,'status':'ready'}, ('Kaggle authenticated owner baseline changed',state,expected)
 return state

def inspect(work):
 from sync_platform_machine_resources import kaggle_client
 client=kaggle_client();owner=owner_state(client)
 metadata=work/'owner-metadata';metadata.mkdir(exist_ok=True)
 client.dataset_metadata(KG,str(metadata))
 assert P['currentArchive']['recordId']==23474664 and P['currentArchive']['doi']=='10.5281/zenodo.23474664'
 r=requests.get('https://zenodo.org/api/deposit/depositions/23474664',headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN']},timeout=60);r.raise_for_status();d=r.json()
 doi=d.get('doi') or d.get('metadata',{}).get('prereserve_doi',{}).get('doi')
 assert doi==P['currentArchive']['doi'] and str(d['conceptrecid'])=='18765168'
 dump(work/'zenodo-owner-metadata-observation.json',d.get('metadata',{}))
 result={'record':d['id'],'reservedDoi':doi,'submitted':d.get('submitted'),'state':d.get('state'),'files':len(d.get('files',[])),
 'draftFiles':[{'name':f.get('filename') or f.get('key'),'checksum':f.get('checksum'),'bytes':f.get('filesize') or f.get('size'),'download':next((v.split('?')[0] for k,v in f.get('links',{}).items() if k in {'download','content'}),None)} for f in d.get('files',[])],
 'draftMetadataSHA256':hashlib.sha256(json.dumps(d.get('metadata',{}),sort_keys=True,ensure_ascii=False).encode()).hexdigest(),
 'siteSource':get(SITE+'release-provenance.json').json()['sourceCommit'],
 'hfRevision':get('https://huggingface.co/api/datasets/'+HF).json()['sha'],
 'kaggleOwnerVersion':owner['version'],'kaggleOwnerStatus':owner['status'],
 'kagglePublicDefaultVersion':get('https://api.kaggle.com/v1/datasets/view/'+KG).json()['currentVersionNumber']}
 dump(work/'inspection.json',result);print(json.dumps(result),flush=True);return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('operation',choices=['inspect','preflight','stage-draft','publish-frozen','verify-publication']);ap.add_argument('--root',type=Path,default=Path('/tmp/coordinated-release'));a=ap.parse_args();a.root.mkdir(parents=True,exist_ok=True)
 if a.operation=='inspect':inspect(a.root)
 elif a.operation=='preflight':preflight(a.root)
 elif a.operation=='stage-draft':
  from doi_release import stage
  require_reviewable_candidate(a.root);check_frozen(a.root)
  assert json.loads((a.root/'preflight-report.json').read_text())['status']=='PASS'
  stage(COHORT['previousZenodoRecord'],a.root);check_frozen(a.root)
 elif a.operation=='verify-publication':
  from doi_release import verify_published
  require_reviewable_candidate(a.root);check_frozen(a.root)
  verify_published(COHORT['previousZenodoRecord'],a.root)
 else:publish_all(a.root)

# Source builds and publication receipts are distinct: no publication receipt is
# inserted into frozen candidate directories after this point.
def run(args,**kwargs):
 return subprocess.check_output([str(x) for x in args],text=True,**kwargs).strip()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p) for p in sorted(root.rglob('*')) if p.is_file() and '.git' not in p.relative_to(root).parts}
CANDIDATE_SCHEMA=4
def require_reviewable_candidate(work):
 plan=json.loads((work/'release-plan.json').read_text())
 assert plan.get('candidateSchema')==CANDIDATE_SCHEMA, 'Superseded candidate: rebuild with preserved canonical data and bounded search JSON-LD'
 assert plan['sourceCommit']!='14304eb2ed06d8d87563a2979df2175407399da0', 'Rejected superseded source'
 assert plan['hfParent']==COHORT['hfParent']
 assert plan['sitePreviousSource']==COHORT['websiteBaselineCommit']
 for key,value in [('kagglePreviousVersion',COHORT['kaggleBaselineVersion']),('kaggleVersion',COHORT['kaggleTargetVersion']),('notebookPreviousVersion',COHORT['notebookBaselineVersion']),('notebookVersion',COHORT['notebookTargetVersion'])]:assert plan[key]==value, ('Frozen plan differs from reviewed cohort',key)
 return plan

def check_frozen(work):
 for platform,files in json.loads((work/'frozen-sha256.json').read_text()).items():
  actual=({name:sha(work/name) for name in files} if platform=='controls' else inventory(work/platform))
  assert actual==files, ('Frozen candidate changed',platform)
def preflight(work):
 from doi_release import prepare
 from platform_bundle import build_kaggle,context
 from sync_platform_machine_resources import extract_package,kaggle_client,source_metadata
 from doi_validation import validate_policy,validate_archive
 assert not (work/'frozen-sha256.json').exists(), 'Frozen candidate already exists; use a new work directory'
 state=inspect(work);assert not state['submitted'] and state['hfRevision']==P['currentArchive']['inputBaselineHfRevision']
 auth=requests.get('https://huggingface.co/api/whoami-v2',headers={'Authorization':'Bearer '+os.environ['HF_TOKEN']},timeout=60);auth.raise_for_status()
 cf=requests.get('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/pages/projects/doctor-ghezelbaash',headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']},timeout=60);cf.raise_for_status();assert cf.json()['success']
 dump(work/'read-only-publication-bindings.json',{'hfAuthenticated':True,'cloudflareProjectAccessible':True,'zenodoReservedDraftAccessible':True})
 assert state['kaggleOwnerVersion']==COHORT['kaggleBaselineVersion'] and state['kaggleOwnerStatus']=='ready'
 assert state['siteSource']==COHORT['websiteBaselineCommit']
 source=os.environ['GITHUB_SHA'];os.environ['CANDIDATE_RUN_ID']='0'
 # Stable build provenance points to actual source, not a future run receipt.
 prepare(COHORT['previousZenodoRecord'],work)
 shutil.copytree(ROOT/'dist',work/'website',dirs_exist_ok=True)
 hf=work/'hf-stage';repo=work/'hf-git'
 env={**os.environ,'GIT_LFS_SKIP_SMUDGE':'1'}
 run(['git','clone','--depth','1','https://huggingface.co/datasets/'+HF,repo],env=env)
 assert run(['git','rev-parse','HEAD'],cwd=repo)==state['hfRevision']
 assert '*.vcf -text' in (hf/'.gitattributes').read_text()
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
 from git_payload import validate_index
 dump(work/'hf-git-logical-bytes.json',validate_index(repo,hf))
 fixed={**env,'GIT_AUTHOR_NAME':'Dataset Release Automation','GIT_AUTHOR_EMAIL':'medicaldoctor91@users.noreply.github.com','GIT_COMMITTER_NAME':'Dataset Release Automation','GIT_COMMITTER_EMAIL':'medicaldoctor91@users.noreply.github.com','GIT_AUTHOR_DATE':'2026-10-19T00:00:00Z','GIT_COMMITTER_DATE':'2026-10-19T00:00:00Z'}
 run(['git','commit','-m','Frozen DOI 23474664; source '+source],cwd=repo,env=fixed)
 revision=run(['git','rev-parse','HEAD'],cwd=repo)
 # This is the actual local Git commit object which will be pushed unchanged.
 assert run(['git','cat-file','-t',revision],cwd=repo)=='commit'
 before=work/'kaggle-before';archive=work/'kaggle-before.zip';archive.write_bytes(get('https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber='+str(COHORT['kaggleBaselineVersion'])).content);extract_package(archive,before)
 baseline_manifest=json.loads((before/'kaggle-manifest.json').read_text())
 assert baseline_manifest['desired_kaggle_version']==COHORT['kaggleBaselineVersion'], 'Kaggle baseline ZIP version differs'
 for line in (before/'checksums.sha256').read_text().splitlines():
  digest,name=line.split('  ',1);assert sha(before/name)==digest, ('Kaggle baseline checksum',name)
 client=kaggle_client();client.dataset_metadata(KG,str(before));wrapped=json.loads((before/'dataset-metadata.json').read_text());control=dict(wrapped.get('info') or wrapped);control['id']=KG;dump(before/'dataset-metadata.json',control)
 ctx=context(source,'0',maintenance_date='2026-10-22');ctx.update(coordinated_release=True,publication_scope=['website','hf','kaggle','notebook','zenodo_dataset']);ctx['run_url']='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source
 kg=work/'kaggle';description=build_kaggle(hf,before,kg,ctx,COHORT['kaggleTargetVersion'],revision)
 control['subtitle']=', '.join([format(json.loads((hf/'viewer/packaging.json').read_text())['tables'][name]['rows'],',')+' '+label for name,label in [('entity_facts','facts'),('clinical_passages','clinical passages'),('query_matrix','queries'),('clinical_answers','source-linked answers')]])
 control['description']=description;control['userSpecifiedSources']=source_metadata(control['userSpecifiedSources'],revision,source);dump(kg/'dataset-metadata.json',control)
 notebook=work/'notebook';notebook.mkdir(exist_ok=True);client.kernels_pull(NB,str(notebook),metadata=True,quiet=True)
 public=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();nb_version=public['metadata']['currentVersionNumber']+1
 assert nb_version==COHORT['notebookTargetVersion'] and nb_version-1==COHORT['notebookBaselineVersion'], 'Public notebook baseline differs from reviewed cohort'
 meta=json.loads((notebook/'kernel-metadata.json').read_text());meta.update(id=NB,code_file='starter.ipynb',dataset_sources=[KG+'/'+str(COHORT['kaggleTargetVersion'])],enable_internet=True);dump(notebook/'kernel-metadata.json',meta);shutil.copyfile(kg/'starter.ipynb',notebook/'starter.ipynb')
 # Full validators execute every final notebook cell against these exact inputs.
 os.environ['RELEASE_EXECUTION_REPORT']=str(work/'local-notebook-execution.json')
 for folder,platform in [(hf,'hf'),(kg,'kaggle')]:
  dump(work/(platform+'-doi-policy.json'),validate_policy(folder))
  subprocess.run([sys.executable,str(ROOT/'tests/validate_platform_sync.py'),str(folder),'--platform',platform,'--source-commit',source,'--report',str(work/(platform+'-preflight.json'))],check=True)
 local=json.loads((work/'local-notebook-execution.json').read_text());assert local['status']=='PASS' and local['input_checksums_sha256']==sha(kg/'checksums.sha256')
 from candidate_contract import validate_candidate
 dump(work/'candidate-editorial-contract.json',validate_candidate(work))
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
 dump(work/'release-plan.json',{'candidateSchema':CANDIDATE_SCHEMA,'sourceCommit':source,'hfParent':state['hfRevision'],'hfRevision':revision,'kagglePreviousVersion':COHORT['kaggleBaselineVersion'],'kaggleVersion':COHORT['kaggleTargetVersion'],'notebookPreviousVersion':nb_version-1,'notebookVersion':nb_version,'sitePreviousSource':state['siteSource'],'kagglePublicDefaultAtPreflight':state['kagglePublicDefaultVersion'],'record':P['currentArchive']['recordId'],'zenodoDraftMetadataSHA256':state['draftMetadataSHA256']})
 r=requests.get('https://zenodo.org/api/deposit/depositions/23474664',headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN']},timeout=60);r.raise_for_status();md=r.json()['metadata']
 md.update(upload_type='dataset',version=P['currentArchive']['packagingVersion'],doi=P['currentArchive']['doi'],publication_date='2026-10-22')
 md['description']='<p>Public collection and latest version: <a href="'+P['concept']['url']+'">'+P['concept']['doi']+'</a>.</p><p>Exact reproducible Dataset snapshot: <a href="'+P['currentArchive']['url']+'">'+P['currentArchive']['doi']+'</a>; packaging '+P['currentArchive']['packagingVersion']+'; content baseline 1.3.4, edition 2026-10-18.</p><p>Source commit '+source+'. Frozen Hugging Face revision '+revision+'; Kaggle dataset version '+str(COHORT['kaggleTargetVersion'])+'; pinned notebook version '+str(nb_version)+'. The source commit identifies build inputs; publication/execution receipts are external and do not modify the frozen files.</p><p>The five root archive descriptors use this record’s own immutable file URLs and measured checksums. Person, Clinic and canonical Dataset IRI '+P['canonicalDatasetIri']+' are distinct from collection/archive DOI entities. Files under upstream/ retain explicitly historical input receipts; older releases retain their own immutable payloads.</p>'
 md['related_identifiers']=[{'identifier':P['concept']['doi'],'scheme':'doi','relation':'isVersionOf','resource_type':'dataset'}, {'identifier':'10.5281/zenodo.'+str(COHORT['previousZenodoRecord']),'scheme':'doi','relation':'isNewVersionOf','resource_type':'dataset'}, {'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source,'scheme':'url','relation':'isDerivedFrom','resource_type':'software'}, {'identifier':'https://huggingface.co/datasets/'+HF+'/tree/'+revision,'scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}, {'identifier':'https://www.kaggle.com/datasets/'+KG+'/versions/'+str(COHORT['kaggleTargetVersion']),'scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}, {'identifier':SITE,'scheme':'url','relation':'isDescribedBy'}, {'identifier':'https://www.kaggle.com/code/'+NB,'scheme':'url','relation':'references','resource_type':'software-computationalnotebook'}]
 dump(work/'zenodo-metadata.json',md)
 dump(work/'frozen-sha256.json',{**{name:inventory(folder) for name,folder in roots.items()},'controls':{name:sha(work/name) for name in ['zenodo-metadata.json','release-plan.json']}})
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

def validate_public_file(name,response,digest):
 assert response.status_code==200, ('Site HTTP',name,response.status_code)
 assert hashlib.sha256(response.content).hexdigest()==digest, ('Site bytes',name)
 return True

def validate_missing_route(response,expected):
 assert response.status_code==404, ('Missing route must return 404',response.status_code)
 assert response.content==expected, 'Missing route body differs from frozen 404 page'
 assert b'noindex' in response.content.lower()
 import re
 assert not re.search(rb'<link[^>]+rel=["\']canonical["\']',response.content,re.I), 'Missing route has a canonical'
 return True

def verify_site(work):
 from doi_validation import validate_policy
 expected=inventory(work/'website');live=work/'site-live';live.mkdir(exist_ok=True)
 controls={'_headers','_redirects','_routes.json','_worker.js'}
 for name in controls:
  r=requests.get(SITE+name,timeout=60);assert r.status_code==404,('Deployment control unexpectedly public',name)
  shutil.copyfile(work/'website'/name,live/name)
 public={name:digest for name,digest in expected.items() if name not in controls}
 def fetch(item):
  name,digest=item;r=requests.get(SITE+requests.utils.quote(name,safe='/'),timeout=90,headers={'Cache-Control':'no-cache'})
  validate_public_file(name,r,digest)
  target=live/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(r.content)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(fetch,public.items()))
 missing=requests.get(SITE+'__release-audit-missing-'+str(time.time_ns()),timeout=60,headers={'Cache-Control':'no-cache'})
 validate_missing_route(missing,(work/'website/404.html').read_bytes())
 source=json.loads((work/'release-plan.json').read_text())['sourceCommit']
 assert json.loads((live/'release-provenance.json').read_text())['sourceCommit']==source
 validate_policy(live)
 subprocess.run([sys.executable,str(ROOT/'tests/validate_machine_resources.py'),str(live)],check=True)
 # Test the actual five-document union independently of archive bindings.
 import rdflib
 from pyshacl import validate
 union=rdflib.Graph()
 for name,fmt in [('graph.jsonld','json-ld'),('provenance.jsonld','json-ld'),('dcat.ttl','turtle'),('void.ttl','turtle'),('croissant.json','json-ld')]:union.parse(live/name,format=fmt)
 conforms,_,report=validate(union,shacl_graph=rdflib.Graph().parse(live/'shapes.ttl',format='turtle'),advanced=True,inference='none');assert conforms,report
 return {'publicFilesDownloadedAndSha256Matched':len(public),'nonPublicDeploymentControls':{name:{'sha256':expected[name],'publicHTTP':404,'bytesSource':'frozen deployment artifact'} for name in sorted(controls)},'advancedFiveDocumentUnion':True,'sourceCommit':source}

def checked_viewer_json(response,revision,label):
 assert response.status_code==200, ('Viewer HTTP',label,response.status_code)
 assert response.headers.get('X-Revision')==revision, ('Viewer cache revision',label,response.headers.get('X-Revision'),revision)
 return response.json()

def assert_viewer_export_rows(actual,expected,config):
 assert set(actual.column_names)==set(expected.column_names), ('Viewer export fields',config)
 encode=lambda rows:json.dumps(rows,ensure_ascii=False,sort_keys=True,separators=(',',':'))
 assert encode(actual.select(expected.column_names).to_pylist())==encode(expected.to_pylist()), ('Viewer complete export rows differ',config)
 return actual.num_rows

def viewer_search_probe(expected,config):
 # Use a meaningful token actually present in the frozen table. In particular,
 # a JSON marker such as [] cannot establish that the search index works.
 probes={'clinical_passages':'ghezelbaash','clinical_answers':'ghezelbaash','entity_facts':'Patient','query_matrix':'ghezelbaash','market_positioning':'positioning'}
 query=probes[config]
 assert any(query.lower() in value.lower() for row in expected for value in row.values() if isinstance(value,str)), ('Search probe absent from frozen table',config)
 return query

def assert_viewer_result_rows(result,expected,config,label):
 assert result.get('partial') is False, ('Partial Viewer result',config,label)
 rows=result.get('rows');assert isinstance(rows,list) and rows, ('Empty Viewer result',config,label)
 encode=lambda value:json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
 for row in rows:
  index=row.get('row_idx');assert type(index) is int and 0<=index<len(expected), ('Viewer result row index',config,label,index)
  assert not row.get('truncated_cells'), ('Truncated Viewer result',config,label,index)
  assert encode(row.get('row'))==encode(expected[index]), ('Viewer result differs from frozen row',config,label,index)
 return len(rows)

def assert_viewer_preview_rows(result,expected,config):
 # /first-rows has a bounded preview schema, not the search partial flag.
 # Global truncated means the preview omits later rows; individual cells must
 # still be complete and every provided row must match its frozen row index.
 assert isinstance(result.get('truncated'),bool), ('Preview truncated flag',config)
 return assert_viewer_result_rows({**result,'partial':False},expected,config,'preview')

def verify_hf(work, runtime_features=True):
 from urllib.parse import urlencode
 plan=json.loads((work/'release-plan.json').read_text());revision=plan['hfRevision']
 assert get('https://huggingface.co/api/datasets/'+HF).json()['sha']==revision
 expected=inventory(work/'hf-stage')
 def fetch(item):
  name,digest=item;r=get('https://huggingface.co/datasets/'+HF+'/resolve/'+revision+'/'+requests.utils.quote(name,safe='/'));assert hashlib.sha256(r.content).hexdigest()==digest,('HF bytes',name)
 if not (work/'hf-bytes-verified.json').exists():
  with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,expected.items()))
  dump(work/'hf-bytes-verified.json',{'revision':revision,'files':len(expected)})
 import io,pyarrow as pa,pyarrow.parquet as pq
 base='https://datasets-server.huggingface.co/'
 def endpoint(name,params):
  return checked_viewer_json(get(base+name+'?'+urlencode(params)),revision,name)
 packaging=json.loads((work/'hf-stage/viewer/packaging.json').read_text());sizes=endpoint('size',{'dataset':HF})
 exports=endpoint('parquet',{'dataset':HF})
 assert not exports.get('failed') and not exports.get('pending') and exports.get('partial') is False, ('Viewer incomplete processing',exports)
 counts={item['config']:item['num_rows'] for item in sizes['size']['configs']}
 evidence={}
 for config,spec in packaging['tables'].items():
  assert counts[config]==spec['rows'],('Viewer row count',config,counts[config])
  shards=[x for x in exports.get('parquet_files',[]) if x.get('config')==config and x.get('split')=='train']
  assert shards,('No complete Viewer export',config)
  expected_table=pq.read_table(work/'hf-stage'/spec['file'])
  expected_rows=expected_table.to_pylist()
  actual_table=pa.concat_tables([pq.read_table(io.BytesIO(get(x['url']).content)) for x in shards])
  converted_rows=assert_viewer_export_rows(actual_table,expected_table,config)
  params={'dataset':HF,'config':config,'split':'train'}
  preview=endpoint('first-rows',params);assert preview['rows'],('Empty viewer',config)
  rows=endpoint('rows',{**params,'offset':0,'length':2});assert rows['rows']
  stats=endpoint('statistics',params);assert 'statistics' in stats
  assert_viewer_preview_rows(preview,expected_rows,config)
  assert_viewer_result_rows(rows,expected_rows,config,'rows')
  if not runtime_features:
   evidence[config]={'rows':counts[config],'completeConvertedRowsMatched':converted_rows,'responseRevisionVerified':True,'preview':True,'viewer':True,'statistics':True,'search':'deferred per user','filter':'deferred per user'}
   continue
  first=preview['rows'][0]['row'];field,value=next((k,v) for k,v in first.items() if isinstance(v,str) and v and len(v)<200)
  query=viewer_search_probe(expected_rows,config)
  search=endpoint('search',{**params,'query':query})
  search_rows=assert_viewer_result_rows(search,expected_rows,config,'search')
  quoted=value.replace("'","''")
  filtered=endpoint('filter',{**params,'where':'"'+field+'"=\''+quoted+'\''})
  filtered_rows=assert_viewer_result_rows(filtered,expected_rows,config,'filter')
  assert all(item['row'][field]==value for item in filtered['rows']), ('Viewer filter predicate',config)
  evidence[config]={'rows':counts[config],'completeConvertedRowsMatched':converted_rows,'responseRevisionVerified':True,'preview':True,'viewer':True,'search':True,'filter':True,'statistics':True,'searchProbe':query,'positiveSearchRowsVerified':search_rows,'positiveFilterRowsVerified':filtered_rows}
 return {'revision':revision,'filesSha256Matched':len(expected),'viewer':evidence}

def verify_kaggle(work):
 from sync_platform_machine_resources import extract_package,verify_public_kaggle_sources
 from doi_validation import validate_policy
 plan=json.loads((work/'release-plan.json').read_text());info=get('https://api.kaggle.com/v1/datasets/view/'+KG).json()
 dump(work/'kaggle-public-observation.json',{'publicDefaultVersion':info['currentVersionNumber'],'requiredVersion':plan['kaggleVersion'],'observedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 assert info['currentVersionNumber']==plan['kaggleVersion'], ('Kaggle public default has not converged',info['currentVersionNumber'],plan['kaggleVersion'])
 z=work/'kaggle-live.zip';z.write_bytes(get('https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber='+str(plan['kaggleVersion'])).content)
 live=work/'kaggle-live';extract_package(z,live)
 default_zip=work/'kaggle-default-live.zip';default_zip.write_bytes(get('https://www.kaggle.com/api/v1/datasets/download/'+KG).content)
 default_live=work/'kaggle-default-live';extract_package(default_zip,default_live)
 controls={'dataset-metadata.json','kernel-metadata.json'}
 expected={k:v for k,v in inventory(work/'kaggle').items() if k not in controls};assert inventory(live)==expected,'Public Kaggle ZIP differs from frozen candidate'
 assert inventory(default_live)==expected,'Public Kaggle default ZIP differs from frozen candidate'
 owner,slug=KG.split('/');r=requests.post('https://api.kaggle.com/v1/datasets.DatasetApiService/GetDatasetMetadata',json={'ownerSlug':owner,'datasetSlug':slug},timeout=60);r.raise_for_status();public=r.json();public=public.get('info') or public
 control=json.loads((work/'kaggle/dataset-metadata.json').read_text());assert public['subtitle']==control['subtitle'],'Public Kaggle subtitle differs';assert public['description'].strip()==control['description'].strip(),'Public Kaggle description differs';assert public['userSpecifiedSources']==control['userSpecifiedSources'],'Public Kaggle sources differ'
 validate_policy(live)
 return {'version':plan['kaggleVersion'],'publicMetadataVerified':True,'publicZipSha256':sha(z),'publicDefaultZipSha256':sha(default_zip),'filesSha256Matched':len(expected)}

def notebook_cells_for_comparison(notebook):
 cells=[]
 for original in notebook['cells']:
  cell=dict(original);source=cell.get('source')
  assert isinstance(source,(str,list)), 'Invalid notebook cell source'
  if isinstance(source,list):
   assert all(isinstance(line,str) for line in source), 'Invalid notebook source lines'
   cell['source']=''.join(source)
  cells.append(cell)
 return cells

def notebook_identity(work,public,evidence):
 plan=json.loads((work/'release-plan.json').read_text());blob=public['blob'];source=json.loads(blob.get('source') or blob.get('sourceNullable'))
 assert public['metadata']['currentVersionNumber']==plan['notebookVersion'],'Notebook version has not converged'
 assert notebook_cells_for_comparison(source)==notebook_cells_for_comparison(json.loads((work/'notebook/starter.ipynb').read_text())),'Public notebook source differs'
 assert evidence['status']=='PASS' and evidence['kaggle_version']==plan['kaggleVersion']
 assert evidence['upstream_revision']==plan['hfRevision'] and evidence['source_commit']==plan['sourceCommit']
 assert evidence['input_checksums_sha256']==sha(work/'kaggle/checksums.sha256')
 assert evidence['exact_doi']==P['currentArchive']['doi']
 return True

def publish_notebook(work,client):
 plan=json.loads((work/'release-plan.json').read_text());before=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();assert before['metadata']['currentVersionNumber'] in {plan['notebookPreviousVersion'],plan['notebookVersion']}
 check_frozen(work)
 if before['metadata']['currentVersionNumber']==plan['notebookPreviousVersion']:client.kernels_push(str(work/'notebook'))
 def proof():
  public=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();assert public['metadata']['currentVersionNumber']==plan['notebookVersion']
  status=str(client.kernels_status(NB).status).lower();assert 'complete' in status,status
  out=work/'notebook-execution-output';out.mkdir(exist_ok=True)
  client.kernels_output(NB,str(out),file_pattern='doi-release-execution.json',force=True,quiet=True)
  evidence=json.loads((out/'doi-release-execution.json').read_text());notebook_identity(work,public,evidence)
  after=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();notebook_identity(work,after,evidence)
  return {'version':plan['notebookVersion'],'status':status,'publicSourceVerified':True,'executionEvidence':evidence,'inputDataset':KG+'/'+str(plan['kaggleVersion'])}
 return retry(work,'notebook',proof,attempts=90)

def publish_all(work):
 global get
 from sync_platform_machine_resources import kaggle_client,correct_kaggle_sources
 from doi_release import publish as publish_zenodo,verify_staged
 plan=require_reviewable_candidate(work);check_frozen(work)
 verify_staged(work) # Server-validated archive must exist before mutable cutover.
 state=inspect(work);assert state['hfRevision'] in {plan['hfParent'],plan['hfRevision']} and state['kaggleOwnerVersion'] in {plan['kagglePreviousVersion'],plan['kaggleVersion']} and state['kaggleOwnerStatus']=='ready' and state['siteSource'] in {plan['sitePreviousSource'],plan['sourceCommit']}
 # The preflight report and checksums exist before this first payload publication.
 assert json.loads((work/'preflight-report.json').read_text())['status']=='PASS'
 askpass=work/'git-askpass.py';askpass.write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.environ["HF_TOKEN"] if "password" in sys.argv[1].lower() else "hf_user")\n');askpass.chmod(0o700)
 env={**os.environ,'GIT_ASKPASS':str(askpass),'GIT_TERMINAL_PROMPT':'0','GIT_LFS_SKIP_SMUDGE':'1'}
 assert run(['git','rev-parse','HEAD'],cwd=work/'hf-git')==plan['hfRevision']
 assert not run(['git','status','--porcelain'],cwd=work/'hf-git'), 'Frozen HF Git tree is dirty'
 if state['hfRevision']==plan['hfParent']:run(['git','push','origin','HEAD:main'],cwd=work/'hf-git',env=env)
 assert get('https://huggingface.co/api/datasets/'+HF).json()['sha']==plan['hfRevision']
 check_frozen(work)
 if state['siteSource']==plan['sitePreviousSource']:subprocess.run(['npx','--yes','wrangler@4','pages','deploy',str(work/'website'),'--project-name=doctor-ghezelbaash','--branch=main','--commit-hash='+plan['sourceCommit'],'--commit-message=Frozen DOI-policy coordinated release','--commit-dirty=false'],cwd=ROOT,check=True)
 retry(work,'site',lambda:verify_site(work),attempts=18)
 client=kaggle_client();old=json.loads((work/'kaggle-before/dataset-metadata.json').read_text())
 if state['kaggleOwnerVersion']==plan['kagglePreviousVersion']:
  # Metadata settings may have converged before an ambiguous version response.
  owner=work/'kaggle-resume-owner';owner.mkdir(exist_ok=True);client.dataset_metadata(KG,str(owner));wrapped=json.loads((owner/'dataset-metadata.json').read_text());current=dict(wrapped.get('info') or wrapped)
  frozen=json.loads((work/'kaggle/dataset-metadata.json').read_text())
  assert current['description'].strip()==old['description'].strip()
  assert current['userSpecifiedSources'] in [old['userSpecifiedSources'],frozen['userSpecifiedSources']]
  correct_kaggle_sources(client,work,current,plan['hfRevision'],plan['kagglePreviousVersion'],plan['sourceCommit'],version_guard=lambda:guard_owner(client,plan['kagglePreviousVersion']))
  guard_owner(client,plan['kagglePreviousVersion'])
  check_frozen(work)
  # Never retry a dataset version write or compensate for cache with a new version.
  result=client.dataset_create_version(str(work/'kaggle'),version_notes='Frozen DOI '+P['currentArchive']['doi']+'; validated website/HF/Parquet/notebook alignment',quiet=True,convert_to_csv=False,delete_old_versions=False,dir_mode='zip')
  dump(work/'kaggle-submission.json',{'status':str(getattr(result,'status','submitted')),'version':plan['kaggleVersion']})
 retry(work,'kaggle',lambda:verify_kaggle(work),attempts=120)
 publish_notebook(work,client)
 # User explicitly defers runtime search/filter indexing; data integrity is strict.
 from mutable_platform_release import fresh_viewer_reads,verify_media
 get=fresh_viewer_reads(work,get)
 retry(work,'media',lambda:verify_media(work),attempts=3)
 retry(work,'hf-core',lambda:verify_hf(work,runtime_features=False),attempts=3)
 dump(work/'runtime-readiness.json',{'searchFilter':'deferred per user; not an overall runtime PASS'})
 # Zenodo is published last, after every platform candidate and live user flow.
 check_frozen(work);publish_zenodo(COHORT['previousZenodoRecord'],work);check_frozen(work)
 report={'status':'PASS','sourceCommit':plan['sourceCommit'],'publicationToolCommit':os.environ['GITHUB_SHA'],'plan':plan,'frozenManifestSha256':sha(work/'frozen-sha256.json'),'noPostPublicationPayloadChanges':True,'completedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 dump(work/'coordinated-publication-report.json',report);print(json.dumps(report),flush=True)

if __name__=='__main__':main()


