#!/usr/bin/env python3
"""Fail-closed Zenodo preservation lifecycle and local release auxiliaries."""
from __future__ import annotations
import argparse, hashlib, json, os, time
from pathlib import Path
from urllib import error, parse, request

BASE='https://zenodo.org/api'
RUNTIME=Path('.release/runtime')
RUNTIME.mkdir(parents=True,exist_ok=True)

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
def load_resource_registry(): return json.loads(Path('src/data/machine-resources.json').read_text())
def sha256(p:Path): return hashlib.sha256(p.read_bytes()).hexdigest()
def write_state(name,obj): (RUNTIME/name).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')

def zenodo_resources():
    registry=load_resource_registry(); resources=[resource for resource in registry.get('resources',[]) if 'zenodo' in resource.get('targets',[])]
    paths=[resource.get('path') for resource in resources]
    if registry.get('schemaVersion')!='1.0' or not paths or len(paths)!=len(set(paths)) or any(not resource.get('source') for resource in resources):
        raise RuntimeError('Canonical Zenodo resource registry is invalid')
    return resources

def expected_zenodo_names():
    return {resource['path'] for resource in zenodo_resources()}|{'release-attestation.json','dist-sha256.json'}

def validate_release_attestation(attestation,source_commit,full_inventory):
    release=load_release(); z=release['dataset']['zenodo']
    expected={
      'schema':'https://www.ghezelbaash.ir/release-attestation/v3',
      'release':release['release'],
      'releasePublishedAt':release['dateModified'],
      'medicalReviewedAt':release['medicalReviewedAt'],
      'canonicalDatasetIri':release['dataset']['id'],
      'primaryEntity':release['primaryEntity']['wikidata'],
      'clinicEntity':release['dataset']['supportingClinicWikidata'],
      'sourceRepository':release['dataset']['github']['repository'],
      'sourceCommit':source_commit,
      'zenodoConceptDoi':z['conceptDoi'],
      'zenodoVersionDoi':z['versionDoi'],
      'zenodoRecordId':str(z['recordId']),
      'releaseHistory':z['releaseHistory'],
      'graphJsonldSha256':full_inventory.get('graph.jsonld'),
      'graphTurtleSha256':full_inventory.get('graph.ttl'),
      'indexHtmlSha256':full_inventory.get('index.html'),
      'queryMatrixSha256':sha256(Path('.generated/projections/query-matrix.jsonl')),
      'currentReleaseMatrixSha256':sha256(Path('.generated/projections/current-release-matrix.json')),
      'distFileCount':len(full_inventory),
      'validation':'PASS',
    }
    mismatches=[key for key,value in expected.items() if attestation.get(key)!=value]
    if mismatches: raise RuntimeError(f'Release attestation contract drift: {mismatches}')

def validate_remote_release_auxiliaries(blobs,record,doi,concept):
    release=load_release(); z=release['dataset']['zenodo']
    try:
        attestation=json.loads(blobs['release-attestation.json'])
        dist_hashes=json.loads(blobs['dist-sha256.json'])
    except (KeyError,TypeError,ValueError,json.JSONDecodeError):
        raise RuntimeError('Zenodo release auxiliary JSON is invalid') from None
    identity={
      'schema':'https://www.ghezelbaash.ir/release-attestation/v3',
      'release':release['release'],
      'releasePublishedAt':release['dateModified'],
      'medicalReviewedAt':release['medicalReviewedAt'],
      'canonicalDatasetIri':release['dataset']['id'],
      'primaryEntity':release['primaryEntity']['wikidata'],
      'clinicEntity':release['dataset']['supportingClinicWikidata'],
      'sourceRepository':release['dataset']['github']['repository'],
      'zenodoConceptDoi':concept,
      'zenodoVersionDoi':doi,
      'zenodoRecordId':str(record),
      'releaseHistory':z['releaseHistory'],
      'validation':'PASS',
    }
    mismatches=[key for key,value in identity.items() if attestation.get(key)!=value]
    if mismatches or not isinstance(attestation.get('sourceCommit'),str) or len(attestation['sourceCommit'])!=40 or any(c not in '0123456789abcdef' for c in attestation['sourceCommit']):
        raise RuntimeError(f'Zenodo release attestation identity drift: {mismatches}')
    if not isinstance(dist_hashes,dict) or not dist_hashes or any(not isinstance(name,str) or not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest) for name,digest in dist_hashes.items()):
        raise RuntimeError('Zenodo DIST hash manifest is invalid')
    if attestation.get('distFileCount')!=len(dist_hashes): raise RuntimeError('Zenodo DIST file-count attestation drift')
    attested_files={
      'index.html':'indexHtmlSha256',
      'graph.jsonld':'graphJsonldSha256',
      'graph.ttl':'graphTurtleSha256',
      'query-matrix.jsonl':'queryMatrixSha256',
      'current-release-matrix.json':'currentReleaseMatrixSha256',
    }
    for name,field in attested_files.items():
        digest=hashlib.sha256(blobs[name]).hexdigest()
        if attestation.get(field)!=digest: raise RuntimeError(f'Zenodo release attestation SHA-256 drift: {name}')
        if name in dist_hashes and dist_hashes[name]!=digest: raise RuntimeError(f'Zenodo DIST manifest SHA-256 drift: {name}')

