#!/usr/bin/env python3
import json, requests, re, datetime
from urllib.parse import urlparse
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'
s=requests.Session(); s.headers.update({'User-Agent':'Q140287622-SemanticDigest/1.0 (https://www.ghezelbaash.ir/)','Cache-Control':'no-cache'})
def get(**p):
    p.update(format='json',formatversion=2,maxage=0,smaxage=0)
    r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def val(snak):
    if not snak or snak.get('snaktype')!='value': return None
    v=snak.get('datavalue',{}).get('value')
    if isinstance(v,dict):
        if 'id' in v:return v['id']
        if 'time' in v:return v['time']
        if 'text' in v:return v['text']
        if 'amount' in v:return v['amount']
    return v
ent=get(action='wbgetentities',ids=Q,props='info|labels|descriptions|aliases|claims|sitelinks')['entities'][Q]
rev=get(action='query',prop='revisions',titles=Q,rvprop='ids|timestamp|user|comment',rvlimit=15)['query']['pages'][0].get('revisions',[])
props=sorted(ent.get('claims',{}))
qids=set()
for p,cs in ent.get('claims',{}).items():
  for c in cs:
    x=val(c.get('mainsnak'))
    if isinstance(x,str) and re.fullmatch(r'Q\d+',x):qids.add(x)
    for qs in c.get('qualifiers',{}).values():
      for q in qs:
        x=val(q)
        if isinstance(x,str) and re.fullmatch(r'Q\d+',x):qids.add(x)
ids=props+sorted(qids)
labels={}
for i in range(0,len(ids),50):
  d=get(action='wbgetentities',ids='|'.join(ids[i:i+50]),props='labels')
  for k,e in d.get('entities',{}).items():
    ls=e.get('labels',{}); labels[k]=(ls.get('en') or ls.get('fa') or next(iter(ls.values()),{})).get('value',k)

def refinfo(c):
  rr=[]
  for ref in c.get('references',[]):
    urls=[]; stated=[]; retrieved=[]; names=[]
    for sn in ref.get('snaks',{}).get('P854',[]):
      x=val(sn)
      if isinstance(x,str): urls.append(x)
    for sn in ref.get('snaks',{}).get('P248',[]):
      x=val(sn); stated.append({'id':x,'label':labels.get(x,x)})
    for sn in ref.get('snaks',{}).get('P813',[]): retrieved.append(val(sn))
    for sn in ref.get('snaks',{}).get('P1810',[]): names.append(val(sn))
    rr.append({'urls':urls,'hosts':[urlparse(u).netloc for u in urls],'stated_in':stated,'retrieved':retrieved,'subject_named_as':names,'snak_properties':sorted(ref.get('snaks',{}))})
  return rr
rows=[]; no_refs=[]; multi_url_refs=[]; exact_dups=[]
for p in props:
  seen={}
  for c in ent['claims'][p]:
    x=val(c.get('mainsnak'))
    qs={qp:[val(z) for z in qsn] for qp,qsn in c.get('qualifiers',{}).items()}
    refs=refinfo(c)
    row={'property':p,'property_label':labels.get(p,p),'claim_id':c.get('id'),'rank':c.get('rank'),'value':x,'value_label':labels.get(x) if isinstance(x,str) and x.startswith('Q') else None,'qualifiers':qs,'references':refs}
    rows.append(row)
    if not refs:no_refs.append({'property':p,'property_label':labels.get(p,p),'claim_id':c.get('id'),'value':x,'value_label':row['value_label']})
    for r in refs:
      if len(r['urls'])>1:multi_url_refs.append({'property':p,'claim_id':c.get('id'),'urls':r['urls']})
    key=json.dumps([x,qs],sort_keys=True,ensure_ascii=False)
    if key in seen:exact_dups.append({'property':p,'property_label':labels.get(p,p),'first':seen[key],'duplicate':c.get('id'),'value':x})
    else:seen[key]=c.get('id')
# constraint check, retain raw response but cap serialization length
constraint={'ok':False}
for params in ({'action':'wbcheckconstraints','id':Q},{'action':'wbcheckconstraints','entityid':Q}):
  try:
    d=get(**params); constraint={'ok':True,'request':params,'top_keys':list(d.keys()),'raw':d}; break
  except Exception as e: constraint.setdefault('errors',[]).append({'request':params,'error':str(e)})
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastrevid':ent.get('lastrevid'),'modified':ent.get('modified'),'sitelinks':{k:v.get('title') for k,v in ent.get('sitelinks',{}).items()},'labels':{k:v.get('value') for k,v in ent.get('labels',{}).items()},'descriptions':{k:v.get('value') for k,v in ent.get('descriptions',{}).items()},'aliases':{k:[x.get('value') for x in v] for k,v in ent.get('aliases',{}).items()},'recent_revisions':rev,'statement_count':len(rows),'property_count':len(props),'statements':rows,'no_reference_statements':no_refs,'multi_url_reference_groups':multi_url_refs,'exact_duplicates':exact_dups,'constraint_check':constraint}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
