#!/usr/bin/env python3
"""Reserve, update, upload, publish and verify the exact Zenodo preservation distribution."""
from __future__ import annotations
import argparse, hashlib, json, os, sys, time
from pathlib import Path
from urllib import error, parse, request

BASE='https://zenodo.org/api'
CORE=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','llms-full.txt','index.md','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json']

def call(token,method,url,body=None,content_type='application/json',ok=(200,201,202,204),binary=False):
    headers={'Authorization':f'Bearer {token}','Accept':'application/json','User-Agent':'doctor-ghezelbaash-release/2.0'}
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

def metadata(version,date,doi,concept):
    return {
      'upload_type':'dataset','publication_date':date,'title':'Dr. Saeed Ghezelbash Public Knowledge Graph',
      'creators':[{'name':'Ghezelbash, Saeed','orcid':'0009-0001-9346-8475'}],
      'description':f'<p>Immutable secondary preservation distribution of Version <strong>{version}</strong> of the canonical first-party <strong>Dr. Saeed Ghezelbash Public Knowledge Graph</strong>. Saeed Ghezelbash (Wikidata Q140287622; ORCID 0009-0001-9346-8475) is creator and publisher; Q140304972 identifies the Dataset and Q140288589 identifies the supporting clinic.</p><p>The canonical Dataset IRI is <a href="https://www.ghezelbaash.ir/graph.jsonld#dataset">https://www.ghezelbaash.ir/graph.jsonld#dataset</a>. GitHub is the version-controlled source, Zenodo is this DOI-preserved distribution, and Hugging Face is the secondary AI/ML distribution. These are related access and distribution layers, not identity-equivalent entities.</p>',
      'access_right':'open','license':'cc-by-4.0','language':'eng','version':version,
      'keywords':['Saeed Ghezelbash','Dr. Saeed Ghezelbash','knowledge graph','entity resolution','JSON-LD','RDF','Schema.org','Wikidata','FAIR data','machine-readable data','AI retrieval','RAG','Croissant','DCAT','Kermanshah','aesthetic medicine'],
      'notes':f'Canonical Dataset IRI: https://www.ghezelbaash.ir/graph.jsonld#dataset. Concept DOI: {concept}. Exact Version DOI: {doi}. Cryptographic integrity and cross-platform roles are recorded in release-attestation.json and dist-sha256.json.',
      'related_identifiers':[
        {'identifier':'https://www.ghezelbaash.ir/graph.jsonld#dataset','relation':'isDerivedFrom','resource_type':'dataset'},
        {'identifier':'https://github.com/medicaldoctor91/doctor-ghezelbaash','relation':'isDerivedFrom','resource_type':'software'},
        {'identifier':'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data','relation':'isReferencedBy','resource_type':'dataset'},
        {'identifier':'https://www.wikidata.org/wiki/Q140304972','relation':'isPartOf','resource_type':'dataset'}
      ],'prereserve_doi':True
    }

def reserve(args,token):
    public=call(token,'GET',f'{BASE}/records/{args.current_record}')
    if public.get('doi')!=args.current_doi: raise RuntimeError('Current public Zenodo DOI mismatch')
    current_version=(public.get('metadata') or {}).get('version')
    current_date=(public.get('metadata') or {}).get('publication_date')
    if not current_version or not current_date: raise RuntimeError('Current Zenodo version/date missing')
    # Published file bytes stay immutable; correct only the mutable descriptive metadata and relations.
    call(token,'POST',f'{BASE}/deposit/depositions/{args.current_record}/actions/edit')
    editable=call(token,'GET',f'{BASE}/deposit/depositions/{args.current_record}')
    current_md=dict(editable.get('metadata') or {})
    for key in ['publication_type','image_type','doi','embargo_date','access_conditions']: current_md.pop(key,None)
    current_md.update(metadata(current_version,current_date,args.current_doi,args.concept_doi))
    current_md.pop('prereserve_doi',None)
    call(token,'PUT',f'{BASE}/deposit/depositions/{args.current_record}',json.dumps({'metadata':current_md},ensure_ascii=False).encode())
    republished=call(token,'POST',f'{BASE}/deposit/depositions/{args.current_record}/actions/publish')
    if (republished.get('metadata') or {}).get('language')!='eng': raise RuntimeError('Current Zenodo metadata correction failed')
    result=call(token,'POST',f'{BASE}/deposit/depositions/{args.current_record}/actions/newversion')
    draft_url=(result.get('links') or {}).get('latest_draft')
    if not draft_url: raise RuntimeError('Zenodo did not return latest_draft')
    draft=call(token,'GET',draft_url)
    record=str(draft.get('id'))
    prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    doi=prere.get('doi'); recid=str(prere.get('recid') or record)
    if not doi or recid!=record: raise RuntimeError('Zenodo DOI reservation mismatch')
    md=dict(draft.get('metadata') or {})
    for key in ['publication_type','image_type','doi','embargo_date','access_conditions']: md.pop(key,None)
    md.update(metadata(args.version,args.date,doi,args.concept_doi))
    updated=call(token,'PUT',draft_url,json.dumps({'metadata':md},ensure_ascii=False).encode())
    check=updated.get('metadata') or {}; prere=check.get('prereserve_doi') or {}
    if check.get('version')!=args.version or prere.get('doi')!=doi or check.get('language')!='eng': raise RuntimeError('Zenodo draft metadata readback mismatch')
    output={'recordId':record,'versionDoi':doi,'draftApi':draft_url,'bucket':(updated.get('links') or {}).get('bucket')}
    if not output['bucket']: raise RuntimeError('Zenodo draft bucket missing')
    Path(args.output).write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({'stage':'ZENODO_RESERVED','release':args.version,**output},separators=(',',':')))