def canonical_metadata(version,date,doi,concept):
    release=load_release(); person=release["primaryEntity"]; dataset=release["dataset"]
    person_q=person["wikidata"]; clinic_q=dataset["supportingClinicWikidata"]; orcid=person["orcid"]
    return {
      'upload_type':'dataset','publication_date':date,'title':dataset['name'],
      'creators':[{'name':'Ghezelbash, Saeed','orcid':orcid}],
      'description':(
        f'<p><strong>{dataset["name"]}</strong> — immutable DOI-preserved Version <strong>{version}</strong> '
        f'of the physician-owned first-party Dataset whose canonical IRI is <a href="{dataset["id"]}">{dataset["id"]}</a>.</p>'
        f'<p>The primary entity, creator and publisher is <strong>Dr. {person["name"]}</strong> '
        f'(Wikidata {person_q}; ORCID {orcid}; Iran Medical Council {person["irimc"]}). '
        f'The supporting clinic is {clinic_q}; the continuing Dataset is identified by its canonical first-party IRI and DOI lineage.</p>'
        '<p>GitHub is the version-controlled source, Zenodo is immutable DOI preservation, and Hugging Face is the AI/retrieval distribution. '
        'These roles are linked without collapsing the physician, clinic, Dataset, source repository or distribution records into one identity.</p>'
      ),
      'access_right':'open','license':'cc-by-4.0','language':'mul','version':version,
      'keywords':['Saeed Ghezelbash','Dr. Saeed Ghezelbash','دکتر سعید قزلباش',
        f'Wikidata {person_q}',f'Google KG {person["googleKnowledgeGraphId"]}',f'ORCID {orcid}',f'Concept DOI {concept}',
        *([f'Version DOI {doi}'] if doi else []),
        'physician entity','aesthetic physician','Kermanshah','Iran','medical knowledge graph','knowledge graph','knowledge base','entity resolution',
        'JSON-LD','RDF','Schema.org','Wikidata','FAIR data','machine-readable data','question answering','text retrieval','AI retrieval','RAG','Croissant','DCAT','provenance'],
      'subjects':[
        {'term':person['name'],'identifier':f'https://www.wikidata.org/entity/{person_q}','scheme':'url'},
        {'term':dataset['name'],'identifier':dataset['id'],'scheme':'url'},
        {'term':'Dr. Saeed Ghezelbash Aesthetic Clinic','identifier':f'https://www.wikidata.org/entity/{clinic_q}','scheme':'url'}],
      'notes':f'Canonical Dataset IRI: {dataset["id"]}. Concept DOI: {concept}.'+(f' Exact Version DOI: {doi}.' if doi else ''),
      'related_identifiers':[
        {'identifier':dataset['id'],'relation':'isDerivedFrom','resource_type':'dataset'},
        {'identifier':release['canonicalUrl'],'relation':'isDescribedBy','resource_type':'other'},
        {'identifier':dataset['github']['repository'],'relation':'isDerivedFrom','resource_type':'software'},
        {'identifier':dataset['huggingFace']['dataset'],'relation':'isReferencedBy','resource_type':'dataset'},
        {'identifier':f'https://www.wikidata.org/entity/{person_q}','relation':'references','resource_type':'other'},
        {'identifier':f'https://www.wikidata.org/entity/{clinic_q}','relation':'references','resource_type':'other'}],
      'prereserve_doi':True
    }

