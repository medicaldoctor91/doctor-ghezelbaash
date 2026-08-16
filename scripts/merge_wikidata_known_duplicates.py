#!/usr/bin/env python3
import json, os, time
import requests

API='https://www.wikidata.org/w/api.php'
USER=os.environ['WIKIMEDIA_USERNAME']
PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
UA='GhezelbaashWikidataDuplicateMerger/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'
MERGES=[
    {'from':'Q141104212','to':'Q93179398','doi':'10.1016/j.jad.2019.04.039','citation_target':'Q36942316'},
    {'from':'Q141104224','to':'Q117439006','doi':'10.3390/ijerph19159759','citation_target':'Q140298431'},
]
s=requests.Session(); s.headers.update({'User-Agent':UA})

def get(**p):
    p.setdefault('format','json'); p.setdefault('formatversion','2')
    r=s.get(API,params=p,timeout=60); r.raise_for_status(); j=r.json()
    if 'error' in j: raise RuntimeError(j['error'])
    return j

def post(**p):
    p.setdefault('format','json'); p.setdefault('formatversion','2')
    for i in range(7):
        r=s.post(API,data=p,timeout=60); r.raise_for_status(); j=r.json()
        if 'error' not in j:
            time.sleep(5); return j
        text=json.dumps(j['error'],ensure_ascii=False).lower()
        if 'actionthrottled' in text or 'too many times in a short space' in text:
            time.sleep(min(20+i*10,70)); continue
        raise RuntimeError(j['error'])
    raise RuntimeError('write throttled')

def login():
    lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
    j=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
    if j.get('login',{}).get('result')!='Success': raise RuntimeError(j)
    return get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']

def ent(qid):
    return get(action='wbgetentities',ids=qid,props='claims|info').get('entities',{}).get(qid,{})

def doi_values(qid):
    vals=[]
    for st in ent(qid).get('claims',{}).get('P356',[]):
        try: vals.append(st['mainsnak']['datavalue']['value'].lower())
        except Exception: pass
    return vals

def qvalue(st):
    try:
        v=st['mainsnak']['datavalue']['value']
        return v.get('id') or f"Q{v['numeric-id']}"
    except Exception: return None

def p2860_statements(qid,target):
    return [st for st in ent(qid).get('claims',{}).get('P2860',[]) if qvalue(st)==target]

def choose_best(sts):
    def score(st):
        return (len(st.get('references',[])), len(st.get('qualifiers',{})))
    return max(sts,key=score)

def main():
    token=login(); report=[]
    for m in MERGES:
        expected=m['doi'].lower()
        # If source already redirects after a prior successful run, treat as done.
        source=ent(m['from'])
        if source.get('redirect'):
            report.append({'from':m['from'],'to':m['to'],'already_redirect':True})
            continue
        if expected not in doi_values(m['from']) or expected not in doi_values(m['to']):
            raise RuntimeError(f"DOI identity check failed for {m}")
        post(action='wbmergeitems',fromid=m['from'],toid=m['to'],token=token,
             ignoreconflicts='description',summary=f"Merge exact duplicate scholarly item; same DOI {m['doi']}")
        time.sleep(2)
        # Remove duplicate P2860 claims only if merge produced more than one identical edge.
        sts=p2860_statements(m['to'],m['citation_target'])
        removed=[]
        if len(sts)>1:
            keep=choose_best(sts)
            for st in sts:
                if st['id']==keep['id']: continue
                post(action='wbremoveclaims',claim=st['id'],token=token,summary='Remove duplicate citation statement after exact-item merge')
                removed.append(st['id'])
        after=ent(m['from'])
        dest_edges=p2860_statements(m['to'],m['citation_target'])
        report.append({'from':m['from'],'to':m['to'],'redirect':bool(after.get('redirect')),'target_edge_count':len(dest_edges),'removed_duplicate_claims':removed})
    print(json.dumps({'ok':True,'report':report},ensure_ascii=False,indent=2))
if __name__=='__main__': main()