def publish(args,token):
    release=json.loads(Path('src/data/release.json').read_text())
    z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']
    draft=call(token,'GET',f'{BASE}/deposit/depositions/{record}')
    if draft.get('submitted') is True: raise RuntimeError('Zenodo draft was already submitted')
    if ((draft.get('metadata') or {}).get('prereserve_doi') or {}).get('doi')!=doi: raise RuntimeError('Reserved DOI drift before upload')
    files=call(token,'GET',f'{BASE}/deposit/depositions/{record}/files')
    for item in files:
        call(token,'DELETE',f"{BASE}/deposit/depositions/{record}/files/{item['id']}",ok=(204,))
    bucket=(draft.get('links') or {}).get('bucket')
    sources={name:Path('dist')/name for name in CORE}
    sources.update({'release-attestation.json':Path('.release/release-attestation.json'),'dist-sha256.json':Path('.release/huggingface/dist-sha256.json')})
    hashes={}
    for name,file in sources.items():
        raw=file.read_bytes(); hashes[name]=hashlib.sha256(raw).hexdigest()
        call(token,'PUT',f'{bucket}/{parse.quote(name)}',raw,'application/octet-stream')
    remote=call(token,'GET',f'{BASE}/deposit/depositions/{record}/files')
    if {x.get('filename') for x in remote}!=set(sources): raise RuntimeError('Zenodo remote file inventory mismatch')
    for item in remote:
        name=item['filename']; url=(item.get('links') or {}).get('download')
        blob=call(token,'GET',url,ok=(200,),binary=True)
        if hashlib.sha256(blob).hexdigest()!=hashes[name]: raise RuntimeError(f'Zenodo remote SHA-256 mismatch: {name}')
    published=call(token,'POST',f'{BASE}/deposit/depositions/{record}/actions/publish')
    for _ in range(45):
        public=call(token,'GET',f'{BASE}/records/{record}')
        if public.get('doi')==doi and (public.get('metadata') or {}).get('version')==release['release']: break
        time.sleep(2)
    else: raise RuntimeError('Zenodo public readback convergence failure')
    if len(public.get('files') or [])!=len(sources): raise RuntimeError('Zenodo public file-count mismatch')
    print(json.dumps({'stage':'ZENODO_PUBLISHED','recordId':record,'versionDoi':doi,'files':len(sources),'integrity':'PASS'},separators=(',',':')))

def reconcile(args,token):
    """Repair mutable metadata on an already-published immutable record."""
    public=call(token,'GET',f'{BASE}/records/{args.record}')
    public_md=public.get('metadata') or {}
    if public.get('doi')!=args.doi: raise RuntimeError('Published Zenodo DOI mismatch')
    if public_md.get('version')!=args.version or public_md.get('publication_date')!=args.date:
        raise RuntimeError('Published Zenodo version/date mismatch')
    call(token,'POST',f'{BASE}/deposit/depositions/{args.record}/actions/edit')
    editable=call(token,'GET',f'{BASE}/deposit/depositions/{args.record}')
    current_md=dict(editable.get('metadata') or {})
    for key in ['publication_type','image_type','doi','embargo_date','access_conditions']:
        current_md.pop(key,None)
    current_md.update(metadata(args.version,args.date,args.doi,args.concept_doi))
    current_md.pop('prereserve_doi',None)
    call(token,'PUT',f'{BASE}/deposit/depositions/{args.record}',json.dumps({'metadata':current_md},ensure_ascii=False).encode())
    call(token,'POST',f'{BASE}/deposit/depositions/{args.record}/actions/publish')
    for _ in range(30):
        verified=call(token,'GET',f'{BASE}/records/{args.record}')
        relations=(verified.get('metadata') or {}).get('related_identifiers') or []
        hf=[r for r in relations if r.get('identifier')=='https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data']
        if verified.get('doi')==args.doi and len(hf)==1 and hf[0].get('relation')=='isReferencedBy':
            break
        time.sleep(2)
    else:
        raise RuntimeError('Zenodo metadata reconciliation readback failure')
    print(json.dumps({'stage':'ZENODO_METADATA_RECONCILED','recordId':str(args.record),'version':args.version,'huggingFaceRelation':'isReferencedBy','integrity':'PASS'},separators=(',',':')))

def main():
    parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest='action',required=True)
    r=sub.add_parser('reserve');r.add_argument('--current-record',required=True);r.add_argument('--current-doi',required=True);r.add_argument('--concept-doi',required=True);r.add_argument('--version',required=True);r.add_argument('--date',required=True);r.add_argument('--output',default='.release/zenodo-reservation.json')
    sub.add_parser('publish')
    m=sub.add_parser('reconcile');m.add_argument('--record',required=True);m.add_argument('--doi',required=True);m.add_argument('--concept-doi',required=True);m.add_argument('--version',required=True);m.add_argument('--date',required=True)
    args=parser.parse_args();token=os.environ.get('ZENODO_TOKEN','')
    if not token: raise SystemExit('ZENODO_TOKEN is required')
    if args.action=='reserve': reserve(args,token)
    elif args.action=='publish': publish(args,token)
    else: reconcile(args,token)
if __name__=='__main__': main()