def compatible_draft(args,token,baseline):
    """Return exactly one matching unpublished target-version draft, or None.

    A failed transaction may already have reserved the next DOI. Reusing that exact
    draft is required for idempotency and avoids creating parallel Zenodo versions.
    Matching is intentionally strict and fail-closed.
    """
    rows=call(token,'GET',f'{BASE}/deposit/depositions?status=draft&sort=mostrecent&size=100')
    if isinstance(rows,dict): rows=rows.get('hits',{}).get('hits',[]) if isinstance(rows.get('hits'),dict) else rows.get('hits',[])
    if not isinstance(rows,list): raise RuntimeError('Unexpected Zenodo draft listing response')
    release=load_release(); expected_title=release['dataset']['name']; expected_orcid=release['primaryEntity']['orcid']
    baseline_concept=str(baseline.get('conceptrecid') or '')
    concept_marker=f'Concept DOI {args.concept_doi}'
    matches=[]
    for row in rows:
        if row.get('submitted') is True: continue
        md=row.get('metadata') or {}; prere=md.get('prereserve_doi') or {}
        if md.get('version')!=args.version or md.get('title')!=expected_title: continue
        if not any((creator or {}).get('orcid')==expected_orcid for creator in (md.get('creators') or [])): continue
        doi=prere.get('doi'); record=str(row.get('id') or '')
        if not record or not doi or str(prere.get('recid') or record)!=record or not doi.startswith('10.5281/zenodo.'): continue
        row_concept=str(row.get('conceptrecid') or '')
        if baseline_concept and row_concept and row_concept!=baseline_concept: continue
        keywords=md.get('keywords') or []; notes=str(md.get('notes') or '')
        if concept_marker not in keywords and args.concept_doi not in notes: continue
        matches.append(row)
    if len(matches)>1: raise RuntimeError(f'Multiple compatible Zenodo drafts found for release {args.version}; refusing ambiguity')
    return matches[0] if matches else None

def reserve(args,token):
    # Read-only proof of the immutable baseline. Never unlock/edit/publish the prior version here.
    public=call(token,'GET',f'{BASE}/records/{args.current_record}')
    if public.get('doi')!=args.current_doi: raise RuntimeError('Current public Zenodo DOI mismatch')
    if public.get('conceptdoi')!=args.concept_doi: raise RuntimeError('Current public Zenodo Concept DOI mismatch')
    if (public.get('metadata') or {}).get('version')!=args.current_version: raise RuntimeError('Current public Zenodo version mismatch')
    draft=compatible_draft(args,token,public)
    if draft is None:
        result=call(token,'POST',f'{BASE}/deposit/depositions/{args.current_record}/actions/newversion')
        draft_url=(result.get('links') or {}).get('latest_draft')
        if not draft_url: raise RuntimeError('Zenodo newversion did not return latest_draft')
        draft=call(token,'GET',draft_url)
    else:
        record=str(draft.get('id'))
        draft_url=(draft.get('links') or {}).get('self') or f'{BASE}/deposit/depositions/{record}'
        draft=call(token,'GET',draft_url)
        print(json.dumps({'stage':'DOI_RESERVATION_RESUMED','release':args.version,'recordId':record},separators=(',',':')))
    if draft.get('submitted') is True: raise RuntimeError('Latest draft is already submitted')
    record=str(draft.get('id'))
    prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    if not prere.get('doi'):
        draft=call(token,'PUT',draft_url,json.dumps({'metadata':canonical_metadata(args.version,args.date,None,args.concept_doi)},ensure_ascii=False).encode())
        prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    doi=prere.get('doi'); recid=str(prere.get('recid') or record)
    if not doi or recid!=record or not doi.startswith('10.5281/zenodo.'):
        raise RuntimeError('Zenodo DOI reservation mismatch')
    call(token,'PUT',draft_url,json.dumps({'metadata':canonical_metadata(args.version,args.date,doi,args.concept_doi)},ensure_ascii=False).encode())
    verify=call(token,'GET',draft_url); vmd=verify.get('metadata') or {}; vpre=vmd.get('prereserve_doi') or {}
    if verify.get('submitted') is True or str(verify.get('id'))!=record or vpre.get('doi')!=doi or vmd.get('version')!=args.version or vmd.get('publication_date')!=args.date:
        raise RuntimeError('Reserved Zenodo draft readback drift')
    bucket=(verify.get('links') or {}).get('bucket')
    if not bucket: raise RuntimeError('Zenodo draft bucket missing')
    state={'stage':'DOI_RESERVED','release':args.version,'recordId':record,'versionDoi':doi,'conceptDoi':args.concept_doi,'draftApi':draft_url,'bucket':bucket,'baselineRecordId':str(args.current_record),'baselineVersionDoi':args.current_doi}
    write_state(Path(args.output).name,state); print(json.dumps(state,separators=(',',':')))

