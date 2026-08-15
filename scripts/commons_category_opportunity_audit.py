#!/usr/bin/env python3
import json, requests

COMMONS='https://commons.wikimedia.org/w/api.php'
WIKIDATA='https://www.wikidata.org/w/api.php'
UA='Medicaldoctor91CommonsOpportunityAudit/1.0 (https://www.ghezelbaash.ir/)'
s=requests.Session(); s.headers['User-Agent']=UA

def get(url, **params):
    params.update(format='json', formatversion=2)
    r=s.get(url, params=params, timeout=60); r.raise_for_status(); return r.json()

cat='Category:Saeed Ghezelbash'
page=get(COMMONS, action='query', titles=cat, prop='revisions|categories|pageprops', rvprop='content', rvslots='main', cllimit='max')['query']['pages'][0]
members=get(COMMONS, action='query', list='categorymembers', cmtitle=cat, cmlimit='500', cmtype='file|page|subcat')['query']['categorymembers']
redirects=['Category:سعید قزلباش','Category:دکتر سعید قزلباش','Category:محمدسعید قزلباش','Category:دکتر محمدسعید قزلباش']
redir_pages=get(COMMONS, action='query', titles='|'.join(redirects), prop='info|revisions', rvprop='content', rvslots='main')['query']['pages']
cands=['Category:Medical researchers from Iran','Category:21st-century physicians from Iran','Category:Men of Kermanshah','Category:People of Kermanshah','Category:Physicians from Iran','Category:Medical researchers','Category:Aesthetic medicine specialists']
cand_pages=get(COMMONS, action='query', titles='|'.join(cands), prop='info|categories|pageprops', cllimit='max')['query']['pages']
wd=get(WIKIDATA, action='wbgetentities', ids='Q140287622', props='labels|aliases|descriptions|sitelinks|claims', languages='fa|en')['entities']['Q140287622']

def claim_values(prop):
    out=[]
    for c in wd.get('claims',{}).get(prop,[]):
        dv=c.get('mainsnak',{}).get('datavalue',{}).get('value')
        if isinstance(dv,dict) and 'id' in dv: out.append(dv['id'])
        else: out.append(dv)
    return out

out={
 'category':{
   'title':page.get('title'),'pageid':page.get('pageid'),'wikibase_item':page.get('pageprops',{}).get('wikibase_item'),
   'parents':[x['title'] for x in page.get('categories',[])],
   'members':[m['title'] for m in members],
   'member_count':len(members),
   'wikitext':page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','')
 },
 'persian_redirects':[{'title':p.get('title'),'exists':'missing' not in p,'content':p.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','') if 'missing' not in p else ''} for p in redir_pages],
 'candidate_categories':[{'title':p.get('title'),'exists':'missing' not in p,'parents':[x['title'] for x in p.get('categories',[])], 'wikibase_item':p.get('pageprops',{}).get('wikibase_item')} for p in cand_pages],
 'wikidata':{
   'fa_label':wd.get('labels',{}).get('fa'), 'fa_aliases':wd.get('aliases',{}).get('fa',[]), 'fa_description':wd.get('descriptions',{}).get('fa'),
   'en_label':wd.get('labels',{}).get('en'), 'en_aliases':wd.get('aliases',{}).get('en',[]),
   'commonswiki_sitelink':wd.get('sitelinks',{}).get('commonswiki'),
   'P373_commons_category':claim_values('P373'),'P2671_google_kg':claim_values('P2671'),'P496_orcid':claim_values('P496'),'P856_official_site':claim_values('P856'),'P18_image':claim_values('P18'),'P1830_owner_of':claim_values('P1830'),'P937_work_location':claim_values('P937')
 }
}
print(json.dumps(out,ensure_ascii=False,indent=2))
