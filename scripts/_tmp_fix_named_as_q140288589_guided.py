#!/usr/bin/env python3
import os, json, time, requests
WD='https://www.wikidata.org/w/api.php'; Q='Q140288589'; PERSON='Q140287622'
USER=os.environ['WIKIMEDIA_USERNAME']; PASS=os.environ['WIKIMEDIA_BOT_PASSWORD']
UA='GhezelbaashNamedAsRepair/2.0 (https://www.ghezelbaash.ir/)'
CLINIC_CANON='Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش'
PERSON_CANON='Dr. Saeed Ghezelbash — دکتر سعید قزلباش'
CLINIC_EN='Dr. Saeed Ghezelbash Aesthetic Clinic'
ICLINIQ_PERSON='Dr. Mohamadsaeed Ghezelbash'
OSM_PERSON='Mohammad Saeed Ghezelbash'
TARGET={
 'P856':'Q140288589$2fd74fdd-4efe-2413-d945-96afc2c0077c',
 'P973':'Q140288589$EE96F1C1-3C47-4FA6-86FA-50BB8FB6B320',
 'P138':'Q140288589$7de10a43-4e1b-121d-0330-aab5dc6d8773',
 'P112':'Q140288589$510c7dfe-471a-21d7-7d27-72d1f29d630c',
 'P281':'Q140288589$17780463-998D-4145-819E-306BA2D302E5',
 'P1037':'Q140288589$82201163-BA66-4635-9CFF-CF522F0B2C09',
 'P127':'Q140288589$E81AC15C-8E78-4A83-8A1E-FE348A0B038F',
 'P137':'Q140288589$9956E05C-B188-40E9-9F9E-E50E9183CD17',
}
REL={'P138','P112','P1037','P127','P137'}
s=requests.Session(); s.headers.update({'User-Agent':UA})
def api(method='get',**p):
 p.update(format='json',formatversion=2)
 r=(s.get if method=='get' else s.post)(WD,params=p if method=='get' else None,data=p if method!='get' else None,timeout=90)
 r.raise_for_status(); d=r.json()
 if 'error' in d: raise RuntimeError(d['error'])
 return d
