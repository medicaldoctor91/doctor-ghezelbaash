#!/usr/bin/env python3
"""Deterministic tests for the canonical Zenodo release lifecycle."""
from __future__ import annotations
import argparse
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('zenodo_release',ROOT/'scripts/zenodo_release.py')
if SPEC is None or SPEC.loader is None: raise RuntimeError('Unable to import canonical Zenodo lifecycle')
z=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(z)

RELEASE={
  'release':'1.2.5',
  'canonicalUrl':'https://www.ghezelbaash.ir/',
  'primaryEntity':{'orcid':'0009-0001-9346-8475','wikidata':'Q140287622','name':'Saeed Ghezelbash','irimc':'167430','googleKnowledgeGraphId':'/g/11nqdfk76c'},
  'dataset':{
    'name':'Dr. Saeed Ghezelbash Public Knowledge Graph',
    'id':'https://www.ghezelbaash.ir/graph.jsonld#dataset',
    'github':{'repository':'https://github.com/medicaldoctor91/doctor-ghezelbaash'},
    'huggingFace':{'dataset':'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'},
    'zenodo':{
      'conceptDoi':'10.5281/zenodo.18765168',
      'releaseHistory':[
        {'release':'1.2.5','recordId':'22216583','versionDoi':'10.5281/zenodo.22216583','publicationDate':'2026-08-31'},
        {'release':'1.2.6','recordId':'22651268','versionDoi':'10.5281/zenodo.22651268','publicationDate':'2026-09-08'},
      ],
    },
  },
}

assert z.latest_archived_release(RELEASE)['release']=='1.2.6'
duplicate=json.loads(json.dumps(RELEASE)); duplicate['dataset']['zenodo']['releaseHistory'].append(dict(duplicate['dataset']['zenodo']['releaseHistory'][-1]))
try: z.latest_archived_release(duplicate)
except RuntimeError as exc: assert 'Duplicate immutable' in str(exc)
else: raise AssertionError('duplicate Zenodo immutable identity was accepted')

predecessor={
  'id':22651268,'doi':'10.5281/zenodo.22651268','conceptdoi':'10.5281/zenodo.18765168','conceptrecid':'18765168',
  'metadata':{'version':'1.2.6','title':RELEASE['dataset']['name'],'creators':[{'orcid':RELEASE['primaryEntity']['orcid']}]},
}
published=[{
  'id':22651268,'conceptrecid':'18765168',
  'metadata':{'version':'1.2.6','title':RELEASE['dataset']['name'],'creators':[{'orcid':RELEASE['primaryEntity']['orcid']}]},
}]
draft=[{
  'id':22663811,'conceptrecid':'18765168','submitted':False,
  'metadata':{
    'version':'1.3.0','title':RELEASE['dataset']['name'],'creators':[{'orcid':RELEASE['primaryEntity']['orcid']}],
    'prereserve_doi':{'doi':'10.5281/zenodo.22663811','recid':22663811},
  },
}]
methods=[]
def fake_call(token,method,url,body=None,content_type='application/json',ok=(200,201,202,204),binary=False):
    methods.append(method)
    if url.endswith('/records/22651268'): return predecessor
    if '/deposit/depositions?' in url and 'status=published' in url: return published
    if '/deposit/depositions?' in url and 'status=draft' in url: return draft
    if url.endswith('/records/22663811'): raise RuntimeError('Zenodo HTTP 404 GET target')
    raise AssertionError(f'unexpected Zenodo call: {method} {url}')
old_load,old_call,old_write=z.load_release,z.call,z.write_state
z.load_release=lambda: json.loads(json.dumps(RELEASE)); z.call=fake_call; z.write_state=lambda name,obj: None
args=argparse.Namespace(version='1.3.0',expected_record='22663811',expected_doi='10.5281/zenodo.22663811',output='.release/runtime/zenodo-preflight.json')
try:
    with redirect_stdout(io.StringIO()): state=z.preflight(args,'token')
finally:
    z.load_release,z.call,z.write_state=old_load,old_call,old_write
assert state['targetState']=='draft'
assert state['predecessor']['release']=='1.2.6'
assert state['candidate']['recordId']=='22663811'
assert methods and set(methods)=={'GET'}

print(json.dumps({'valid':True,'latestArchive':'1.2.6','preflightMethods':sorted(set(methods)),'target':'1.3.0'},separators=(',',':')))
