#!/usr/bin/env python3
import json, requests, datetime, re

WD = 'https://www.wikidata.org/w/api.php'
QID = 'Q140287622'
UA = 'Q140287622-LiveAudit/1.1 (https://www.ghezelbaash.ir/)'
s = requests.Session(); s.headers.update({'User-Agent': UA, 'Cache-Control':'no-cache'})

def get(**p):
    p.update(format='json', formatversion=2, maxage=0, smaxage=0)
    r=s.get(WD, params=p, timeout=60); r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError(d['error'])
    return d

def snak_value(snak):
    if not snak: return None
    if snak.get('snaktype') != 'value': return {'snaktype': snak.get('snaktype')}
    v = snak.get('datavalue',{}).get('value')
    if isinstance(v,dict):
        if 'id' in v: return v['id']
        if 'time' in v: return v['time']
        if 'text' in v: return {'text':v.get('text'),'language':v.get('language')}
        if 'amount' in v: return {'amount':v.get('amount'),'unit':v.get('unit')}
    return v

ent = get(action='wbgetentities', ids=QID, props='info|labels|descriptions|aliases|claims|sitelinks')['entities'][QID]
rev = get(action='query', prop='revisions', titles=QID, rvprop='ids|timestamp|user|comment|tags', rvlimit=20)['query']['pages'][0]

qids=set()
for plist in ent.get('claims',{}).values():
    for c in plist:
        v=snak_value(c.get('mainsnak'))
        if isinstance(v,str) and re.fullmatch(r'[QP]\d+',v): qids.add(v)
        for ql in c.get('qualifiers',{}).values():
            for q in ql:
                v=snak_value(q)
                if isinstance(v,str) and re.fullmatch(r'[QP]\d+',v): qids.add(v)
        for ref in c.get('references',[]):
            for rl in ref.get('snaks',{}).values():
                for r in rl:
                    v=snak_value(r)
                    if isinstance(v,str) and re.fullmatch(r'[QP]\d+',v): qids.add(v)
labels={}
for chunk_start in range(0,len(qids),50):
    chunk=list(sorted(qids))[chunk_start:chunk_start+50]
    if not chunk: continue
    d=get(action='wbgetentities', ids='|'.join(chunk), props='labels')
    for k,v in d.get('entities',{}).items():
        labs=v.get('labels',{})
        labels[k]=(labs.get('en') or labs.get('fa') or next(iter(labs.values()),{})).get('value')

def refs_compact(refs):
    out=[]
    for ref in refs or []:
        rr={}
        for p,snaks in ref.get('snaks',{}).items(): rr[p]=[snak_value(x) for x in snaks]
        out.append(rr)
    return out

claims={}
for p,plist in sorted(ent.get('claims',{}).items()):
    claims[p]=[]
    for c in plist:
        claims[p].append({
            'id':c.get('id'),'rank':c.get('rank'),'value':snak_value(c.get('mainsnak')),
            'datatype':c.get('mainsnak',{}).get('datatype'),'references':refs_compact(c.get('references',[])),
            'qualifiers':{qp:[snak_value(x) for x in qs] for qp,qs in c.get('qualifiers',{}).items()}
        })

# Exact duplicates on value+qualifiers.
duplicates=[]
for p,plist in claims.items():
    seen={}
    for x in plist:
        key=json.dumps([x['value'],x['qualifiers']],sort_keys=True,ensure_ascii=False)
        if key in seen: duplicates.append({'property':p,'first':seen[key],'duplicate':x['id'],'value':x['value'],'qualifiers':x['qualifiers']})
        else: seen[key]=x['id']

# Constraint report from Wikidata's own quality-constraints API.
constraint={'ok':False}
try:
    helpd=get(action='help', modules='wbcheckconstraints')
    module=helpd.get('help',{}).get('modules',[{}])[0]
    constraint['params']=[x.get('name') for x in module.get('parameters',[])]
    tried=[]
    for candidate in ({'action':'wbcheckconstraints','id':QID},{'action':'wbcheckconstraints','entityid':QID}):
        try:
            d=get(**candidate); constraint.update({'ok':True,'request':candidate,'result':d}); break
        except Exception as e: tried.append({'request':candidate,'error':str(e)})
    constraint['tried']=tried
except Exception as e: constraint['error']=str(e)

out={
 'audit_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'entity':QID,'lastrevid':ent.get('lastrevid'),'modified':ent.get('modified'),'pageid':ent.get('pageid'),
 'recent_revisions':rev.get('revisions',[]),
 'labels':ent.get('labels',{}),'descriptions':ent.get('descriptions',{}),'aliases':ent.get('aliases',{}),
 'sitelinks':ent.get('sitelinks',{}),'claims':claims,'resolved_entity_labels':labels,
 'exact_duplicates':duplicates,'constraint_check':constraint
}
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
