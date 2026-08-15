#!/usr/bin/env python3
import json
import requests

COMMONS='https://commons.wikimedia.org/w/api.php'
WIKIDATA='https://www.wikidata.org/w/api.php'
WIKIVERSITY='https://en.wikiversity.org/w/api.php'
UA='Medicaldoctor91CommonsFullOpportunityAudit/1.0 (https://www.ghezelbaash.ir/)'
s=requests.Session(); s.headers['User-Agent']=UA

def get(url, **params):
    params.update(format='json', formatversion=2)
    r=s.get(url, params=params, timeout=60); r.raise_for_status(); return r.json()

def page(url,title,props='info|revisions|categories|pageprops'):
    data=get(url,action='query',titles=title,prop=props,rvprop='content',rvslots='main',cllimit='max')
    return data['query']['pages'][0]

def content(p):
    if 'missing' in p: return ''
    return p.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('content','')

def claims(qid):
    return get(WIKIDATA,action='wbgetentities',ids=qid,props='labels|aliases|descriptions|sitelinks|claims')['entities'][qid]

def vals(ent,prop):
    out=[]
    for c in ent.get('claims',{}).get(prop,[]):
        v=c.get('mainsnak',{}).get('datavalue',{}).get('value')
        if isinstance(v,dict) and 'id' in v: v=v['id']
        out.append(v)
    return out

person=claims('Q140287622')
clinic=claims('Q140288589')
creator=page(COMMONS,'Creator:Saeed Ghezelbash')
clinic_cat=page(COMMONS,'Category:Dr. Saeed Ghezelbash Aesthetic Clinic')
main_cat=page(COMMONS,'Category:Saeed Ghezelbash')
video=page(COMMONS,'File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm')
files=[
 'File:Saeed-Ghezelbaash-physician-portrait.jpg',
 'File:Saeed-Ghezelbaash-in-clinical-office.jpg',
 'File:Saeed-Ghezelbaash-with-clinical-team.jpg',
 'File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm'
]
file_pages=[]
for f in files:
    p=page(COMMONS,f)
    file_pages.append({'title':f,'categories':[x['title'] for x in p.get('categories',[])],'wikitext':content(p)})

redirects=[]
for t in ['Category:سعید قزلباش','Category:دکتر سعید قزلباش','Category:محمدسعید قزلباش','Category:دکتر محمدسعید قزلباش']:
    p=page(COMMONS,t)
    redirects.append({'title':t,'exists':'missing' not in p,'wikitext':content(p)})

candidates=[]
for t in ['Category:Men of Kermanshah','Category:People of Kermanshah','Category:Videos of physicians','Category:Physicians in Iran','Category:Physicians from Iran','Category:Medical staff','Category:Aesthetic medicine','Category:Videos in Persian']:
    p=page(COMMONS,t)
    candidates.append({'title':t,'exists':'missing' not in p,'parents':[x['title'] for x in p.get('categories',[])],'wikibase_item':p.get('pageprops',{}).get('wikibase_item')})

searches={}
for q in ['Kermanshah physicians','physicians videos','aesthetic medicine physicians','medical staff Iran']:
    data=get(COMMONS,action='query',list='search',srsearch=q,srnamespace=14,srlimit=20)
    searches[q]=[x['title'] for x in data.get('query',{}).get('search',[])]

wv=page(WIKIVERSITY,'Botulinum toxin in aesthetic medicine',props='info|revisions')

out={
 'person':{
   'P1472_creator_page':vals(person,'P1472'),'P373_commons_category':vals(person,'P373'),'P2671_google_kg':vals(person,'P2671'),'P496_orcid':vals(person,'P496'),'P856_site':vals(person,'P856'),'P18_image':vals(person,'P18'),'P1830_owner_of':vals(person,'P1830'),'P937_work_location':vals(person,'P937'),
   'commons_sitelink':person.get('sitelinks',{}).get('commonswiki'),
   'fa_label':person.get('labels',{}).get('fa'),'fa_aliases':person.get('aliases',{}).get('fa',[])
 },
 'clinic':{
   'P1472_creator_page':vals(clinic,'P1472'),'P373_commons_category':vals(clinic,'P373'),'P2671_google_kg':vals(clinic,'P2671'),'P856_site':vals(clinic,'P856'),'P18_image':vals(clinic,'P18'),'commons_sitelink':clinic.get('sitelinks',{}).get('commonswiki'),
   'en_label':clinic.get('labels',{}).get('en'),'fa_label':clinic.get('labels',{}).get('fa')
 },
 'creator_page':{'exists':'missing' not in creator,'wikitext':content(creator)},
 'clinic_category':{'exists':'missing' not in clinic_cat,'wikitext':content(clinic_cat),'wikibase_item':clinic_cat.get('pageprops',{}).get('wikibase_item')},
 'main_category':{'wikitext':content(main_cat),'categories':[x['title'] for x in main_cat.get('categories',[])],'wikibase_item':main_cat.get('pageprops',{}).get('wikibase_item')},
 'redirects':redirects,
 'candidate_categories':candidates,
 'category_searches':searches,
 'files':file_pages,
 'video_has_wikiversity_marker':'Wikiversity learning material' in content(video),
 'wikiversity':{'exists':'missing' not in wv,'wikitext':content(wv),'has_commons_video':('دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm' in content(wv))}
}
print(json.dumps(out,ensure_ascii=False,indent=2))
