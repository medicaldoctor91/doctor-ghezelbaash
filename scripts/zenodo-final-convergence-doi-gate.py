#!/usr/bin/env python3
import json, os, pathlib, urllib.error, urllib.request

BASE='https://zenodo.org/api'
PREVIOUS_RECORD='21886743'
PREVIOUS_VERSION_DOI='10.5281/zenodo.21886743'
CONCEPT_DOI='10.5281/zenodo.18765168'
TARGET_RELEASE='1.1.1'
RELEASE_PATH=pathlib.Path('src/data/release.json')
TOKEN=os.environ.get('ZENODO_TOKEN','').strip()
if not TOKEN:
    raise SystemExit('ZENODO_TOKEN unavailable; stopped before Zenodo mutation')
HEADERS={'Authorization':f'Bearer {TOKEN}','Accept':'application/json','User-Agent':'doctor-ghezelbaash-final-convergence/1.0'}

def call(method,url,body=None,expected=(200,201,202)):
    headers=dict(HEADERS); data=None
    if body is not None:
        headers['Content-Type']='application/json'; data=json.dumps(body,ensure_ascii=False,separators=(',',':')).encode()
    req=urllib.request.Request(url,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            raw=r.read().decode('utf-8','replace')
            if r.status not in expected: raise RuntimeError(f'Unexpected HTTP {r.status} {method} {url}')
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw=e.read().decode('utf-8','replace')
        raise RuntimeError(f'Zenodo HTTP {e.code} {method} {url}: {raw[:2500]}') from None

def nested(x,*keys):
    for k in keys:
        if not isinstance(x,dict): return None
        x=x.get(k)
    return x

def concept_candidates(*objs):
    out=set()
    paths=[('conceptdoi',),('metadata','conceptdoi'),('concept_doi',),('metadata','concept_doi'),('parent','pids','doi','identifier'),('parent','doi')]
    for obj in objs:
        for path in paths:
            v=nested(obj,*path)
            if isinstance(v,str) and v.startswith('10.'): out.add(v.strip())
    return out

# Authoritative previous published state.
prev=call('GET',f'{BASE}/deposit/depositions/{PREVIOUS_RECORD}')
public=call('GET',f'{BASE}/records/{PREVIOUS_RECORD}')
public_doi=public.get('doi') or nested(public,'pids','doi','identifier')
if public_doi!=PREVIOUS_VERSION_DOI:
    raise RuntimeError(f'Previous published DOI mismatch: {public_doi}')
if (public.get('metadata') or {}).get('version')!='1.1.0':
    raise RuntimeError('Previous Zenodo record is not expected v1.1.0')

# Create the new-version draft. If a previous failed attempt already created one,
# recover only the authoritative latest_draft link from the published deposition.
try:
    new=call('POST',f'{BASE}/deposit/depositions/{PREVIOUS_RECORD}/actions/newversion')
except RuntimeError as exc:
    refreshed=call('GET',f'{BASE}/deposit/depositions/{PREVIOUS_RECORD}')
    latest_draft=nested(refreshed,'links','latest_draft')
    if not (isinstance(latest_draft,str) and latest_draft.startswith('https://zenodo.org/api/')):
        raise
    new=refreshed

draft_url=nested(new,'links','latest_draft')
if not (isinstance(draft_url,str) and draft_url.startswith('https://zenodo.org/api/')):
    raise RuntimeError('Zenodo did not expose authoritative links.latest_draft')
draft=call('GET',draft_url)
if draft.get('submitted') is True or draft.get('state')=='done':
    raise RuntimeError('Final convergence target unexpectedly already published')

draft_id=str(draft.get('id') or '')
if not draft_id.isdigit() or draft_id==PREVIOUS_RECORD:
    raise RuntimeError(f'Invalid new draft id: {draft_id}')

concepts=concept_candidates(prev,public,new,draft)
if CONCEPT_DOI not in concepts or any(x!=CONCEPT_DOI for x in concepts):
    raise RuntimeError(f'Concept DOI verification failure: {sorted(concepts)}')

pre=nested(draft,'metadata','prereserve_doi')
if not (isinstance(pre,dict) and pre.get('doi')):
    metadata=dict(draft.get('metadata') or {})
    metadata['prereserve_doi']=True
    draft=call('PUT',draft_url,{'metadata':metadata})
    pre=nested(draft,'metadata','prereserve_doi')
if not isinstance(pre,dict): raise RuntimeError('Zenodo prereserve_doi object unavailable')
version_doi=str(pre.get('doi') or '').strip()
record_id=str(pre.get('recid') or draft.get('record_id') or draft.get('id') or '').strip()
if not version_doi.startswith('10.5281/zenodo.'):
    raise RuntimeError(f'Invalid reserved Version DOI: {version_doi}')
if version_doi in {CONCEPT_DOI,PREVIOUS_VERSION_DOI}:
    raise RuntimeError('New Version DOI is not distinct')
if not record_id.isdigit() or record_id in {PREVIOUS_RECORD,'18765169'}:
    raise RuntimeError(f'Invalid reserved record id: {record_id}')

release=json.loads(RELEASE_PATH.read_text(encoding='utf-8'))
if release.get('release')!='1.1.0': raise RuntimeError('Source is not based on validated v1.1.0 convergence parent')
z=release.get('dataset',{}).get('zenodo',{})
if z.get('conceptDoi')!=CONCEPT_DOI or z.get('versionDoi')!=PREVIOUS_VERSION_DOI or str(z.get('recordId'))!=PREVIOUS_RECORD:
    raise RuntimeError('Parent release Zenodo contract mismatch before final gate')

release['release']=TARGET_RELEASE
release['dateModified']='2026-08-11'
release['dataset']['zenodo']={
    'role':'preservation',
    'conceptDoi':CONCEPT_DOI,
    'versionDoi':version_doi,
    'recordId':record_id,
    'draftApi':draft_url,
    'state':'doi-locked-draft',
    'previousVersion':{'release':'1.1.0','recordId':PREVIOUS_RECORD,'versionDoi':PREVIOUS_VERSION_DOI},
    'historicalVersion':z.get('historicalVersion',{'release':'1.0.0','recordId':'18765169','versionDoi':'10.5281/zenodo.18765169'})
}
RELEASE_PATH.write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
pathlib.Path('.release').mkdir(exist_ok=True)
status={'stage':'FINAL_CONVERGENCE_DOI_LOCKED','release':TARGET_RELEASE,'conceptDoi':CONCEPT_DOI,'versionDoi':version_doi,'recordId':record_id,'draftApi':draft_url,'coreFrozen':False,'integrity':'PASS'}
pathlib.Path('.release/final-doi-gate.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps(status,separators=(',',':')))
