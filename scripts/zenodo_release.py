#!/usr/bin/env python3
"""Fail-closed Zenodo preservation lifecycle and local release auxiliaries."""
from __future__ import annotations
import argparse, hashlib, json, os, time, subprocess, sys
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

_PUBLICATION_DATA = None

def load_release():
    global _PUBLICATION_DATA
    if _PUBLICATION_DATA is not None:
        return _PUBLICATION_DATA
    result = subprocess.run(
        ["node", "scripts/publication-context.mjs", "json"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()[:4000]
        raise RuntimeError(f"Canonical publication context failed: {detail}")
    try:
        publication = json.loads(result.stdout)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise RuntimeError("Canonical publication context returned invalid JSON") from None
    required = (
        publication.get("release"),
        publication.get("dateModified"),
        (publication.get("primaryEntity") or {}).get("wikidata"),
        (publication.get("primaryEntity") or {}).get("orcid"),
        (publication.get("dataset") or {}).get("name"),
        (publication.get("clinic") or {}).get("placeId"),
    )
    if any(value in (None, "") for value in required):
        raise RuntimeError("Canonical publication context is incomplete for Zenodo")
    _PUBLICATION_DATA = publication
    return _PUBLICATION_DATA
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
    person_q=person["wikidata"]; orcid=person["orcid"]
    return {
      'upload_type':'dataset','publication_date':date,'title':dataset['name'],
      'creators':[{'name':'Ghezelbash, Saeed','orcid':orcid}],
      'description':(
        f'<p><strong>{dataset["name"]}</strong> â€²È="25M!´ÈÔØµ¥Íµ…Ñ èí¹…µ•ôœ¤(€€€É•…‘‰…¬õ…±°¡Ñ½­•¸°Pœ±‘É…™Ñ}ÕÉ°¤ìÉµõÉ•…‘‰…¬¹•Ğ µ•Ñ…‘…Ñ„œ¤½ÈíôìÁÉ•É”õÉµ¹•Ğ ÁÉ•É•Í•ÉÙ•}‘½¤œ¤½Èíô(€€€¥˜É•…‘‰…¬¹•Ğ ÍÕ‰µ¥ÑÑ•œ¤¥ÌQÉÕ”½ÈÁÉ•É”¹•Ğ ‘½¤œ¤„õ‘½¤½ÈÉµ¹•Ğ Ù•ÉÍ¥½¸œ¤„õÉ•±•…Í•lÉ•±•…Í”t½ÈÉµ¹•Ğ ÁÕ‰±¥…Ñ¥½¹}‘…Ñ”œ¤„õÉ•±•…Í•l‘…Ñ•5½‘¥™¥•tè(€€€€€€€É…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÍÑ…•µ•Ñ…‘…Ñ„É•…‘‰…¬‘É¥™Ğœ¤(€€€ÍÑ…Ñ”õìÍÑ…”œèi9==}MQœ°É•±•…Í”œéÉ•±•…Í•lÉ•±•…Í”t°É•½É‘%œéÉ•½É°Ù•ÉÍ¥½¹½¤œé‘½¤°½¹•ÁÑ½¤œéél½¹•ÁÑ½¤t°Í½ÕÉ•½µµ¥ĞœéÍ½ÕÉ•}½µµ¥Ğ°™¥±•Ìœé±•¸¡Í½ÕÉ•Ì¤°Í¡„ÈÔØœé¡…Í¡•Ì°É•µ½Ñ•M¡„ÈÔØœéÉ•µ½Ñ•}¡…Í¡•Íô(€€€İÉ¥Ñ•}ÍÑ…Ñ” é•¹½‘¼µÍÑ…”¹©Í½¸œ±ÍÑ…Ñ”¤ìÁÉ¥¹Ğ¡©Í½¸¹‘ÕµÁÌ¡í¬éØ™½È¬±Ø¥¸ÍÑ…Ñ”¹¥Ñ•µÌ ¤¥˜¬¹½Ğ¥¸€ Í¡„ÈÔØœ°É•µ½Ñ•M¡„ÈÔØœ¥ô±Í•Á…É…Ñ½ÉÌô œ°œ°œèœ¤¤¤()‘•˜ÁÕ‰±¥Í ¡…ÉÌ±Ñ½­•¸¤è(€€€É•±•…Í”õ±½…‘}É•±•…Í” ¤ìèõÉ•±•…Í•l‘…Ñ…Í•Ğulé•¹½‘¼tìÉ•½ÉõÍÑÈ¡élÉ•½É‘%t¤ì‘½¤õélÙ•ÉÍ¥½¹½¤tì‘É…™Ñ}ÕÉ°õ˜í	Mô½‘•Á½Í¥Ğ½‘•Á½Í¥Ñ¥½¹Ì½íÉ•½É‘ôœìÍ½ÕÉ•}½µµ¥Ğõ½Ì¹•¹Ù¥É½¸¹•Ğ M=UI}=55%Pœ°œœ¤¹ÍÑÉ¥À ¤(€€€ÍÑ…•õ©Í½¸¹±½…‘Ì ¡IU9Q%5¼é•¹½‘¼µÍÑ…”¹©Í½¸œ¤¹É•…‘}Ñ•áĞ ¤¤(€€€¥˜ÍÑ…•¹•Ğ É•½É‘%œ¤„õÉ•½É½ÈÍÑ…•¹•Ğ Ù•ÉÍ¥½¹½¤œ¤„õ‘½¤½ÈÍÑ…•¹•Ğ É•±•…Í”œ¤„õÉ•±•…Í•lÉ•±•…Í”t½ÈÍÑ…•¹•Ğ Í½ÕÉ•½µµ¥Ğœ¤„õÍ½ÕÉ•}½µµ¥ĞèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÍÑ…”±•‘•Èµ¥Íµ…Ñ ½ÈÍÑ…±”…¹‘¥‘…Ñ”‰¥¹‘¥¹œœ¤(€€€€ŒI”µ‘½İ¹±½…•Ù•ÉäÍÑ…•™¥±”¥µµ•‘¥…Ñ•±ä‰•™½É”Ñ¡”¥ÉÉ•Ù•ÉÍ¥‰±”ÁÕ‰±¥Í …Ñ¥½¸¸(€€€É•µ½Ñ”õ…±°¡Ñ½­•¸°Pœ±˜í‘É…™Ñ}ÕÉ±ô½™¥±•Ìœ¤(€€€É•µ½Ñ•}¹…µ•Ìõmà¹•Ğ ™¥±•¹…µ”œ¤™½Èà¥¸É•µ½Ñ•t(€€€¥˜±•¸¡É•µ½Ñ•}¹…µ•Ì¤„õ±•¸¡Í•Ğ¡É•µ½Ñ•}¹…µ•Ì¤¤½ÈÍ•Ğ¡É•µ½Ñ•}¹…µ•Ì¤„õÍ•Ğ¡ÍÑ…•‘lÍ¡„ÈÔØt¤èÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼¥¹Ù•¹Ñ½Éä‘É¥™Ğ…™Ñ•ÈÍÑ…”œ¤(€€€™½È¥Ñ•´¥¸É•µ½Ñ”è(€€€€€€€ÕÉ°ô¡¥Ñ•´¹•Ğ ±¥¹­Ìœ¤½Èíô¤¹•Ğ ‘½İ¹±½…œ¤(€€€€€€€¥˜¹½ĞÕÉ°èÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È¡˜‰i•¹½‘¼ÁÉ”µÁÕ‰±¥Í ‘½İ¹±½…UI0µ¥ÍÍ¥¹œèí¥Ñ•´¹•Ğ ™¥±•¹…µ”œ¥ôˆ¤(€€€€€€€‰±½ˆõ…±°¡Ñ½­•¸°Pœ±ÕÉ°±½¬ô ÈÀÀ°¤±‰¥¹…ÉäõQÉÕ”¤(€€€€€€€¥˜¡…Í¡±¥ˆ¹Í¡„ÈÔØ¡‰±½ˆ¤¹¡•á‘¥•ÍĞ ¤„õÍÑ…•‘lÍ¡„ÈÔØum¥Ñ•µl™¥±•¹…µ”utèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È¡˜‰i•¹½‘¼ÁÉ”µÁÕ‰±¥Í ‘É¥™Ğèí¥Ñ•µl™¥±•¹…µ”uôˆ¤(€€€‘É…™Ğõ…±°¡Ñ½­•¸°Pœ±‘É…™Ñ}ÕÉ°¤ìµõ‘É…™Ğ¹•Ğ µ•Ñ…‘…Ñ„œ¤½ÈíôìÁÉ•É”õµ¹•Ğ ÁÉ•É•Í•ÉÙ•}‘½¤œ¤½Èíô(€€€¥˜‘É…™Ğ¹•Ğ ÍÕ‰µ¥ÑÑ•œ¤¥ÌQÉÕ”è(€€€€€€€ÍÑ…Ñ”õÙ•É¥™å}ÁÕ‰±¥}É•½É¡Ñ½­•¸±É•½É±‘½¤±É•±•…Í•lÉ•±•…Í”t±él½¹•ÁÑ½¤t±ÍÑ…•‘lÍ¡„ÈÔØt¤ìÍÑ…Ñ•l¥‘•µÁ½Ñ•¹Ñ±É•…‘åAÕ‰±¥Í¡•tõQÉÕ”ìÍÑ…Ñ•lÍ½ÕÉ•½µµ¥ĞtõÍ½ÕÉ•}½µµ¥Ğ(€€€€€€€İÉ¥Ñ•}ÍÑ…Ñ” é•¹½‘¼µÁÕ‰±¥Í¡•¹©Í½¸œ±ÍÑ…Ñ”¤ìÁÉ¥¹Ğ¡©Í½¸¹‘ÕµÁÌ¡ÍÑ…Ñ”±Í•Á…É…Ñ½ÉÌô œ°œ°œèœ¤¤¤ìÉ•ÑÕÉ¸(€€€¥˜ÁÉ•É”¹•Ğ ‘½¤œ¤„õ‘½¤½Èµ¹•Ğ Ù•ÉÍ¥½¸œ¤„õÉ•±•…Í•lÉ•±•…Í”tèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼¥‘•¹Ñ¥Ñä‘É¥™Ğ‰•™½É”ÁÕ‰±¥Í œ¤(€€€…±°¡Ñ½­•¸°A=MPœ±˜í‘É…™Ñ}ÕÉ±ô½…Ñ¥½¹Ì½ÁÕ‰±¥Í œ¤(€€€ÍÑ…Ñ”õÙ•É¥™å}ÁÕ‰±¥}É•½É¡Ñ½­•¸±É•½É±‘½¤±É•±•…Í•lÉ•±•…Í”t±él½¹•ÁÑ½¤t±ÍÑ…•‘lÍ¡„ÈÔØt¤(€€€İÉ¥Ñ•}ÍÑ…Ñ” é•¹½‘¼µÁÕ‰±¥Í¡•¹©Í½¸œ±ÍÑ…Ñ”¤ìÁÉ¥¹Ğ¡©Í½¸¹‘ÕµÁÌ¡ÍÑ…Ñ”±Í•Á…É…Ñ½ÉÌô œ°œ°œèœ¤¤¤()‘•˜Ù•É¥™å}ÁÕ‰±¥}É•½É¡Ñ½­•¸±É•½É±‘½¤±Ù•ÉÍ¥½¸±½¹•ÁĞ±•áÁ•Ñ•‘}¡…Í¡•Ìõ9½¹”¤è(€€€ÁÕ‰±¥Œõ9½¹”(€€€™½È|¥¸É…¹” ØÀ¤è(€€€€€€€ÑÉäè(€€€€€€€€€€€Àõ…±°¡Ñ½­•¸°Pœ±˜í	Mô½É•½É‘Ì½íÉ•½É‘ôœ¤ìµõÀ¹•Ğ µ•Ñ…‘…Ñ„œ¤½Èíô(€€€€€€€€€€€¥˜À¹•Ğ ‘½¤œ¤ôõ‘½¤…¹À¹•Ğ ½¹•ÁÑ‘½¤œ¤ôõ½¹•ÁĞ…¹µ¹•Ğ Ù•ÉÍ¥½¸œ¤ôõÙ•ÉÍ¥½¸èÁÕ‰±¥ŒõÀì‰É•…¬(€€€€€€€•á•ÁĞá•ÁÑ¥½¸èÁ…ÍÌ(€€€€€€€Ñ¥µ”¹Í±••À È¤(€€€¥˜¹½ĞÁÕ‰±¥ŒèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÁÕ‰±¥ŒÉ•…‘‰…¬½¹Ù•É•¹”™…¥±ÕÉ”œ¤(€€€É•±•…Í”õ±½…‘}É•±•…Í” ¤ìµõÁÕ‰±¥Œ¹•Ğ µ•Ñ…‘…Ñ„œ¤½Èíô(€€€¥˜µ¹•Ğ Ñ¥Ñ±”œ¤„õÉ•±•…Í•l‘…Ñ…Í•Ğul¹…µ”tèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÁÕ‰±¥ŒÑ¥Ñ±”‘É¥™Ğœ¤(€€€É•…Ñ½Èô¡µ¹•Ğ É•…Ñ½ÉÌœ¤½Èmíõt¥lÁt(€€€¥˜É•…Ñ½È¹•Ğ ½É¥œ¤„õÉ•±•…Í•lÁÉ¥µ…Éå¹Ñ¥Ñäul½É¥tèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÁÕ‰±¥ŒÉ•…Ñ½È=I%‘É¥™Ğœ¤(€€€™¥±•ÌõÁÕ‰±¥Œ¹•Ğ ™¥±•Ìœ¤½Èmt(€€€¹…µ•Ìõm¥Ñ•´¹•Ğ ­•äœ¤½È¥Ñ•´¹•Ğ ™¥±•¹…µ”œ¤™½È¥Ñ•´¥¸™¥±•Ít(€€€İ…¹Ñ•‘}¹…µ•ÌõÍ•Ğ¡•áÁ•Ñ•‘}¡…Í¡•Ì¤¥˜•áÁ•Ñ•‘}¡…Í¡•Ì¥Ì¹½Ğ9½¹”•±Í”•áÁ•Ñ•‘}é•¹½‘½}¹…µ•Ì ¤(€€€¥˜±•¸¡¹…µ•Ì¤„õ±•¸¡Í•Ğ¡¹…µ•Ì¤¤½ÈÍ•Ğ¡¹…µ•Ì¤„õİ…¹Ñ•‘}¹…µ•ÌèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È i•¹½‘¼ÁÕ‰±¥Œ™¥±”¥¹Ù•¹Ñ½Éä‘É¥™Ğœ¤(€€€‰±½‰Ìõíô(€€€™½È¥Ñ•´±¹…µ”¥¸é¥À¡™¥±•Ì±¹…µ•Ì¤è(€€€€€€€ÕÉ°ô¡¥Ñ•´¹•Ğ ±¥¹­Ìœ¤½Èíô¤¹•Ğ Í•±˜œ¤½È€¡¥Ñ•´¹•Ğ ±¥¹­Ìœ¤½Èíô¤¹•Ğ ‘½İ¹±½…œ¤(€€€€€€€¥˜¹½ĞÕÉ°èÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È¡˜i•¹½‘¼ÁÕ‰±¥Œ™¥±”UI0µ¥ÍÍ¥¹œèí¹…µ•ôœ¤(€€€€€€€‰±½ˆõ…±°¡Ñ½­•¸°Pœ±ÕÉ°±½¬ô ÈÀÀ°¤±‰¥¹…ÉäõQÉÕ”¤ì‰±½‰Ím¹…µ•tõ‰±½ˆ(€€€€€€€¥˜•áÁ•Ñ•‘}¡…Í¡•Ì¥Ì¹½Ğ9½¹”…¹¡…Í¡±¥ˆ¹Í¡„ÈÔØ¡‰±½ˆ¤¹¡•á‘¥•ÍĞ ¤„õ•áÁ•Ñ•‘}¡…Í¡•Ím¹…µ•tèÉ…¥Í”IÕ¹Ñ¥µ•ÉÉ½È¡˜i•¹½‘¼ÁÕ‰±¥ŒM!´ÈÔØµ¥Íµ…Ñ èí¹…µ•ôœ¤(€€€Ù…±¥‘…Ñ•}É•µ½Ñ•}É•±•…Í•}…Õá¥±¥…É¥•Ì¡‰±½‰Ì±É•½É±‘½¤±½¹•ÁĞ¤(€€€É•ÑÕÉ¸ìÍÑ…”œèi9==}AU	1%}YI%%œ°É•±•…Í”œéÙ•ÉÍ¥½¸°É•½É‘%œéÍÑÈ¡É•½É¤°Ù•ÉÍ¥½¹½¤œé‘½¤°½¹•ÁÑ½¤œé½¹•ÁĞ°ÁÕ‰±¥¥±•Ìœé±•¸¡™¥±•Ì¤°¥¹Ñ•É¥ÑäœèAMLô()‘•˜Ù•É¥™å}ÁÕ‰±¥Œ¡…ÉÌ±Ñ½­•¸¤è(€€€•áÁ•Ñ•õ9½¹”(€€€ÍÑ…•}Á…Ñ õIU9Q%5¼é•¹½‘¼µÍÑ…”¹©Í½¸œ(€€€¥˜ÍÑ…•}Á…Ñ ¹•á¥ÍÑÌ ¤è•áÁ•Ñ•õ©Í½¸¹±½…‘Ì¡ÍÑ…•}Á…Ñ ¹É•…‘}Ñ•áĞ ¤¤¹•Ğ Í¡„ÈÔØœ¤(€€€ÍÑ…Ñ”õÙ•É¥™å}ÁÕ‰±¥}É•½É¡Ñ½­•¸±ÍÑÈ¡…ÉÌ¹É•½É¤±…ÉÌ¹‘½¤±…ÉÌ¹Ù•ÉÍ¥½¸±…ÉÌ¹½¹•ÁÑ}‘½¤±•áÁ•Ñ•¤ìÁÉ¥¹Ğ¡©Í½¸¹‘ÕµÁÌ¡ÍÑ…Ñ”±Í•Á…É…Ñ½ÉÌô œ°œ°œèœ¤¤¤()‘•˜Í•±™}Ñ•ÍÑ}ÁÕ‰±¥…Ñ¥½¹}½¹Ñ•áĞ ¤è(€€€É•±•…Í”õ±½…‘}É•±•…Í” ¤ìèõÉ•±•…Í•l‰‘…Ñ…Í•Ğ‰ul‰é•¹½‘¼‰t(€€€µ•Ñ…‘…Ñ„õ…¹½¹¥…±}µ•Ñ…‘…Ñ„¡É•±•…Í•l‰É•±•…Í”‰t±É•±•…Í•l‰‘…Ñ•5½‘¥™¥•‰t±él‰Ù•ÉÍ¥½¹½¤‰t±él‰½¹•ÁÑ½¤‰t¤(€€€É•…Ñ½Èô¡µ•Ñ…‘…Ñ„¹•Ğ ‰É•…Ñ½ÉÌˆ¤½Èmíõt¥lÁt(€€€¥˜€¡µ•Ñ…‘…Ñ„¹•Ğ ‰Ñ¥Ñ±”ˆ¤„õÉ•±•…Í•l‰‘…Ñ…Í•Ğ‰ul‰¹…µ”‰t½ÈÉ•…Ñ½È¹•Ğ ‰½É¥ˆ¤„õÉ•±•…Í•l‰ÁÉ¥µ…Éå¹Ñ¥Ñä‰ul‰½É¥‰t½ÈÉ•±•…Í•l‰ÁÉ¥µ…Éå¹Ñ¥Ñä‰ul‰İ¥­¥‘…Ñ„‰t¹½Ğ¥¸©Í½¸¹‘ÕµÁÌ¡µ•Ñ…‘…Ñ„±•¹ÍÕÉ•}…Í¥¤õ…±Í”¤¤è(€€€€€€€É…¥Í”IÕ¹Ñ¥µ•ÉÉ½È ‰i•¹½‘¼ÁÕ‰±¥…Ñ¥½¸µ½¹Ñ•áĞÍ•±˜µÑ•ÍĞ™…¥±•ˆ¤(€€€ÁÉ¥¹Ğ¡©Í½¸¹‘ÕµÁÌ¡ì‰ÁÕ‰±¥…Ñ¥½¹½¹Ñ•áĞˆè‰AMLˆ°‰É•±•…Í”ˆéÉ•±•…Í•l‰É•±•…Í”‰t°‰ÁÉ¥µ…Éå¹Ñ¥ÑäˆéÉ•±•…Í•l‰ÁÉ¥µ…Éå¹Ñ¥Ñä‰ul‰İ¥­¥‘…Ñ„‰t°‰½É¥ˆéÉ•±•…Í•l‰ÁÉ¥µ…Éå¹Ñ¥Ñä‰ul‰½É¥‰t°‰‘…Ñ…Í•ĞˆéÉ•±•…Í•l‰‘…Ñ…Í•Ğ‰ul‰¥‰uô±Í•Á…É…Ñ½ÉÌô ˆ°ˆ°ˆèˆ¤¤¤()‘•˜µ…¥¸ ¤è(€€€¥˜ÍåÌ¹…ÉÙlÄétôõl‰Í•±˜µÑ•ÍĞµÁÕ‰±¥…Ñ¥½¸µ½¹Ñ•áĞ‰tè(€€€€€€€Í•±™}Ñ•ÍÑ}ÁÕ‰±¥…Ñ¥½¹}½¹Ñ•áĞ ¤ìÉ•ÑÕÉ¸(€€€Á…ÉÍ•È€ô…ÉÁ…ÉÍ”¹ÉÕµ•¹ÑA…ÉÍ•È ¤(€€€ÍÕˆ€ôÁ…ÉÍ•È¹…‘‘}ÍÕ‰Á…ÉÍ•ÉÌ¡‘•ÍĞô‰…Ñ¥½¸ˆ°É•ÅÕ¥É•õQÉÕ”¤((€€€É•Í•ÉÙ•}Á…ÉÍ•È€ôÍÕˆ¹…‘‘}Á…ÉÍ•È ‰É•Í•ÉÙ”ˆ¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÕÉÉ•¹ĞµÉ•½Éˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÕÉÉ•¹Ğµ‘½¤ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÕÉÉ•¹ĞµÙ•ÉÍ¥½¸ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µ½¹•ÁĞµ‘½¤ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÙ•ÉÍ¥½¸ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µ‘…Ñ”ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€É•Í•ÉÙ•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ (€€€€€€€€ˆ´µ½ÕÑÁÕĞˆ°‘•™…Õ±Ğôˆ¹É•±•…Í”½ÉÕ¹Ñ¥µ”½é•¹½‘¼µÉ•Í•ÉÙ…Ñ¥½¸¹©Í½¸ˆ(€€€€¤((€€€ÍÑ…•}Á…ÉÍ•È€ôÍÕˆ¹…‘‘}Á…ÉÍ•È ‰ÍÑ…”ˆ¤(€€€ÍÑ…•}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÙ•ÉÍ¥½¸ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€ÍÕˆ¹…‘‘}Á…ÉÍ•È ‰ÁÉ•Á…É”µ…Õá¥±¥…É¥•Ìˆ¤(€€€ÍÕˆ¹…‘‘}Á…ÉÍ•È ‰ÁÕ‰±¥Í ˆ¤((€€€Ù•É¥™å}Á…ÉÍ•È€ôÍÕˆ¹…‘‘}Á…ÉÍ•È ‰Ù•É¥™äµÁÕ‰±¥Œˆ¤(€€€Ù•É¥™å}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÉ•½Éˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€Ù•É¥™å}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µ‘½¤ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€Ù•É¥™å}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µ½¹•ÁĞµ‘½¤ˆ°É•ÅÕ¥É•õQÉÕ”¤(€€€Ù•É¥™å}Á…ÉÍ•È¹…‘‘}…ÉÕµ•¹Ğ ˆ´µÙ•ÉÍ¥½¸ˆ°É•ÅÕ¥É•õQÉÕ”¤((€€€…ÉÌ€ôÁ…ÉÍ•È¹Á…ÉÍ•}…ÉÌ ¤(€€€¥˜…ÉÌ¹…Ñ¥½¸€ôô€‰ÁÉ•Á…É”µ…Õá¥±¥…É¥•Ìˆè(€€€€€€€ÁÉ•Á…É•}…Õá¥±¥…É¥•Ì ¤(€€€€€€€É•ÑÕÉ¸(€€€Ñ½­•¸€ô½Ì¹•¹Ù¥É½¸¹•Ğ ‰i9==}Q=-8ˆ°€ˆˆ¤(€€€¥˜¹½ĞÑ½­•¸è(€€€€€€€É…¥Í”MåÍÑ•µá¥Ğ ‰i9==}Q=-8¥ÌÉ•ÅÕ¥É•ˆ¤(€€€¥˜…ÉÌ¹…Ñ¥½¸€ôô€‰É•Í•ÉÙ”ˆè(€€€€€€€É•Í•ÉÙ”¡…ÉÌ°Ñ½­•¸¤(€€€•±¥˜…ÉÌ¹…Ñ¥½¸€ôô€‰ÍÑ…”ˆè(€€€€€€€ÍÑ…”¡…ÉÌ°Ñ½­•¸¤(€€€•±¥˜…ÉÌ¹…Ñ¥½¸€ôô€‰ÁÕ‰±¥Í ˆè(€€€€€€€ÁÕ‰±¥Í ¡…ÉÌ°Ñ½­•¸¤(€€€•±Í”è(€€€€€€€Ù•É¥™å}ÁÕ‰±¥Œ¡…ÉÌ°Ñ½­•¸¤(()¥˜}}¹…µ•}|€ôô€‰}}µ…¥¹}|ˆè(€€€µ…¥¸ ¤(