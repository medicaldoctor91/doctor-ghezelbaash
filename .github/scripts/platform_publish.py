"""Publish verified maintenance corrections; all current Zenodo DOIs stay unchanged."""
import argparse, copy, hashlib, importlib.util, io, json, os, re, shutil, subprocess, sys, tempfile, time, zipfile
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from platform_bundle import *

BASE='https://zenodo.org/api'

def guard_hf_publication(ctx,current,expected,receipt):
    if current==expected:return False
    assert receipt and receipt.get('sourceCommit')==ctx['source_commit'] and receipt.get('publicationRun')==ctx['run_url'],'HF changed outside this publication'
    return True


def guard_kaggle_publication(ctx,current,expected,manifest,hf_revision):
    if current==expected:return False
    assert current==expected+1 and manifest,'Kaggle changed outside this publication'
    assert manifest.get('website_source_commit')==ctx['source_commit'] and manifest.get('package_publication_run_url')==ctx['run_url'],'Kaggle belongs to another publication'
    assert manifest.get('desired_kaggle_version')==current and manifest.get('upstream_revision')==hf_revision,'Kaggle revision bindings differ'
    return True


def public_kaggle_manifest(version):
    body=download_bytes('https://www.kaggle.com/api/v1/datasets/download/'+KAGGLE_REF+'?datasetVersionNumber='+str(version))
    with zipfile.ZipFile(io.BytesIO(body)) as archive:return json.loads(archive.read('kaggle-manifest.json'))


def wait_for_public_metadata(url,accept,attempts=12,delay=5):
    for attempt in range(attempts):
        try:
            separator='&' if '?' in url else '?'
            _,value=request('GET',url+separator+'_publication_verify='+str(time.time_ns()))
            if accept(value):return value
        except (RuntimeError,urllib.error.URLError,TimeoutError):
            if attempt==attempts-1:raise
        if attempt<attempts-1:time.sleep(delay)
    raise RuntimeError('Public metadata did not converge: '+url)


def zenodo_metadata_matches(final,original,expected):
    current=final.get('metadata',{});before=original['metadata']
    license_id=lambda value:value.get('id') if isinstance(value,dict) else value
    normalized=lambda value:re.sub(r'\s+',' ',value or '').strip()
    pairs=lambda items:{(entry.get('identifier'),entry.get('relation')) for entry in items}
    return (final.get('doi')==original.get('doi') and current.get('version')==before.get('version')
            and current.get('creators')==before.get('creators')
            and license_id(current.get('license'))==license_id(before.get('license'))
            and normalized(current.get('description'))==normalized(expected.get('description'))
            and pairs(expected.get('related_identifiers',[]))<=pairs(current.get('related_identifiers',[])))


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
    root=f'{BASE}/records/{rec}/draft'
    files_url=root+'/files'
    key,body=next(iter(changed.items()))
    encoded=urllib.parse.quote(key,safe='')
    request('DELETE',files_url+'/'+encoded,token=token)
    request('POST',files_url,payload=[{'key':key}],token=token)
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/'source.zip';path.write_bytes(body)
        command=['curl','--fail-with-body','--silent','--show-error','--retry','4','--retry-all-errors',
                 '--retry-delay','2','--connect-timeout','20','--max-time','600','--http1.1',
                 '-H','Content-Type: application/octet-stream','-H','Authorization: Bearer '+token,
                 '--upload-file',str(path),files_url+'/'+encoded+'/content']
        try:
            result=subprocess.run(command,capture_output=True,text=True,timeout=1000)
        except subprocess.TimeoutExpired:
            raise RuntimeError('Zenodo source bucket upload exceeded its time limit') from None
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout).replace(token,'[redacted]')[:1200])
    request('POST',files_url+'/'+encoded+'/commit',token=token)
    _,listing=request('GET',files_url,token=token)
    uploaded=next(entry for entry in listing['entries'] if entry['key']==key)
    assert int(uploaded['size'])==len(body) and uploaded['checksum']=='md5:'+hashlib.md5(body).hexdigest()
    request('POST',root+'/actions/publish',token=token)


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


