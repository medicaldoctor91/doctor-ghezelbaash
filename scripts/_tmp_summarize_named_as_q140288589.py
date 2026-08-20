#!/usr/bin/env python3
import requests, json
WD='https://www.wikidata.org/w/api.php'; Q='Q140288589'; UA='GhezelbaashNamedAsAudit/1.1 (https://www.ghezelbaash.ir/)'
def get(**p):
 p.update(format='json',formatversion=2); r=requests.get(WD,params=p,headers={'User-Agent':UA},timeout=60); r.raise_for_status(); d=r.json()
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def v(s):
 dv=s.get('datavalue')
 if not dv:return None
 x=dv['value']; return x.get('id') if isinstance(x,dict) and 'id' in x else x
e=get(action='wbgetentities',ids=Q,props='claims')['entities'][Q]
rows=[]
for p,cs in e.get('claims',{}).items():
 for c in cs:
  qs=c.get('qualifiers',{}); refs=c.get('references',[])
  if not(qs.get('P1810') or qs.get('P1932') or any(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932') for r in refs)): continue
  rr=[]
  for r in refs:
   s=r.get('snaks',{})
   rr.append({'urls':[v(x) for x in s.get('P854',[])],'P1810':[v(x) for x in s.get('P1810',[])],'P1932':[v(x) for x in s.get('P1932',[])]})
  rows.append({'property':p,'guid':c['id'],'value':v(c['mainsnak']),'qual_P1810':[v(x) for x in qs.get('P1810',[])],'qual_P1932':[v(x) for x in qs.get('P1932',[])],'refs':rr})
print(json.dumps({'count':len(rows),'rows':rows},ensure_ascii=False,indent=2))
