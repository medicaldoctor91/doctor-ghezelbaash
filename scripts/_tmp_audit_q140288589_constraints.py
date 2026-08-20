#!/usr/bin/env python3
import json
import requests

WD='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataConstraintAudit/1.0 (https://www.ghezelbaash.ir/)'
IDS=['Q140288589','Q140287622','Q256688']
PROPS=['P2388','P2389','P1810','P1932','P12201','P2671','P13096','P31','P17','P625','P856']

def get(**p):
    p.update(format='json',formatversion=2)
    r=requests.get(WD,params=p,headers={'User-Agent':UA},timeout=60)
    r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def val(snak):
    dv=snak.get('datavalue')
    if not dv: return {'snaktype':snak.get('snaktype')}
    v=dv.get('value')
    if isinstance(v,dict) and 'id' in v: return v['id']
    return v

def simp_claim(c):
    return {
      'guid':c.get('id'),'rank':c.get('rank'),'value':val(c.get('mainsnak',{})),
      'qualifiers':{p:[val(x) for x in xs] for p,xs in c.get('qualifiers',{}).items()},
      'references':[
        {p:[val(x) for x in xs] for p,xs in ref.get('snaks',{}).items()}
        for ref in c.get('references',[])
      ]
    }

d=get(action='wbgetentities',ids='|'.join(IDS),props='labels|descriptions|claims',languages='en|fa')
out={'entities':{}}
for q in IDS:
    e=d['entities'][q]
    out['entities'][q]={
      'labels':e.get('labels',{}),'descriptions':e.get('descriptions',{}),
      'claims':{p:[simp_claim(c) for c in e.get('claims',{}).get(p,[])] for p in PROPS if e.get('claims',{}).get(p)}
    }

# Constraint check on every clinic statement, preserving only non-compliance results.
clinic=d['entities']['Q140288589']
checks={}
for prop, claims in clinic.get('claims',{}).items():
    for c in claims:
        guid=c.get('id')
        try:
            cc=get(action='wbcheckconstraints',claim=guid,status='violation|warning|suggestion|bad-parameters')
            results=cc.get('wbcheckconstraints',{}).get(guid,[])
            if results:
                checks[guid]=results
        except Exception as ex:
            checks[guid]={'audit_error':repr(ex)}
out['constraint_results']=checks
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
