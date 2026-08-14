#!/usr/bin/env python3
"""Fail-closed Zenodo v1.2.2 preservation lifecycle: reserve -> stage -> publish -> verify-public."""
from __future__ import annotations
import argparse, hashlib, json, os, time
from pathlib import Path
from urllib import error, parse, request

BASE='https://zenodo.org/api'
RUNTIME=Path('.release/runtime')
RUNTIME.mkdir(parents=True,exist_ok=True)
CORE=[
 'index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','llms-full.txt','index.md',
 'datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl',
 'artifact-manifest.json','query-matrix.jsonl','current-release-matrix.json'
]

def call(token,method,url,body=None,content_type='application/json',ok=(200,201,202,204),binary=False):
    headers={'Authorization':f'Bearer {token}','Accept':'application/json','User-Agent':'doctor-ghezelbaash-release/3.0'}
    if body is not None: headers['Content-Type']=content_type
    req=request.Request(url,data=body,headers=headers,method=method)
    try:
        with request.urlopen(req,timeout=180) as response:
            raw=response.read()
            if response.status not in ok: raise RuntimeError(f'HTTP {response.status} {method} {url}')
            return raw if binary else (json.loads(raw.decode()) if raw else {})
    except error.HTTPError as exc:
        detail=exc.read().decode('utf-8','replace')[:4000]
        raise RuntimeError(f'Zenodo HTTP {exc.code} {method} {url}: {detail}') from None

