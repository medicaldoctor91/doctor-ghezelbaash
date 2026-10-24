"""Frozen mutable-distribution maintenance. No Zenodo write or mint operation."""
import argparse, concurrent.futures, copy, hashlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path
import requests
import coordinated_doi_release as gates
from platform_bundle import build_hf, build_kaggle, context, dump, load, sha, HF_REPO, KAGGLE_REF, DOI_POLICY
from sync_platform_machine_resources import kaggle_client, extract_package, source_metadata
from immutable_archive import verify_published_archive
from kaggle_baseline import public_baseline_state, prepare_baseline, verify_exact_public_files
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

def archive_scope(text, published=False, *, archive=None):
 if published:
  binding=archive or DOI_POLICY['currentArchive']
  boundary='The published immutable archive '+binding['doi']+' preserves source '+binding['sourceCommit']+'. Cite these updated distribution bytes by their own platform revision and website source; the archive files are unchanged.'
  for original in [
   'The exact DOI identifies this release cohort; its live availability is verified separately in publication receipts.',
   'The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.',
   'The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.',
   'Use the assigned exact DOI to cite this coordinated archive.',
   'the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.',
   'while the necessary corrected Zenodo packaging has the exact DOI and version stated above.',
   'This coordinated release uses the exact Dataset DOI stated above; subsequent maintenance must respect the archived snapshot and platform revision boundaries.']:
   text=text.replace(original,boundary)
  return text.replace('Exact release binding','Published immutable archive')
 # This maintenance does not turn a reserved DOI into a published archive.
 replacements={
 'The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.':'The exact Dataset DOI remains a reserved archive binding; this maintenance updates only site, HF, Kaggle and notebook distributions. Historical archives remain unchanged.',
 'The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.':'The Dataset DOI remains reserved; this maintenance does not publish an archive. Historical archives remain unchanged.',
 'Use the assigned exact DOI to cite this coordinated archive.':'The exact DOI is reserved and does not yet resolve to a published record; cite this distribution using its immutable platform revision.',
 'the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.':'the reserved exact DOI is an archive binding; current distribution revisions and historical records retain their own provenance.',
 'while the necessary corrected Zenodo packaging has the exact DOI and version stated above.':'while the reserved Zenodo binding has the exact DOI and version stated above; it is not published by this maintenance.'}
 for a,b in replacements.items():text=text.replace(a,b)
 return text