def build_zenodo_metadata(metadata,doi,ctx,hf_revision,source_archive=False):
    md=copy.deepcopy(metadata)
    desc=md.get('description','').replace('A5064828898','A5146521397')
    desc=desc.replace('https://www.ghezelbaash.ir/graph.jsonld#dataset',DATASET)
    desc=re.sub(r'<p><strong>Archive and current-distribution scope:</strong>.*?</p>','',desc,flags=re.S)
    desc=re.sub(r'<p><strong>Publication convergence — \d{4}-\d{2}-\d{2}:</strong>.*?</p>','',desc,flags=re.S)
    desc=desc.replace('This record preserves a fixed 24-file research-data snapshot',
                      'This DOI identifies a selected 24-file research-data distribution with documented in-place maintenance')
    current_hf=ctx['hf']+'/tree/'+hf_revision
    current_source='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+ctx['source_commit']
    desc+=('<p><strong>Publication convergence — '+ctx['maintenance_date']+':</strong> Existing DOI '+doi
       +' and version '+str(md.get('version'))+' remain unchanged. This record received a documented in-place maintenance correction. '
       +'Canonical OpenAlex: A5146521397; ORCID: 0009-0001-9346-8475; Wikidata: Q140287622. '
       +'Canonical dataset IRI: '+DATASET+'. Verified source commit: '+ctx['source_commit']+'. '
       +'Publication run: <a href="'+ctx['run_url']+'">'+ctx['run_url']+'</a>. '
       +'Hugging Face revision: <a href="'+current_hf+'">'+hf_revision+'</a>. '
       +'Website: <a href="'+ctx['website']+'">canonical website</a>; Kaggle: <a href="'+ctx['kaggle']+'">current distribution</a>. '
       +('The source ZIP contains the corrected current canonical source; its existing filename/version is retained. ' if source_archive else
         'This is the selected 24-file dataset distribution; its matching resources share the verified website/Hub bytes. ')
       +'Dataset DOI: <a href="'+ctx['zenodo_dataset']+'">'+ctx['zenodo_dataset']+'</a>; '
       +'website-source DOI: <a href="'+ctx['zenodo_source']+'">'+ctx['zenodo_source']+'</a>. '
       +'The concept DOI 10.5281/zenodo.18765168 is a release-family pointer and may resolve to a website-source record; use the explicit dataset DOI when citing data. '
       +'Earlier pinned source/Hub links in the related identifiers are historical references, not the current maintenance state.</p>')
    md['description']=desc
    related=md.get('related_identifiers',[])
    current={current_hf,current_source,ctx['run_url']}
    prefixes=(ctx['hf']+'/tree/','https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/',
              'https://github.com/medicaldoctor91/doctor-ghezelbaash/actions/runs/')
    for entry in related:
        identifier=entry.get('identifier','')
        if identifier.startswith(prefixes) and identifier not in current:entry['relation']='references'
    known={entry.get('identifier') for entry in related}
    for url in [ctx['website'],current_hf,ctx['kaggle'],ctx['wikidata'],ctx['run_url'],current_source]:
        if url not in known:
            related.append({'identifier':url,'scheme':'url','relation':'isSupplementTo'})
            known.add(url)
    md['related_identifiers']=related
    return md


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
    # Preserve creator/license fields while producing one unambiguous current receipt.
    dep=f'{BASE}/deposit/depositions/{rec}';_,draft=request('GET',dep,token=token)
    md=build_zenodo_metadata(draft['metadata'],doi,ctx,hf_revision,source_archive)
    if draft.get('submitted'):request('POST',dep+'/actions/edit',token=token)
    request('PUT',dep,payload={'metadata':md},token=token)
    request('POST',dep+'/actions/publish',token=token)
    final=wait_for_public_metadata(f'{BASE}/records/{rec}',lambda value:zenodo_metadata_matches(value,original,md))
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
    from huggingface_hub import HfApi,CommitOperationAdd,CommitOperationDelete,hf_hub_download
    parser=argparse.ArgumentParser();parser.add_argument('--root',default='/tmp/platform-publish');args=parser.parse_args()
    root=Path(args.root);root.mkdir(parents=True,exist_ok=True)
    ctx=context(os.environ['GITHUB_SHA'],os.environ['GITHUB_RUN_ID'],os.environ.get('PUBLICATION_MAINTENANCE_DATE'))
    if os.environ.get('WEBSITE_PUBLICATION_RUN_URL'):ctx['website_publication_run_url']=os.environ['WEBSITE_PUBLICATION_RUN_URL']
    dump(root/'context.json',ctx)
    token=os.environ['HF_TOKEN'];api=HfApi(token=token)
    info=api.dataset_info(HF_REPO,files_metadata=True);parent=info.sha
    hf_resume=False
    if os.environ.get('EXPECTED_HF_REVISION'):
        receipt=None
        if parent!=os.environ['EXPECTED_HF_REVISION']:
            receipt=load(hf_hub_download(HF_REPO,filename='release-attestation.json',repo_type='dataset',revision=parent,token=token))
        hf_resume=guard_hf_publication(ctx,parent,os.environ['EXPECTED_HF_REVISION'],receipt)
    _,initial_kaggle=request('GET','https://www.kaggle.com/api/v1/datasets/view/'+KAGGLE_REF)
    kaggle_resume=False
    if os.environ.get('EXPECTED_KAGGLE_VERSION'):
        current=int(initial_kaggle['currentVersionNumber']);expected=int(os.environ['EXPECTED_KAGGLE_VERSION'])
        manifest=public_kaggle_manifest(current) if current!=expected else None
        kaggle_resume=guard_kaggle_publication(ctx,current,expected,manifest,parent)
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
    if hf_resume:
        assert sha(hf/'dist-sha256.json')==sha(baseline/'dist-sha256.json'),'Previously published HF bytes differ from this exact candidate'
        revision=parent
    else:
        result=api.create_commit(HF_REPO,repo_type='dataset',revision='main',parent_commit=parent,operations=operations,
           commit_message='Align canonical DOI roles, release metadata and measured dataset counts',
           commit_description='Verified source '+ctx['source_commit']+'; existing Zenodo DOIs preserved. Publication '+ctx['run_url'])
        revision=result.oid
    ctx['hf_revision']=revision;dump(root/'context.json',ctx)
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
    _,view=request('GET','https://www.kaggle.com/api/v1/datasets/view/'+KAGGLE_REF)
    version=int(view['currentVersionNumber'])+(0 if kaggle_resume else 1)
    kg=root/'kaggle';description=build_kaggle(hf,previous,kg,ctx,version,revision)
    control=load(kg/'dataset-metadata.json')
    target=kaggle_control_metadata(control,load(hf/'viewer/packaging.json')['tables'],description,ctx,revision)
    dump(kg/'dataset-metadata.json',target)
    validate(kg,reader=False)
    subprocess.run([sys.executable,'tests/validate_platform_sync.py',str(kg),'--platform','kaggle',
                    '--source-commit',ctx['source_commit'],'--canonical-root',str(hf),
                    '--report',str(root/'kaggle-staged-validation.json')],check=True)
    if kaggle_resume:
        assert (kg/'checksums.sha256').read_bytes()==(previous/'checksums.sha256').read_bytes(),'Previously published Kaggle bytes differ from this exact candidate'
    else:
        subprocess.run(['kaggle','datasets','version','-p',str(kg),'-m','Align DOI roles, release metadata and measured dataset counts','--dir-mode','zip'],check=True)
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
    public_metadata=wait_for_public_metadata('https://www.kaggle.com/api/v1/datasets/view/'+KAGGLE_REF,
        lambda value:value.get('currentVersionNumber')==version and value.get('subtitle')==target['subtitle']
                     and value.get('description','').strip()==target['description'].strip())
    for line in (final/'checksums.sha256').read_text().splitlines():
        digest,name=line.split('  ',1);assert sha(final/name)==digest,name
    report['kaggle']={'version':version,'files':sum(p.is_file() for p in final.rglob('*')),'query_bindings':'PASS','checksums':'PASS'}
    _,latest=request('GET',BASE+'/records/22857496/versions/latest')
    assert str(latest['id'])=='23289009','Zenodo source latest target changed unexpectedly'
    dump(root/'publication-report.json',report);print(json.dumps(report,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
