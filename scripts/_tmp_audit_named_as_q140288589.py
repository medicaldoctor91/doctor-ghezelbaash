#!/usr/bin/env python3
import json, requests
WD='https://www.wikidata.org/w/api.php'
Q='Q140288589'
UA='GhezelbaashNamedAsAudit/1.0 (https://www.ghezelbaash.ir/)'

def get(**p):
    p.update(format='json',formatversion=2)
    r=requests.get(WD,params=p,headers={'User-Agent':UA},timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def val(s):
    dv=s.get('datavalue')
    if not dv: return {'snaktype':s.get('snaktype')}
    v=dv.get('value')
    if isinstance(v,dict) and 'id' in v: return v['id']
    return v

e=get(action='wbgetentities',ids=Q,props='labels|descriptions|claims')['entities'][Q]
out={'qid':Q,'lastrevid':e.get('lastrevid'),'named_as_statements':[]}
for prop,claims in e.get('claims',{}).items():
    for c in claims:
        qs=c.get('qualifiers',{})
        refs=c.get('references',[])
        has=bool(qs.get('P1810') or qs.get('P1932')) or any(r.get('snaks',{}).get('P1810') or r.get('snaks',{}).get('P1932') for r in refs)
        if not has: continue
        rec={
          'property':prop,'guid':c.get('id'),'rank':c.get('rank'),'value':val(c.get('mainsnak',{})),
          'qualifiers':{p:[val(x) for x in xs] for p,xs in qs.items() if p in ('P1810','P1932','P3831','P2868')},
          'references':[]
        }
        for r in refs:
            sn=r.get('snaks',{})
            rec['references'].append({p:[val(x) for x in xs] for p,xs in sn.items() if p in ('P854','P248','P813','P1810','P1932','P2671')})
        out['named_as_statements'].append(rec)
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