def exact_sources(source_commit):
    dist_root=Path('dist')
    full_inventory={str(p.relative_to(dist_root)):sha256(p) for p in sorted(dist_root.rglob('*')) if p.is_file()}
    if not full_inventory or 'index.html' not in full_inventory:
        raise RuntimeError('Canonical DIST inventory is incomplete before Zenodo stage')
    att=RUNTIME/'release-attestation.json'
    if not att.exists(): raise RuntimeError('Release attestation is required for every Zenodo stage')
    resources=zenodo_resources()
    sources={
      resource['path']:(dist_root/resource['path'] if 'website' in resource['targets'] else Path(resource['source']))
      for resource in resources
    }
    missing=[name for name,p in sources.items() if not p.exists()]
    if missing: raise RuntimeError(f'Zenodo stage source files missing: {missing}')
    try: attestation=json.loads(att.read_text())
    except (ValueError,json.JSONDecodeError): raise RuntimeError('Release attestation is not valid JSON') from None
    validate_release_attestation(attestation,source_commit,full_inventory)
    hashes=RUNTIME/'dist-sha256.json'
    hashes.write_text(json.dumps(full_inventory,sort_keys=True,separators=(',',':'))+'\n')
    sources['release-attestation.json']=att
    sources['dist-sha256.json']=hashes
    return sources

def prepare_auxiliaries():
    source_commit=os.environ.get('SOURCE_COMMIT','').strip()
    if len(source_commit)!=40 or any(c not in '0123456789abcdef' for c in source_commit): raise RuntimeError('SOURCE_COMMIT must bind release auxiliaries to an exact commit')
    sources=exact_sources(source_commit)
    print(json.dumps({'stage':'RELEASE_AUXILIARIES_PREPARED','sourceCommit':source_commit,'files':sorted(sources),'integrity':'PASS'},separators=(',',':')))

def synchronize_exact_files(token,draft_url,bucket,sources):
    expected_hashes={name:sha256(file) for name,file in sources.items()}
    remote=call(token,'GET',f'{draft_url}/files')
    remote_by_name={item.get('filename'):item for item in remote}
    if len(remote_by_name)!=len(remote): raise RuntimeError('Duplicate Zenodo draft filenames')
    for name,item in remote_by_name.items():
        if name not in sources: call(token,'DELETE',f"{draft_url}/files/{item['id']}",ok=(204,))
    for name,file in sources.items():
        item=remote_by_name.get(name); current=False
        if item:
            url=(item.get('links') or {}).get('download')
            if url:
                blob=call(token,'GET',url,ok=(200,),binary=True)
                current=hashlib.sha256(blob).hexdigest()==expected_hashes[name]
            if not current: call(token,'DELETE',f"{draft_url}/files/{item['id']}",ok=(204,))
        if not current: call(token,'PUT',f'{bucket}/{parse.quote(name)}',file.read_bytes(),'application/octet-stream')
    return expected_hashes

