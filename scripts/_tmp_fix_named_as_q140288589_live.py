#!/usr/bin/env python3
import os, json, time, requests
WD='https://www.wikidata.org/w/api.php'; Q='Q140288589'; PERSON='Q140287622'
USER=os.environ['WIKIMEDIA_USERNAME']; PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
UA='GhezelbaashNamedAsRepair/1.0 (https://www.ghezelbaash.ir/)'
CLINIC_CANON='Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش'
PERSON_CANON='Dr. Saeed Ghezelbash — دکتر سعید قزلباش'
CLINIC_EN='Dr. Saeed Ghezelbash Aesthetic Clinic'
ICLINIQ_PERSON='Dr. Mohamadsaeed Ghezelbash'
OSM_PERSON='Mohammad Saeed Ghezelbash'
REL={'P138','P112','P1037','P127','P137'}
EXPECTED_PROPS={'P856','P973','P138','P112','P281','P1037','P127','P137'}
s=requests.Session(); s.headers.update({'User-Agent':UA})
def get(**p):
 p.update(format='json',formatversion=2,maxlag=5); r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json()
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def post(**p):
 p.update(format='json',formatversion=2,maxlag=5); r=s.post(WD,data=p,timeout=90); r.raise_for_status(); d=r.json()
 if 'error' in d: raise RuntimeError(d['error'])
 return d
