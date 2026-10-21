"""Frozen mutable-distribution maintenance. No Zenodo write or mint operation."""
import argparse, concurrent.futures, copy, hashlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path
import requests
import coordinated_doi_release as gates
from platform_bundle import build_hf, build_kaggle, context, dump, load, sha, HF_REPO, KAGGLE_REF
from sync_platform_machine_resources import kaggle_client, extract_package, source_metadata
ROOT=Path(__file__).resolve().parents[2]
SITE=gates.SITE

def read(url):
 r=requests.get(url,headers={'Cache-Control':'no-cache','Pragma':'no-cache','Accept-Encoding':'identity'},timeout=90);r.raise_for_status();return r

def inventory(root):return gates.inventory(root)
def guard_frozen(w):gates.check_frozen(w)
def owner(client):return gates.owner_state(client)
def snapshot(w):
 w.mkdir(exist_ok=True,parents=True);client=kaggle_client()
 hf=read('https://huggingface.co/api/datasets/'+HF_REPO).json();kg=read('https://api.kaggle.com/v1/datasets/view/'+KAGGLE_REF).json();nb=read('https://www.kaggle.com/api/v1/kernels/pull/'+gates.NB).json()
 state={'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'hfRevision':hf['sha'],'kaggleOwner':owner(client),'kagglePublicDefault':kg['currentVersionNumber'],'notebookVersion':nb['metadata']['currentVersionNumber'],'siteSource':read(SITE+'release-provenance.json').json()['sourceCommit']}
 (w/'owner-metadata').mkdir(exist_ok=True)
 client.dataset_metadata(KAGGLE_REF,str(w/'owner-metadata'))
 state['notebookStatus']=str(client.kernels_status(gates.NB).status)
 # GET-only archive availability; this tool contains no Zenodo mutation path.
 policy=load(ROOT/'src/canonical/doi-policy.json');record=policy['currentArchive']['recordId']
 token=os.environ.get('ZENODO_TOKEN');r=requests.get('https://zenodo.org/api/deposit/depositions/'+str(record),headers={'Authorization':'Bearer '+token} if token else {},timeout=60)
 state['zenodoOwnerHTTP']=r.status_code
 if r.status_code==200:
  d=r.json();dump(w/'zenodo-owner-before.json',d);state['zenodo']={'record':d['id'],'submitted':d.get('submitted'),'state':d.get('state'),'files':len(d.get('files',[])),'doi':d.get('doi') or d.get('metadata',{}).get('prereserve_doi',{}).get('doi')}
 r=requests.get('https://zenodo.org/api/records/'+str(record),timeout=60);state['zenodoPublicHTTP']=r.status_code
 concept=read('https://zenodo.org/api/records/'+str(policy['concept']['recordId'])).json();state['publishedConceptTarget']={'record':concept['id'],'doi':concept['doi']}
 dump(w/'inspection.json',state);dump(w/'hf-before-info.json',hf);dump(w/'notebook-before.json',nb);dump(w/'kaggle-public-before.json',kg)
 for name in ['release-provenance.json','integrity-manifest.json']:(w/('before-'+name)).write_bytes(read(SITE+name).content)
 print(json.dumps(state),flush=True);return state

def archive_scope(text):
 # This maintenance does not turn a reserved DOI into a published archive.
 replacements={
 'The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.':'The exact Dataset DOI remains a reserved archive binding; this maintenance updates only site, HF, Kaggle and notebook distributions. Historical archives remain unchanged.',
 'The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.':'The Dataset DOI remains reserved; this maintenance does not publish an archive. Historical archives remain unchanged.',
 'Use the assigned exact DOI to cite this coordinated archive.':'The exact DOI is reserved and does not yet resolve to a published record; cite this distribution using its immutable platform revision.',
 'the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.':'the reserved exact DOI is an archive binding; current distribution revisions and historical records retain their own provenance.',
 'while the necessary corrected Zenodo packaging has the exact DOI and version stated above.':'while the reserved Zenodo binding has the exact DOI and version stated above; it is not published by this maintenance.'}
 for a,b in replacements.items():text=text.replace(a,b)
 return text

def reseal_hf(stage):
 inv={n:{'bytes':(stage/n).stat().st_size,'sha256':h} for n,h in inventory(stage).items() if n!='dist-sha256.json'}
 old=load(stage/'dist-sha256.json');old['files']=inv;dump(stage/'dist-sha256.json',old)
def seal_kg(stage):
 excluded={'checksums.sha256','dataset-metadata.json','kernel-metadata.json'}
 (stage/'checksums.sha256').write_text(''.join(h+'  '+n+'\n' for n,h in inventory(stage).items() if n not in excluded))

def mutable_context(source):
 ctx=context(source,'0')
 ctx.update(coordinated_release=True,publication_scope=['website','hf','kaggle','notebook'],archived_snapshots_updated=False,run_url='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source,notebook='https://www.kaggle.com/code/'+gates.NB)
 return ctx

def preflight(w,expected):
 state=snapshot(w);assert state['hfRevision']==expected['hfRevision'];assert state['siteSource']==expected['siteSource'];assert state['kaggleOwner']=={'version':expected['kaggleVersion'],'status':'ready'};assert state['notebookVersion']==expected['notebookVersion'];assert state['kagglePublicDefault']==expected['kaggleVersion']
 # Freeze a truthful boundary: no reserve/publish/edit of the pending DOI.
 assert state['zenodoPublicHTTP']==404 and state.get('zenodo',{}).get('submitted') is False, 'Archive status changed: review DOI scope before building'
 assert load(ROOT/'dist/release-provenance.json')['sourceCommit']==os.environ['GITHUB_SHA']
 source=os.environ['GITHUB_SHA'];shutil.copytree(ROOT/'dist',w/'website')
 # Snapshot every public baseline body against the current live manifest.
 manifest=load(w/'before-integrity-manifest.json');controls={'_headers','_redirects','_worker.js','_routes.json'}
 def before_file(item):
  n,meta=item;n=n.lstrip('/')
  if n in controls:return {'path':n,'public':False,'expected':meta['sha256']}
  r=read(SITE+requests.utils.quote(n,safe='/'));assert hashlib.sha256(r.content).hexdigest()==meta['sha256'],('Baseline website changed',n)
  p=w/'site-before'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(r.content)
  return {'path':n,'sha256':sha(p),'bytes':len(r.content),'status':r.status_code,'headers':dict(r.headers)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:dump(w/'site-before-downloads.json',list(pool.map(before_file,manifest['files'].items())))
 baseline=w/'hf-before';baseline.mkdir()
 def hub_file(x):
  n=x['rfilename'];r=read('https://huggingface.co/datasets/'+HF_REPO+'/resolve/'+state['hfRevision']+'/'+requests.utils.quote(n,safe='/'));p=baseline/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(r.content)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(hub_file,load(w/'hf-before-info.json')['siblings']))
 for n,v in load(baseline/'dist-sha256.json')['files'].items():assert sha(baseline/n)==v['sha256'],('HF baseline integrity',n)
 kg_before=w/'kaggle-before';(w/'kaggle-before.zip').write_bytes(read('https://www.kaggle.com/api/v1/datasets/download/'+KAGGLE_REF+'?datasetVersionNumber='+str(expected['kaggleVersion'])).content);extract_package(w/'kaggle-before.zip',kg_before)
 for line in (kg_before/'checksums.sha256').read_text().splitlines():h,n=line.split('  ',1);assert sha(kg_before/n)==h
 assert load(kg_before/'kaggle-manifest.json')['desired_kaggle_version']==expected['kaggleVersion']
 ctx=mutable_context(source)
 # Preserve archive source metadata; mutable source provenance has its own fields.
 import platform_bundle
 platform_bundle.DOI_POLICY=load(ROOT/'src/canonical/doi-policy.json')
 hf=w/'hf-stage';build_hf(w/'website',baseline,hf,ctx)
 obsolete=[]
 for file in list(hf.glob('assets/guide*.json')):
  if not (w/'website'/file.relative_to(hf)).exists():obsolete.append(file.relative_to(hf).as_posix());file.unlink()
 dump(w/'removed-obsolete-assets.json',obsolete)
 for n in ['README.md']:(hf/n).write_text(archive_scope((hf/n).read_text()))
 for n in ['current-release-matrix.json','release-attestation.json']:
  d=load(hf/n);d.update(archiveBindingStatus='reserved, unpublished; no archive mutation in this maintenance',archivedSnapshotsUpdated=False);dump(hf/n,d)
 # CFF describes these mutable bytes by source, not a reserved archive as published.
 import yaml
 if (hf/'CITATION.cff').exists():
  cff=yaml.safe_load((hf/'CITATION.cff').read_text());cff.pop('doi',None);cff.update(version='1.3.4+source.'+source[:12],url='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source,message='Cite this mutable distribution by its pinned platform revision and website source. Exact archive DOI '+gates.P['currentArchive']['doi']+' is reserved and unpublished; collection DOI '+gates.P['concept']['doi']+' remains stable.')
  for ref in cff.get('references',[]):
   if ref.get('doi')==gates.P['currentArchive']['doi']:ref['title']='Reserved unpublished archive binding '+gates.P['currentArchive']['packagingVersion']
  (hf/'CITATION.cff').write_text(yaml.safe_dump(cff,allow_unicode=True,sort_keys=False))
 reseal_hf(hf)
 repo=w/'hf-git';env={**os.environ,'GIT_LFS_SKIP_SMUDGE':'1'}
 gates.run(['git','clone','--depth','1','https://huggingface.co/datasets/'+HF_REPO,repo],env=env);assert gates.run(['git','rev-parse','HEAD'],cwd=repo)==state['hfRevision']
 for n in gates.run(['git','ls-files'],cwd=repo).splitlines():
  if not (hf/n).exists():assert n in obsolete;(repo/n).unlink()
 shutil.copytree(hf,repo,dirs_exist_ok=True);gates.run(['git','lfs','install','--local'],cwd=repo);gates.run(['git','add','--all'],cwd=repo,env=env)
 from git_payload import validate_index
 dump(w/'hf-git-logical-bytes.json',validate_index(repo,hf))
 git_env={**env,'GIT_AUTHOR_NAME':'Dataset Release Automation','GIT_AUTHOR_EMAIL':'medicaldoctor91@users.noreply.github.com','GIT_COMMITTER_NAME':'Dataset Release Automation','GIT_COMMITTER_EMAIL':'medicaldoctor91@users.noreply.github.com'}
 gates.run(['git','commit','-m','Align website and typed datasets; source '+source],cwd=repo,env=git_env);revision=gates.run(['git','rev-parse','HEAD'],cwd=repo)
 control=load(w/'owner-metadata/dataset-metadata.json');control=dict(control.get('info') or control);control['id']=KAGGLE_REF;dump(kg_before/'dataset-metadata.json',control)
 kg=w/'kaggle';build_kaggle(hf,kg_before,kg,ctx,expected['kaggleVersion']+1,revision)
 (kg/'README.md').write_text(archive_scope((kg/'README.md').read_text()))
 # The reserved archive is a reference, not a DOI falsely assigned to changed mutable bytes.
 import yaml
 cff=yaml.safe_load((kg/'CITATION.cff').read_text());cff.pop('doi',None);cff.update(version='1.3.4+kaggle.'+str(expected['kaggleVersion']+1),url='https://www.kaggle.com/datasets/'+KAGGLE_REF+'/versions/'+str(expected['kaggleVersion']+1),message='Cite this mutable distribution by its pinned Kaggle version, Hugging Face revision and website source commit. The collection DOI is stable; the exact archive DOI is reserved and unpublished.')
 for ref in cff.get('references',[]):
  if ref.get('doi')==gates.P['currentArchive']['doi']:ref['title']='Reserved unpublished archive binding '+gates.P['currentArchive']['packagingVersion']
 (kg/'CITATION.cff').write_text(yaml.safe_dump(cff,allow_unicode=True,sort_keys=False))
 seal_kg(kg)
 tables=load(hf/'viewer/packaging.json')['tables'];control.update(description=(kg/'README.md').read_text(),subtitle=', '.join(format(tables[n]['rows'],',')+' '+label for n,label in [('entity_facts','facts'),('clinical_passages','clinical passages'),('query_matrix','queries'),('clinical_answers','source-linked answers')]),userSpecifiedSources=source_metadata(control['userSpecifiedSources'],revision,source));dump(kg/'dataset-metadata.json',control)
 nb=w/'notebook';nb.mkdir();client=kaggle_client();client.kernels_pull(gates.NB,str(nb),metadata=True,quiet=True);meta=load(nb/'kernel-metadata.json');meta.update(id=gates.NB,code_file='starter.ipynb',dataset_sources=[KAGGLE_REF+'/'+str(expected['kaggleVersion']+1)],enable_internet=True);dump(nb/'kernel-metadata.json',meta);shutil.copyfile(kg/'starter.ipynb',nb/'starter.ipynb')
 os.environ['RELEASE_EXECUTION_REPORT']=str(w/'local-notebook-execution.json')
 from doi_validation import validate_policy
 for folder,platform in [(hf,'hf'),(kg,'kaggle')]:
  dump(w/(platform+'-policy.json'),validate_policy(folder));subprocess.run([sys.executable,str(ROOT/'tests/validate_platform_sync.py'),str(folder),'--platform',platform,'--source-commit',source,'--report',str(w/(platform+'-validation.json'))],check=True)
 local=load(w/'local-notebook-execution.json');assert local['status']=='PASS' and local['input_checksums_sha256']==sha(kg/'checksums.sha256')
 # Complete inline equality is a hard invariant; source may legitimately add media triples.
 from browser_projection import validate_home_projection
 from html.parser import HTMLParser
 class Inline(HTMLParser):
  def __init__(self):super().__init__();self.blocks=[];self.active=False;self.text=''
  def handle_starttag(self,t,a):
   if t=='script' and dict(a).get('type')=='application/ld+json':self.active=True;self.text=''
  def handle_data(self,d):
   if self.active:self.text+=d
  def handle_endtag(self,t):
   if t=='script' and self.active:self.blocks.append(json.loads(self.text));self.active=False
 html=(w/'website/index.html').read_bytes();parser=Inline();parser.feed(html.decode());validate_home_projection(w/'website/graph.jsonld',parser.blocks,html)
 protected=['enrichment/instruction_examples_fa_market_positioning.jsonl','enrichment/positioning-strategy.json','enrichment/market-positioning-evidence.json']
 for name in protected:
  for folder in [w/'website',hf,kg]:assert sha(folder/name)==sha(baseline/name),('Positioning changed',folder,name)
 for name in ['enrichment/instruction_examples_fa_market_positioning.csv','viewer/positioning-examples.parquet']:
  for folder in [hf,kg]:assert sha(folder/name)==sha(baseline/name),('Protected derived positioning changed',folder,name)
 for name in inventory(ROOT/'public'):
  assert sha(w/'website'/name)==sha(ROOT/'public'/name),('Public payload modified',name)
 plan={'candidateSchema':'mutable-distributions-1','sourceCommit':source,'hfParent':state['hfRevision'],'hfRevision':revision,'kagglePreviousVersion':expected['kaggleVersion'],'kaggleVersion':expected['kaggleVersion']+1,'notebookPreviousVersion':expected['notebookVersion'],'notebookVersion':expected['notebookVersion']+1,'sitePreviousSource':state['siteSource'],'archiveWrites':False,'archivePublicStatus':404}
 dump(w/'release-plan.json',plan);dump(w/'frozen-sha256.json',{**{k:inventory(w/k) for k in ['website','hf-stage','kaggle','notebook']},'controls':{'release-plan.json':sha(w/'release-plan.json')}});guard_frozen(w)
 assert read(SITE+'release-provenance.json').json()['sourceCommit']==state['siteSource'];assert read('https://huggingface.co/api/datasets/'+HF_REPO).json()['sha']==state['hfRevision'];gates.guard_owner(client,expected['kaggleVersion'])
 dump(w/'preflight-report.json',{'status':'PASS','plan':plan,'frozenManifestSHA256':sha(w/'frozen-sha256.json'),'localExecution':local});print('MUTABLE CANDIDATE FROZEN AND VALIDATED '+sha(w/'frozen-sha256.json'),flush=True)

def verify_media(w):
 import base64
 eligibility=load(w/'website/content-digest-eligibility.json')['eligible'];out={}
 for path,meta in eligibility.items():
  if not path.endswith(('.mp4','.webm')):continue
  body=(w/'website'/path.lstrip('/')).read_bytes();full_digest='sha-256=:'+base64.b64encode(hashlib.sha256(body).digest()).decode()+':'
  r=read(SITE+path.lstrip('/'));assert r.content==body and r.headers.get('Content-Digest')==full_digest
  etag=r.headers['ETag'];checks=[]
  for suffix in ['', '?media-audit='+str(time.time_ns())]:
   for header,expected in [('bytes=0-63',body[:64]),('bytes=-17',body[-17:]),('bytes='+str(len(body)-8)+'-',body[-8:])]:
    q=requests.get(SITE+path.lstrip('/')+suffix,headers={'Range':header,'Accept-Encoding':'identity','Cache-Control':'no-cache'},timeout=60);assert q.status_code==206 and q.content==expected
    digest='sha-256=:'+base64.b64encode(hashlib.sha256(q.content).digest()).decode()+':'
    assert q.headers.get('Content-Digest')==digest,('Partial Content-Digest',path,q.headers.get('Content-Digest'),digest)
    checks.append({'status':q.status_code,'range':header,'sha256':hashlib.sha256(q.content).hexdigest(),'digest':digest,'headers':dict(q.headers)})
  for method,headers,status in [('HEAD',{},200),('GET',{'If-None-Match':etag},304),('GET',{'Range':'bytes='+str(len(body))+'-'},416)]:
   q=requests.request(method,SITE+path.lstrip('/'),headers={**headers,'Accept-Encoding':'identity','Cache-Control':'no-cache'},timeout=60);assert q.status_code==status and not q.content and q.headers.get('Content-Digest') is None,(path,method,status,q.status_code,q.headers.get('Content-Digest'))
  out[path]={'fullSHA256':meta['sha256'],'partialChecks':checks,'HEAD304416':True}
 return out

def fresh_viewer_reads(work,original):
 """Refresh Viewer API cache keys only; retain all revision/row/type gates."""
 from urllib.parse import urlsplit
 def fresh(url):
  if urlsplit(url).netloc!='datasets-server.huggingface.co':return original(url)
  token=str(time.time_ns())
  r=requests.get(url,params={'live_audit':token},headers={'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache','Accept-Encoding':'identity'},timeout=90)
  folder=Path(work)/'viewer-response-evidence';folder.mkdir(exist_ok=True)
  name=token+'-'+urlsplit(url).path.strip('/').replace('/','-')
  (folder/(name+'.body')).write_bytes(r.content)
  dump(folder/(name+'.json'),{'observedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'requestedURL':url,'finalURL':r.url,'status':r.status_code,'headers':dict(r.headers),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest()})
  r.raise_for_status();return r
 return fresh

def publish(w):
 plan=load(w/'release-plan.json');assert plan['candidateSchema']=='mutable-distributions-1' and plan['archiveWrites'] is False;guard_frozen(w);assert load(w/'preflight-report.json')['status']=='PASS'
 state=snapshot(w/'publication-before');client=kaggle_client();assert state['siteSource'] in {plan['sitePreviousSource'],plan['sourceCommit']};assert state['hfRevision'] in {plan['hfParent'],plan['hfRevision']};assert state['kaggleOwner']['version'] in {plan['kagglePreviousVersion'],plan['kaggleVersion']}
 # All candidate bytes already validated before these first writes.
 if state['hfRevision']==plan['hfParent']:
  ask=w/'askpass.py';ask.write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.environ["HF_TOKEN"] if "password" in sys.argv[1].lower() else "hf_user")\n');ask.chmod(0o700)
  gates.run(['git','push','origin','HEAD:main'],cwd=w/'hf-git',env={**os.environ,'GIT_ASKPASS':str(ask),'GIT_TERMINAL_PROMPT':'0','GIT_LFS_SKIP_SMUDGE':'1'})
 if state['siteSource']==plan['sitePreviousSource']:subprocess.run(['npx','--yes','wrangler@4','pages','deploy',str(w/'website'),'--project-name=doctor-ghezelbaash','--branch=main','--commit-hash='+plan['sourceCommit'],'--commit-message=Validated media digest and mutable distribution alignment','--commit-dirty=false'],cwd=ROOT,check=True)
 gates.retry(w,'site',lambda:gates.verify_site(w),attempts=12)
 gates.retry(w,'media',lambda:verify_media(w),attempts=6)
 if state['kaggleOwner']['version']==plan['kagglePreviousVersion']:
  gates.guard_owner(client,plan['kagglePreviousVersion']);guard_frozen(w)
  # SDK consumes final metadata with this version; exactly one version write.
  response=client.dataset_create_version(str(w/'kaggle'),version_notes='Align validated website source '+plan['sourceCommit']+'; immutable HF '+plan['hfRevision']+'; media rights and Range Content-Digest repair',quiet=True,convert_to_csv=False,delete_old_versions=False,dir_mode='zip')
  dump(w/'kaggle-submission.json',{'status':str(getattr(response,'status','submitted')),'target':plan['kaggleVersion']})
 def metadata_after_ready():
  gates.guard_owner(client,plan['kaggleVersion']);folder=w/'owner-after';folder.mkdir(exist_ok=True);client.dataset_metadata(KAGGLE_REF,str(folder));v=load(folder/'dataset-metadata.json');v=dict(v.get('info') or v);desired=load(w/'kaggle/dataset-metadata.json')
  fields=['description','subtitle','userSpecifiedSources'];changed=any(v.get(k)!=desired[k] for k in fields)
  if changed:
   assert not (w/'metadata-write-attempted.json').exists(),'Metadata write already attempted; verify owner before any retry'
   dump(w/'metadata-write-attempted.json',{'fields':fields});v.update({k:desired[k] for k in fields});dump(folder/'dataset-metadata.json',v);client.dataset_metadata_update(KAGGLE_REF,str(folder))
  return {'ownerVersion':plan['kaggleVersion'],'fields':fields,'write':changed}
 gates.retry(w,'kaggle-owner-ready',metadata_after_ready,attempts=12)
 gates.retry(w,'kaggle',lambda:gates.verify_kaggle(w),attempts=90)
 gates.publish_notebook(w,client)
 gates.get=fresh_viewer_reads(w,gates.get)
 gates.retry(w,'hf',lambda:gates.verify_hf(w),attempts=18)
 guard_frozen(w);dump(w/'publication-report.json',{'status':'PASS','plan':plan,'frozenManifestSHA256':sha(w/'frozen-sha256.json'),'archiveWrites':False});print('MUTABLE PLATFORMS LIVE VERIFIED',flush=True)

def main():
 p=argparse.ArgumentParser();p.add_argument('operation',choices=['inspect','preflight','publish']);p.add_argument('--root',type=Path,default=Path('/tmp/mutable-release'));a=p.parse_args();a.root.mkdir(exist_ok=True,parents=True)
 if a.operation=='inspect':snapshot(a.root)
 elif a.operation=='preflight':preflight(a.root,{'hfRevision':os.environ['BASELINE_HF'],'siteSource':os.environ['BASELINE_SITE'],'kaggleVersion':int(os.environ['BASELINE_KAGGLE']),'notebookVersion':int(os.environ['BASELINE_NOTEBOOK'])})
 else:publish(a.root)
if __name__=='__main__':main()