def stage(args,token):
    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; source_commit=os.environ.get('SOURCE_COMMIT','').strip()
    if len(source_commit)!=40 or any(c not in '0123456789abcdef' for c in source_commit): raise RuntimeError('SOURCE_COMMIT must bind Zenodo stage to exact Candidate C')
    if release['release']!=args.version: raise RuntimeError('Source release differs from stage target')
    draft_url=f'{BASE}/deposit/depositions/{record}'; draft=call(token,'GET',draft_url)
    if draft.get('submitted') is True:
        sources=exact_sources(source_commit); hashes={name:sha256(file) for name,file in sources.items()}
        verified=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],hashes)
        state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'sourceCommit':source_commit,'files':len(sources),'sha256':hashes,'remoteSha256':dict(hashes),'alreadyPublished':True,'publicIntegrity':verified.get('integrity')}
        write_state('zenodo-stage.json',state); print(json.dumps({k:v for k,v in state.items() if k not in ('sha256','remoteSha256')},separators=(',',':'))); return
    prere=(draft.get('metadata') or {}).get('prereserve_doi') or {}
    if prere.get('doi')!=doi: raise RuntimeError('Reserved DOI drift before stage')
    call(token,'PUT',draft_url,json.dumps({'metadata':canonical_metadata(release['release'],release['dateModified'],doi,z['conceptDoi'])},ensure_ascii=False).encode())
    draft=call(token,'GET',draft_url); bucket=(draft.get('links') or {}).get('bucket')
    if not bucket: raise RuntimeError('Zenodo draft bucket missing at stage')
    sources=exact_sources(source_commit)
    hashes=synchronize_exact_files(token,draft_url,bucket,sources)
    remote=call(token,'GET',f'{draft_url}/files')
    if {x.get('filename') for x in remote}!=set(sources): raise RuntimeError('Zenodo staged file inventory mismatch')
    remote_hashes={}
    for item in remote:
        name=item['filename']; url=(item.get('links') or {}).get('download'); blob=call(token,'GET',url,ok=(200,),binary=True); got=hashlib.sha256(blob).hexdigest(); remote_hashes[name]=got
        if got!=hashes[name]: raise RuntimeError(f'Zenodo staged SHA-256 mismatch: {name}')
    readback=call(token,'GET',draft_url); rmd=readback.get('metadata') or {}; prere=rmd.get('prereserve_doi') or {}
    if readback.get('submitted') is True or prere.get('doi')!=doi or rmd.get('version')!=release['release'] or rmd.get('publication_date')!=release['dateModified']:
        raise RuntimeError('Zenodo staged metadata readback drift')
    state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'sourceCommit':source_commit,'files':len(sources),'sha256':hashes,'remoteSha256':remote_hashes}
    write_state('zenodo-stage.json',state); print(json.dumps({k:v for k,v in state.items() if k not in ('sha256','remoteSha256')},separators=(',',':')))

def publish(args,token):
    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; draft_url=f'{BASE}/deposit/depositions/{record}'; source_commit=os.environ.get('SOURCE_COMMIT','').strip()
    staged=json.loads((RUNTIME/'zenodo-stage.json').read_text())
    if staged.get('recordId')!=record or staged.get('versionDoi')!=doi or staged.get('release')!=release['release'] or staged.get('sourceCommit')!=source_commit: raise RuntimeError('Zenodo stage ledger mismatch or stale Candidate C binding')
    # Re-download every staged file immediately before the irreversible publish action.
    remote=call(token,'GET',f'{draft_url}/files')
    remote_names=[x.get('filename') for x in remote]
    if len(remote_names)!=len(set(remote_names)) or set(remote_names)!=set(staged['sha256']): raise RuntimeError('Zenodo inventory drift after stage')
    for item in remote:
        url=(item.get('links') or {}).get('download')
        if not url: raise RuntimeError(f"Zenodo pre-publish download URL missing: {item.get('filename')}")
        blob=call(token,'GET',url,ok=(200,),binary=True)
        if hashlib.sha256(blob).hexdigest()!=staged['sha256'][item['filename']]: raise RuntimeError(f"Zenodo pre-publish drift: {item['filename']}")
    draft=call(token,'GET',draft_url); md=draft.get('metadata') or {}; prere=md.get('prereserve_doi') or {}
    if draft.get('submitted') is True:
        state=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],staged['sha256']); state['idempotentAlreadyPublished']=True; state['sourceCommit']=source_commit
        write_state('zenodo-published.json',state); print(json.dumps(state,separators=(',',':'))); return
    if prere.get('doi')!=doi or md.get('version')!=release['release']: raise RuntimeError('Zenodo identity drift before publish')
    call(token,'POST',f'{draft_url}/actions/publish')
    state=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],staged['sha256'])
    write_state('zenodo-published.json',state); print(json.dumps(state,separators=(',',':')))

