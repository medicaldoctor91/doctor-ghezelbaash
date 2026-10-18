"""Publish verified maintenance corrections; all current Zenodo DOIs stay unchanged."""
import argparse, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, tempfile, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from platform_bundle import *

BASE='https://zenodo.org/api'

def download_bytes(url,attempts=30,delay=10):
    for attempt in range(attempts):
        try:
            req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'ghezelbaash-public-byte-verification/1.0'})
            with urllib.request.urlopen(req,timeout=180) as response:return response.read()
        except (urllib.error.URLError,TimeoutError):
            if attempt==attempts-1:raise
            time.sleep(delay)


def bucket_upload_command(path,url,token):
    if not url.startswith(BASE+'/files/'):raise ValueError('Untrusted Zenodo bucket')
    return ['curl','--fail-with-body','--silent','--show-error','--retry','4','--retry-all-errors',
            '--retry-delay','2','--retry-max-time','900','--connect-timeout','20','--max-time','600',
            '--speed-time','90','--speed-limit','1024','--http1.1','--expect100-timeout','5',
            '-H','Content-Type: application/zip','-H','Authorization: Bearer '+token,'--upload-file',path,url]


def publish_source_bucket(rec,changed,token):
    assert len(changed)==1 and next(iter(changed)).endswith('.zip')
    dep=f'{BASE}/deposit/depositions/{rec}'
    _,draft=request('GET',dep,token=token)
    # An already-published record retains submitted=True during an approved
    # in-place correction. Its editable draft is identified by inprogress.
    assert draft.get('state')=='inprogress','Zenodo source is not an editable correction draft'
    files_url=draft.get('links',{}).get('files') or dep+'/files'
    publish_url=draft.get('links',{}).get('publish') or dep+'/actions/publish'
    bucket=draft.get('links',{}).get('bucket','')
    assert bucket.startswith(BASE+'/files/'),'Trusted bucket is missing'
    assert files_url.startswith(dep+'/') and publish_url.startswith(dep+'/')
    _,entries=request('GET',files_url,token=token)
    entries=entries if isinstance(entries,list) else entries['entries']
    key,body=next(iter(changed.items()))
    matching=[entry for entry in entries if (entry.get('filename') or entry.get('name') or entry.get('key'))==key]
    assert len(matching)==1 and matching[0].get('id')
    request('DELETE',files_url.rstrip('/')+'/'+str(matching[0]['id']),token=token)
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'source.zip';path.write_bytes(body)
        try:
            result=subprocess.run(bucket_upload_command(str(path),bucket.rstrip('/')+'/'+urllib.parse.quote(key,safe=''),token),
                                  capture_output=True,text=True,timeout=1000)
        except subprocess.TimeoutExpired:
            raise RuntimeError('Zenodo source bucket upload exceeded its time limit') from None
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).replace(token,'[redacted]')[:1200])
        uploaded=json.loads(result.stdout)
        assert uploaded['key']==key and int(uploaded['size'])==len(body)
        assert uploaded['checksum']=='md5:'+hashlib.md5(body).hexdigest()
    request('POST',publish_url,token=token)


def request(method,url,payload=None,raw=None,token=None,allowed=(200,201,202,204),raw_response=False):
    headers={'User-Agent':'doctor-ghezelbaash-platform-convergence/1.0','Accept':'application/json',
             'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'}
    if token:headers['Authorization']='Bearer '+token
    data=None
    if raw is not None:data=raw;headers['Content-Type']='application/octet-stream'
    elif payload is not None:data=json.dumps(payload,ensure_ascii=False).encode();headers['Content-Type']='application/json'
    elif method in {'POST','PUT','PATCH'}:data=b''
    req=urllib.request.Request(url,data=data,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=180) as r:
            b=r.read();assert r.status in allowed,(method,url,r.status)
            return r.status,(json.loads(b) if not raw_response and b and 'json' in r.headers.get('Content-Type','') else b)
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='replace')
        # URLs never contain credentials; response detail is bounded and secret values redacted.
        if token:body=body.replace(token,'[redacted]')
        raise RuntimeError(f'HTTP {e.code} {method} {url}: {body[:1200]}') from e


def fetch_zenodo_files(rec,out):
    _,listing=request('GET',f'{BASE}/records/{rec}/files')
    for entry in listing['entries']:
        key=entry['key'];path=Path(out)/key;path.parent.mkdir(parents=True,exist_ok=True)
        _,body=request('GET',f'{BASE}/records/{rec}/files/{urllib.parse.quote(key,safe="")}/content',raw_response=True)
        path.write_bytes(body)
        assert hashlib.md5(body).hexdigest()==entry['checksum'].removeprefix('md5:')
    return listing['entries']