def scope_notebook_archive(path, *, archive_doi, archive_source_commit):
 """Scope citation prose to the actual archive without changing notebook code."""
 path=Path(path)
 if not path.is_file():return False
 assert re.fullmatch(r'10\.5281/zenodo\.\d+',archive_doi), 'Invalid archived DOI'
 assert re.fullmatch(r'[a-f0-9]{40}',archive_source_commit), 'Invalid archived source commit'
 document=load(path);executable=copy.deepcopy([cell for cell in document['cells'] if cell.get('cell_type')=='code']);changed=False
 binding={'doi':archive_doi,'sourceCommit':archive_source_commit}
 for cell in document['cells']:
  if cell.get('cell_type')!='markdown':continue
  source=cell.get('source',[]);text=source if isinstance(source,str) else ''.join(source)
  scoped=archive_scope(text,published=True,archive=binding)
  if scoped!=text:
   cell['source']=scoped if isinstance(source,str) else scoped.splitlines(keepends=True);changed=True
 assert [cell for cell in document['cells'] if cell.get('cell_type')=='code']==executable, 'Notebook executable cells changed during archive scoping'
 if changed:dump(path,document)
 return changed

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
 state=snapshot(w);assert state['hfRevision']==expected['hfRevision'];assert state['siteSource']==expected['siteSource'];assert state['notebookVersion']==expected['notebookVersion']
 kg_publication=public_baseline_state(state['kaggleOwner'],load(w/'kaggle-public-before.json'),expected['kaggleVersion'])
 # This maintenance preserves the published archive and its independent source pin.
 assert state['zenodoPublicHTTP']==200, 'Published immutable archive must be publicly available'
 archive=verify_published_archive(w/'archive-public-before',DOI_POLICY,DOI_POLICY['currentArchive']['sourceCommit'],read)
 dump(w/'archive-baseline.json',archive)
 assert load(ROOT/'dist/release-provenance.json')['sourceCommit']==os.environ['GITHUB_SHA']
 assert load(ROOT/'dist/doi-policy.json')['currentArchive']['sourceCommit']==archive['sourceCommit'], 'Website relabels the immutable archive'
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
 kg_before=w/'kaggle-before'
 kg_baseline=prepare_baseline(w,KAGGLE_REF,expected['kaggleVersion'],state['hfRevision'],load(baseline/'release-provenance.json')['sourceCommit'],read,extract_package,kg_publication)
 ctx=mutable_context(source)
 # Keep platform_bundle's resolved archive source pin; its template has no sourceCommit.
 hf=w/'hf-stage';build_hf(w/'website',baseline,hf,ctx)
 obsolete=[]
 for file in list(hf.glob('assets/guide*.json')):
  if not (w/'website'/file.relative_to(hf)).exists():obsolete.append(file.relative_to(hf).as_posix());file.unlink()
 dump(w/'removed-obsolete-assets.json',obsolete)
 for n in ['README.md']:(hf/n).write_text(archive_scope((hf/n).read_text(),published=True))
 scope_notebook_archive(hf/'starter.ipynb',archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit'])
 for n in ['current-release-matrix.json','release-attestation.json']:
  d=load(hf/n);d.update(archiveBindingStatus='published immutable archive; this maintenance changes only mutable distributions',archiveSourceCommit=archive['sourceCommit'],archivedSnapshotsUpdated=False);dump(hf/n,d)
 # CFF describes these mutable bytes by source and preserves the archive's own citation.
 import yaml
 if (hf/'CITATION.cff').exists():
  cff=yaml.safe_load((hf/'CITATION.cff').read_text());cff.pop('doi',None);cff.update(version='1.3.4+source.'+source[:12],url='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source,message='Cite this mutable distribution by its pinned platform revision and website source. Immutable archive DOI '+archive['doi']+' preserves source '+archive['sourceCommit']+'; collection DOI '+gates.P['concept']['doi']+' remains stable.')
  for ref in cff.get('references',[]):
   if ref.get('doi')==gates.P['currentArchive']['doi']:ref['title']='Published immutable archive '+gates.P['currentArchive']['packagingVersion']
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
 (kg/'README.md').write_text(archive_scope((kg/'README.md').read_text(),published=True))
 scope_notebook_archive(kg/'starter.ipynb',archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit'])
 # The archive citation remains a reference; changed mutable bytes keep their own version.
 import yaml
 cff=yaml.safe_load((kg/'CITATION.cff').read_text());cff.pop('doi',None);cff.update(version='1.3.4+kaggle.'+str(expected['kaggleVersion']+1),url='https://www.kaggle.com/datasets/'+KAGGLE_REF+'/versions/'+str(expected['kaggleVersion']+1),message='Cite this mutable distribution by its pinned Kaggle version, Hugging Face revision and website source commit. Immutable archive DOI '+archive['doi']+' preserves source '+archive['sourceCommit']+'; the collection DOI remains stable.')
 for ref in cff.get('references',[]):
  if ref.get('doi')==gates.P['currentArchive']['doi']:ref['title']='Published immutable archive '+gates.P['currentArchive']['packagingVersion']
 (kg/'CITATION.cff').write_text(yaml.safe_dump(cff,allow_unicode=True,sort_keys=False))
 seal_kg(kg)
 tables=load(hf/'viewer/packaging.json')['tables'];control.update(description=(kg/'README.md').read_text(),subtitle=', '.join(format(tables[n]['rows'],',')+' '+label for n,label in [('entity_facts','facts'),('clinical_passages','clinical passages'),('query_matrix','queries'),('clinical_answers','source-linked answers')]),userSpecifiedSources=source_metadata(control['userSpecifiedSources'],revision,source));dump(kg/'dataset-metadata.json',control)
 nb=w/'notebook';nb.mkdir();client=kaggle_client();client.kernels_pull(gates.NB,str(nb),metadata=True,quiet=True);meta=load(nb/'kernel-metadata.json');meta.update(id=gates.NB,code_file='starter.ipynb',dataset_sources=[KAGGLE_REF+'/'+str(expected['kaggleVersion']+1)],enable_internet=True);dump(nb/'kernel-metadata.json',meta);shutil.copyfile(kg/'starter.ipynb',nb/'starter.ipynb')
 scope_notebook_archive(nb/'starter.ipynb',archive_doi=archive['doi'],archive_source_commit=archive['sourceCommit'])
 assert sha(nb/'starter.ipynb')==sha(kg/'starter.ipynb'), 'Notebook citation scope differs from the pinned dataset copy'
 os.environ['RELEASE_EXECUTION_REPORT']=str(w/'local-notebook-execution.json')
 from doi_validation import validate_policy
 for folder,platform in [(hf,'hf'),(kg,'kaggle')]:
  dump(w/(platform+'-policy.json'),validate_policy(folder));subprocess.run([sys.executable,str(ROOT/'tests/validate_platform_sync.py'),str(folder),'--platform',platform,'--source-commit',source,'--report',str(w/(platform+'-validation.json'))],check=True)
 local=load(w/'local-notebook-execution.json');assert local['status']=='PASS' and local['input_checksums_sha256']==sha(kg/'checksums.sha256')
 # Preserve complete canonical data separately from the bounded recognized
 # search document; the shared helper verifies both against the final HTML.
 guard_frozen_home_projection(w)
 protected=['enrichment/instruction_examples_fa_market_positioning.jsonl','enrichment/positioning-strategy.json','enrichment/market-positioning-evidence.json']
 for name in protected:
  for folder in [w/'website',hf,kg]:assert sha(folder/name)==sha(baseline/name),('Positioning changed',folder,name)
 for name in ['enrichment/instruction_examples_fa_market_positioning.csv','viewer/positioning-examples.parquet']:
  for folder in [hf,kg]:assert sha(folder/name)==sha(baseline/name),('Protected derived positioning changed',folder,name)
 for name in inventory(ROOT/'public'):
  assert sha(w/'website'/name)==sha(ROOT/'public'/name),('Public payload modified',name)
 for folder in [w/'website',hf,kg]:assert load(folder/'doi-policy.json')['currentArchive']['sourceCommit']==archive['sourceCommit'], ('Immutable archive source changed',folder)
 plan={'candidateSchema':'mutable-distributions-3','sourceCommit':source,'hfParent':state['hfRevision'],'hfRevision':revision,'kagglePreviousVersion':expected['kaggleVersion'],'kaggleVersion':expected['kaggleVersion']+1,'notebookPreviousVersion':expected['notebookVersion'],'notebookVersion':expected['notebookVersion']+1,'sitePreviousSource':state['siteSource'],'archiveWrites':False,'archivePublicStatus':200,'archiveSourceCommit':archive['sourceCommit'],'kaggleBaselinePublication':kg_baseline}
 dump(w/'release-plan.json',plan);dump(w/'frozen-sha256.json',{**{k:inventory(w/k) for k in ['website','hf-stage','kaggle','notebook']},'controls':{n:sha(w/n) for n in ['release-plan.json','archive-baseline.json','baseline-publication-evidence.json']}});guard_frozen(w)
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

def guard_hf_git(w,plan):
 repo=w/'hf-git'
 assert gates.run(['git','rev-parse','HEAD'],cwd=repo)==plan['hfRevision'], 'Frozen HF Git commit differs from the release plan'
 assert not gates.run(['git','status','--porcelain'],cwd=repo), 'Frozen HF Git tree is dirty'
 from git_payload import validate_index
 return validate_index(repo,w/'hf-stage')

def guard_frozen_home_projection(w):
 """Recheck actual restored HTML before any publication API can write."""
 from browser_projection import validate_home_html
 home=w/'website/index.html';graph=w/'website/graph.jsonld'
 proof=validate_home_html(graph,home.read_bytes())
 proof.update(homepageSHA256=sha(home),canonicalGraphSHA256=sha(graph))
 dump(w/'frozen-home-projection.json',proof)
 return proof

def verify_final_consistency(w,plan,client):
 """Re-read public identities after slow runtime checks and before declaring success."""
 website=read(SITE+'release-provenance.json').content
 assert website==(w/'website/release-provenance.json').read_bytes(), 'Website changed before final publication verification'
 assert json.loads(website)['sourceCommit']==plan['sourceCommit'], 'Final website source differs'
 assert read('https://huggingface.co/api/datasets/'+HF_REPO).json()['sha']==plan['hfRevision'], 'HF changed before final publication verification'
 public=read('https://api.kaggle.com/v1/datasets/view/'+KAGGLE_REF).json()
 assert public['currentVersionNumber']==plan['kaggleVersion'], 'Kaggle default changed before final publication verification'
 assert not any(v['versionNumber']>plan['kaggleVersion'] for v in public.get('versions',[])), 'Newer Kaggle version appeared before final verification'
 gates.guard_owner(client,plan['kaggleVersion'])
 notebook=read('https://www.kaggle.com/api/v1/kernels/pull/'+gates.NB).json()
 saved=load(w/'notebook-live.json');assert saved['status']=='PASS', 'Verified notebook execution receipt is missing'
 gates.notebook_identity(w,notebook,saved['result']['executionEvidence'])
 return {'status':'PASS','observedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
         'sourceCommit':plan['sourceCommit'],'websiteProvenanceSHA256':hashlib.sha256(website).hexdigest(),
         'hfRevision':plan['hfRevision'],'kagglePublicAndOwnerVersion':plan['kaggleVersion'],
         'notebookVersion':plan['notebookVersion'],'notebookSourceAndExecutionReceiptRechecked':True}

def publish(w):
 plan=load(w/'release-plan.json')
 assert plan.get('candidateSchema')=='mutable-distributions-3', 'Superseded archive-citation candidate: rebuild with explicit preserved-archive notebook scope'
 assert plan['archiveWrites'] is False and plan['archivePublicStatus']==200;guard_frozen(w);assert load(w/'preflight-report.json')['status']=='PASS'
 guard_hf_git(w,plan)
 home_projection=guard_frozen_home_projection(w)
 archive=load(w/'archive-baseline.json');assert plan['archiveSourceCommit']==archive['sourceCommit']==DOI_POLICY['currentArchive']['sourceCommit']
 verify_published_archive(w/'archive-public-at-cutover',DOI_POLICY,archive['sourceCommit'],read,expected=archive,verify_bytes=False)
 state=snapshot(w/'publication-before');client=kaggle_client();assert state['siteSource'] in {plan['sitePreviousSource'],plan['sourceCommit']};assert state['hfRevision'] in {plan['hfParent'],plan['hfRevision']};assert state['kaggleOwner']['version'] in {plan['kagglePreviousVersion'],plan['kaggleVersion']}
 # All candidate bytes already validated before these first writes.
 if state['hfRevision']==plan['hfParent']:
  ask=w/'askpass.py';ask.write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.environ["HF_TOKEN"] if "password" in sys.argv[1].lower() else "hf_user")\n');ask.chmod(0o700)
  gates.run(['git','push','origin','HEAD:main'],cwd=w/'hf-git',env={**os.environ,'GIT_ASKPASS':str(ask),'GIT_TERMINAL_PROMPT':'0','GIT_LFS_SKIP_SMUDGE':'1'})
 if state['siteSource']==plan['sitePreviousSource']:subprocess.run(['npx','--yes','wrangler@4','pages','deploy',str(w/'website'),'--project-name=doctor-ghezelbaash','--branch=main','--commit-hash='+plan['sourceCommit'],'--commit-message=Validated website and mutable distribution alignment','--commit-dirty=false'],cwd=ROOT,check=True)
 gates.retry(w,'site',lambda:gates.verify_site(w),attempts=12)
 gates.retry(w,'media',lambda:verify_media(w),attempts=6)
 if state['kaggleOwner']['version']==plan['kagglePreviousVersion']:
  gates.guard_owner(client,plan['kagglePreviousVersion']);guard_frozen(w)
  # SDK consumes final metadata with this version; exactly one version write.
  response=client.dataset_create_version(str(w/'kaggle'),version_notes='Align validated website source '+plan['sourceCommit']+'; immutable HF '+plan['hfRevision']+'; preserve archive source '+archive['sourceCommit'],quiet=True,convert_to_csv=False,delete_old_versions=False,dir_mode='zip')
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
 verify_published_archive(w/'archive-public-after',DOI_POLICY,archive['sourceCommit'],read,expected=archive)
 guard_frozen(w)
 final=verify_final_consistency(w,plan,client)
 dump(w/'publication-report.json',{'status':'PASS','plan':plan,'frozenManifestSHA256':sha(w/'frozen-sha256.json'),'archiveWrites':False,'publishedArchivePreserved':True,'archivedFilesSha256Verified':len(archive['files']),'frozenHomeProjection':home_projection,'finalOutsideConsistency':final});print('MUTABLE PLATFORMS LIVE VERIFIED',flush=True)

def complete_notebook(w):
 """Only notebook may be written; independent runtime faults stay visible."""
 plan=load(w/'release-plan.json');guard_frozen(w)
 assert sha(w/'frozen-sha256.json')=='0a4eff9164fa8ba76604e2cd4588cf644b48beed0ba9084fe0eeb389dabfb5fd'
 assert plan['sourceCommit']=='bbda1167e1ed05bda5e8a600b1ad4a9547629489'
 assert plan['hfRevision']=='b3bf6162c411f924b1f70dee372e17c337397568'
 assert plan['kaggleVersion']==26 and plan['notebookVersion']==11 and plan['archiveWrites'] is False
 assert load(w/'preflight-report.json')['status']=='PASS'
 state=snapshot(w/'notebook-before');client=kaggle_client()
 assert state['siteSource']==plan['sourceCommit'] and state['hfRevision']==plan['hfRevision']
 assert state['kaggleOwner']=={'version':26,'status':'ready'} and state['kagglePublicDefault']==26
 assert state['notebookVersion'] in {10,11}
 gates.get=fresh_viewer_reads(w,gates.get)
 core={}
 core['site']=gates.verify_site(w)
 core['kaggle']=gates.verify_kaggle(w)
 core['hf']=gates.verify_hf(w,runtime_features=False)
 guard_frozen(w);dump(w/'notebook-core-preflight.json',core)
 proof=gates.publish_notebook(w,client)
 guard_frozen(w)
 dump(w/'notebook-completion-report.json',{'status':'PASS','scope':'notebook completion and core alignment; not overall runtime health','proof':proof,'frozenManifestSHA256':sha(w/'frozen-sha256.json'),'mediaDelivery':'independent canonical partial digest defect; Cloudflare Rules access denied','searchFilter':'deferred per explicit user instruction'})
 print('FROZEN NOTEBOOK COMPLETE; RUNTIME HEALTH REPORTED SEPARATELY',flush=True)

def complete_notebook_exact_version(w):
 """Complete only the reviewed notebook using every frozen exact-version public file."""
 plan=load(w/'release-plan.json');guard_frozen(w)
 assert sha(w/'frozen-sha256.json')=='82aa6b793ca90cf1027a27e454d4e41c83fb71d24c502aa862b28c25c045df05', 'Unreviewed exact-version candidate'
 assert plan['candidateSchema']=='mutable-distributions-3' and plan['archiveWrites'] is False
 assert plan['sourceCommit']=='94611168bacf7630022499204c493f6e4af64f70'
 assert plan['hfRevision']=='d5d5d17e2b4584fba2da326060f9b3202d712a1e'
 assert plan['kaggleVersion']==29 and plan['notebookVersion']==13 and plan['notebookPreviousVersion']==12
 assert load(w/'preflight-report.json')['status']=='PASS'
 state=snapshot(w/'exact-notebook-before');client=kaggle_client()
 assert state['siteSource']==plan['sourceCommit'] and state['hfRevision']==plan['hfRevision']
 assert state['kaggleOwner']=={'version':29,'status':'ready'} and state['notebookVersion'] in {12,13}
 public=load(w/'exact-notebook-before/kaggle-public-before.json')
 assert public['currentVersionNumber'] in {27,28,29}, 'Unexpected public Kaggle default'
 assert any(v['versionNumber']==29 and v.get('status','').lower()=='ready' for v in public['versions']), 'Exact version 29 is not publicly Ready'
 assert not any(v['versionNumber']>29 for v in public['versions']), 'Newer Kaggle version exists'
 website=read(SITE+'release-provenance.json').content
 assert website==(w/'website/release-provenance.json').read_bytes(), 'Live website provenance differs from candidate'
 hub=read('https://huggingface.co/datasets/'+HF_REPO+'/resolve/'+plan['hfRevision']+'/release-provenance.json').content
 assert hub==(w/'hf-stage/release-provenance.json').read_bytes(), 'Live HF provenance differs from candidate'
 assert json.loads(website)['sourceCommit']==json.loads(hub)['sourceCommit']==plan['sourceCommit']
 exact=verify_exact_public_files(w/'exact-notebook-public-files',KAGGLE_REF,29,w/'kaggle',read)
 assert exact['filesSha256Matched']==48 and exact['packageChecksumsVerified']==47
 assert exact['sourceCommit']==plan['sourceCommit'] and exact['hfRevision']==plan['hfRevision']
 archive=load(w/'archive-baseline.json')
 verify_published_archive(w/'exact-notebook-archive-before',DOI_POLICY,archive['sourceCommit'],read,expected=archive,verify_bytes=False)
 guard_frozen(w)
 assert read(SITE+'release-provenance.json').content==website, 'Website changed during exact-version verification'
 assert read('https://huggingface.co/api/datasets/'+HF_REPO).json()['sha']==plan['hfRevision'], 'HF changed during exact-version verification'
 gates.guard_owner(client,29)
 proof=gates.publish_notebook(w,client)
 guard_frozen(w)
 verify_published_archive(w/'exact-notebook-archive-after',DOI_POLICY,archive['sourceCommit'],read,expected=archive,verify_bytes=False)
 dump(w/'notebook-completion-report.json',{'status':'NOTEBOOK_VERIFIED','scope':'Reviewed notebook 13 and all exact-version 29 public input files only',
  'verificationBasis':'Complete anonymous exact-version inventory/SHA256 plus actual notebook execution; no implication that the default pointer or generated ZIP is ready',
  'fullPublicationVerified':False,'proof':proof,'exactVersionPublicFiles':exact,'observedPublicDefaultVersion':public['currentVersionNumber'],
  'frozenManifestSHA256':sha(w/'frozen-sha256.json'),'archiveWrites':False,'publishedArchivePreserved':True,
  'outstanding':{'currentDefaultAndExactDefaultZipEquality':'Not verified by this operation; full publication gate remains required',
                 'hfRuntimeSearchFilter':'Not verified by this operation; no overall runtime PASS'}})
 print('NOTEBOOK 13 AND EXACT VERSION 29 INPUTS VERIFIED; FULL PUBLICATION AND RUNTIME GATES REMAIN OUTSTANDING',flush=True)

def main():
 p=argparse.ArgumentParser();p.add_argument('operation',choices=['inspect','preflight','publish','complete-notebook','complete-notebook-exact-version']);p.add_argument('--root',type=Path,default=Path('/tmp/mutable-release'));a=p.parse_args();a.root.mkdir(exist_ok=True,parents=True)
 if a.operation=='inspect':snapshot(a.root)
 elif a.operation=='preflight':preflight(a.root,{'hfRevision':os.environ['BASELINE_HF'],'siteSource':os.environ['BASELINE_SITE'],'kaggleVersion':int(os.environ['BASELINE_KAGGLE']),'notebookVersion':int(os.environ['BASELINE_NOTEBOOK'])})
 elif a.operation=='complete-notebook':complete_notebook(a.root)
 elif a.operation=='complete-notebook-exact-version':complete_notebook_exact_version(a.root)
 else:publish(a.root)
if __name__=='__main__':main()
