#!/usr/bin/env python3
import json, requests
WD='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataConstraintAudit/1.2 (https://www.ghezelbaash.ir/)'
IDS=['Q140288589','Q140287622','Q141131884']
FOCUS=['P2388','P2389','P39','P1308','P1810','P1932','P2671','P12201','P31','P279']

def get(**p):
    p.update(format='json',formatversion=2)
    r=requests.get(WD,params=p,headers={'User-Agent':UA},timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def val(s):
    d=s.get('datavalue')
    if not d: return {'snaktype':s.get('snaktype')}
    v=d.get('value')
    if isinstance(v,dict) and 'id' in v: return v['id']
    return v

def claim(c):
    return {'guid':c.get('id'),'value':val(c.get('mainsnak',{})),'rank':c.get('rank'),
      'qualifiers':{p:[val(x) for x in xs] for p,xs in c.get('qualifiers',{}).items()},
      'references':[{p:[val(x) for x in xs] for p,xs in r.get('snaks',{}).items()} for r in c.get('references',[])]}

d=get(action='wbgetentities',ids='|'.join(IDS),props='labels|descriptions|claims',languages='en|fa')
out={}
for q in IDS:
    e=d['entities'][q]
    out[q]={'labels':e.get('labels',{}),'descriptions':e.get('descriptions',{}),
      'claims':{p:[claim(c) for c in e.get('claims',{}).get(p,[])] for p in FOCUS if e.get('claims',{}).get(p)}}

# Directional semantic assertions for named-as qualifiers.
expect={
 ('Q140288589','P2388','Q141131884'):('Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش','Director / Manager / مدیر'),
 ('Q141131884','P2389','Q140288589'):('Director / Manager / مدیر','Dr. Saeed Ghezelbash Aesthetic Clinic — کلینیک زیبایی دکتر سعید قزلباش'),
 ('Q140287622','P39','Q141131884'):('Dr. Saeed Ghezelbash — دکتر سعید قزلباش','Director / Manager / مدیر'),
 ('Q141131884','P1308','Q140287622'):('Director / Manager / مدیر','Dr. Saeed Ghezelbash — دکتر سعید قزلباش'),
}
checks={}
for (q,p,target),(subj,obj) in expect.items():
    cs=out[q]['claims'].get(p,[])
    ms=[c for c in cs if c['value']==target]
    ok=len(ms)==1 and ms[0]['qualifiers'].get('P1810')==[subj] and ms[0]['qualifiers'].get('P1932')==[obj]
    checks[f'{q}:{p}:{target}']={'ok':ok,'subject_named_as':ms[0]['qualifiers'].get('P1810') if ms else None,'object_named_as':ms[0]['qualifiers'].get('P1932') if ms else None}
    if not ok: raise RuntimeError({'named_as_direction_failed':q,'property':p,'target':target,'matches':ms})
out['directional_named_as_checks']=checks
print(json.dumps({'ok':True,**out},ensure_ascii=False,indent=2,sort_keys=True))
