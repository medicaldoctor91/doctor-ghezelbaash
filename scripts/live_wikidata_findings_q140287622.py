#!/usr/bin/env python3
import json, requests, re, datetime
from urllib.parse import urlparse
WD='https://www.wikidata.org/w/api.php'; Q='Q140287622'; CHILD='Q141099455'
s=requests.Session(); s.headers.update({'User-Agent':'Q140287622-Findings/1.1 (https://www.ghezelbaash.ir/)','Cache-Control':'no-cache'})
def get(**p):
    p.update(format='json',formatversion=2,maxage=0,smaxage=0)
    r=s.get(WD,params=p,timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d
def val(snak):
    if not snak or snak.get('snaktype')!='value': return None
    v=snak.get('datavalue',{}).get('value')
    if isinstance(v,dict):
        for k in ('id','time','text','amount'):
            if k in v:return v[k]
    return v
ent=get(action='wbgetentities',ids=Q,props='info|claims|sitelinks')['entities'][Q]
child=get(action='wbgetentities',ids=CHILD,props='info|claims|sitelinks')['entities'][CHILD]
ids=set(ent.get('claims',{}).keys())
for cs in ent.get('claims',{}).values():
    for c in cs:
        x=val(c.get('mainsnak'))
        if isinstance(x,str) and re.fullmatch(r'Q\d+',x): ids.add(x)
labels={}
sl=sorted(ids)
for i in range(0,len(sl),50):
    d=get(action='wbgetentities',ids='|'.join(sl[i:i+50]),props='labels')
    for k,e in d.get('entities',{}).items():
        labs=e.get('labels',{}); labels[k]=(labs.get('en') or labs.get('fa') or next(iter(labs.values()),{})).get('value',k)
cc=get(action='wbcheckconstraints',id=Q).get('wbcheckconstraints',{}).get(Q,{}).get('claims',{})
viol=[]
for p,claims in cc.items():
    for c in claims:
        for res in c.get('mainsnak',{}).get('results',[]) or []:
            viol.append({'property':p,'property_label':labels.get(p,p),'claim_id':c.get('id'),'status':res.get('status'),'constraint_type':res.get('constraint',{}).get('typeLabel'),'message_html':res.get('message-html'),'clarification':res.get('constraint-clarification')})
no_refs=[]; multi_url=[]; duplicates=[]; allrows=[]
for p,cs in ent.get('claims',{}).items():
    seen={}
    for c in cs:
        x=val(c.get('mainsnak')); quals={qp:[val(z) for z in qsn] for qp,qsn in c.get('qualifiers',{}).items()}; refs=c.get('references',[]) or []
        hosts=[]; groups=[]
        for ref in refs:
            urls=[val(z) for z in ref.get('snaks',{}).get('P854',[]) if val(z)]; groups.append(urls); hosts.extend([urlparse(u).netloc for u in urls if isinstance(u,str)])
            if len(urls)>1: multi_url.append({'property':p,'property_label':labels.get(p,p),'claim_id':c.get('id'),'value':x,'urls':urls})
        row={'property':p,'property_label':labels.get(p,p),'claim_id':c.get('id'),'value':x,'value_label':labels.get(x,x) if isinstance(x,str) and x.startswith('Q') else None,'rank':c.get('rank'),'qualifiers':quals,'reference_count':len(refs),'reference_hosts':sorted(set(hosts)),'reference_url_groups':groups}
        allrows.append(row)
        if not refs:no_refs.append(row)
        key=json.dumps([x,quals],sort_keys=True,ensure_ascii=False)
        if key in seen: duplicates.append({'property':p,'property_label':labels.get(p,p),'value':x,'first':seen[key],'duplicate':c.get('id')})
        else:seen[key]=c.get('id')
child_p31=[]
for c in child.get('claims',{}).get('P31',[]):
    x=val(c.get('mainsnak')); child_p31.append({'claim_id':c.get('id'),'value':x})
out={'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastrevid':ent.get('lastrevid'),'modified':ent.get('modified'),'sitelinks':{k:v.get('title') for k,v in ent.get('sitelinks',{}).items()},'linked_work':{'id':CHILD,'lastrevid':child.get('lastrevid'),'modified':child.get('modified'),'P31':child_p31,'sitelinks':{k:v.get('title') for k,v in child.get('sitelinks',{}).items()}},'constraint_violations':viol,'exact_duplicates':duplicates,'no_reference_statements':no_refs,'multi_url_reference_groups':multi_url,'all_statements':allrows}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