def verify_public_record(token,record,doi,version,concept,expected_hashes=None):
    public=None
    for _ in range(60):
        try:
            p=call(token,'GET',f'{BASE}/records/{record}'); md=p.get('metadata') or {}
            if p.get('doi')==doi and p.get('conceptdoi')==concept and md.get('version')==version: public=p; break
        except Exception: pass
        time.sleep(2)
    if not public: raise RuntimeError('Zenodo public readback convergence failure')
    release=load_release(); md=public.get('metadata') or {}
    if md.get('title')!=release['dataset']['name']: raise RuntimeError('Zenodo public title drift')
    creator=(md.get('creators') or [{}])[0]
    if creator.get('orcid')!=release['primaryEntity']['orcid']: raise RuntimeError('Zenodo public creator ORCID drift')
    files=public.get('files') or []
    names=[item.get('key') or item.get('filename') for item in files]
    wanted_names=set(expected_hashes) if expected_hashes is not None else expected_zenodo_names()
    if len(names)!=len(set(names)) or set(names)!=wanted_names: raise RuntimeError('Zenodo public file inventory drift')
    blobs={}
    for item,name in zip(files,names):
        url=(item.get('links') or {}).get('self') or (item.get('links') or {}).get('download')
        if not url: raise RuntimeError(f'Zenodo public file URL missing: {name}')
        blob=call(token,'GET',url,ok=(200,),binary=True); blobs[name]=blob
        if expected_hashes is not None and hashlib.sha256(blob).hexdigest()!=expected_hashes[name]: raise RuntimeError(f'Zenodo public SHA-256 mismatch: {name}')
    validate_remote_release_auxiliaries(blobs,record,doi,concept)
    return {'stage':'ZENODO_PUBLIC_VERIFIED','release':version,'recordId':str(record),'versionDoi':doi,'conceptDoi':concept,'publicFiles':len(files),'integrity':'PASS'}

def verify_public(args,token):
    expected=None
    stage_path=RUNTIME/'zenodo-stage.json'
    if stage_path.exists(): expected=json.loads(stage_path.read_text()).get('sha256')
    state=verify_public_record(token,str(args.record),args.doi,args.version,args.concept_doi,expected); print(json.dumps(state,separators=(',',':')))

def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)

    reserve_parser = sub.add_parser("reserve")
    reserve_parser.add_argument("--current-record", required=True)
    reserve_parser.add_argument("--current-doi", required=True)
    reserve_parser.add_argument("--current-version", required=True)
    reserve_parser.add_argument("--concept-doi", required=True)
    reserve_parser.add_argument("--version", required=True)
    reserve_parser.add_argument("--date", required=True)
    reserve_parser.add_argument(
        "--output", default=".release/runtime/zenodo-reservation.json"
    )

    stage_parser = sub.add_parser("stage")
    stage_parser.add_argument("--version", required=True)
    sub.add_parser("prepare-auxiliaries")
    sub.add_parser("publish")

    verify_parser = sub.add_parser("verify-public")
    verify_parser.add_argument("--record", required=True)
    verify_parser.add_argument("--doi", required=True)
    verify_parser.add_argument("--concept-doi", required=True)
    verify_parser.add_argument("--version", required=True)

    args = parser.parse_args()
    if args.action == "prepare-auxiliaries":
        prepare_auxiliaries()
        return
    token = os.environ.get("ZENODO_TOKEN", "")
    if not token:
        raise SystemExit("ZENODO_TOKEN is required")
    if args.action == "reserve":
        reserve(args, token)
    elif args.action == "stage":
        stage(args, token)
    elif args.action == "publish":
        publish(args, token)
    else:
        verify_public(args, token)


if __name__ == "__main__":
    main()
