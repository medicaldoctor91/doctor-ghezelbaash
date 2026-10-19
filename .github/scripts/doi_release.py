"""DOI-policy release operations; never rewrite a published Zenodo payload."""
import argparse
import json
import os
import concurrent.futures
import hashlib
import io
import subprocess
import zipfile
from urllib.parse import quote
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]


def policy():
    return json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())


def reserve(previous, output):
    p = policy()
    session = requests.Session()
    session.headers.update(Authorization='Bearer ' + os.environ['ZENODO_TOKEN'])
    base = 'https://zenodo.org/api/'
    public = session.get(base + 'records/' + str(previous), timeout=60)
    public.raise_for_status()
    public = public.json()
    assert public['conceptdoi'] == p['concept']['doi']
    assert public['id'] == p['currentArchive']['recordId']
    # Read existing family drafts first. An ambiguous version POST is never retried.
    deposits = session.get(base + 'deposit/depositions', params={'q': 'conceptrecid:18765168', 'size': 100}, timeout=60)
    deposits.raise_for_status()
    entries = deposits.json()
    assert isinstance(entries, list)
    pending = [d for d in entries if str(d.get('conceptrecid')) == '18765168' and not d.get('submitted')]
    if pending:
        assert len(pending) == 1, 'Multiple family drafts require inspection'
        draft = pending[0]
        print(json.dumps({'existingDraft': draft['id'], 'created': draft.get('created'), 'version': draft.get('metadata', {}).get('version'),
                          'title': draft.get('metadata', {}).get('title'), 'doi': draft.get('doi'),
                          'prereserve_doi': draft.get('metadata', {}).get('prereserve_doi'), 'responseKeys': list(draft)}, ensure_ascii=False), flush=True)
        assert draft['metadata'].get('title') == public['metadata']['title'], 'Existing draft title differs from the reviewed parent'
        assert draft['metadata'].get('description') == public['metadata']['description'], 'Existing draft description has independent changes'
    else:
        response = session.post(base + 'records/' + str(previous) + '/versions', json={}, timeout=90)
        response.raise_for_status()
        draft = response.json()
    record = draft['id']
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'reservedRecord': record, 'phase': 'draft created or recovered'}) + '\n')
    print(json.dumps({'reservedRecord': record, 'phase': 'draft created or recovered', 'responseKeys': list(draft), 'metadataKeys': list(draft.get('metadata', {}))}), flush=True)
    def extract(value):
        return value.get('doi') or value.get('metadata', {}).get('prereserve_doi', {}).get('doi') or (value.get('pids', {}).get('doi') or {}).get('identifier')
    doi = extract(draft)
    if not doi:
        response = session.post(base + 'records/' + str(record) + '/draft/pids/doi', json={}, timeout=60)
        response.raise_for_status()
        draft_response = session.get(base + 'records/' + str(record) + '/draft', timeout=60)
        draft_response.raise_for_status()
        draft = draft_response.json()
        doi = extract(draft)
    assert doi and doi.startswith('10.5281/zenodo.')
    result = {'previousRecord': previous, 'reservedRecord': record, 'reservedDoi': doi,
              'conceptDoi': p['concept']['doi'], 'published': False,
              'metadata': draft.get('metadata', {}), 'links': draft.get('links', {})}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in {'metadata', 'links'}}), flush=True)