lt=get(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
lr=post(action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
if lr.get('login',{}).get('result')!='Success': raise RuntimeError(lr)
csrf=get(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']

def entity(): return get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
def sval(x):
 dv=x.get('datavalue')
 if not dv:return None
 v=dv['value']; return v.get('id') if isinstance(v,dict) and 'id' in v else v
def clean_snak(x):
 o={'snaktype':x.get('snaktype'),'property':x.get('property')}
 if 'datavalue' in x:o['datavalue']=x['datavalue']
 if 'datatype' in x:o['datatype']=x['datatype']
 return o
def str_snak(prop,val): return {'snaktype':'value','property':prop,'datavalue':{'value':val,'type':'string'},'datatype':'string'}
def qvals(c,p): return [sval(x) for x in c.get('qualifiers',{}).get(p,[])]
def mainval(c): return sval(c['mainsnak'])
def refurls(r): return [sval(x) for x in r.get('snaks',{}).get('P854',[])]
def desired_statement_names(prop):
 if prop=='P856': return (CLINIC_CANON,None)
 if prop=='P973': return (CLINIC_EN,None)
 if prop in REL: return (CLINIC_CANON,PERSON_CANON)
 return (None,None)
def desired_ref_names(prop,urls):
 u=' '.join(urls).lower()
 if 'ghezelbaash.ir' in u:
  return CLINIC_CANON, (PERSON_CANON if prop in REL else None)
 if 'icliniq.com' in u:
  return CLINIC_EN, (ICLINIQ_PERSON if prop in REL else None)
 if 'openstreetmap.org' in u:
  return CLINIC_EN, (OSM_PERSON if prop=='P137' else None)
 if 'google.com/maps' in u:
  return CLINIC_EN, None
 if 'orcid.org' in u:
  return None, None
 return None, None

def replace_qualifiers(c,p1810,p1932,changes):
 for p,desired in [('P1810',p1810),('P1932',p1932)]:
  existing=c.get('qualifiers',{}).get(p,[])
  vals=[sval(x) for x in existing]
  if vals==([] if desired is None else [desired]): continue
  hashes=[x.get('hash') for x in existing if x.get('hash')]
  if hashes:
   post(action='wbremovequalifiers',claim=c['id'],qualifiers='|'.join(hashes),summary=f'Normalize {p} to exact subject/object source wording',token=csrf,**{'assert':'user'})
   changes.append({'statement':c['id'],'remove_qualifier':p,'old':vals})
  if desired is not None:
   post(action='wbsetqualifier',claim=c['id'],property=p,snaktype='value',value=json.dumps(desired,ensure_ascii=False),summary=f'Normalize {p} to exact subject/object source wording',token=csrf,**{'assert':'user'})
   changes.append({'statement':c['id'],'set_qualifier':p,'new':desired})
  time.sleep(.4)

def replace_reference(guid,r,p1810,p1932,changes):
 sn={k:[clean_snak(x) for x in xs] for k,xs in r.get('snaks',{}).items() if k not in ('P1810','P1932')}
 if p1810 is not None: sn['P1810']=[str_snak('P1810',p1810)]
 if p1932 is not None: sn['P1932']=[str_snak('P1932',p1932)]
 old1810=[sval(x) for x in r.get('snaks',{}).get('P1810',[])]
 old1932=[sval(x) for x in r.get('snaks',{}).get('P1932',[])]
 want1810=[] if p1810 is None else [p1810]; want1932=[] if p1932 is None else [p1932]
 if old1810==want1810 and old1932==want1932:return
 post(action='wbsetreference',statement=guid,reference=r['hash'],snaks=json.dumps(sn,ensure_ascii=False,separators=(',',':')),summary='Normalize reference-level subject/object named-as wording to the cited source',token=csrf,**{'assert':'user'})
 changes.append({'statement':guid,'reference_urls':refurls(r),'P1810':[old1810,want1810],'P1932':[old1932,want1932]})
 time.sleep(.4)

before=entity(); props={p:cs for p,cs in before.get('claims',{}).items() if any(c.get('qualifiers',{}).get('P1810') or c.get('qualifiers',{}).get('P1932') or any(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932') for r in c.get('references',[])) for c in cs)}
if set(props)!=EXPECTED_PROPS: raise RuntimeError({'unexpected_named_as_properties':sorted(props),'expected':sorted(EXPECTED_PROPS)})
for p in EXPECTED_PROPS:
 if len(before['claims'].get(p,[]))!=1: raise RuntimeError({'expected_single_statement':p,'count':len(before['claims'].get(p,[]))})
 if p in REL and mainval(before['claims'][p][0])!=PERSON: raise RuntimeError({'unexpected_relation_object':p,'value':mainval(before['claims'][p][0])})
changes=[]
for p in sorted(EXPECTED_PROPS):
 c=entity()['claims'][p][0]
 a,b=desired_statement_names(p); replace_qualifiers(c,a,b,changes)
for p in sorted(EXPECTED_PROPS):
 c=entity()['claims'][p][0]
 for r in list(c.get('references',[])):
  urls=refurls(r); a,b=desired_ref_names(p,urls)
  known=any(x in ' '.join(urls).lower() for x in ('ghezelbaash.ir','icliniq.com','openstreetmap.org','google.com/maps','orcid.org'))
  has=bool(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932'))
  if known or has: replace_reference(c['id'],r,a,b,changes)
time.sleep(2); after=entity(); checks={}
for p in sorted(EXPECTED_PROPS):
 c=after['claims'][p][0]; sa,sb=desired_statement_names(p)
 actual1810=qvals(c,'P1810'); expected1810=[] if sa is None else [sa]
 actual1932=qvals(c,'P1932'); expected1932=[] if sb is None else [sb]
 if actual1810 != expected1810: raise RuntimeError({'statement_P1810_verify':{'property':p,'actual':actual1810,'expected':expected1810}})
 if actual1932 != expected1932: raise RuntimeError({'statement_P1932_verify':{'property':p,'actual':actual1932,'expected':expected1932}})
 refs=[]
 for r in c.get('references',[]):
  urls=refurls(r); a,b=desired_ref_names(p,urls); u=' '.join(urls).lower(); known=any(x in u for x in ('ghezelbaash.ir','icliniq.com','openstreetmap.org','google.com/maps','orcid.org'))
  if known:
   av=[sval(x) for x in r.get('snaks',{}).get('P1810',[])]; bv=[sval(x) for x in r.get('snaks',{}).get('P1932',[])]
   ea=[] if a is None else [a]; eb=[] if b is None else [b]
   if av != ea: raise RuntimeError({'reference_P1810_verify':{'property':p,'urls':urls,'actual':av,'expected':ea}})
   if bv != eb: raise RuntimeError({'reference_P1932_verify':{'property':p,'urls':urls,'actual':bv,'expected':eb}})
   refs.append({'urls':urls,'P1810':av,'P1932':bv})
 checks[p]={'value':mainval(c),'P1810':actual1810,'P1932':actual1932,'references':refs}
print(json.dumps({'ok':True,'qid':Q,'changes_count':len(changes),'changes':changes,'verified':checks},ensure_ascii=False,indent=2))
