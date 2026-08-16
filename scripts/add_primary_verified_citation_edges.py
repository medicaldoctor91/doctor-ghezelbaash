#!/usr/bin/env python3
import json, os, re, time
from urllib.parse import quote
import requests

API='https://www.wikidata.org/w/api.php'
CROSSREF='https://api.crossref.org/works/{}'
USER=os.environ['WIKIMEDIA_USERNAME']
PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
UA='GhezelbaashPrimaryVerifiedCitationAdder/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
TARGET='Q140298431'
ENTRIES=[
  {
    'doi':'10.5080/u27544',
    'title':'Theory of Mind, Attachment and Metacognitive Functions in Depression',
    'source':'https://pmc.ncbi.nlm.nih.gov/articles/PMC11987535/',
    'pmid':'41070497',
    'pmcid':'PMC11987535'
  },
  {
    'doi':'10.31083/AP38786',
    'title':'Comparison of Insomnia, Depression, and Perceived Social Support among Individuals with Amphetamine Use Disorder (AUD) and Healthy Controls',
    'source':'https://www.imrpress.com/journal/AP/26/1/10.31083/AP38786',
    'pmid':'40110367',
    'pmcid':None
  }
]
s=requests.Session(); s.headers.update({'User-Agent':UA})

def norm(v):
    v=(v or '').strip()
    for p in ('https://doi.org/','http://doi.org/','doi:'):
        if v.lower().startswith(p): v=v[len(p):]
    return v.strip()

def get(**p):
    p.setdefault('format','json'); p.setdefault('formatversion','2')
    r=s.get(API,params=p,timeout=60); r.raise_for_status(); j=r.json()
    if 'error' in j: raise RuntimeError(j['error'])
    return j

def post(**p):
    p.setdefault('format','json'); p.setdefault('formatversion','2')
    for i in range(8):
        r=s.post(API,data=p,timeout=60); r.raise_for_status(); j=r.json()
        if 'error' not in j:
            time.sleep(5); return j
        txt=json.dumps(j['error'],ensure_ascii=False).lower()
        if 'actionthrottled' in txt or 'too many times in a short space' in txt:
            time.sleep(min(20+i*10,70)); continue
        raise RuntimeError(j['error'])
    raise RuntimeError('write throttled')

def login():
    lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
    j=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
    if j.get('login',{}).get('result')!='Success': raise RuntimeError(j)
    return get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']

def ent(qid):
    e=get(action='wbgetentities',ids=qid,props='claims|labels|descriptions').get('entities',{}).get(qid)
    if not e or e.get('missing'): raise RuntimeError(f'missing {qid}')
    return e

def sval(st):
    try:
        v=st['mainsnak']['datavalue']['value']; return v if isinstance(v,str) else None
    except Exception: return None

def qval(st):
    try:
        v=st['mainsnak']['datavalue']['value']; return v.get('id') or f"Q{v['numeric-id']}"
    except Exception: return None

def item_value(q): return {'entity-type':'item','numeric-id':int(q[1:]),'id':q}

def exact_search(doi):
    needle=norm(doi).lower(); qids=[]
    for query in (f'haswbstatement:P356={norm(doi).upper()}',f'haswbstatement:P356={norm(doi).lower()}',f'"{norm(doi)}"'):
        j=get(action='query',list='search',srsearch=query,srnamespace='0',srlimit='50',srprop='')
        for hit in j.get('query',{}).get('search',[]):
            q=hit.get('title','')
            if re.fullmatch(r'Q\d+',q): qids.append(q)
    out=[]
    for q in dict.fromkeys(qids):
        for st in ent(q).get('claims',{}).get('P356',[]):
            if norm(sval(st) or '').lower()==needle:
                out.append(q); break
    out=sorted(set(out),key=lambda q:int(q[1:]))
    if len(out)>1: raise RuntimeError(f'duplicate DOI before create {doi}: {out}')
    return out[0] if out else None

def ensure_string(qid,prop,value,token):
    for st in ent(qid).get('claims',{}).get(prop,[]):
        if (sval(st) or '').lower()==value.lower(): return False
    post(action='wbcreateclaim',entity=qid,property=prop,snaktype='value',value=json.dumps(value),token=token,summary='Add scholarly identifier')
    return True

def ensure_item(qid,prop,target,token,summary):
    for st in ent(qid).get('claims',{}).get(prop,[]):
        if qval(st)==target: return False
    post(action='wbcreateclaim',entity=qid,property=prop,snaktype='value',value=json.dumps(item_value(target)),token=token,summary=summary)
    return True

def ensure_title(qid,title,token):
    for st in ent(qid).get('claims',{}).get('P1476',[]):
        try:
            if st['mainsnak']['datavalue']['value']['text']==title: return False
        except Exception: pass
    post(action='wbcreateclaim',entity=qid,property='P1476',snaktype='value',value=json.dumps({'text':title,'language':'en'}),token=token,summary='Add scholarly article title')
    return True

def create_item(entry,token):
    data={'labels':{'en':{'language':'en','value':entry['title'][:250]}},'descriptions':{'en':{'language':'en','value':'scholarly article'}}}
    j=post(action='wbeditentity',new='item',data=json.dumps(data,ensure_ascii=False),token=token,summary='Create scholarly article item from verified DOI')
    qid=j.get('entity',{}).get('id')
    if not qid: raise RuntimeError(f'creation failed {entry}')
    ensure_item(qid,'P31','Q13442814',token,'Classify as scholarly article')
    ensure_string(qid,'P356',norm(entry['doi']).upper(),token)
    ensure_title(qid,entry['title'],token)
    if entry.get('pmid'): ensure_string(qid,'P698',entry['pmid'],token)
    if entry.get('pmcid'): ensure_string(qid,'P932',entry['pmcid'],token)
    return qid

def ensure_edge(qid,source,token):
    for st in ent(qid).get('claims',{}).get('P2860',[]):
        if qval(st)==TARGET: return False
    post(action='wbcreateclaim',entity=qid,property='P2860',snaktype='value',value=json.dumps(item_value(TARGET)),token=token,summary='Add citation to independently cited scholarly work')
    return True

def verify_primary(entry):
    body=s.get(entry['source'],timeout=60).text.lower()
    target='10.3390/healthcare9091169'
    if target not in body:
        raise RuntimeError(f'primary source does not expose target DOI: {entry["source"]}')

def main():
    token=login(); report=[]
    for e in ENTRIES:
        verify_primary(e)
        qid=exact_search(e['doi'])
        created=False
        if not qid:
            qid=create_item(e,token); created=True
        else:
            ensure_item(qid,'P31','Q13442814',token,'Classify as scholarly article')
            ensure_title(qid,e['title'],token)
            if e.get('pmid'): ensure_string(qid,'P698',e['pmid'],token)
            if e.get('pmcid'): ensure_string(qid,'P932',e['pmcid'],token)
        edge=ensure_edge(qid,e['source'],token)
        report.append({'doi':e['doi'],'qid':qid,'item_created':created,'p2860_created':edge,'primary_verified':True})
    print(json.dumps({'ok':True,'target':TARGET,'report':report},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