def load_release(): return json.loads(Path('src/data/release.json').read_text())
def sha256(p:Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def write_state(name,obj): (RUNTIME/name).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')

def metadata(version,date,doi,concept):
    return {
      'upload_type':'dataset','publication_date':date,'title':'Dr. Saeed Ghezelbash Public Knowledge Graph',
      'creators':[{'name':'Ghezelbash, Saeed','orcid':'0009-0001-9346-8475'}],
      'description':(
        f'<p><strong>Dr. Saeed Ghezelbash Public Knowledge Graph</strong> — immutable DOI-preserved Version <strong>{version}</strong> '
        'of the physician-owned first-party Dataset whose canonical IRI is '
        '<a href="https://www.ghezelbaash.ir/graph.jsonld#dataset">https://www.ghezelbaash.ir/graph.jsonld#dataset</a>.</p>'
        '<p>The primary entity, creator and publisher is <strong>Dr. Saeed Ghezelbash</strong> '
        '(Wikidata Q140287622; ORCID 0009-0001-9346-8475; Iran Medical Council 167430). '
        'The supporting clinic is Q140288589 and the continuing Dataset entity is Q140304972.</p>'
        '<p>GitHub is the version-controlled source, Zenodo is immutable DOI preservation, and Hugging Face is the AI/retrieval distribution. '
        'These roles are linked without collapsing the physician, clinic, Dataset, source repository or distribution records into one identity.</p>'
      ),
      'access_right':'open','license':'cc-by-4.0','language':'eng','version':version,
      'keywords':['Saeed Ghezelbash','Dr. Saeed Ghezelbash','Mohammad Saeed Ghezelbash','دکتر سعید قزلباش','محمد سعید قزلباش',
        'physician entity','aesthetic physician','Kermanshah','Iran','medical knowledge graph','knowledge graph','knowledge base','entity resolution',
        'JSON-LD','RDF','Schema.org','Wikidata','FAIR data','machine-readable data','question answering','text retrieval','AI retrieval','RAG','Croissant','DCAT'],
      'subjects':[
        {'term':'Saeed Ghezelbash','identifier':'https://www.wikidata.org/entity/Q140287622','scheme':'url'},
        {'term':'Dr. Saeed Ghezelbash Public Knowledge Graph','identifier':'https://www.wikidata.org/entity/Q140304972','scheme':'url'},
        {'term':'Dr. Saeed Ghezelbash Aesthetic Clinic','identifier':'https://www.wikidata.org/entity/Q140288589','scheme':'url'}],
      'notes':f'Canonical Dataset IRI: https://www.ghezelbaash.ir/graph.jsonld#dataset. Concept DOI: {concept}. Exact Version DOI: {doi}. Current live observations: https://www.ghezelbaash.ir/live-observations.jsonld.',
      'related_identifiers':[
        {'identifier':'https://www.ghezelbaash.ir/graph.jsonld#dataset','relation':'isIdenticalTo','resource_type':'dataset'},
        {'identifier':'https://www.ghezelbaash.ir/','relation':'isDescribedBy','resource_type':'other'},
        {'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash','relation':'isDerivedFrom','resource_type':'software'},
        {'identifier':'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data','relation':'isReferencedBy','resource_type':'dataset'},
        {'identifier':'https://www.wikidata.org/entity/Q140304972','relation':'isIdenticalTo','resource_type':'dataset'},
        {'identifier':'https://www.wikidata.org/entity/Q140287622','relation':'references','resource_type':'other'},
        {'identifier':'https://www.wikidata.org/entity/Q140288589','relation':'references','resource_type':'other'}],
      'prereserve_doi':True
    }

def sanitize_metadata(md):
    md=dict(md or {})
    for k in ['publication_type','image_type','doi','embargo_date','access_conditions']: md.pop(k,None)
    return md

def reserve(args,token):
    # Read-only proof of the immutable baseline. Never unlock/edit/publish the prior version here.
    public=call(token,'GET',f'{BASE}/records/{args.current_record}')
    if public.get('doi')!=args.current_doi: raise RuntimeError('Current public Zenodo DOI mismatch')
    if (public.get('metadata') or {}).get('version')!=args.current_version: raise RuntimeError('Current public Zenodo version mismatch')
    result=call(token,'POST',f'{BASE}/deposit/depositions/{args.current_record}/actions/newversion')
    draft_url=(result.get('links') or {}).get('latest_draft')
    if not draft_url: raise RuntimeError('Zenodo newversion did not return latest_draft')
    draft=call(token,'GET',draft_url)
    if draft.get('submitted') is True: raise RuntimeError('Latest draft is already submitted')
    record=str(draft.get('id'))
    md=sanitize_metadata(draft.get('metadata'))
    prere=md.get('prereserve_doi') or {}
    if not prere.get('doi'):
        md['prereserve_doi']=True
        draft=call(token,'PUT',draft_url,json.dumps({'metadata':md},ensure_ascii=False).encode())
        prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    doi=prere.get('doi'); recid=str(prere.get('recid') or record)
    if not doi or recid!=record or not doi.startswith('10.5281/zenodo.'):
        raise RuntimeError('Zenodo DOI reservation mismatch')
    md=sanitize_metadata(draft.get('metadata')); md.update(metadata(args.version,args.date,doi,args.concept_doi))
    updated=call(token,'PUT',draft_url,json.dumps({'metadata':md},ensure_ascii=False).encode())
    verify=call(token,'GET',draft_url); vmd=verify.get('metadata') or {}; vpre=vmd.get('prereserve_doi') or {}
    if verify.get('submitted') is True or str(verify.get('id'))!=record or vpre.get('doi')!=doi or vmd.get('version')!=args.version or vmd.get('publication_date')!=args.date:
        raise RuntimeError('Reserved Zenodo draft readback drift')
    bucket=(verify.get('links') or {}).get('bucket')
    if not bucket: raise RuntimeError('Zenodo draft bucket missing')
    state={'stage':'DOI_RESERVED','release':args.version,'recordId':record,'versionDoi':doi,'conceptDoi':args.concept_doi,'draftApi':draft_url,'bucket':bucket,'baselineRecordId':str(args.current_record),'baselineVersionDoi':args.current_doi}
    write_state(Path(args.output).name,state); print(json.dumps(state,separators=(',',':')))

def exact_sources():
    # Rebuild the immutable Release Snapshot inventory from the exact canonical DIST bytes.
    # Hugging Face has a separate inventory and must never redefine Zenodo snapshot truth.
    dist_root=Path('dist')
    full_inventory={str(p.relative_to(dist_root)):sha256(p) for p in sorted(dist_root.rglob('*')) if p.is_file()}
    if not full_inventory or 'index.html' not in full_inventory or 'artifact-manifest.json' not in full_inventory:
        raise RuntimeError('Canonical DIST inventory is incomplete before Zenodo stage')
    hashes=RUNTIME/'dist-sha256.json'
    hashes.write_text(json.dumps(full_inventory,sort_keys=True,separators=(',',':'))+'\n')
    sources={name:dist_root/name for name in CORE}
    att=RUNTIME/'release-attestation.json'
    if att.exists(): sources['release-attestation.json']=att
    sources['dist-sha256.json']=hashes
    missing=[name for name,p in sources.items() if not p.exists()]
    if missing: raise RuntimeError(f'Zenodo stage source files missing: {missing}')
    return sources

def stage(args,token):
    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']
    if release['release']!=args.version: raise RuntimeError('Source release differs from stage target')
    draft_url=f'{BASE}/deposit/depositions/{record}'; draft=call(token,'GET',draft_url)
    if draft.get('submitted') is True: raise RuntimeError('Cannot stage an already-published draft')
    prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    if prere.get('doi')!=doi: raise RuntimeError('Reserved DOI drift before stage')
    md=sanitize_metadata(draft.get('metadata')); md.update(metadata(release['release'],release['dateModified'],doi,z['conceptDoi']))
    call(token,'PUT',draft_url,json.dumps({'metadata':md},ensure_ascii=False).encode())
    for item in call(token,'GET',f'{draft_url}/files'):
        call(token,'DELETE',f"{draft_url}/files/{item['id']}",ok=(204,))
    draft=call(token,'GET',draft_url); bucket=(draft.get('links') or {}).get('bucket')
    if not bucket: raise RuntimeError('Zenodo draft bucket missing at stage')
    sources=exact_sources(); hashes={}
    for name,file in sources.items():
        raw=file.read_bytes(); hashes[name]=hashlib.sha256(raw).hexdigest(); call(token,'PUT',f'{bucket}/{parse.quote(name)}',raw,'application/octet-stream')
    remote=call(token,'GET',f'{draft_url}/files')
    if {x.get('filename') for x in remote}!=set(sources): raise RuntimeError('Zenodo staged file inventory mismatch')
    remote_hashes={}
    for item in remote:
        name=item['filename']; url=(item.get('links') or {}).get('download'); blob=call(token,'GET',url,ok=(200,),binary=True); got=hashlib.sha256(blob).hexdigest(); remote_hashes[name]=got
        if got!=hashes[name]: raise RuntimeError(f'Zenodo staged SHA-256 mismatch: {name}')
    readback=call(token,'GET',draft_url); rmd=readback.get('metadata') or {}; prere=rmd.get('prereserve_doi') or {}
    if readback.get('submitted') is True or prere.get('doi')!=doi or rmd.get('version')!=release['release'] or rmd.get('publication_date')!=release['dateModified']:
        raise RuntimeError('Zenodo staged metadata readback drift')
    state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'files':len(sources),'sha256':hashes,'remoteSha256':remote_hashes}
    write_state('zenodo-stage.json',state); print(json.dumps({k:v for k,v in state.items() if k not in ('sha256','remoteSha256')},separators=(',',':')))

