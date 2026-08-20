#!/usr/bin/env python3
import json, re, requests
WD='https://www.wikidata.org/w/api.php'
UA='GhezelbaashWikidataConstraintAudit/1.1 (https://www.ghezelbaash.ir/)'
IDS=['Q140288589','Q140287622','Q256688']
FOCUS=['P2388','P2389','P12201','P2671','P13096','P31','P17','P625','P856']

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

d=get(action='wbgetentities',ids='|'.join(IDS),props='labels|claims',languages='en|fa')
out={}
for q in IDS:
    e=d['entities'][q]
    out[q]={'labels':e.get('labels',{}),'claims':{p:[claim(c) for c in e.get('claims',{}).get(p,[])] for p in FOCUS if e.get('claims',{}).get(p)}}
# API help parameters for exact constraint-check invocation.
try:
    h=requests.get(WD,params={'action':'help','modules':'wbcheckconstraints','format':'json'},headers={'User-Agent':UA},timeout=60).json()
    txt=json.dumps(h,ensure_ascii=False)
    out['wbcheckconstraints_help_parameter_names']=sorted(set(re.findall(r'"([a-zA-Z][a-zA-Z0-9_-]{1,30})"\s*:',txt)))
except Exception as ex:
    out['help_error']=repr(ex)
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
