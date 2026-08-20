#!/usr/bin/env python3
import json, re, requests, datetime
UA='GhezelbaashReadOnlyIntegrityAudit/1.0 (https://www.ghezelbaash.ir/)'
S=requests.Session(); S.headers.update({'User-Agent':UA})
WIKIDATA='https://www.wikidata.org/w/api.php'
QIDS=['Q140287622','Q140288589','Q140304972']
RELATED=['Q141099455','Q141129555']

def api(url, **params):
    params.update(format='json', formatversion=2)
    r=S.get(url, params=params, timeout=90)
    r.raise_for_status(); d=r.json()
    if 'error' in d: raise RuntimeError({'url':url,'params':params,'error':d['error']})
    return d

def sv(snak):
    if not snak: return None
    if snak.get('snaktype')!='value': return {'snaktype':snak.get('snaktype')}
    dv=snak.get('datavalue',{}); v=dv.get('value')
    if isinstance(v,dict):
        if 'id' in v: return v['id']
        if 'time' in v: return {'time':v.get('time'),'precision':v.get('precision'),'calendar':v.get('calendarmodel')}
        if 'latitude' in v: return {'lat':v.get('latitude'),'lon':v.get('longitude'),'precision':v.get('precision'),'globe':v.get('globe')}
        if 'text' in v and 'language' in v: return {'text':v['text'],'language':v['language']}
        if 'amount' in v: return {'amount':v.get('amount'),'unit':v.get('unit'),'lowerBound':v.get('lowerBound'),'upperBound':v.get('upperBound')}
    return v

def compact_claim(c):
    refs=[]
    for r in c.get('references',[]):
        refs.append({p:[sv(x) for x in xs] for p,xs in r.get('snaks',{}).items()})
    return {
        'guid':c.get('id'),'rank':c.get('rank'),'value':sv(c.get('mainsnak')),
        'qualifiers':{p:[sv(x) for x in xs] for p,xs in c.get('qualifiers',{}).items()},
        'references':refs
    }

def fetch_entities(ids):
    d=api(WIKIDATA,action='wbgetentities',ids='|'.join(ids),props='labels|descriptions|aliases|claims|sitelinks')
    return d['entities']

def fetch_property_meta(pids):
    out={}
    pids=sorted(set(pids))
    for i in range(0,len(pids),50):
        d=api(WIKIDATA,action='wbgetentities',ids='|'.join(pids[i:i+50]),props='labels|descriptions|datatype')
        for pid,e in d['entities'].items():
            out[pid]={'label':e.get('labels',{}).get('en',{}).get('value'),'description':e.get('descriptions',{}).get('en',{}).get('value'),'datatype':e.get('datatype')}
    return out

def constraint_check(qid):
    try:
        return api(WIKIDATA,action='wbcheckconstraints',entityid=qid)
    except Exception as ex:
        return {'_error':repr(ex)}

def page_snapshot(site,title):
    url=f'https://{site}/w/api.php'
    d=api(url,action='query',prop='revisions|pageprops|info',titles=title,rvprop='ids|timestamp|user|comment|content',rvslots='main',redirects=1)
    p=d['query']['pages'][0]
    rev=(p.get('revisions') or [{}])[0]
    content=(rev.get('slots',{}).get('main',{}).get('content') or '')
    return {'site':site,'title':p.get('title'),'pageid':p.get('pageid'),'missing':p.get('missing',False),'pageprops':p.get('pageprops',{}),'revid':rev.get('revid'),'parentid':rev.get('parentid'),'timestamp':rev.get('timestamp'),'user':rev.get('user'),'comment':rev.get('comment'),'content':content}

def excerpt(content, patterns, radius=220):
    found=[]
    for pat in patterns:
        for m in re.finditer(pat,content,re.I|re.M):
            a=max(0,m.start()-radius); b=min(len(content),m.end()+radius)
            found.append(content[a:b])
    return found[:12]

ents=fetch_entities(QIDS+RELATED)
all_pids=[]
for q in QIDS+RELATED:
    all_pids += list(ents[q].get('claims',{}).keys())
    for cs in ents[q].get('claims',{}).values():
        for c in cs:
            all_pids += list(c.get('qualifiers',{}).keys())
            for r in c.get('references',[]): all_pids += list(r.get('snaks',{}).keys())
prop_meta=fetch_property_meta(all_pids)
entity_out={}
for q in QIDS:
    e=ents[q]
    entity_out[q]={
        'lastrevid':e.get('lastrevid'),
        'modified':e.get('modified'),
        'labels':{k:v.get('value') for k,v in e.get('labels',{}).items()},
        'descriptions':{k:v.get('value') for k,v in e.get('descriptions',{}).items()},
        'aliases':{k:[x.get('value') for x in v] for k,v in e.get('aliases',{}).items()},
        'sitelinks':{k:v.get('title') for k,v in e.get('sitelinks',{}).items()},
        'claims':{p:[compact_claim(c) for c in cs] for p,cs in e.get('claims',{}).items()},
        'constraint_check':constraint_check(q)
    }
