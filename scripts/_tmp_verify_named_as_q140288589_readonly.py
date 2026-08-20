#!/usr/bin/env python3
import json, requests
WD='https://www.wikidata.org/w/api.php'; Q='Q140288589'; PERSON='Q140287622'
UA='GhezelbaashNamedAsVerify/1.0 (https://www.ghezelbaash.ir/)'
CLINIC_CANON='Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش'
PERSON_CANON='Dr. Saeed Ghezelbash — دکتر سعید قزلباش'
CLINIC_EN='Dr. Saeed Ghezelbash Aesthetic Clinic'; ICLINIQ_PERSON='Dr. Mohamadsaeed Ghezelbash'; OSM_PERSON='Mohammad Saeed Ghezelbash'
TARGET={'P856':'Q140288589$2fd74fdd-4efe-2413-d945-96afc2c0077c','P973':'Q140288589$EE96F1C1-3C47-4FA6-86FA-50BB8FB6B320','P138':'Q140288589$7de10a43-4e1b-121d-0330-aab5dc6d8773','P112':'Q140288589$510c7dfe-471a-21d7-7d27-72d1f29d630c','P281':'Q140288589$17780463-998D-4145-819E-306BA2D302E5','P1037':'Q140288589$82201163-BA66-4635-9CFF-CF522F0B2C09','P127':'Q140288589$E81AC15C-8E78-4A83-8A1E-FE348A0B038F','P137':'Q140288589$9956E05C-B188-40E9-9F9E-E50E9183CD17'}
REL={'P138','P112','P1037','P127','P137'}
def get(**p):
 p.update(format='json',formatversion=2); r=requests.get(WD,params=p,headers={'User-Agent':UA},timeout=90); r.raise_for_status(); d=r.json()
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def sval(x):
 dv=x.get('datavalue'); v=dv.get('value') if dv else None
 return v.get('id') if isinstance(v,dict) and 'id' in v else v
def qvals(c,p): return [sval(x) for x in c.get('qualifiers',{}).get(p,[])]
def urls(r): return [sval(x) for x in r.get('snaks',{}).get('P854',[])]
def claim(e,p):
 cs=[c for c in e.get('claims',{}).get(p,[]) if c.get('id')==TARGET[p]]
 if len(cs)!=1: raise RuntimeError({'target_guid':p,'count':len(cs)})
 return cs[0]
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
e=get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
named=set(); rows={}
for p,cs in e.get('claims',{}).items():
 for c in cs:
  if c.get('qualifiers',{}).get('P1810') or c.get('qualifiers',{}).get('P1932') or any(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932') for r in c.get('references',[])): named.add(c['id'])
if named!=set(TARGET.values()): raise RuntimeError({'named_guid_set':sorted(named),'expected':sorted(TARGET.values())})
for p in TARGET:
 c=claim(e,p); value=sval(c['mainsnak'])
 if p in REL and value!=PERSON: raise RuntimeError({'relation_object':p,'actual':value})
 a,b=stmt_names(p); ea=[] if a is None else [a]; eb=[] if b is None else [b]
 if qvals(c,'P1810')!=ea or qvals(c,'P1932')!=eb: raise RuntimeError({'statement_names':p,'actual':[qvals(c,'P1810'),qvals(c,'P1932')],'expected':[ea,eb]})
 rr=[]
 for r in c.get('references',[]):
  us=urls(r); low=' '.join(us).lower(); known=any(x in low for x in ('ghezelbaash.ir','icliniq.com','openstreetmap.org','google.com/maps','orcid.org'))
  av=[sval(x) for x in r.get('snaks',{}).get('P1810',[])]; bv=[sval(x) for x in r.get('snaks',{}).get('P1932',[])]
  if known:
   ra,rb=ref_names(p,us); rea=[] if ra is None else [ra]; reb=[] if rb is None else [rb]
   if av!=rea or bv!=reb: raise RuntimeError({'reference_names':p,'urls':us,'actual':[av,bv],'expected':[rea,reb]})
  elif av or bv: raise RuntimeError({'unexpected_named_as_on_unknown_reference':p,'urls':us,'P1810':av,'P1932':bv})
  if av or bv: rr.append({'urls':us,'P1810':av,'P1932':bv})
 other={k:[sval(x) for x in v] for k,v in c.get('qualifiers',{}).items() if k not in ('P1810','P1932')}
 rows[p]={'guid':c['id'],'value':value,'P1810':qvals(c,'P1810'),'P1932':qvals(c,'P1932'),'other_qualifiers':other,'named_references':rr}
if rows['P1037']['other_qualifiers'].get('P3831')!=['Q256688']: raise RuntimeError({'P1037_role_preservation':rows['P1037']['other_qualifiers']})
print(json.dumps({'ok':True,'qid':Q,'named_statement_count':len(named),'all_named_as_occurrences_accounted_for':True,'direct_person_relations_preserved':all(rows[p]['value']==PERSON for p in REL),'P1037_medical_director_role_preserved':True,'verified':rows},ensure_ascii=False,indent=2))