def validate(root,reader=True):
    spec=importlib.util.spec_from_file_location('acceptance','tests/validate_platform_bundle.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod.validate(root,reader=reader,rdf=True)


def correct_zenodo_record(rec,desired,token,ctx,hf_revision,source_archive=False):
    _,original=request('GET',f'{BASE}/records/{rec}',token=token)
    doi=original.get('doi') or original['pids']['doi']['identifier'];version=original['metadata'].get('version')
    _,old_files=request('GET',f'{BASE}/records/{rec}/files',token=token)
    old={e['key']:e['checksum'].removeprefix('md5:') for e in old_files['entries']}
    incoming={p.relative_to(desired).as_posix():p.read_bytes() for p in desired.rglob('*') if p.is_file()}
    assert set(incoming)==set(old),(rec,'Existing DOI file keys must stay unchanged',set(incoming)^set(old))
    assert not any(b'A5064828898' in b for name,b in incoming.items() if not name.endswith('.zip'))
    changed={k:b for k,b in incoming.items() if hashlib.md5(b).hexdigest()!=old[k]}
    if changed:
        try:
            request('GET',f'{BASE}/records/{rec}/draft',token=token)
        except RuntimeError as e:
            if 'HTTP 404' not in str(e):raise
        else:raise RuntimeError(f'Record {rec} has an existing unpublished draft; it was not overwritten')
        request('POST',f'{BASE}/records/{rec}/draft',token=token)
        published=False
        try:
            status,_=request('POST',f'{BASE}/records/{rec}/file-modification',payload={'reason':'correction',
              'comment':'Correct stale source identity and legacy retrieval bindings; preserve every existing DOI, version and filename. Align files with verified canonical source '+ctx['source_commit']+'.'},token=token)
            if status!=200:raise RuntimeError(f'Zenodo file correction for {rec} requires platform approval; no DOI was changed')
            if source_archive:
                publish_source_bucket(rec,changed,token)
            else:
                for key in changed:request('DELETE',f'{BASE}/records/{rec}/draft/files/{urllib.parse.quote(key,safe="")}',token=token)
                request('POST',f'{BASE}/records/{rec}/draft/files',payload=[{'key':k} for k in changed],token=token)
                for key,body in changed.items():
                    key=urllib.parse.quote(key,safe='')
                    request('PUT',f'{BASE}/records/{rec}/draft/files/{key}/content',raw=body,token=token)
                    request('POST',f'{BASE}/records/{rec}/draft/files/{key}/commit',token=token)
                request('POST',f'{BASE}/records/{rec}/draft/actions/publish',token=token)
            published=True
        finally:
            if not published:
                try:request('DELETE',f'{BASE}/records/{rec}/draft',token=token)
                except Exception:pass
    # Metadata keeps the original DOI/version and all original creator/license information.
    dep=f'{BASE}/deposit/depositions/{rec}';_,draft=request('GET',dep,token=token);md=draft['metadata']
    desc=md.get('description','')
    desc=desc.replace('A5064828898','A5146521397').replace('https://www.ghezelbaash.ir/graph.jsonld#dataset',DATASET)
    desc=re.sub(r'<p><strong>Publication convergence — \d{4}-\d{2}-\d{2}:</strong>.*?</p>','',desc,flags=re.S)
    desc+=('<p><strong>Publication convergence — '+ctx['maintenance_date']+':</strong> Existing DOI '+doi+' and version '+str(version)
       +' remain unchanged. This record received a documented in-place maintenance correction. Canonical OpenAlex: A5146521397; ORCID: 0009-0001-9346-8475; Wikidata: Q140287622. '
       +'Canonical dataset IRI: '+DATASET+'. Verified source commit: '+ctx['source_commit']+'. '
       +'Publication run: <a href="'+ctx['run_url']+'">'+ctx['run_url']+'</a>. '
       +'Hugging Face revision: <a href="'+ctx['hf']+'/tree/'+hf_revision+'">'+hf_revision+'</a>. '
       +'Website: <a href="'+ctx['website']+'">canonical website</a>; Kaggle: <a href="'+ctx['kaggle']+'">current distribution</a>. '
       +('The source ZIP contains the corrected current canonical source; the base source release filename/version is retained.' if source_archive else
         'Graph and query bindings use current canonical IRIs and the same bytes as the verified website/Hub resources; this is the selected 24-file preservation subset.')+'</p>')
    md['description']=desc
    related=list(md.get('related_identifiers',[]));known={r.get('identifier') for r in related}
    for u in [ctx['website'],ctx['hf']+'/tree/'+hf_revision,ctx['kaggle'],ctx['wikidata'],ctx['run_url'],
              'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+ctx['source_commit']]:
        if u not in known:related.append({'identifier':u,'scheme':'url','relation':'isSupplementTo'})
    md['related_identifiers']=related
    if draft.get('submitted'):request('POST',dep+'/actions/edit',token=token)
    request('PUT',dep,payload={'metadata':md},token=token)
    request('POST',dep+'/actions/publish',token=token)
    _,final=request('GET',f'{BASE}/records/{rec}',token=token)
    final_doi=final.get('doi') or final['pids']['doi']['identifier']
    assert final_doi==doi and final['metadata'].get('version')==version,(rec,'DOI/version changed')
    _,files=request('GET',f'{BASE}/records/{rec}/files',token=token)
    final_hashes={f['key']:f['checksum'].removeprefix('md5:') for f in files['entries']}
    assert final_hashes=={k:hashlib.md5(b).hexdigest() for k,b in incoming.items()},(rec,'Published file hashes differ')
    return {'record':rec,'doi':doi,'version':version,'files':len(incoming),'changed':len(changed),'DOI_unchanged':True}


def update_hf_org(token):
    _,org=request('GET','https://huggingface.co/api/organizations/doctor-ghezelbaash/overview')
    # Public profile API may expose details directly or under org; change only that field.
    value=org.get('details') if isinstance(org,dict) else None
    if value is None and isinstance(org,dict):value=org.get('org',{}).get('details')
    if not isinstance(value,str) or 'graph.jsonld#dataset' not in value:return {'profile':'no stale details in public overview'}
    replacement=value.replace('https://www.ghezelbaash.ir/graph.jsonld#dataset',DATASET)
    request('PUT','https://huggingface.co/api/organizations/doctor-ghezelbaash/settings',payload={'details':replacement},token=token)
    return {'profile':'canonical dataset pointer corrected'}


def main():
    assert os.environ.get('ALLOW_LEGACY_IN_PLACE_ARCHIVE_CORRECTION') == 'true', \
        'Legacy in-place archive corrections require explicit separate authorization; use scoped website/HF/Kaggle publication for a new release'
    from huggingface_hub import HfApi,CommitOperationAdd,CommitOperationDelete,hf_hub_download
    parser=argparse.ArgumentParser();parser.add_argument('--root',default='/tmp/platform-publish');args=parser.parse_args()
    root=Path(args.root);root.mkdir(parents=True,exist_ok=True)
    ctx=context(os.environ['GITHUB_SHA'],os.environ['GITHUB_RUN_ID'],os.environ.get('PUBLICATION_MAINTENANCE_DATE'))
    ctx.update(publication_scope=['hf','kaggle','zenodo_dataset','zenodo_source'],archived_snapshots_updated=True)
    dump(root/'context.json',ctx)
    token=os.environ['HF_TOKEN'];api=HfApi(token=token)
    info=api.dataset_info(HF_REPO,files_metadata=True);parent=info.sha
    if os.environ.get('EXPECTED_HF_REVISION'):
        assert parent==os.environ['EXPECTED_HF_REVISION'],'HF changed since preflight'
    _,initial_kaggle=request('GET','https://api.kaggle.com/v1/datasets/view/'+KAGGLE_REF)
    if os.environ.get('EXPECTED_KAGGLE_VERSION'):
        assert int(initial_kaggle['currentVersionNumber'])==int(os.environ['EXPECTED_KAGGLE_VERSION']),'Kaggle changed since preflight'
    baseline=root/'hf-before';baseline.mkdir(exist_ok=True)
    dist_files={p.relative_to('dist').as_posix() for p in Path('dist').rglob('*') if p.is_file()}
    needed=[s.rfilename for s in info.siblings if s.rfilename not in dist_files and not re.match(r'assets/guide(?:-meta)?\.',s.rfilename)]
    for name in needed:
        src=hf_hub_download(HF_REPO,filename=name,repo_type='dataset',revision=parent,token=token)
        dest=baseline/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
    hf=root/'hf';build_hf('dist',baseline,hf,ctx)
    # Also preserve current dataset controls such as the card's declared viewer configs.
    validate(hf)
    subprocess.run([sys.executable,'tests/validate_platform_sync.py',str(hf),'--platform','hf',
                    '--source-commit',ctx['source_commit'],'--report',str(root/'hf-validation.json')],check=True)
    print('PREPARED_HF_PASS',flush=True)
    operations=[CommitOperationAdd(path_in_repo=p.relative_to(hf).as_posix(),path_or_fileobj=str(p)) for p in hf.rglob('*') if p.is_file()]
    current={s.rfilename for s in info.siblings}
    old_assets=[n for n in current if re.match(r'assets/guide(?:-meta)?\.',n) and not (hf/n).exists()]
    operations.extend(CommitOperationDelete(path_in_repo=n) for n in old_assets)
    result=api.create_commit(HF_REPO,repo_type='dataset',revision='main',parent_commit=parent,operations=operations,
       commit_message='Restore complete reader and converge canonical provenance and query bindings',
       commit_description='Verified source '+ctx['source_commit']+'; existing Zenodo DOIs preserved. Publication '+ctx['run_url'])
    revision=result.oid;ctx['hf_revision']=revision;dump(root/'context.json',ctx)
    for name in ['graph.jsonld','provenance.jsonld','integrity-manifest.json','viewer/packaging.json']:
        live=hf_hub_download(HF_REPO,filename=name,repo_type='dataset',revision=revision,token=token,force_download=True)
        assert sha(live)==sha(hf/name),('HF live hash',name)
    print('PUBLISHED_HF',revision,flush=True)
    report={'sourceCommit':ctx['source_commit'],'publicationRun':ctx['run_url'],'hfRevision':revision}
    dump(root/'publication-report.json',report)
    try:report['hfOrg']=update_hf_org(token)
    except Exception as e:report['hfOrg']={'requires_followup':str(e)}
    # Create a current source ZIP on the existing source record, keeping its exact DOI and file key.
    source_before=root/'zenodo-source-before';entries=fetch_zenodo_files('23289009',source_before)
    assert len(entries)==1 and entries[0]['key'].endswith('.zip')
    source_after=root/'zenodo-source';key=entries[0]['key'];out=source_after/key;out.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','archive','--format=zip','--prefix=doctor-ghezelbaash-source-final-2026-10-10/','-o',str(out),'HEAD'],check=True)
    import zipfile
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        source=z.read(next(n for n in z.namelist() if n.endswith('src/canonical/source.mjs')))
        assert b'A5064828898' not in source and b'A5146521397' in source
    report['zenodoSource']=correct_zenodo_record('23289009',source_after,os.environ['ZENODO_TOKEN'],ctx,revision,True)
    dump(root/'publication-report.json',report)
    zen_before=root/'zenodo-before';fetch_zenodo_files('22838416',zen_before)
    zen=root/'zenodo';build_zenodo(hf,zen_before,zen,ctx);validate(zen,reader=False)
    report['zenodoDataset']=correct_zenodo_record('22838416',zen,os.environ['ZENODO_TOKEN'],ctx,revision)
    dump(root/'publication-report.json',report)
    print('PUBLISHED_ZENODO_SAME_DOIS',flush=True)
    # Kaggle control metadata is not part of its downloadable payload.
    previous=root/'kaggle-before';previous.mkdir(exist_ok=True)
    subprocess.run(['kaggle','datasets','download',KAGGLE_REF,'-p',str(previous),'--unzip','--force'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['kaggle','datasets','metadata',KAGGLE_REF,'-p',str(previous)],check=True,stdout=subprocess.DEVNULL)
    _,view=request('GET','https://api.kaggle.com/v1/datasets/view/'+KAGGLE_REF)
    version=int(view['currentVersionNumber'])+1
    kg=root/'kaggle';description=build_kaggle(hf,previous,kg,ctx,version,revision)
    control=load(kg/'dataset-metadata.json')
    target=dict(control.get('info') or control)
    target['id']=KAGGLE_REF
    target['description']=description
    dump(kg/'dataset-metadata.json',target)
    validate(kg,reader=False)
    subprocess.run([sys.executable,'tests/validate_platform_sync.py',str(kg),'--platform','kaggle',
                    '--source-commit',ctx['source_commit'],'--canonical-root',str(hf),
                    '--report',str(root/'kaggle-staged-validation.json')],check=True)
    subprocess.run(['kaggle','datasets','version','-p',str(kg),'-m','Converge canonical IRIs, typed provenance, release proof and complete version metadata','--dir-mode','zip'],check=True)
    final=root/'kaggle-live'
    for attempt in range(30):
        shutil.rmtree(final,ignore_errors=True);final.mkdir()
        archive=download_bytes('https://www.kaggle.com/api/v1/datasets/download/'+KAGGLE_REF+'?datasetVersionNumber='+str(version))
        import io
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            for name in zipped.namelist():assert (final/name).resolve().is_relative_to(final.resolve()),name
            assert zipped.testzip() is None
            zipped.extractall(final)
        if (final/'kaggle-manifest.json').is_file() and load(final/'kaggle-manifest.json').get('desired_kaggle_version')==version:break
        time.sleep(10)
    else:raise RuntimeError('Kaggle published package not visible yet')
    validate(final,reader=False)
    subprocess.run([sys.executable,'tests/validate_platform_sync.py',str(final),'--platform','kaggle',
                    '--source-commit',ctx['source_commit'],'--canonical-root',str(hf),
                    '--report',str(root/'kaggle-public-validation.json')],check=True)
    subprocess.run(['kaggle','datasets','metadata',KAGGLE_REF,'-p',str(kg),'--update'],check=True)
    for line in (final/'checksums.sha256').read_text().splitlines():
        digest,name=line.split('  ',1);assert sha(final/name)==digest,name
    report['kaggle']={'version':version,'files':sum(p.is_file() for p in final.rglob('*')),'query_bindings':'PASS','checksums':'PASS'}
    _,latest=request('GET',BASE+'/records/22857496/versions/latest')
    assert str(latest['id'])=='23289009','Zenodo source latest target changed unexpectedly'
    dump(root/'publication-report.json',report);print(json.dumps(report,ensure_ascii=False),flush=True)

def correct_zenodo_metadata(spec,token):
    """Edit only mutable metadata on the existing deposition; never touch file APIs."""
    record=spec['record'];url=BASE+'/records/'+record
    _,before=request('GET',url,token=token)
    assert before['revision']==spec['expected_revision'],'Zenodo revision changed since review'
    assert before['doi']==spec['doi'] and before['metadata']['version']==spec['version']
    files=lambda value:{f['key']:(f['checksum'],f['size']) for f in value['files']}
    original_files=files(before)
    dep=BASE+'/deposit/depositions/'+record
    _,draft=request('GET',dep,token=token)
    assert draft.get('submitted'),'An unpublished Zenodo draft already exists; do not overwrite it'
    md=draft['metadata'];old={k:v for k,v in md.items() if k not in {'description','related_identifiers'}}
    md['description']=spec['description']
    related=list(md.get('related_identifiers',[]));known={r['identifier'] for r in related}
    for link in ['https://www.ghezelbaash.ir/','https://www.ghezelbaash.ir/graph.jsonld',
                 'https://huggingface.co/datasets/'+HF_REPO,'https://www.kaggle.com/datasets/'+KAGGLE_REF]:
        if link not in known:related.append({'identifier':link,'scheme':'url','relation':'isSupplementTo'})
    md['related_identifiers']=related
    _,current=request('GET',url,token=token)
    assert current['revision']==before['revision'],'Zenodo metadata changed before edit'
    assert files(current)==original_files
    request('POST',dep+'/actions/edit',token=token)
    request('PUT',dep,payload={'metadata':md},token=token)
    request('POST',dep+'/actions/publish',token=token)
    _,after=request('GET',url,token=token)
    assert after['doi']==before['doi'] and after['conceptdoi']==before['conceptdoi']
    assert after['metadata']['version']==spec['version'] and files(after)==original_files
    assert after['metadata']['description']==spec['description']
    _,published=request('GET',dep,token=token)
    assert {k:v for k,v in published['metadata'].items() if k not in {'description','related_identifiers'}}==old,'Unrelated metadata changed'
    return {'record':record,'beforeRevision':before['revision'],'afterRevision':after['revision'],
            'doi':after['doi'],'version':spec['version'],'filesUnchanged':True,'metadataVerified':True}


def maintain_zenodo_metadata():
    parser=argparse.ArgumentParser();parser.add_argument('--zenodo-metadata-only',action='store_true');parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args();report={'scope':'metadata-only','newReleaseCreated':False,'newDoiCreated':False,'records':[]}
    token=os.environ.get('ZENODO_TOKEN')
    if not token:report.update(status='blocked',reason='No existing authenticated Zenodo binding is available')
    else:
        specs=load(Path(__file__).resolve().parents[2]/'src/canonical/platforms/zenodo-metadata.json')['records']
        for spec in specs:
            try:report['records'].append(correct_zenodo_metadata(spec,token))
            except (RuntimeError,AssertionError) as error:
                report['records'].append({'record':spec['record'],'status':'blocked','reason':str(error)[:1200]})
        report['status']='verified' if all(r.get('metadataVerified') for r in report['records']) else 'partial-or-blocked'
    dump(args.report,report);print(json.dumps(report),flush=True)


if __name__=='__main__':
    if '--zenodo-metadata-only' in sys.argv:maintain_zenodo_metadata()
    else:main()
