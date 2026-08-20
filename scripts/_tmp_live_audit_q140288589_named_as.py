#!/usr/bin/env python3
import json, requests, datetime
WD='https://www.wikidata.org/w/api.php'; Q='Q140288589'
UA='GhezelbaashNamedAsAudit/1.0 (https://www.ghezelbaash.ir/)'
s=requests.Session(); s.headers.update({'User-Agent':UA})
def get(**p):
 p.update(format='json',formatversion=2); r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json();
 if 'error' in d: raise RuntimeError(d['error'])
 return d
def val(snak):
 dv=snak.get('datavalue');
 if not dv: return None
 v=dv.get('value')
 if isinstance(v,dict) and 'id' in v: return v['id']
 if isinstance(v,dict) and 'text' in v: return v['text']
 return v
ent=get(action='wbgetentities',ids=Q,props='info|labels|descriptions|claims',languages='en|fa')['entities'][Q]
# labels for properties and item-valued objects
prop_ids=set(); item_ids=set()
for p,claims in ent.get('claims',{}).items():
 prop_ids.add(p)
 for c in claims:
  v=val(c.get('mainsnak',{}));
  if isinstance(v,str) and v.startswith('Q'): item_ids.add(v)
  for qp in c.get('qualifiers',{}): prop_ids.add(qp)
  for ref in c.get('references',[]):
   for rp in ref.get('snaks',{}): prop_ids.add(rp)
ids=list(prop_ids|item_ids)
meta={}
for i in range(0,len(ids),50):
 chunk=ids[i:i+50]
 d=get(action='wbgetentities',ids='|'.join(chunk),props='labels',languages='en|fa')['entities']
 meta.update(d)
def label(x):
 e=meta.get(x,{})
 return e.get('labels',{}).get('en',{}).get('value') or e.get('labels',{}).get('fa',{}).get('value') or x
rows=[]; qocc=0; rocc=0
for p,claims in ent.get('claims',{}).items():
 for c in claims:
  q1810=[val(x) for x in c.get('qualifiers',{}).get('P1810',[])]
  q1932=[val(x) for x in c.get('qualifiers',{}).get('P1932',[])]
  refs=[]
  for idx,ref in enumerate(c.get('references',[]),1):
   r1810=[val(x) for x in ref.get('snaks',{}).get('P1810',[])]
   r1932=[val(x) for x in ref.get('snaks',{}).get('P1932',[])]
   if r1810 or r1932:
    refs.append({'index':idx,'P1810':r1810,'P1932':r1932,'P854':[val(x) for x in ref.get('snaks',{}).get('P854',[])],'P248':[val(x) for x in ref.get('snaks',{}).get('P248',[])]})
    rocc += len(r1810)+len(r1932)
  if q1810 or q1932 or refs:
   v=val(c.get('mainsnak',{})); qocc += len(q1810)+len(q1932)
   rows.append({'property':p,'property_label':label(p),'guid':c.get('id'),'rank':c.get('rank'),'object_value':v,'object_label':label(v) if isinstance(v,str) and v.startswith('Q') else None,'qualifier_P1810':q1810,'qualifier_P1932':q1932,'references_named_as':refs,'reference_count':len(c.get('references',[]))})
out={'fetched_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'qid':Q,'lastrevid':ent.get('lastrevid'),'modified':ent.get('modified'),'labels':ent.get('labels',{}),'total_claim_properties':len(ent.get('claims',{})),'statements_with_named_as':len(rows),'qualifier_named_as_occurrences':qocc,'reference_named_as_occurrences':rocc,'rows':rows}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