def prepare(previous, work):
    from platform_bundle import build_hf, context, dump, DOI_POLICY
    from archive_bundle import build_archive
    source_commit=os.environ.get('GITHUB_SHA') or subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()
    p=policy();work.mkdir(parents=True,exist_ok=True)
    repo='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
    revision=p['currentArchive']['inputBaselineHfRevision']
    base='https://huggingface.co/datasets/'+repo+'/resolve/'+revision+'/'
    baseline=work/'hf-baseline';baseline.mkdir(exist_ok=True)
    names=['README.md','datapackage.json','croissant.json','dcat.ttl','void.ttl','entity-facts.csv-metadata.json',
           'current-release-matrix.json','release-attestation.json','release-provenance.json','integrity-manifest.json','dist-sha256.json']
    names+=['viewer/'+name for name in ['packaging.json','iri-migration.json','clinical-passages.parquet','clinical-answers.parquet','entity-facts.parquet','query-matrix.parquet','positioning-examples.parquet']]
    def download(name):
        r=requests.get(base+name,timeout=90);r.raise_for_status();dest=baseline/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(r.content)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(download,names))
    parent=requests.get('https://zenodo.org/api/records/'+str(previous),timeout=60);parent.raise_for_status();parent=parent.json()
    archive=next(item for item in parent['files'] if item['key'].endswith('.zip'))
    response=requests.get(archive['links']['self'],timeout=120);response.raise_for_status()
    assert hashlib.md5(response.content).hexdigest()==archive['checksum'].removeprefix('md5:')
    previous_root=work/'previous-archive'
    with zipfile.ZipFile(io.BytesIO(response.content)) as zipped:
        assert zipped.testzip() is None
        for name in zipped.namelist():assert '..' not in Path(name).parts and not Path(name).is_absolute()
        zipped.extractall(previous_root)
    ctx=context(source_commit,os.environ.get('CANDIDATE_RUN_ID',os.environ.get('GITHUB_RUN_ID','0')),maintenance_date='2026-10-19')
    if os.environ.get('CANDIDATE_RUN_ID')=='0':ctx['run_url']='https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+source_commit
    ctx.update(publication_scope=['zenodo_dataset'],archived_snapshots_updated=False)
    stage=work/'hf-stage'
    packaging=build_hf(ROOT/'dist',baseline,stage,ctx)
    subprocess.run(['python',str(ROOT/'tests/validate_platform_bundle.py'),str(stage),'--rdf'],check=True)
    files,result=build_archive(stage,previous_root,work/'archive',source_commit)
    dump(work/'payload.json',{'sourceCommit':source_commit,'record':p['currentArchive']['recordId'],
         'doi':p['currentArchive']['doi'],'files':{key:{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'md5':hashlib.md5(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size} for key,path in files.items()},
         'validation':result,'upstreamParentChecksums':{item['key']:item['checksum'] for item in parent['files']}})
    print(json.dumps({'preparedRecord':p['currentArchive']['recordId'],'files':len(files),'sourceCommit':source_commit,'validation':result}),flush=True)


def publish(previous, work):
    from platform_bundle import dump
    from doi_validation import validate_policy
    validate_policy(work/'archive',archive=True)
    p=policy();payload=json.loads((work/'payload.json').read_text());record=p['currentArchive']['recordId']
    assert record==payload['record'] and record!=previous
    session=requests.Session();session.headers['Authorization']='Bearer '+os.environ['ZENODO_TOKEN']
    base='https://zenodo.org/api/';dep=base+'deposit/depositions/'+str(record)
    response=session.get(dep,timeout=60);response.raise_for_status();draft=response.json()
    assert draft['doi']==p['currentArchive']['doi'] and str(draft['conceptrecid'])==str(p['concept']['recordId'])
    if not draft.get('submitted'):
        response=session.get(dep+'/files',timeout=60);response.raise_for_status();existing=response.json()
        for item in existing:
            key=item.get('filename') or item.get('key')
            digest=item.get('checksum','').removeprefix('md5:')
            if key not in payload['files'] or digest!=payload['files'][key]['md5']:
                response=session.delete(dep+'/files/'+str(item['id']),timeout=60);response.raise_for_status()
        response=session.get(dep+'/files',timeout=60);response.raise_for_status()
        present={item.get('filename') or item.get('key'):item.get('checksum','').removeprefix('md5:') for item in response.json()}
        bucket=draft['links']['bucket'];assert bucket.startswith(base+'files/')
        def upload(item):
            key,spec=item
            if present.get(key)==spec['md5']:return key
            path=Path(spec['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==spec['sha256']
            with path.open('rb') as stream:
                response=requests.put(bucket+'/'+quote(key,safe=''),data=stream,headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN'],'Content-Type':'application/octet-stream'},timeout=240)
            response.raise_for_status()
            return key
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(upload,payload['files'].items()))
        response=session.get(dep+'/files',timeout=60);response.raise_for_status()
        actual={item.get('filename') or item.get('key'):item.get('checksum','').removeprefix('md5:') for item in response.json()}
        assert actual=={key:spec['md5'] for key,spec in payload['files'].items()}, 'Draft file inventory differs'
        md=draft['metadata'];md.update(upload_type='dataset',version=p['currentArchive']['packagingVersion'],doi=p['currentArchive']['doi'])
        md['description']=('<p><strong>مجموعهٔ عمومی و آخرین نسخه / Public collection and latest version:</strong> <a href="'+p['concept']['url']+'">'+p['concept']['doi']+'</a>.</p>'
            '<p><strong>Exact reproducible snapshot:</strong> '+p['currentArchive']['packagingVersion']+'; DOI <a href="'+p['currentArchive']['url']+'">'+p['currentArchive']['doi']+'</a>. Content baseline '+p['currentArchive']['contentBaseline']+'; source commit '+payload['sourceCommit']+'.</p>'
            '<p>This release aligns DOI roles in the Dataset payload and ZIP. Its Croissant, Data Package, DCAT, VoID and CSVW descriptors bind downloads to this record and the actual archived bytes. Historical upstream files and training-message references retain their explicit historical roles. The physician, clinic, canonical Dataset IRI '+p['canonicalDatasetIri']+', collection DOI and snapshot DOI are distinct resources.</p>'
            '<p>Website: <a href="https://www.ghezelbaash.ir/">official website</a>; <a href="https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data">Hugging Face</a>; <a href="https://www.kaggle.com/datasets/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data">Kaggle dataset</a>; <a href="https://www.kaggle.com/code/saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter">Kaggle notebook</a>. Previous record '+str(previous)+' and earlier records retain their own immutable files and DOIs.</p>')
        related=[item for item in md.get('related_identifiers',[]) if item.get('relation')!='isNewVersionOf']
        related.append({'identifier':'10.5281/zenodo.'+str(previous),'scheme':'doi','relation':'isNewVersionOf','resource_type':'dataset'})
        related.append({'identifier':p['concept']['doi'],'scheme':'doi','relation':'isVersionOf','resource_type':'dataset'})
        related.append({'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/'+payload['sourceCommit'],'scheme':'url','relation':'isDerivedFrom','resource_type':'software'})
        md['related_identifiers']=related
        if (work/'zenodo-metadata.json').is_file():md=json.loads((work/'zenodo-metadata.json').read_text())
        response=session.put(dep,json={'metadata':md},timeout=90);response.raise_for_status()
        # One publish request only. A later recovery verifies this same record.
        response=session.post(dep+'/actions/publish',json={},timeout=120);response.raise_for_status()
    verify_published(previous,work)


def verify_published(previous, work):
    from platform_bundle import dump
    from doi_validation import validate_archive, validate_policy
    p=policy();payload=json.loads((work/'payload.json').read_text());record=p['currentArchive']['recordId']
    response=requests.get('https://zenodo.org/api/records/'+str(record),timeout=90);response.raise_for_status();live=response.json()
    assert live['doi']==p['currentArchive']['doi'] and live['conceptdoi']==p['concept']['doi']
    assert live['metadata']['version']==p['currentArchive']['packagingVersion'] and live['metadata']['resource_type']['type']=='dataset'
    assert {item['key']:item['checksum'].removeprefix('md5:') for item in live['files']}=={key:spec['md5'] for key,spec in payload['files'].items()}
    downloads=work/'live-downloads';downloads.mkdir(exist_ok=True)
    def fetch(item):
        response=requests.get(item['links']['self'],timeout=120);response.raise_for_status();body=response.content
        expected=payload['files'][item['key']]
        assert hashlib.sha256(body).hexdigest()==expected['sha256']
        target=downloads/item['key'];target.write_bytes(body)
        return item['key']
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(fetch,live['files']))
    zipfile_name=Path(p['downloadBindings']['bundle']).name
    extracted=work/'live-archive'
    with zipfile.ZipFile(downloads/zipfile_name) as zipped:
        assert zipped.testzip() is None
        for name in zipped.namelist():assert '..' not in Path(name).parts and not Path(name).is_absolute()
        zipped.extractall(extracted)
        for line in zipped.read('checksums.sha256').decode().splitlines():
            digest,name=line.split('  ',1);assert hashlib.sha256(zipped.read(name)).hexdigest()==digest,name
        for item in live['files']:
            if item['key']==zipfile_name:continue
            matches=[name for name in zipped.namelist() if not name.startswith(('viewer/','upstream/')) and Path(name).name==item['key']]
            assert len(matches)==1 and zipped.read(matches[0])==(downloads/item['key']).read_bytes(),item['key']
    result=validate_archive(extracted,online=True)
    parent=requests.get('https://zenodo.org/api/records/'+str(previous),timeout=60);parent.raise_for_status()
    assert {item['key']:item['checksum'] for item in parent.json()['files']}==payload['upstreamParentChecksums'], 'Previous archive changed'
    concept=requests.get(p['concept']['url'],timeout=60);concept.raise_for_status()
    assert '/'+str(record) in concept.url, ('Concept DOI has not converged',concept.url)
    report={'status':'PASS','record':record,'doi':live['doi'],'conceptDoi':live['conceptdoi'],'sourceCommit':payload['sourceCommit'],
            'filesDownloadedAndSha256Verified':len(live['files']),'zipSha256':hashlib.sha256((downloads/zipfile_name).read_bytes()).hexdigest(),
            'previousRecordUnchanged':previous,'liveValidation':result}
    dump(work/'publication-report.json',report);print(json.dumps(report),flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['reserve','prepare','publish','verify'])
    parser.add_argument('--previous-record', type=int, required=True)
    parser.add_argument('--output', type=Path, default=Path('/tmp/doi-release/reservation.json'))
    args = parser.parse_args()
    if args.operation=='reserve':reserve(args.previous_record, args.output)
    elif args.operation=='prepare':prepare(args.previous_record,args.output.parent)
    elif args.operation=='publish':publish(args.previous_record,args.output.parent)
    else:verify_published(args.previous_record,args.output.parent)


if __name__ == '__main__':
    main()
