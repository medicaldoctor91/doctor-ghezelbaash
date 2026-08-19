#!/usr/bin/env python3
import requests,json,os,time
WD='https://www.wikidata.org/w/api.php'; ITEM='Q141099455'; WORK='Q386724'; PERSON='Q140287622'
USER=os.environ['WIKIMEDIA_USERNAME']; PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
s=requests.Session(); s.headers.update({'User-Agent':'Q140287622-ConstraintFix/1.0 (https://www.ghezelbaash.ir/)'})
def get(**p):
 p.update(format='json',formatversion=2,maxage=0,smaxage=0); r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json();
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def post(**p):
 p.update(format='json',formatversion=2); r=s.post(WD,data=p,timeout=90); r.raise_for_status(); d=r.json();
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def login():
 t=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']; d=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=t)
 if d.get('login',{}).get('result')!='Success': raise RuntimeError(d)
def csrf(): return get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
def p31_values():
 e=get(action='wbgetentities',ids=ITEM,props='claims|sitelinks')['entities'][ITEM]
 sl=e.get('sitelinks',{}).get('enwikiversity',{}).get('title')
 if sl!='Botulinum toxin in aesthetic medicine': raise RuntimeError({'unexpected_sitelink':sl})
 vals=[]
 for c in e.get('claims',{}).get('P31',[]):
  try: vals.append(c['mainsnak']['datavalue']['value']['id'])
  except Exception: pass
 return vals
before=p31_values(); created=False
if WORK not in before:
 login(); target=json.dumps({'entity-type':'item','id':WORK},separators=(',',':'))
 d=post(action='wbcreateclaim',entity=ITEM,property='P31',snaktype='value',value=target,summary='Classify this existing Wikiversity educational resource as a work; fixes the P3919 value-type constraint on its contributor item',token=csrf(),assert='user')
 if not d.get('claim'): raise RuntimeError(d)
 created=True; time.sleep(2)
after=p31_values()
if WORK not in after: raise RuntimeError({'readback_failed':after})
constraints=get(action='wbcheckconstraints',id=PERSON).get('wbcheckconstraints',{}).get(PERSON,{})
viol=[]
for p,cs in constraints.get('claims',{}).items():
 for c in cs:
  for r in c.get('mainsnak',{}).get('results',[]) or []:
   viol.append({'property':p,'claim':c.get('id'),'status':r.get('status'),'message':r.get('message-html')})
print(json.dumps({'ok':True,'item':ITEM,'before_P31':before,'created':created,'after_P31':after,'person_constraint_violations':viol},ensure_ascii=False,indent=2))