related_out={}
for q in RELATED:
    e=ents[q]
    related_out[q]={
        'lastrevid':e.get('lastrevid'),'modified':e.get('modified'),
        'labels':{k:v.get('value') for k,v in e.get('labels',{}).items()},
        'sitelinks':{k:v.get('title') for k,v in e.get('sitelinks',{}).items()},
        'claims':{p:[compact_claim(c) for c in cs] for p,cs in e.get('claims',{}).items()}
    }

pages={}
page_specs={
 'wikisource_author':('en.wikisource.org','Author:Mohammad Saeed Ghezelbash'),
 'wikiversity_resource':('en.wikiversity.org','Botulinum toxin in aesthetic medicine'),
 'wikiversity_preprint':('en.wikiversity.org','WikiJournal Preprints/Individualized clinical assessment and outcome interpretation in aesthetic botulinum neurotoxin type A treatment: a focused review'),
 'wikipedia_botulinum':('en.wikipedia.org','Botulinum toxin'),
 'wikipedia_botulinum_talk':('en.wikipedia.org','Talk:Botulinum toxin'),
 'wikipedia_bipolar_talk':('en.wikipedia.org','Talk:Treatment of bipolar disorder'),
 'commons_category':('commons.wikimedia.org','Category:Saeed Ghezelbash'),
}
for k,(site,title) in page_specs.items():
    snap=page_snapshot(site,title)
    pats=[]
    if k=='wikisource_author': pats=[r'Wikidata',r'Mohammad Saeed Ghezelbash',r'Saeed Ghezelbash',r'1991',r'Works']
    elif k=='wikiversity_resource': pats=[r'author',r'Saeed Ghezelbash',r'wikibase_item',r'Botulinum toxin']
    elif k=='wikiversity_preprint': pats=[r'orcid1',r'Saeed Ghezelbash',r'author',r'license',r'conflict',r'journal']
    elif k=='wikipedia_botulinum': pats=[r'sister project links',r'Wikiversity',r'Botulinum toxin in aesthetic medicine']
    elif k=='wikipedia_botulinum_talk': pats=[r'Medicaldoctor91',r'Wikiversity',r'Botulinum toxin in aesthetic medicine',r'COI']
    elif k=='wikipedia_bipolar_talk': pats=[r'Medicaldoctor91',r'omega',r'Ghezelbash',r'COI']
    snap['excerpts']=excerpt(snap['content'],pats)
    # retain full content only for compact pages; for large Wikipedia pages keep targeted excerpts
    if k.startswith('wikipedia_'):
        snap.pop('content',None)
    pages[k]=snap

# Compact direct checks helpful for human audit; all are read-only observations.
def vals(q,p): return [x['value'] for x in entity_out[q]['claims'].get(p,[])]
summary={
 'person_en_label':entity_out['Q140287622']['labels'].get('en'),
 'person_en_aliases':entity_out['Q140287622']['aliases'].get('en',[]),
 'person_sitelinks':entity_out['Q140287622']['sitelinks'],
 'clinic_sitelinks':entity_out['Q140288589']['sitelinks'],
 'graph_sitelinks':entity_out['Q140304972']['sitelinks'],
 'person_to_clinic_P1830':'Q140288589' in vals('Q140287622','P1830'),
 'person_to_graph_P1830':'Q140304972' in vals('Q140287622','P1830'),
 'clinic_founder_P112':vals('Q140288589','P112'),
 'clinic_owner_P127':vals('Q140288589','P127'),
 'clinic_operator_P137':vals('Q140288589','P137'),
 'clinic_director_P1037':vals('Q140288589','P1037'),
 'graph_creator_P170':vals('Q140304972','P170'),
 'graph_developer_P178':vals('Q140304972','P178'),
 'graph_owner_P127':vals('Q140304972','P127'),
 'wikisource_wikibase_item':pages['wikisource_author']['pageprops'].get('wikibase_item'),
 'wikiversity_resource_wikibase_item':pages['wikiversity_resource']['pageprops'].get('wikibase_item'),
 'wikiversity_preprint_wikibase_item':pages['wikiversity_preprint']['pageprops'].get('wikibase_item'),
}
print(json.dumps({'generated_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'entities':entity_out,'related_items':related_out,'property_meta':prop_meta,'pages':pages,'summary':summary},ensure_ascii=False,indent=2))
