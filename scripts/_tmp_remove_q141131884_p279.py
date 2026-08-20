#!/usr/bin/env python3
import json, os, requests, time
WD='https://www.wikidata.org/w/api.php'; Q='Q141131884'; TARGET='Q1162163'
USER=os.environ['WIKIMEDIA_USERNAME']; PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
s=requests.Session(); s.headers.update({'User-Agent':'GhezelbaashWikidataPositionCleanup/1.0 (https://www.ghezelbaash.ir/)'})
def get(**p):
 p.update(format='json',formatversion=2); r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json();
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def post(**p):
 p.update(format='json',formatversion=2); r=s.post(WD,data=p,timeout=90); r.raise_for_status(); d=r.json();
 if 'error' in d: raise RuntimeError(d['error'])
 return d
lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
if post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt).get('login',{}).get('result')!='Success': raise RuntimeError('login failed')
tok=get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
e=get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
p31=[c['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for c in e.get('claims',{}).get('P31',[])]
if 'Q4164871' not in p31: raise RuntimeError({'position_P31_missing':p31})
p279=[c for c in e.get('claims',{}).get('P279',[]) if c['mainsnak'].get('datavalue',{}).get('value',{}).get('id')==TARGET]
if len(p279)>1: raise RuntimeError({'duplicate_P279':len(p279)})
removed=False
if p279:
 post(action='wbremoveclaims',claim=p279[0]['id'],summary='Remove class-only subclass relation from this organization-specific position instance; P31 position is the correct membership model',token=tok,**{'assert':'user'})
 removed=True
time.sleep(1)
a=get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
a31=[c['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for c in a.get('claims',{}).get('P31',[])]
a279=[c['mainsnak'].get('datavalue',{}).get('value',{}).get('id') for c in a.get('claims',{}).get('P279',[])]
if 'Q4164871' not in a31 or TARGET in a279: raise RuntimeError({'verify_P31':a31,'verify_P279':a279})
print(json.dumps({'ok':True,'qid':Q,'removed_P279_director':removed,'P31':a31,'P279':a279},indent=2))
