#!/usr/bin/env python3
import json, os, re, time
from pathlib import Path
from urllib.parse import quote
import requests

CFG=Path('wikimedia/external-strengthening-2026-08-16.json')
API='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataDuplicateAuditor/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
s=requests.Session(); s.headers.update({'User-Agent':UA})

def get(**p):
    p.setdefault('format','json'); p.setdefault('formatversion','2')
    r=s.get(API,params=p,timeout=60); r.raise_for_status(); j=r.json()
    if 'error' in j: raise RuntimeError(j['error'])
    return j

def norm(d):
    d=(d or '').strip()
    for pref in ('https://doi.org/','http://doi.org/','doi:'):
        if d.lower().startswith(pref): d=d[len(pref):]
    return d.strip()

def search_doi(doi):
    doi=norm(doi)
    queries=[f'haswbstatement:P356={doi.upper()}',f'haswbstatement:P356={doi.lower()}',f'"{doi}"']
    qids=[]
    for q in queries:
        j=get(action='query',list='search',srsearch=q,srnamespace='0',srlimit='50',srprop='')
        for hit in j.get('query',{}).get('search',[]):
            title=hit.get('title','')
            if re.fullmatch(r'Q\d+',title): qids.append(title)
    # exact verify via entity P356
    out=[]
    for qid in dict.fromkeys(qids):
        e=get(action='wbgetentities',ids=qid,props='claims').get('entities',{}).get(qid,{})
        for st in e.get('claims',{}).get('P356',[]):
            try: val=st['mainsnak']['datavalue']['value']
            except Exception: continue
            if norm(val).lower()==doi.lower():
                out.append(qid); break
    return sorted(set(out),key=lambda q:int(q[1:]))

def main():
    cfg=json.loads(CFG.read_text())
    dois=[]
    for e in cfg.get('incoming_citations',[]): dois.append(e['doi'])
    # include the two target publication DOIs too
    dois += ['10.4103/2008-7802.182734','10.3390/healthcare9091169']
    report={}
    for d in dict.fromkeys(dois):
        report[d]=search_doi(d)
        time.sleep(.4)
    print(json.dumps(report,indent=2,ensure_ascii=False))
if __name__=='__main__': main()