lt=api(action='query',meta='tokens',type='login')['query']['tokens']['logintoken']
lr=api('post',action='login',lgname=USER,lgpassword=PASS,lgtoken=lt)
if lr.get('login',{}).get('result')!='Success': raise RuntimeError(lr)
csrf=api(action='query',meta='tokens',type='csrf')['query']['tokens']['csrftoken']
def entity(): return api(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
def sval(x):
 dv=x.get('datavalue'); v=dv.get('value') if dv else None
 return v.get('id') if isinstance(v,dict) and 'id' in v else v
def mainval(c): return sval(c['mainsnak'])
def qvals(c,p): return [sval(x) for x in c.get('qualifiers',{}).get(p,[])]
def urls(r): return [sval(x) for x in r.get('snaks',{}).get('P854',[])]
def claim(e,p):
 cs=[c for c in e.get('claims',{}).get(p,[]) if c.get('id')==TARGET[p]]
 if len(cs)!=1: raise RuntimeError({'target_guid_missing_or_duplicate':p,'guid':TARGET[p],'count':len(cs)})
 return cs[0]
def clean_snak(x):
 o={'snaktype':x.get('snaktype'),'property':x.get('property')}
 if 'datavalue' in x:o['datavalue']=x['datavalue']
 if 'datatype' in x:o['datatype']=x['datatype']
 return o
def str_snak(p,v): return {'snaktype':'value','property':p,'datavalue':{'value':v,'type':'string'},'datatype':'string'}
def stmt_names(p):
 if p=='P856': return CLINIC_CANON,None
 if p=='P973': return CLINIC_EN,None
 if p in REL: return CLINIC_CANON,PERSON_CANON
 return None,None
def ref_names(p,us):
 u=' '.join(us).lower()
 if 'ghezelbaash.ir' in u: return CLINIC_CANON,(PERSON_CANON if p in REL else None)
 if 'icliniq.com' in u: return CLINIC_EN,(ICLINIQ_PERSON if p in REL else None)
 if 'openstreetmap.org' in u: return CLINIC_EN,(OSM_PERSON if p=='P137' else None)
 if 'google.com/maps' in u: return CLINIC_EN,None
 if 'orcid.org' in u: return None,None
 return None,None
def set_quals(c,a,b,changes):
 for p,want in [('P1810',a),('P1932',b)]:
  old=c.get('qualifiers',{}).get(p,[]); oldvals=[sval(x) for x in old]; wantvals=[] if want is None else [want]
  if oldvals==wantvals: continue
  hs=[x.get('hash') for x in old if x.get('hash')]
  if hs: api('post',action='wbremovequalifiers',claim=c['id'],qualifiers='|'.join(hs),summary=f'Correct {p} subject/object wording',token=csrf,**{'assert':'user'})
  if want is not None: api('post',action='wbsetqualifier',claim=c['id'],property=p,snaktype='value',value=json.dumps(want,ensure_ascii=False),summary=f'Correct {p} subject/object wording',token=csrf,**{'assert':'user'})
  changes.append({'guid':c['id'],'qualifier':p,'from':oldvals,'to':wantvals}); time.sleep(.25)
def set_ref(c,r,a,b,changes):
 olda=[sval(x) for x in r.get('snaks',{}).get('P1810',[])]; oldb=[sval(x) for x in r.get('snaks',{}).get('P1932',[])]
 wa=[] if a is None else [a]; wb=[] if b is None else [b]
 if olda==wa and oldb==wb:return
 sn={k:[clean_snak(x) for x in xs] for k,xs in r.get('snaks',{}).items() if k not in ('P1810','P1932')}
 if a is not None: sn['P1810']=[str_snak('P1810',a)]
 if b is not None: sn['P1932']=[str_snak('P1932',b)]
 api('post',action='wbsetreference',statement=c['id'],reference=r['hash'],snaks=json.dumps(sn,ensure_ascii=False,separators=(',',':')),summary='Correct source-specific subject/object named-as wording',token=csrf,**{'assert':'user'})
 changes.append({'guid':c['id'],'reference_urls':urls(r),'P1810':[olda,wa],'P1932':[oldb,wb]}); time.sleep(.25)
# Preflight: exact audited GUIDs still exist and relational objects still point directly to the doctor.
before=entity()
for p in TARGET:
 c=claim(before,p)
 if p in REL and mainval(c)!=PERSON: raise RuntimeError({'relation_object_drift':p,'actual':mainval(c)})
# No unexpected statement with named-as data may appear outside the audited GUID set.
named=set()
for p,cs in before.get('claims',{}).items():
 for c in cs:
  if c.get('qualifiers',{}).get('P1810') or c.get('qualifiers',{}).get('P1932') or any(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932') for r in c.get('references',[])): named.add(c['id'])
if named != set(TARGET.values()): raise RuntimeError({'named_as_guid_drift':sorted(named),'expected':sorted(TARGET.values())})
changes=[]
for p in TARGET:
 c=claim(entity(),p); a,b=stmt_names(p); set_quals(c,a,b,changes)
for p in TARGET:
 c=claim(entity(),p)
 for r in list(c.get('references',[])):
  us=urls(r); low=' '.join(us).lower(); known=any(x in low for x in ('ghezelbaash.ir','icliniq.com','openstreetmap.org','google.com/maps','orcid.org'))
  has=bool(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932'))
  if known or has:
   a,b=ref_names(p,us); set_ref(c,r,a,b,changes)
time.sleep(2)
after=entity(); verified={}
for p in TARGET:
 c=claim(after,p); a,b=stmt_names(p); ea=[] if a is None else [a]; eb=[] if b is None else [b]
 if qvals(c,'P1810')!=ea or qvals(c,'P1932')!=eb: raise RuntimeError({'statement_verify':p,'P1810':qvals(c,'P1810'),'P1932':qvals(c,'P1932'),'expected':[ea,eb]})
 rr=[]
 for r in c.get('references',[]):
  us=urls(r); low=' '.join(us).lower(); known=any(x in low for x in ('ghezelbaash.ir','icliniq.com','openstreetmap.org','google.com/maps','orcid.org'))
  if known:
   a,b=ref_names(p,us); ea=[] if a is None else [a]; eb=[] if b is None else [b]; av=[sval(x) for x in r.get('snaks',{}).get('P1810',[])]; bv=[sval(x) for x in r.get('snaks',{}).get('P1932',[])]
   if av!=ea or bv!=eb: raise RuntimeError({'reference_verify':p,'urls':us,'actual':[av,bv],'expected':[ea,eb]})
   rr.append({'urls':us,'P1810':av,'P1932':bv})
 verified[p]={'guid':c['id'],'value':mainval(c),'P1810':qvals(c,'P1810'),'P1932':qvals(c,'P1932'),'references':rr,'other_qualifier_properties':sorted(k for k in c.get('qualifiers',{}) if k not in ('P1810','P1932'))}
print(json.dumps({'ok':True,'qid':Q,'changes_count':len(changes),'changes':changes,'verified':verified},ensure_ascii=False,indent=2))