def publish(args,token):
    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; draft_url=f'{BASE}/deposit/depositions/{record}'
    staged=json.loads((RUNTIME/'zenodo-stage.json').read_text())
    if staged.get('recordId')!=record or staged.get('versionDoi')!=doi or staged.get('release')!=release['release']: raise RuntimeError('Zenodo stage ledger mismatch')
    # Re-download every staged file immediately before the irreversible publish action.
    remote=call(token,'GET',f'{draft_url}/files')
    if {x.get('filename') for x in remote}!=set(staged['sha256']): raise RuntimeError('Zenodo inventory drift after stage')
    for item in remote:
        blob=call(token,'GET',(item.get('links') or {}).get('download'),ok=(200,),binary=True)
        if hashlib.sha256(blob).hexdigest()!=staged['sha256'][item['filename']]: raise RuntimeError(f"Zenodo pre-publish drift: {item['filename']}")
    draft=call(token,'GET',draft_url); md=draft.get('metadata') or {}; prere=md.get('prereserve_doi') or {}
    if draft.get('submitted') is True: raise RuntimeError('Zenodo draft unexpectedly already published')
    if prere.get('doi')!=doi or md.get('version')!=release['release']: raise RuntimeError('Zenodo identity drift before publish')
    call(token,'POST',f'{draft_url}/actions/publish')
    state=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],staged['sha256'])
    write_state('zenodo-published.json',state); print(json.dumps(state,separators=(',',':')))

def verify_public_record(token,record,doi,version,concept,expected_hashes=None):
    public=None
    for _ in range(60):
        try:
            p=call(token,'GET',f'{BASE}/records/{record}'); md=p.get('metadata') or {}
            if p.get('doi')==doi and md.get('version')==version: public=p; break
        except Exception: pass
        time.sleep(2)
    if not public: raise RuntimeError('Zenodo public readback convergence failure')
    md=public.get('metadata') or {}
    if md.get('title')!='Dr. Saeed Ghezelbash Public Knowledge Graph': raise RuntimeError('Zenodo public title drift')
    creator=(md.get('creators') or [{}])[0]
    if creator.get('orcid')!='0009-0001-9346-8475': raise RuntimeError('Zenodo public creator ORCID drift')
    files=public.get('files') or []
    if expected_hashes is not None:
        if {x.get('key') or x.get('filename') for x in files}!=set(expected_hashes): raise RuntimeError('Zenodo public file inventory drift')
        for item in files:
            name=item.get('key') or item.get('filename'); url=(item.get('links') or {}).get('self') or (item.get('links') or {}).get('download')
            if not url: continue
            blob=call(token,'GET',url,ok=(200,),binary=True)
            if hashlib.sha256(blob).hexdigest()!=expected_hashes[name]: raise RuntimeError(f'Zenodo public SHA-256 mismatch: {name}')
    return {'stage':'ZENODO_PUBLIC_VERIFIED','release':version,'recordId':str(record),'versionDoi':doi,'conceptDoi':concept,'publicFiles':len(files),'integrity':'PASS'}

def verify_public(args,token):
    expected=None
    stage_path=RUNTIME/'zenodo-stage.json'
    if stage_path.exists(): expected=json.loads(stage_path.read_text()).get('sha256')
    state=verify_public_record(token,str(args.record),args.doi,args.version,args.concept_doi,expected); print(json.dumps(state,separators=(',',':')))

def main():
    parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest='action',required=True)
    r=sub.add_parser('reserve');r.add_argument('--current-record',required=True);r.add_argument('--current-doi',required=True);r.add_argument('--current-version',required=True);r.add_argument('--concept-doi',required=True);r.add_argument('--version',required=True);r.add_argument('--date',required=True);r.add_argument('--output',default='.release/runtime/zenodo-reservation.json')
    s=sub.add_parser('stage');s.add_argument('--version',required=True)
    sub.add_parser('publish')
    v=sub.add_parser('verify-public');v.add_argument('--record',required=True);v.add_argument('--doi',required=True);v.add_argument('--concept-doi',required=True);v.add_argument('--version',required=True)
    args=parser.parse_args(); token=os.environ.get('ZENODO_TOKEN','')
    if not token: raise SystemExit('ZENODO_TOKEN is required')
    if args.action=='reserve': reserve(args,token)
    elif args.action=='stage': stage(args,token)
    elif args.action=='publish': publish(args,token)
    else: verify_public(args,token)
if __name__=='__main__': main()
